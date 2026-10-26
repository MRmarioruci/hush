// Everything about the white noise: what's playing, the sleep timer, and the safe volume.
// Lives above the screens so it keeps running whatever tab is open.
import { logAct } from "../activity";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { createAudioPlayer, setAudioModeAsync, useAudioPlayerStatus } from "expo-audio";
import { cryDetector, deviceVolume, diag, type VolumeState } from "../../modules/hush-native/src";
import { SOUNDS, beatIndex, soundById, type SoundId } from "../sounds";
import { outputDb, safeDistance, stepDb } from "../safety";
import { DEFAULTS, saveSettings, type Settings } from "../storage";
import { addEvent } from "../nights";
import { LIMIT_DB } from "../safety";
import { smartTarget, type SmartPhase } from "../smart";
import { useMonitor } from "./monitor";
import { t } from "../i18n";
import * as Notifications from "expo-notifications";
import { addPushListener, sendData } from "../monitor";
import { loadStops, saveStops, type Stop, type StopWhy } from "../stops";
import { Asset } from "expo-asset";

// The picture on the playback notification and lock screen. It must be a real URL: in Android
// release builds a bundled image is only a resource name, which expo-audio rejects, and then the
// player doesn't show at all. So: a file the native side writes, else the asset if it's a URL.
const isUrl = (u?: string | null) => !!u && /^(file|https?):\/\//.test(u);
let artwork: string | undefined;
try {
  const art = Asset.fromModule(require("../../assets/artwork.png"));
  if (isUrl(art.uri)) art.downloadAsync().then((a) => { if (isUrl(a.localUri)) artwork = a.localUri!; }).catch(() => {});
  else { const f = cryDetector?.artworkFile(art.uri); if (isUrl(f)) artwork = f; } // a resource name ("assets_artwork")
} catch {}

export const TIMERS: [number, string][] = [[0, "Never"], [15, "15 min"], [30, "30 min"], [60, "1 hr"], [120, "2 hr"]];

