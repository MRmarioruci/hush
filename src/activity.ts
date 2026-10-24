// The room's shared history: what each phone did and when (baby monitor on/off, white noise,
// asleep/awake, "I'm on it"). Each phone records its own actions and sends them to the others,
// so every phone shows the same story instead of guessing ("turned off here").
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ActKind = "monOn" | "monOff" | "noiseOn" | "noiseOff" | "asleep" | "awake" | "onit";
export type Act = {
  k: ActKind;
  at: number;
  /** The phone it happened on (push address); "" = this phone before its address is known. */
  by: string;
  /** That phone's name when it happened. */
  name: string;
  /** Why it stopped (you / remote / timer / system / error / woke / smart). */
  why?: string;
  /** Who asked, when a paired phone did it remotely. */
  asker?: string;
  sound?: string;
  id: string;
};

const KEY = "hush:acts";
const KEEP = 40;
let list: Act[] = [];
let loaded = false;
const subs = new Set<(l: Act[]) => void>();
type Transport = { me: () => string; myName: () => string; send: (a: Act) => void };
let transport: Transport | null = null;

async function load() {
  if (loaded) return;
  loaded = true;
  try { const raw = await AsyncStorage.getItem(KEY); if (raw) list = merge(list, JSON.parse(raw)); } catch {}
  emit();
}
function merge(a: Act[], b: Act[]) {
  const m = new Map<string, Act>();
  for (const x of [...a, ...b]) if (x && x.id && x.k && x.at) m.set(x.id, x);
  return [...m.values()].sort((p, q) => q.at - p.at).slice(0, KEEP);
}
function emit() {
  AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => {});
  for (const f of subs) f(list);
}

/** The monitor state connects this to the family (who we are, how to reach the others). */
export function setActTransport(t: Transport | null) { transport = t; load(); }

/** Something happened on this phone: keep it and tell the others. */
export function logAct(k: ActKind, extra: Partial<Pick<Act, "why" | "asker" | "sound">> = {}) {
  const a: Act = { k, at: Date.now(), by: transport?.me() ?? "", name: transport?.myName() ?? "", id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, ...extra };
  list = merge(list, [a]);
  emit();
  try { transport?.send(a); } catch {}
}

/** Something happened on another phone in the family. */
export function receiveAct(a: Act) { receiveActs([a]); }
/** Several at once (the cloud room's log): one save, one redraw, and only if something is new. */
export function receiveActs(xs: Act[]) {
  const ok = xs.filter((a) => a?.id && a.k && a.at > clearedAt).map((a) => ({ ...a, at: Math.min(a.at, Date.now()) }));
  if (!ok.length) return;
  const next = merge(list, ok);
  if (next.length === list.length && next.every((x, i) => x.id === list[i].id)) return;
  list = next;
  emit();
}

export function subscribeActs(f: (l: Act[]) => void) {
  subs.add(f);
  load().then(() => f(list));
  f(list);
  return () => { subs.delete(f); };
}
/** Cleared here: older entries (from the room, or late pushes) don't come back. */
let clearedAt = 0;
AsyncStorage.getItem("hush:actsCleared").then((v) => { clearedAt = Number(v) || 0; }).catch(() => {});
export const clearActs = () => {
  clearedAt = Date.now();
  AsyncStorage.setItem("hush:actsCleared", String(clearedAt)).catch(() => {});
  list = []; emit();
};
