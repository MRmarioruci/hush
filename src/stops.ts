// Why the white noise or the baby monitor last stopped, so the app can say so
// ("Stopped at 21:28 · from Parent 1's phone") instead of leaving people guessing.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type StopWhy =
  | "you" // tapped on this phone
  | "woke" // "Woke up" was tapped
  | "remote" // a paired phone asked
  | "timer" // the sleep timer ran out
  | "interrupted" // a call or another app took the audio
  | "system" // the phone closed hush
  | "error"; // the mic stopped working
export type Stop = { at: number; why: StopWhy; who?: string; detail?: string };
type Stops = { sound?: Stop; listen?: Stop; wasListening?: boolean };

const KEY = "hush:stops";
let cache: Stops | null = null;

export async function loadStops(): Promise<Stops> {
  if (cache) return cache;
  try { cache = JSON.parse((await AsyncStorage.getItem(KEY)) ?? "{}"); } catch { cache = {}; }
  return cache!;
}
export async function saveStops(patch: Partial<Stops>) {
  cache = { ...(await loadStops()), ...patch };
  AsyncStorage.setItem(KEY, JSON.stringify(cache)).catch(() => {});
  return cache;
}

/** "Stopped at 21:28 · from Parent 1's phone", or null if there's nothing recent to say. */
export function stopLine(stop: Stop | null, t: (k: string, v?: Record<string, string | number>) => string, time: (ms: number) => string): string | null {
  if (!stop || Date.now() - stop.at > 12 * 3600_000) return null;
  const why = stop.why === "woke" && !stop.who ? t("stop.wokeHere") : t(`stop.${stop.why}`, { who: stop.who ?? t("stop.otherPhone") });
  return t("stop.line", { time: time(stop.at), why });
}