type Sleep = {
  s: Settings;
  set: (patch: Partial<Settings>) => void;
  soundId: SoundId;
  sound: ReturnType<typeof soundById>;
  playing: boolean;
  toggle: () => void;
  /** Stop the white noise, noting why (shown later as "Stopped at … · why"). */
  stop: (why: StopWhy, who?: string) => void;
  /** Why the white noise last stopped. */
  lastStop: Stop | null;
  /** Goes up each time someone starts a sound (on this phone or from a parent's phone). */
  starts: number;
  timerLeft: number | null;
  setTimer: (minutes: number) => void;
  dev: VolumeState | null;
  setStep: (step: number) => void;
  /** Closest the phone should be to the crib at this volume (m). Null when silent. */
  safeDist: number | null;
  /** Level at the crib with the phone at safeDist (dB), including smart mode's quieting. */
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
    player.loop = true;
    return () => player.remove();
  }, [player]);

  const loaded = useRef<SoundId>(soundId);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  useEffect(() => {
    if (loaded.current === soundId) return;
    loaded.current = soundId;
    const wasPlaying = player.playing;
    player.replace(sound.file);
    player.loop = true;
    if (wasPlaying) player.play();
    try { player.updateLockScreenMetadata({ title: t(`sound.${soundId}`), artist: "hush", artworkUrl: artwork }); } catch {}
  }, [soundId, sound, player]);

  // Why it stopped: set just before pausing. A stop without one was a call or another app.
  const stopWhy = useRef<{ why: StopWhy; who?: string } | null>(null);
  const [lastStop, setLastStop] = useState<Stop | null>(null);
  useEffect(() => { loadStops().then((st) => setLastStop(st.sound ?? null)); }, []);
  const stop = useCallback((why: StopWhy, who?: string) => {
    if (endPending(why, who)) return;
    if (!player.playing) return;
    stopWhy.current = { why, who };
    player.pause();
  }, [player]);

  // A stop nobody asked for (the system, a notification, the mic starting, another app):
  // start again by itself, so the room never goes silent. Only a person, the sleep timer or a
  // remote "stop" turn the white noise off.
  const resume = useRef<{ tries: number; timer?: ReturnType<typeof setTimeout> }>({ tries: 0 });
  const cancelResume = useCallback(() => {
    if (resume.current.timer) clearTimeout(resume.current.timer);
    resume.current = { tries: 0 };
  }, []);
  /** Turned off on purpose while it was coming back from an interruption. */
  const endPending = useCallback((why: StopWhy, who?: string) => {
    if (!resume.current.timer) return false;
    cancelResume();
    const st: Stop = { at: Date.now(), why, who };
    setLastStop(st);
    saveStops({ sound: st });
    addEvent({ type: "noise_stop", t: Date.now() });
    logAct("noiseOff", { why, asker: who });
    return true;
  }, [cancelResume]);
  // Quick at first, then every 30 s for as long as it takes (until someone turns it off).
  const RESUME_MS = [800, 2000, 4000, 8000, 15000, 30000];
  const RESUME_FOR_MS = 3 * 3600_000;

  // Note when white noise plays, for the Nights timeline.
  const wasPlaying = useRef(false);
  useEffect(() => {
    if (playing === wasPlaying.current) return;
    if (wasPlaying.current && !playing) {
      // Android: hush never gives up the audio to other apps (it mixes with them), so the only
      // thing that stops the white noise without hush asking is a call, or a person: the pause
      // or stop button in the notification, on the lock screen, a headset or the car. A person's
      // stop is final; only a call is waited out and the sound brought back.
      if (!stopWhy.current && Platform.OS === "android" && cryDetector && !cryDetector.inCall()) {
        diag.mark(`sound stopped from the media controls (${player.isLoaded ? "paused" : "stopped"}): not starting it again`);
        stopWhy.current = { why: "you" };
      }
      if (!stopWhy.current) {
        // Interrupted: try again, and only report it if it can't come back.
        const since = Date.now();
        diag.mark("sound stopped by itself");
        const attempt = () => {
          const r = resume.current;
          if (player.playing) return cancelResume();
          if (Date.now() - since > RESUME_FOR_MS) {
            diag.mark("sound: gave up resuming");
            const st: Stop = { at: Date.now(), why: "interrupted" };
            setLastStop(st);
            saveStops({ sound: st });
            return cancelResume();
          }
          r.timer = setTimeout(() => {
            r.tries += 1;
            try {
              // A player that errored out won't play again: load the sound afresh.
              if (r.tries >= 3) { player.replace(soundRef.current.file); player.loop = true; }
              player.volume = Math.max(0.02, Math.min(1, gainRef.current || 1));
              player.play();
            } catch {}
            setTimeout(() => { if (player.playing) diag.mark(`sound resumed (try ${r.tries})`); }, 600);
            attempt();
          }, RESUME_MS[Math.min(r.tries, RESUME_MS.length - 1)]);
        };
        if (!resume.current.timer) attempt();
        stopWhy.current = null;
        wasPlaying.current = false;
        return; // the Nights timeline only records real stops
      }
      cancelResume();
      const st: Stop = { at: Date.now(), ...stopWhy.current };
      setLastStop(st);
      saveStops({ sound: st });
    }
    if (playing && resume.current.timer) {
      // Came back after an interruption: carry on as if nothing happened.
      cancelResume();
      stopWhy.current = null;
      wasPlaying.current = true;
      return;
    }
    const why = stopWhy.current;
    stopWhy.current = null;
    wasPlaying.current = playing;
    addEvent({ type: playing ? "noise_start" : "noise_stop", t: Date.now() });
    if (playing) logAct("noiseOn", { sound: soundRef.current.id });
    else logAct("noiseOff", { why: why?.why, asker: why?.who });
  }, [playing]);

  /* ---------- phone volume + safety ---------- */
  const [dev, setDev] = useState<VolumeState | null>(() => deviceVolume?.get() ?? null);
  useEffect(() => {
    if (!deviceVolume) return;
    const sub = deviceVolume.onChange(setDev);
    const app = AppState.addEventListener("change", (st) => st === "active" && setDev(deviceVolume!.get()));
    return () => { sub.remove(); app.remove(); };
  }, []);

  // The parent picks any volume; hush says how far from the crib the phone has to be for
  // 50 dB there. Android: the phone's media volume. iPhone (volume can't be read): hush's own
  // slider, assuming the phone's volume is all the way up, so the distance errs on the far side.
  // hush's own slider follows the same loudness curve as Android's volume steps.
  const appGain = dev ? 1 : s.vol <= 0 ? 0 : Math.pow(10, stepDb(s.vol, 100) / 20);
  const outDb = dev ? outputDb(dev.step, dev.max) : outputDb(1, 1, appGain);
  const safeDist = outDb == null ? null : safeDistance(outDb);
  const baseLevel = outDb == null ? null : outDb - 20 * Math.log10(safeDist! / 0.3);

  // Older versions held the volume under a ceiling; make sure none is left behind.
  useEffect(() => { deviceVolume?.setCeiling(-1); }, []);

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
    // (Only redrawn on screen; see the timer tick below for why.)
    if (AppState.currentState === "active") setSmartView({ phase: target.phase, db: smartDb.current, nextChange: target.nextChange, hearing: mon.micOn });
    return Math.pow(10, (smartDb.current - LIMIT_DB) / 20);
  }, [isSmart, mon.micOn]);

  // iPhone: while the mic listens (monitor or smart volume), the shared audio session has to
  // allow recording and mixing, or starting/stopping the white noise would cut the mic off.
  const micOn = mon.micOn;
  useEffect(() => {
    const rec = Platform.OS === "ios" && micOn;
    // Android: don't take part in audio focus at all. Otherwise a notification, the mic
    // starting, or any other app's sound pauses the white noise (and a full focus loss never
    // gives it back). The room must never go silent by itself.
    const mix = rec || Platform.OS === "android";
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: mix ? "mixWithOthers" : "doNotMix", allowsRecording: rec }).catch(() => {});
  }, [micOn]);

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
      if (left <= 0) { stopAt.current = 0; if (!endPending("timer")) { stopWhy.current = { why: "timer" }; player.pause(); } }
      else if (left < 60000) fade = left / 60000; // gentle fade over the last minute
    }
    // Smart mode only ever lowers the volume; never let a bad number silence or crash playback.
    const v = gainRef.current * fade * smartFactor();
    player.volume = Number.isFinite(v) ? Math.max(0.02, Math.min(1, v)) : 1;
  }, [player, smartFactor]);

  useEffect(checkTimer, [appGain, status.currentTime, checkTimer]); // status updates keep arriving while locked
  useEffect(() => {
    if (!playing) return;
    // The countdown on screen ticks every second, but only while it's on screen: Android keeps
    // every redraw made with the screen off and applies them all on unlock (an hour of white
    // noise was enough to get hush killed). The timer itself keeps working either way.
    const id = setInterval(() => { checkTimer(); if (AppState.currentState === "active") force((n) => n + 1); }, 1000);
    return () => clearInterval(id);
  }, [playing, checkTimer]);

  const setTimer = useCallback((m: number) => {
    set({ timer: m });
    stopAt.current = m && player.playing ? Date.now() + m * 60000 : 0;
  }, [set, player]);

  // For the diagnostics report: how long hush was in the background, and whether sound played.
  useEffect(() => {
    let since = 0;
    let memo: ReturnType<typeof setInterval> | undefined;
    // Memory every 10 minutes while in the background: a report then shows what grew before a crash.
    const jsHeap = () => {
      try {
        const st = (globalThis as { HermesInternal?: { getInstrumentedStats?: () => { js_heapSize?: number } } }).HermesInternal?.getInstrumentedStats?.();
        return st?.js_heapSize ? `${Math.round(st.js_heapSize / 1_048_576)} MB` : "?";
      } catch { return "?"; }
    };
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "background") {
        since = Date.now();
        diag.mark(`background (sound ${player.playing ? "on" : "off"})`);
        diag.memory(`bg 0m js ${jsHeap()}`);
        if (memo) clearInterval(memo);
        memo = setInterval(() => diag.memory(`bg ${Math.round((Date.now() - since) / 60000)}m js ${jsHeap()} sound ${player.playing ? "on" : "off"}`), 10 * 60_000);
      } else if (st === "active" && since) {
        if (memo) { clearInterval(memo); memo = undefined; }
        diag.mark(`back after ${Math.round((Date.now() - since) / 60000)} min (sound ${player.playing ? "on" : "off"})`);
        diag.memory(`back js ${jsHeap()}`);
        since = 0;
      }
    });
    return () => { sub.remove(); if (memo) clearInterval(memo); };
  }, [player]);

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
    // Quiet for a moment after an interruption (the screen shows it stopped): a tap means play.
    if (resume.current.timer && !player.playing) { cancelResume(); try { player.play(); } catch {} return; }
    if (player.playing) { stopWhy.current = { why: "you" }; return player.pause(); }
    setStarts((n) => n + 1);
    player.volume = gainRef.current;
    // Stopped (not just paused) from the media controls: the player has to load the sound again.
    try { if (!player.isLoaded && !player.isBuffering) { player.replace(soundRef.current.file); player.loop = true; } } catch {}
    player.play();
    try { player.setActiveForLockScreen(true, { title: t(`sound.${loaded.current}`), artist: "hush", artworkUrl: artwork }); } catch {}
  }, [player]);

  // The native listener reports the room to the parents (also with the screen locked).
  useEffect(() => { cryDetector?.setRoom(playing, soundId); }, [playing, soundId]);

  // When the monitor started listening, for the parents (a later "woke up" ends the sleep, not the monitor).
  const listenSince = useRef(0);
  useEffect(() => { listenSince.current = mon.listening ? Date.now() : 0; }, [mon.listening]);

  /* ---------- remote control from another phone in the family ---------- */
  const remote = useRef({ toggle, set, soundId, listening: mon.listening, members: mon.members, me: mon.me, name: mon.m.myName, baby: mon.m.babyName });
  remote.current = { toggle, set, soundId, listening: mon.listening, members: mon.members, me: mon.me, name: mon.m.myName, baby: mon.m.babyName };
  const roomFor = useCallback(() => {
    const r = remote.current;
    // Whether the microphone is really on comes from the native listener, not this screen's state
    // (they can differ after hush was restarted in the background), so phones never flip between answers.
    // Listening only counts as the baby monitor; the mic can also be on just for smart volume.
    const listening = cryDetector ? cryDetector.isMonitoring() : r.listening;
    const canMonitor = !!cryDetector && cryDetector.isListening() && !listening;
    // When it became the baby monitor: the native value (the same one the cloud has), so phones
    // compare like with like when settling which one is the monitor.
    const since = cryDetector ? cryDetector.listenSince() : listenSince.current;
    return { type: "room", from: r.me, name: r.name.trim(), baby: r.baby.trim(), playing: player.playing, sound: r.soundId, listening, canMonitor, listenSince: since, at: Date.now() };
  }, [player]);
  useEffect(() => {
    const sub = addPushListener((n) => {
      const d = n.request.content.data as { type?: string; cmd?: string; sound?: string; from?: string } | undefined;
      const r = remote.current;
      if (d?.type !== "cmd" || !d.from || !r.members.some((p) => p.token === d.from)) return;
      if (!["play", "stop", "sound", "status"].includes(d.cmd ?? "")) return; // "woke" and "clip" are handled elsewhere
      if (d.cmd === "play" && !player.playing) r.toggle();
      else if (d.cmd === "stop" && endPending("remote", r.members.find((p) => p.token === d.from)?.name)) { /* was already quiet */ }
      else if (d.cmd === "stop" && player.playing) { stopWhy.current = { why: "remote", who: r.members.find((p) => p.token === d.from)?.name }; player.pause(); }
      else if (d.cmd === "sound" && d.sound && SOUNDS.some((x) => x.id === d.sound)) r.set({ sound: d.sound });
      // Answer after the change has taken effect. Android answers "status" natively (with battery), so only once.
      if (!(d.cmd === "status" && Platform.OS === "android" && cryDetector)) setTimeout(() => sendData([d.from!], roomFor()), 900);
      Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {});
    });
    return () => sub.remove();
  }, [player, roomFor]);
  // This phone's state in the family's cloud room, whenever it changes (and every 10 minutes while
  // white noise plays, so the others can tell it's still going).
  const { writeLive, cloudReady } = mon;
  useEffect(() => {
    if (!cloudReady) return;
    const write = () => {
      const r = roomFor();
      // listenSince comes from the native side only (this screen's copy restarts with the app).
      writeLive({ playing: r.playing, sound: r.sound, listening: r.listening, canMonitor: r.canMonitor });
    };
    const id0 = setTimeout(write, 800);
    const id = playing ? setInterval(write, 10 * 60_000) : null;
    return () => { clearTimeout(id0); if (id) clearInterval(id); };
  }, [cloudReady, playing, soundId, mon.listening, mon.members.length, writeLive, roomFor]);
  // Tell the other phones when this room changes (someone pressed play, a timer ended, listening
  // started or stopped). Only while listening, or the moment it stops.
  const wasListening = useRef(mon.listening);
  useEffect(() => {
    const changed = wasListening.current !== mon.listening;
    wasListening.current = mon.listening;
    if ((!mon.listening && !changed) || !mon.members.length) return;
    const id = setTimeout(() => sendData(remote.current.members.map((p) => p.token), roomFor()), 1500);
    return () => clearTimeout(id);
  }, [playing, soundId, mon.listening]); // eslint-disable-line react-hooks/exhaustive-deps

  // What's actually reaching the crib, including smart mode's quieting.
  const level = baseLevel != null && isSmart && playing && smartView ? baseLevel + (smartView.db - LIMIT_DB) : baseLevel;

  const timerLeft = playing && stopAt.current ? Math.max(0, stopAt.current - Date.now()) : null;

  // The player reports its position about twice a second (also with the screen off). Only hand
  // the screens a new value when something they show changed, so those reports don't redraw them.
  const smart = isSmart && playing ? smartView : null;
  const value = useMemo(
    () => ({ s, set, soundId, sound, playing, toggle, stop, lastStop, starts, timerLeft, setTimer, dev, setStep, safeDist, level, beat, still, smart }),
    [s, set, soundId, sound, playing, toggle, stop, lastStop, starts, timerLeft == null ? null : Math.round(timerLeft / 1000), setTimer, dev, setStep, safeDist, level, beat, still, smart], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const fmtLeft = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
export const fmtDist = (m: number, unit: "m" | "ft") => (unit === "m" ? `${m.toFixed(1)} m` : `${Math.round(m * 3.281)} ft`);
/** A minimum distance, rounded up so it never reads closer than it is. */
export const fmtMinDist = (m: number, unit: "m" | "ft") => (unit === "m" ? `${(Math.ceil(m * 10) / 10).toFixed(1)} m` : `${Math.ceil(m * 3.281)} ft`);
