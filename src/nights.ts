// Night stats. Raw events for the last 14 nights; anything older is rolled up into one small
// summary per night and the raw events are deleted, so storage stays tiny over the years.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { dateLocale, t } from "./i18n";

export type HushEvent =
  | { type: "listen_start" | "listen_stop" | "noise_start" | "noise_stop"; t: number }
  | { type: "alert"; t: number; first?: boolean }
  | { type: "cry"; t: number; start: number; end: number; peak: number; alerted?: boolean };

/** One night, summarised. Also what the baby's phone sends to parents each morning. */
export type Night = {
  key: string; // evening date, YYYY-MM-DD
  from: number; // first listening start
  to: number; // last listening stop
  listenedMin: number;
  cries: number;
  cryMin: number;
  longestQuietMin: number;
  firstWake: number | null; // first crying start
  alerts: number;
  hours: number[]; // 24 slots, crying minutes by clock hour
  spells: [number, number][]; // [start, end] epoch ms; kept only while raw data is kept
  listening: [number, number][];
  noise: [number, number][];
  baby?: string;
};

const EVENTS = "hush:events";
const NIGHTS = "hush:nights";
export const RAW_NIGHTS = 14;
const KEEP_NIGHTS = 3 * 365;

/** Nights run noon to noon, named after the evening they start on. */
export function nightKey(t: number) {
  const d = new Date(t - 12 * 3600_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
const write = (key: string, v: unknown) => AsyncStorage.setItem(key, JSON.stringify(v)).catch(() => {});

export async function addEvents(list: HushEvent[]) {
  if (!list.length) return;
  const all = await read<HushEvent[]>(EVENTS, []);
  await write(EVENTS, [...all, ...list].sort((a, b) => a.t - b.t));
}

export const addEvent = (e: HushEvent) => addEvents([e]);

/** Pair start/stop events into [start, end] spans, closing an open span at `until`. */
function spans(evs: HushEvent[], on: string, off: string, until: number): [number, number][] {
  const out: [number, number][] = [];
  let open: number | null = null;
  for (const e of evs) {
    if (e.type === on && open == null) open = e.t;
    else if (e.type === off && open != null) { out.push([open, e.t]); open = null; }
  }
  if (open != null) out.push([open, Math.max(open, until)]);
  return out;
}

export function summarise(key: string, evs: HushEvent[], now = Date.now()): Night | null {
  const listening = spans(evs, "listen_start", "listen_stop", now);
  if (!listening.length) return null;
  const noise = spans(evs, "noise_start", "noise_stop", now);
  const cries = evs.filter((e): e is Extract<HushEvent, { type: "cry" }> => e.type === "cry");
  const spells = cries.map((c) => [c.start, Math.max(c.end, c.start + 1000)] as [number, number]);
  const from = listening[0][0];
  const to = listening[listening.length - 1][1];
  const min = (ms: number) => Math.round(ms / 60000);

  // Longest stretch of listening with no crying.
  let quiet = 0;
  for (const [a, b] of listening) {
    let cursor = a;
    for (const [s, e] of spells) {
      if (e < a || s > b) continue;
      quiet = Math.max(quiet, s - cursor);
      cursor = Math.max(cursor, e);
    }
    quiet = Math.max(quiet, b - cursor);
  }

  const hours = new Array(24).fill(0);
  for (const [s, e] of spells) {
    for (let t = s; t < e; t += 60000) hours[new Date(t).getHours()] += Math.min(1, (e - t) / 60000);
  }

  return {
    key,
    from,
    to,
    listenedMin: min(listening.reduce((n, [a, b]) => n + (b - a), 0)),
    cries: spells.length,
    cryMin: Math.round(spells.reduce((n, [a, b]) => n + (b - a), 0) / 6000) / 10,
    longestQuietMin: min(quiet),
    firstWake: spells.length ? spells[0][0] : null,
    alerts: evs.filter((e) => e.type === "alert").length,
    hours: hours.map((h) => Math.round(h * 10) / 10),
    spells,
    listening,
    noise,
  };
}

/**
 * All nights, newest first: recent ones computed from raw events, older ones from summaries.
 * Also rolls up raw events older than RAW_NIGHTS and saves nights received from the baby's phone.
 */
export async function loadNights(): Promise<Night[]> {
  const events = await read<HushEvent[]>(EVENTS, []);
  let stored = await read<Night[]>(NIGHTS, []);

  const byKey = new Map<string, HushEvent[]>();
  for (const e of events) {
    const k = nightKey(e.type === "cry" ? e.start : e.t);
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(e);
  }
  const keys = [...byKey.keys()].sort().reverse();
  const recent = new Set(keys.slice(0, RAW_NIGHTS));

  // Roll up old nights: keep the summary, drop timelines and raw events.
  const old = keys.filter((k) => !recent.has(k));
  if (old.length) {
    const rolled = old
      .map((k) => summarise(k, byKey.get(k)!))
      .filter((n): n is Night => !!n)
      .map((n) => ({ ...n, spells: [], listening: [], noise: [] }));
    stored = mergeNights(stored, rolled);
    await write(NIGHTS, stored.slice(0, KEEP_NIGHTS));
    await write(EVENTS, events.filter((e) => recent.has(nightKey(e.type === "cry" ? e.start : e.t))));
  }

  const live = [...recent].map((k) => summarise(k, byKey.get(k)!)).filter((n): n is Night => !!n);
  return mergeNights(stored, live);
}

/** Merge by night, preferring the entry with more detail. Newest first. */
export function mergeNights(a: Night[], b: Night[]): Night[] {
  const m = new Map<string, Night>();
  for (const n of [...a, ...b]) {
    const cur = m.get(n.key);
    if (!cur || n.spells.length >= cur.spells.length) m.set(n.key, n);
  }
  return [...m.values()].sort((x, y) => (x.key < y.key ? 1 : -1));
}

/** Parent's phone: keep a night summary that arrived from the baby's phone. */
export async function saveReceivedNight(n: Night) {
  const stored = await read<Night[]>(NIGHTS, []);
  await write(NIGHTS, mergeNights(stored, [n]).slice(0, KEEP_NIGHTS));
}

/** Compact a night for sending in a push (limit ~4 KB): timelines as minutes from `from`. */
export function packNight(n: Night, baby: string) {
  const m = (t: number) => Math.round((t - n.from) / 60000);
  return {
    type: "night",
    baby,
    n: {
      ...n,
      spells: undefined,
      listening: undefined,
      noise: undefined,
      s: n.spells.slice(0, 60).map(([a, b]) => [m(a), m(b)]),
      l: n.listening.slice(0, 10).map(([a, b]) => [m(a), m(b)]),
      w: n.noise.slice(0, 10).map(([a, b]) => [m(a), m(b)]),
    },
  };
}

export function unpackNight(data: unknown): Night | null {
  const d = data as { type?: string; baby?: string; n?: Night & { s?: number[][]; l?: number[][]; w?: number[][] } } | undefined;
  if (d?.type !== "night" || !d.n?.key) return null;
  const { s = [], l = [], w = [], ...rest } = d.n;
  const t = (x: number[]) => [rest.from + x[0] * 60000, rest.from + x[1] * 60000] as [number, number];
  return { ...rest, baby: d.baby, spells: s.map(t), listening: l.map(t), noise: w.map(t) };
}

export const fmtDur = (min: number) => {
  const m = Math.round(min);
  return m < 60 ? t("dur.min", { m }) : t("dur.hm", { h: Math.floor(m / 60), mm: String(m % 60).padStart(2, "0") });
};
export const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });
