// Everything about the white noise: what's playing, the sleep timer, and the safe volume.
// Lives above the screens so it keeps running whatever tab is open.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { createAudioPlayer, setAudioModeAsync, useAudioPlayerStatus } from "expo-audio";
import { deviceVolume, type VolumeState } from "../../modules/hush-native/src";
import { SOUNDS, beatIndex, soundById, type SoundId } from "../sounds";
import { capGain, fullVolumeDb, levelAtCrib, safePlan } from "../safety";
import { DEFAULTS, saveSettings, type Settings } from "../storage";
import { addEvent } from "../nights";
import { LIMIT_DB } from "../safety";
import { smartTarget, type SmartPhase } from "../smart";
import { useMonitor } from "./monitor";
import { t } from "../i18n";
import * as Notifications from "expo-notifications";
import { sendData } from "../monitor";

export const TIMERS: [number, string][] = [[0, "Never"], [15, "15 min"], [30, "30 min"], [60, "1 hr"], [120, "2 hr"]];

type Sleep = {
  s: Settings;
  set: (patch: Partial<Settings>) => void;
  soundId: SoundId;
  sound: ReturnType<typeof soundById>;
  playing: boolean;
  toggle: () => void;
  /** Goes up each time someone starts a sound (on this phone or from a parent's phone). */
  starts: number;
  timerLeft: number | null;
  setTimer: (minutes: number) => void;
  dev: VolumeState | null;
  setStep: (step: number) => void;
  ceiling: number | null;
  level: number | null;
  beat: number;
  still: boolean;
  /** Smart mode: what it's doing now and the level it's aiming for (dB at the crib). */
  smart: { phase: SmartPhase; db: number; nextChange: number | null; hearing: boolean } | null;
};

const Ctx = createContext<Sleep | null>(null);
export const useSleep = () => useContext(Ctx)!;

export function SleepProvider({ initial, still, children }: { initial: Settings; still: boolean; children: ReactNode }) {
  const [s, setRaw] = useState<Settings>({ ...DEFAULTS, ...initial });
  const set = useCallback((patch: Partial<Settings>) => {
    setRaw((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);
  const soundId = (SOUNDS.some((x) => x.id === s.sound) ? s.sound : "womb") as SoundId;
  const sound = soundById(soundId);

  /* ---------- audio ---------- */
  const player = useMemo(() => createAudioPlayer(sound.file, { updateInterval: 1000 }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" }).catch(() => {});
    player.loop = true;
    return () => player.remove();
  }, [player]);

  const loaded = useRef<SoundId>(soundId);
  useEffect(() => {
    if (loaded.current === soundId) return;
    loaded.current = soundId;
    const wasPlaying = player.playing;
    player.replace(sound.file);
    player.loop = true;
    if (wasPlaying) player.play();
    try { player.updateLockScreenMetadata({ title: t(`sound.${soundId}`), artist: "hush" }); } catch {}
  }, [soundId, sound, player]);

  // Note when white noise plays, for the Nights timeline.
  const wasPlaying = useRef(false);
  useEffect(() => {
    if (playing === wasPlaying.current) return;
    wasPlaying.current = playing;
    addEvent({ type: playing ? "noise_start" : "noise_stop", t: Date.now() });
  }, [playing]);

  /* ---------- phone volume + safety ---------- */
  const [dev, setDev] = useState<VolumeState | null>(() => deviceVolume?.get() ?? null);
  useEffect(() => {
    if (!deviceVolume) return;
    const sub = deviceVolume.onChange(setDev);
    const app = AppState.addEventListener("change", (st) => st === "active" && setDev(deviceVolume!.get()));
    return () => { sub.remove(); app.remove(); };
  }, []);

  const safe = dev ? safePlan(s.dist, dev.max) : null;
  // Past the limit only when the parent turned that on; then nothing is capped.
  const plan = safe && s.allowLoud ? { ceiling: dev!.max, appGain: 1 } : safe;
  const appGain = plan ? plan.appGain : (s.allowLoud ? 1 : capGain(s.dist)) * (s.vol / 100);
  const baseLevel = dev
    ? levelAtCrib(s.dist, dev.step, dev.max, plan!.appGain)
    : s.vol > 0 ? fullVolumeDb(s.dist) + 20 * Math.log10(appGain) : null;

  // While playing, the phone's media volume can't go past the safe step (enforced natively).
  useEffect(() => {
    if (!deviceVolume || !plan) return;
    setDev(deviceVolume.setCeiling(playing && !s.allowLoud ? plan.ceiling : -1));
  }, [playing, plan?.ceiling, s.allowLoud]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStep = useCallback((step: number) => {
    if (deviceVolume) setDev(deviceVolume.setStep(step));
  }, []);

  /* ---------- smart mode ---------- */
  const mon = useMonitor();
  const isSmart = s.mode === "smart";
  const startedAt = useRef(0);
  const smartDb = useRef(LIMIT_DB); // current level, eased toward the target
  const [smartView, setSmartView] = useState<Sleep["smart"]>(null);

  useEffect(() => {
    if (playing && !startedAt.current) {
      startedAt.current = Date.now();
      smartDb.current = LIMIT_DB;
    }
    if (!playing) startedAt.current = 0;
  }, [playing]);

  // React to crying using this phone's mic while smart white noise plays.
  useEffect(() => {
    mon.setSoundWantsMic(playing && isSmart && s.smartCry);
  }, [playing, isSmart, s.smartCry]); // eslint-disable-line react-hooks/exhaustive-deps

  const cryRef = useRef<number | null>(null);
  cryRef.current = mon.cryHeardAt;

  /** Extra quieting from smart mode, as a volume multiplier (1 = full safe level). */
  const smartFactor = useCallback(() => {
    if (!isSmart || !startedAt.current) return 1;
    const now = Date.now();
    const cry = cryRef.current && cryRef.current >= startedAt.current ? cryRef.current : null;
    const target = smartTarget(now, startedAt.current, cry);
    // Rise quickly when crying starts, settle slowly.
    const cur = smartDb.current;
    smartDb.current = target.db > cur ? Math.min(target.db, cur + 2) : Math.max(target.db, cur - 0.2);
    setSmartView({ phase: target.phase, db: smartDb.current, nextChange: target.nextChange, hearing: mon.micOn });
    return Math.pow(10, (smartDb.current - LIMIT_DB) / 20);
  }, [isSmart, mon.micOn]);

  /* ---------- sleep timer ---------- */
  const stopAt = useRef(0);
  const [, force] = useState(0);
  useEffect(() => {
    stopAt.current = playing && s.timer ? Date.now() + s.timer * 60000 : 0;
  }, [playing, s.timer]);

  const gainRef = useRef(appGain);
  gainRef.current = appGain;
  const checkTimer = useCallback(() => {
    let fade = 1;
    if (stopAt.current) {
      const left = stopAt.current - Date.now();
      if (left <= 0) { stopAt.current = 0; player.pause(); }
      else if (left < 60000) fade = left / 60000; // gentle fade over the last minute
    }
    player.volume = gainRef.current * fade * smartFactor();
  }, [player, smartFactor]);

  useEffect(checkTimer, [appGain, status.currentTime, checkTimer]); // status updates keep arriving while locked
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => { checkTimer(); force((n) => n + 1); }, 1000);
    return () => clearInterval(id);
  }, [playing, checkTimer]);

  const setTimer = useCallback((m: number) => {
    set({ timer: m });
    stopAt.current = m && player.playing ? Date.now() + m * 60000 : 0;
  }, [set, player]);

  /* ---------- ripples in time with the sound ---------- */
  const [beat, setBeat] = useState(-1);
  useEffect(() => {
    if (!playing || still) return;
    const id = setInterval(() => {
      if (AppState.currentState !== "active") return;
      setBeat(beatIndex(soundId, player.currentTime));
    }, 80);
    return () => clearInterval(id);
  }, [playing, still, soundId, player]);

  const [starts, setStarts] = useState(0);
  const toggle = useCallback(() => {
    if (player.playing) return player.pause();
    setStarts((n) => n + 1);
    // Smart starts at the full safe level, so the phone's volume goes to the line.
    if (s.mode === "smart" && deviceVolume) {
      const st = deviceVolume.get();
      const c = safePlan(s.dist, st.max).ceiling;
      if (st.step < c) setDev(deviceVolume.setStep(c));
    }
    player.volume = gainRef.current;
    player.play();
    try { player.setActiveForLockScreen(true, { title: t(`sound.${loaded.current}`), artist: "hush" }); } catch {}
  }, [player, s.mode, s.dist]);

  /* ---------- remote control from a paired parent's phone ---------- */
  const remote = useRef({ toggle, set, soundId, listening: mon.listening, role: mon.m.role, parents: mon.m.parents });
  remote.current = { toggle, set, soundId, listening: mon.listening, role: mon.m.role, parents: mon.m.parents };
  const roomFor = useCallback(() => ({ type: "room", playing: player.playing, sound: remote.current.soundId, listening: remote.current.listening, at: Date.now() }), [player]);
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const d = n.request.content.data as { type?: string; cmd?: string; sound?: string; from?: string } | undefined;
      const r = remote.current;
      if (d?.type !== "cmd" || !d.from || r.role !== "nursery" || !r.parents.some((p) => p.token === d.from)) return;
      if (d.cmd === "play" && !player.playing) r.toggle();
      else if (d.cmd === "stop" && player.playing) player.pause();
      else if (d.cmd === "sound" && d.sound && SOUNDS.some((x) => x.id === d.sound)) r.set({ sound: d.sound });
      // Answer after the change has taken effect.
      setTimeout(() => sendData([d.from!], roomFor()), 900);
      Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {});
    });
    return () => sub.remove();
  }, [player, roomFor]);
  // Tell the parents when the room changes here (someone pressed play, a timer ended…).
  useEffect(() => {
    if (mon.m.role !== "nursery" || !mon.m.parents.length) return;
    const id = setTimeout(() => sendData(mon.m.parents.map((p) => p.token), roomFor()), 1500);
    return () => clearTimeout(id);
  }, [playing, soundId, mon.listening]); // eslint-disable-line react-hooks/exhaustive-deps

  // What's actually reaching the crib, including smart mode's quieting.
  const level = baseLevel != null && isSmart && playing && smartView ? baseLevel + (smartView.db - LIMIT_DB) : baseLevel;

  const timerLeft = playing && stopAt.current ? Math.max(0, stopAt.current - Date.now()) : null;

  return (
    <Ctx.Provider
      value={{ s, set, soundId, sound, playing, toggle, starts, timerLeft, setTimer, dev, setStep, ceiling: safe?.ceiling ?? null, level, beat, still, smart: isSmart && playing ? smartView : null }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const fmtLeft = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
export const fmtDist = (m: number, unit: "m" | "ft") => (unit === "m" ? `${m.toFixed(1)} m` : `${Math.round(m * 3.281)} ft`);
