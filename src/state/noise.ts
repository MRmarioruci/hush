// White noise, from any screen, the widget, the tile, shortcuts or notification buttons: one rule
// for where it plays. This phone is the baby monitor, or no phone is: here. Another phone is the
// baby monitor: there (this phone is its remote), and what's shown is that phone's real state.
//
// A remote change is "pending" until the baby monitor reports the new state (white noise on/off,
// the sound), so a spinner never stops on just any message; after 15 s with no such report it says
// there was no answer.
import { useEffect, useState } from "react";
import { getMyToken, sendData } from "../monitor";
import { useMonitor } from "./monitor";
import { useSleep } from "./sleep";
import { babyLabel, t } from "../i18n";

type Want = { token: string; playing?: boolean; sound?: string; at: number };
let want: Want | null = null;
let failedAt = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** Send a change to the baby monitor phone and wait for it to show up. */
export async function remoteNoise(token: string, change: { playing?: boolean; sound?: string }) {
  want = { token, ...change, at: Date.now() };
  failedAt = 0;
  emit();
  const cmd = change.sound ? "sound" : change.playing ? "play" : "stop";
  let ok = false;
  try { ok = await sendData([token], { type: "cmd", cmd, sound: change.sound, from: await getMyToken() }); } catch {}
  if (!ok && want?.at && want.token === token) { want = null; failedAt = Date.now(); emit(); }
}

export type Noise = {
  /** "here": this phone plays it. "remote": the baby monitor phone does (this phone is its remote). */
  where: "here" | "remote";
  /** The baby monitor phone's name, and its room ("Sebastian's room"), when remote. */
  phone: string;
  room: string;
  playing: boolean;
  soundId: string;
  toggle: () => void;
  setSound: (id: string) => void;
  /** Waiting for the baby monitor to make the change. */
  pending: boolean;
  /** The last change didn't happen (couldn't send, or no answer in 15 s). */
  failed: boolean;
};

export function useNoise(): Noise {
  const sleep = useSleep();
  const mon = useMonitor();
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((x) => x + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  const token = mon.listening ? null : mon.target;
  const r = token ? mon.room : null;

  // Done once the baby monitor reports what was asked for; no answer after 15 s.
  const w = want && want.token === token ? want : null;
  const done = !!w && !!r && (w.playing === undefined || !!r.playing === w.playing) && (w.sound === undefined || r.sound === w.sound) && (r.got ?? 0) >= w.at - 1000;
  useEffect(() => {
    if (!w) return;
    if (done) { want = null; emit(); return; }
    const id = setTimeout(() => { if (want === w) { want = null; failedAt = Date.now(); emit(); } }, Math.max(0, w.at + 15_000 - Date.now()));
    return () => clearTimeout(id);
  }, [w, done]);

  if (!token) {
    return {
      where: "here", phone: "", room: "", playing: sleep.playing, soundId: sleep.soundId,
      toggle: sleep.toggle, setSound: (id) => sleep.set({ sound: id }), pending: false, failed: false,
    };
  }
  const member = mon.members.find((p) => p.token === token);
  const phone = (r?.name || member?.name || "").trim() || t("rt.otherPhone");
  const baby = r?.baby || mon.m.babyName;
  // While a change is on its way, show what was asked for.
  const playing = w?.playing ?? !!r?.playing;
  const soundId = w?.sound ?? r?.sound ?? sleep.soundId;
  return {
    where: "remote", phone, room: baby.trim() ? t("hero.room", { name: babyLabel(baby) }) : t("rx.room"),
    playing, soundId,
    toggle: () => { remoteNoise(token, { playing: !playing }); },
    setSound: (id) => { remoteNoise(token, { sound: id }); },
    pending: !!w && !done, failed: Date.now() - failedAt < 10_000,
  };
}
