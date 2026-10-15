// Everything about the white noise: what's playing, the sleep timer, and the safe volume.
// Lives above the screens so it keeps running whatever tab is open.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { createAudioPlayer, setAudioModeAsync, useAudioPlayerStatus } from "expo-audio";
import { deviceVolume, type VolumeState } from "../../modules/hush-native/src";
import { SOUNDS, beatIndex, soundById, type SoundId } from "../sounds";
import { capGain, fullVolumeDb, levelAtCrib, safePlan } from "../safety";
import { DEFAULTS, saveSettings, type Settings } from "../storage";

export const TIMERS: [number, string][] = [[0, "Never"], [15, "15 min"], [30, "30 min"], [60, "1 hr"], [120, "2 hr"]];

type Sleep = {
  s: Settings;
  set: (patch: Partial<Settings>) => void;
  soundId: SoundId;
  sound: ReturnType<typeof soundById>;
  playing: boolean;
  toggle: () => void;
  timerLeft: number | null;
  setTimer: (minutes: number) => void;
  dev: VolumeState | null;
  setStep: (step: number) => void;
  ceiling: number | null;
  level: number | null;
  beat: number;
  still: boolean;
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
    try { player.updateLockScreenMetadata({ title: `${sound.name} noise`, artist: "hush" }); } catch {}
  }, [soundId, sound, player]);

  /* ---------- phone volume + safety ---------- */
  const [dev, setDev] = useState<VolumeState | null>(() => deviceVolume?.get() ?? null);
  useEffect(() => {
    if (!deviceVolume) return;
    const sub = deviceVolume.onChange(setDev);
    const app = AppState.addEventListener("change", (st) => st === "active" && setDev(deviceVolume!.get()));
    return () => { sub.remove(); app.remove(); };
  }, []);

  const plan = dev ? safePlan(s.dist, dev.max) : null;
  const appGain = plan ? plan.appGain : capGain(s.dist) * (s.vol / 100);
  const level = dev
    ? levelAtCrib(s.dist, dev.step, dev.max, plan!.appGain)
    : s.vol > 0 ? fullVolumeDb(s.dist) + 20 * Math.log10(appGain) : null;

  // While playing, the phone's media volume can't go past the safe step (enforced natively).
  useEffect(() => {
    if (!deviceVolume || !plan) return;
    setDev(deviceVolume.setCeiling(playing ? plan.ceiling : -1));
  }, [playing, plan?.ceiling]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStep = useCallback((step: number) => {
    if (deviceVolume) setDev(deviceVolume.setStep(step));
  }, []);

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
    player.volume = gainRef.current * fade;
  }, [player]);

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

  const toggle = useCallback(() => {
    if (player.playing) return player.pause();
    player.volume = gainRef.current;
    player.play();
    try { player.setActiveForLockScreen(true, { title: `${soundById(loaded.current).name} noise`, artist: "hush" }); } catch {}
  }, [player]);

  const timerLeft = playing && stopAt.current ? Math.max(0, stopAt.current - Date.now()) : null;

  return (
    <Ctx.Provider
      value={{ s, set, soundId, sound, playing, toggle, timerLeft, setTimer, dev, setStep, ceiling: plan?.ceiling ?? null, level, beat, still }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const fmtLeft = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
export const fmtDist = (m: number, unit: "m" | "ft") => (unit === "m" ? `${m.toFixed(1)} m` : `${Math.round(m * 3.281)} ft`);
