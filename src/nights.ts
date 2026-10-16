// Sleep stats, one calendar day (00:00–23:59) at a time. Each listening session is a "sleep",
// labelled night or nap by when it happened. Raw events are kept for the last 14 days;
// anything older is rolled up into one small summary per day and the raw events are deleted,
// so storage stays tiny over the years.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { dateLocale, t } from "./i18n";

export type HushEvent =
  | { type: "listen_start" | "listen_stop" | "noise_start" | "noise_stop"; t: number }
  | { type: "alert"; t: number; first?: boolean }
  | { type: "cry"; t: number; start: number; end: number; peak: number; alerted?: boolean };

/** One listening session. Times are the whole session, even when it crosses midnight. */
export type Sleep = { from: number; to: number; kind: "night" | "nap"; cries: number; cryMin: number };

/** One day, summarised. Also what the baby's phone sends to parents after a sleep. */
export type Night = {
  key: string; // calendar date, YYYY-MM-DD
  from: number; // first listening moment this day
  to: number; // last listening moment this day
  listenedMin: number;
  cries: number;
  cryMin: number;
  longestQuietMin: number;
  firstWake: number | null; // first crying start
  alerts: number;
  hours: number[]; // 24 slots, crying minutes by clock hour
  sleeps?: Sleep[];
  spells: [number, number][]; // [start, end] epoch ms; kept only while raw data is kept
  listening: [number, number][];
  noise: [number, number][];
  baby?: string;
};

const EVENTS = "hush:events";
const NIGHTS = "hush:nights";
export const RAW_DAYS = 14;
const KEEP_DAYS = 3 * 365;
const HOUR = 3600_000;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Days run midnight to midnight, named after their date. */
export const dayKey = (t: number) => ymd(new Date(t));
const dayStart = (key: string) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d).getTime(); };
const nextDay = (key: string) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d + 1).getTime(); };

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

/** How much of [a, b] falls between 7 pm and 7 am. */
function nightOverlap(a: number, b: number) {
  let total = 0;
  const d = new Date(a); d.setHours(0, 0, 0, 0);
  for (let day = d.getTime() - 24 * HOUR; day < b; day += 24 * HOUR) {
    const s = day + 19 * HOUR, e = day + 31 * HOUR; // 19:00 → 07:00 next day
    total += Math.max(0, Math.min(b, e) - Math.max(a, s));
  }
  return total;
}

type Cry = Extract<HushEvent, { type: "cry" }>;

/** Every listening session in the events, labelled night (2 h+ between 7 pm and 7 am) or nap. */
function sleepsOf(evs: HushEvent[], now: number): Sleep[] {
  const cries = evs.filter((e): e is Cry => e.type === "cry");
  return spans(evs, "listen_start", "listen_stop", now).map(([a, b]) => {
    const mine = cries.filter((c) => c.start >= a - 60_000 && c.start <= b);
    return {
      from: a,
      to: b,
      kind: nightOverlap(a, b) >= 2 * HOUR ? "night" : "nap",
      cries: mine.length,
      cryMin: Math.round(mine.reduce((n, c) => n + Math.max(1000, c.end - c.start), 0) / 6000) / 10,
    };
  });
}

const clip = (list: [number, number][], a: number, b: number) =>
  list.map(([s, e]) => [Math.max(s, a), Math.min(e, b)] as [number, number]).filter(([s, e]) => e > s);

/** One day from the raw events (which may start before and end after it). */
export function summarise(key: string, evs: HushEvent[], now = Date.now()): Night | null {
  const a = dayStart(key), b = nextDay(key);
  const listening = clip(spans(evs, "listen_start", "listen_stop", now), a, b);
  if (!listening.length) return null;
  const noise = clip(spans(evs, "noise_start", "noise_stop", now), a, b);
  const cries = evs.filter((e): e is Cry => e.type === "cry" && e.start >= a && e.start < b);
  const spells = cries.map((c) => [c.start, Math.max(c.end, c.start + 1000)] as [number, number]);
  const sleeps = sleepsOf(evs, now).filter((s) => s.to > a && s.from < b);
  const min = (ms: number) => Math.round(ms / 60000);

  // Longest stretch of listening with no crying.
  let quiet = 0;
  for (const [s0, e0] of listening) {
    let cursor = s0;
    for (const [s, e] of spells) {
      if (e < s0 || s > e0) continue;
      quiet = Math.max(quiet, s - cursor);
      cursor = Math.max(cursor, e);
    }
    quiet = Math.max(quiet, e0 - cursor);
  }

  const hours = new Array(24).fill(0);
  for (const [s, e] of spells) {
    for (let t = s; t < e; t += 60000) hours[new Date(t).getHours()] += Math.min(1, (e - t) / 60000);
  }

  return {
    key,
    from: listening[0][0],
    to: listening[listening.length - 1][1],
    listenedMin: min(listening.reduce((n, [s, e]) => n + (e - s), 0)),
    cries: spells.length,
    cryMin: Math.round(spells.reduce((n, [s, e]) => n + (e - s), 0) / 6000) / 10,
    longestQuietMin: min(quiet),
    firstWake: spells.length ? spells[0][0] : null,
    alerts: evs.filter((e) => e.type === "alert" && e.t >= a && e.t < b).length,
    hours: hours.map((h) => Math.round(h * 10) / 10),
    sleeps,
    spells,
    listening,
    noise,
  };
}

/** Days touched by any listening in the events. */
function daysOf(evs: HushEvent[], now: number) {
  const keys = new Set<string>();
  for (const [a, b] of spans(evs, "listen_start", "listen_stop", now)) {
    for (let k = dayKey(a); dayStart(k) < b; k = dayKey(nextDay(k))) keys.add(k);
  }
  return [...keys];
}

/**
 * All days, newest first: recent ones computed from raw events, older ones from summaries.
 * Also rolls up raw events older than RAW_DAYS.
 */
export async function loadNights(now = Date.now()): Promise<Night[]> {
  let events = await read<HushEvent[]>(EVENTS, []);
  let stored = await read<Night[]>(NIGHTS, []);

  // Roll up days that ended more than RAW_DAYS ago.
  const cutoff = dayStart(dayKey(now - RAW_DAYS * 24 * HOUR));
  if (events.some((e) => e.t < cutoff)) {
    const oldDays = daysOf(events, now).filter((k) => nextDay(k) <= cutoff);
    const rolled = oldDays
      .map((k) => summarise(k, events, now))
      .filter((n): n is Night => !!n)
      .map((n) => ({ ...n, spells: [], listening: [], noise: [] }));
    stored = mergeNights(stored, rolled);
    await write(NIGHTS, stored.slice(0, KEEP_DAYS));
    // Keep what's newer; sessions still open at the cutoff restart there.
    const kept: HushEvent[] = events.filter((e) => e.t >= cutoff && !(e.type === "cry" && e.start < cutoff));
    const before = events.filter((e) => e.t < cutoff);
    if (spans(before, "listen_start", "listen_stop", Infinity).some(([, b]) => b === Infinity)) kept.unshift({ type: "listen_start", t: cutoff });
    if (spans(before, "noise_start", "noise_stop", Infinity).some(([, b]) => b === Infinity)) kept.unshift({ type: "noise_start", t: cutoff });
    events = kept.sort((x, y) => x.t - y.t);
    await write(EVENTS, events);
  }

  const live = daysOf(events, now).map((k) => summarise(k, events, now)).filter((n): n is Night => !!n);
  return mergeNights(stored, live);
}

/** Merge by day, preferring the entry with more detail. Newest first. */
export function mergeNights(a: Night[], b: Night[]): Night[] {
  const m = new Map<string, Night>();
  for (const n of [...a, ...b]) {
    const cur = m.get(n.key);
    if (!cur || n.spells.length >= cur.spells.length) m.set(n.key, n);
  }
  return [...m.values()].sort((x, y) => (x.key < y.key ? 1 : -1));
}

/** Parent's phone: keep day summaries that arrived from the baby's phone. */
export async function saveReceivedNights(list: Night[]) {
  const stored = await read<Night[]>(NIGHTS, []);
  await write(NIGHTS, mergeNights(stored, list).slice(0, KEEP_DAYS));
}

/** The sleep that just ended, and the days it touched (for the summary push). */
export async function lastSleep(now = Date.now()): Promise<{ sleep: Sleep; days: Night[] } | null> {
  const events = await read<HushEvent[]>(EVENTS, []);
  const all = sleepsOf(events, now);
  const sleep = all[all.length - 1];
  if (!sleep) return null;
  const days = [dayKey(sleep.from), dayKey(sleep.to)]
    .filter((k, i, l) => l.indexOf(k) === i)
    .map((k) => summarise(k, events, now))
    .filter((n): n is Night => !!n);
  return { sleep, days };
}

/** Compact days for one push (limit ~4 KB): timelines as minutes from each day's `from`. */
export function packNights(list: Night[], baby: string) {
  return {
    type: "days",
    baby,
    d: list.slice(0, 2).map((n) => {
      const m = (t: number) => Math.round((t - n.from) / 60000);
      return {
        ...n,
        spells: undefined,
        listening: undefined,
        noise: undefined,
        s: n.spells.slice(0, 40).map(([a, b]) => [m(a), m(b)]),
        l: n.listening.slice(0, 8).map(([a, b]) => [m(a), m(b)]),
        w: n.noise.slice(0, 8).map(([a, b]) => [m(a), m(b)]),
      };
    }),
  };
}

export function unpackNights(data: unknown): Night[] | null {
  const d = data as { type?: string; baby?: string; d?: (Night & { s?: number[][]; l?: number[][]; w?: number[][] })[] } | undefined;
  if (d?.type !== "days" || !Array.isArray(d.d)) return null;
  return d.d.filter((n) => n?.key).map(({ s = [], l = [], w = [], ...rest }) => {
    const t = (x: number[]) => [rest.from + x[0] * 60000, rest.from + x[1] * 60000] as [number, number];
    return { ...rest, baby: d.baby, spells: s.map(t), listening: l.map(t), noise: w.map(t) };
  });
}

export const fmtDur = (min: number) => {
  const m = Math.round(min);
  return m < 60 ? t("dur.min", { m }) : t("dur.hm", { h: Math.floor(m / 60), mm: String(m % 60).padStart(2, "0") });
};
export const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString(dateLocale(), { hour: "numeric", minute: "2-digit" });
