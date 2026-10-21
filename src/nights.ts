// Sleep stats, one calendar day (00:00–23:59) at a time. Each listening session is a "sleep",
// labelled night or nap by when it happened. Raw events are kept for the last 14 days;
// anything older is rolled up into one small summary per day and the raw events are deleted,
// so storage stays tiny over the years.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { dateLocale, t } from "./i18n";

export type HushEvent =
  | { type: "listen_start" | "listen_stop" | "noise_start" | "noise_stop"; t: number }
  | { type: "alert"; t: number; first?: boolean }
  | { type: "cry"; t: number; start: number; end: number; peak: number; alerted?: boolean }
  /** Grown-ups talking in the room (logged by the listening phone). */
  | { type: "talk"; t: number; start: number; end: number };

/** One sleep: a listening session or a logged one. Times are the whole sleep, even across midnight. */
export type Sleep = { from: number; to: number; kind: "night" | "nap"; cries: number; cryMin: number; id?: string; note?: string; logged?: boolean };

/** A sleep logged by hand ("fell asleep" / "woke up", or added later). `to` null = still asleep. */
export type ManualSleep = { id: string; from: number; to: number | null; kind?: "night" | "nap"; note?: string };
type ManualStore = { list: ManualSleep[]; cleared: Record<string, number> };

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
  /** Which phone recorded it. Missing = this phone. */
  device?: string;
  /** Minutes asleep this day (monitor sessions and logged sleeps together). */
  sleptMin?: number;
  /** Logged sleeps, clipped to the day, for the timeline. */
  logged?: [number, number][];
  /** When this copy was made; the newest copy of a phone's day wins. */
  rev?: number;
  spells: [number, number][]; // [start, end] epoch ms; kept only while raw data is kept
  listening: [number, number][];
  noise: [number, number][];
  baby?: string;
};

const EVENTS = "hush:events";
const DEVICE = "hush:device";
const MANUAL = "hush:manual";
const NIGHTS = "hush:nights";
export const RAW_DAYS = 14;
const KEEP_DAYS = 3 * 365;
const HOUR = 3600_000;
/** No single sleep is longer than this. A monitor left listening for days, or a "woke up" that was
 *  never tapped, would otherwise turn into one 70-hour sleep. */
const LONG = 16 * HOUR;

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

/* ---------- logged sleeps ---------- */

export async function loadManual(): Promise<ManualStore> {
  const m = await read<ManualStore>(MANUAL, { list: [], cleared: {} });
  return { list: m.list ?? [], cleared: m.cleared ?? {} };
}
async function saveManual(m: ManualStore) { await write(MANUAL, m); }

/** The sleep in progress, if one was started by hand. */
export async function openSleep(): Promise<ManualSleep | null> {
  return (await loadManual()).list.find((x) => x.to == null) ?? null;
}
export async function startSleep(at = Date.now()) {
  const m = await loadManual();
  if (m.list.some((x) => x.to == null)) return;
  m.list.push({ id: Math.random().toString(36).slice(2, 10), from: at, to: null });
  await saveManual(m);
}
export async function endSleep(at = Date.now()) {
  const m = await loadManual();
  const open = m.list.find((x) => x.to == null);
  if (!open) return;
  open.to = Math.max(at, open.from + 60_000);
  await saveManual(m);
}
export async function upsertSleep(x: ManualSleep) {
  const m = await loadManual();
  const old = m.list.find((y) => y.id === x.id);
  if (old) markCleared(m, old);
  m.list = [...m.list.filter((y) => y.id !== x.id), x].sort((p, q) => p.from - q.from);
  await saveManual(m);
}
export async function deleteSleep(id: string) {
  const m = await loadManual();
  const old = m.list.find((y) => y.id === id);
  if (!old) return;
  markCleared(m, old);
  m.list = m.list.filter((y) => y.id !== id);
  await saveManual(m);
}
/** Days a changed or deleted sleep touched, so other phones replace their copies. */
function markCleared(m: ManualStore, x: ManualSleep) {
  const end = x.to ?? Date.now();
  for (let k = dayKey(x.from); dayStart(k) < end; k = dayKey(nextDay(k))) m.cleared[k] = Date.now();
}

export async function addEvents(list: HushEvent[]) {
  if (!list.length) return;
  const all = await read<HushEvent[]>(EVENTS, []);
  await write(EVENTS, [...all, ...list].sort((a, b) => a.t - b.t));
}

export const addEvent = (e: HushEvent) => addEvents([e]);

/** Delete every sleep, nap and crying record kept on this phone (Settings → Clear sleep history). */
export async function clearHistory() {
  await AsyncStorage.multiRemove([EVENTS, MANUAL, NIGHTS, "hush:stillAsleepAt", "hush:stops"]).catch(() => {});
}

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

/** Overlapping spans joined, so no minute is counted twice (a day never adds up to more than 24 h). */
export function mergeSpans(list: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [s, e] of [...list].sort((p, q) => p[0] - q[0])) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}
const spanMs = (list: [number, number][]) => mergeSpans(list).reduce((n, [s, e]) => n + (e - s), 0);
const overlap = (p: { from: number; to: number }, q: { from: number; to: number }) => Math.max(0, Math.min(p.to, q.to) - Math.max(p.from, q.from));

/** The same sleep recorded twice (two phones, or monitored and logged) counts once. */
function dedupe(list: Sleep[]): Sleep[] {
  const out: Sleep[] = [];
  for (const x of [...list].sort((p, q) => p.from - q.from)) {
    const twin = out.find((o) => overlap(o, x) > 0.5 * Math.min(o.to - o.from, x.to - x.from));
    if (!twin) out.push(x);
    else if (x.to - x.from > twin.to - twin.from) out[out.indexOf(twin)] = x;
  }
  return out;
}

/**
 * The sleep(s) in one listening session. A normal session is one sleep; one left running for more
 * than 16 h counts each night (7 pm to 7 am) it covered, instead of one impossible sleep.
 */
function sleepSpans(a: number, b: number): [number, number][] {
  if (b - a <= LONG) return [[a, b]];
  const out: [number, number][] = [];
  const d = new Date(a); d.setHours(0, 0, 0, 0);
  for (let day = d.getTime() - 24 * HOUR; day < b; day += 24 * HOUR) {
    const s = Math.max(a, day + 19 * HOUR), e = Math.min(b, day + 31 * HOUR);
    if (e - s >= HOUR) out.push([s, e]);
  }
  return out;
}

type Cry = Extract<HushEvent, { type: "cry" }>;
type Talk = Extract<HushEvent, { type: "talk" }>;

export const kindOf = (a: number, b: number): "night" | "nap" => (nightOverlap(a, b) >= 2 * HOUR ? "night" : "nap");

/**
 * Every sleep: listening sessions, plus logged sleeps that don't mostly overlap one (so a sleep
 * recorded both ways counts once). Labelled night (2 h+ between 7 pm and 7 am) or nap.
 */
function sleepsOf(evs: HushEvent[], now: number, manual: ManualSleep[] = []): Sleep[] {
  const sessions = sessionsOf(evs, now);
  const cries = evs.filter((e): e is Cry => e.type === "cry");
  const logged: Sleep[] = manual
    .map((x) => ({ ...x, to: Math.max(x.from, Math.min(x.to ?? now, x.from + LONG)) }))
    .filter((x) => !sessions.some((s) => Math.min(s.to, x.to) - Math.max(s.from, x.from) > 0.5 * (x.to - x.from)))
    .map((x) => {
      const mine = cries.filter((c) => c.start >= x.from && c.start <= x.to);
      return {
        from: x.from, to: x.to, kind: x.kind ?? kindOf(x.from, x.to), id: x.id, note: x.note, logged: true,
        cries: mine.length, cryMin: Math.round(mine.reduce((n, c) => n + Math.max(1000, c.end - c.start), 0) / 6000) / 10,
      };
    });
  return dedupe([...sessions, ...logged]);
}

/** Crying this long in one go means the baby is up. */
const WAKE_CRY = 10 * 60_000;
/** …or this much crying with grown-ups talking (someone went in to them). */
const WAKE_CRY_TALK = 2 * 60_000, WAKE_TALK = 60_000;
/** Back asleep once the room has been quiet this long. */
const SETTLE = 20 * 60_000;
/** Shorter pieces of sleep between wakings aren't counted. */
const MIN_PIECE = 10 * 60_000;

/**
 * When the baby was awake during [a, b], judged from the room: a waking is a long cry, or a cry
 * with grown-ups talking. At night it lasts until the room has been quiet for 20 minutes (the baby
 * went back to sleep at the last sound); otherwise, or if that hasn't happened yet, they're up.
 */
export function wakings(evs: HushEvent[], a: number, b: number, now: number): [number, number][] {
  const acts = evs
    .filter((e): e is Cry | Talk => (e.type === "cry" || e.type === "talk") && e.end >= a && e.start <= b)
    .map((e) => ({ s: e.start, e: Math.max(e.end, e.start + 1000), cry: e.type === "cry" }))
    .sort((p, q) => p.s - q.s);
  // Sounds closer than SETTLE belong to one episode.
  const eps: { s: number; e: number; cry: number; talk: number }[] = [];
  for (const x of acts) {
    const last = eps[eps.length - 1];
    const ep = last && x.s - last.e < SETTLE ? last : (eps.push({ s: x.s, e: x.e, cry: 0, talk: 0 }), eps[eps.length - 1]);
    ep.e = Math.max(ep.e, x.e);
    if (x.cry) ep.cry += x.e - x.s; else ep.talk += x.e - x.s;
  }
  const end = Math.min(b, now);
  return eps
    .filter((ep) => ep.cry >= WAKE_CRY || (ep.cry >= WAKE_CRY_TALK && ep.talk >= WAKE_TALK))
    // Back to sleep only after a night waking, once a quiet SETTLE has passed while still listening.
    // A morning or nap waking is the end: a quiet room then usually means everyone left it.
    .map((ep) => [ep.s, nightTime(ep.s) && end - ep.e >= SETTLE ? ep.e : b] as [number, number]);
}

/** 7 pm to 5:30 am: a waking then is usually a feed, and the night goes on. */
const nightTime = (t: number) => { const d = new Date(t); const h = d.getHours() + d.getMinutes() / 60; return h >= 19 || h < 5.5; };

/** [a, b] minus the wakings, in pieces long enough to count as sleep. */
function minus(a: number, b: number, gaps: [number, number][], now: number): [number, number][] {
  const out: [number, number][] = [];
  let cur = a;
  for (const [s, e] of mergeSpans(gaps)) {
    if (s > cur) out.push([cur, Math.min(s, b)]);
    cur = Math.max(cur, e);
  }
  if (cur < b) out.push([cur, b]);
  return out.filter(([s, e]) => e - s >= MIN_PIECE || (e === b && b >= now - 60_000));
}

/** Smart sleep detection (Settings, on by default): split listening sessions at the wakings heard. */
let smart = true;
export const setSmartSleep = (on: boolean) => { smart = on; };

function sessionsOf(evs: HushEvent[], now: number): Sleep[] {
  const cries = evs.filter((e): e is Cry => e.type === "cry");
  return spans(evs, "listen_start", "listen_stop", now)
    .flatMap(([s, e]) => (smart ? minus(s, e, wakings(evs, s, e, now), now) : [[s, e] as [number, number]]))
    .flatMap(([s, e]) => sleepSpans(s, e)).map(([a, b]) => {
    const mine = cries.filter((c) => c.start >= a - 60_000 && c.start <= b);
    return {
      from: a,
      to: b,
      kind: kindOf(a, b),
      cries: mine.length,
      cryMin: Math.round(mine.reduce((n, c) => n + Math.max(1000, c.end - c.start), 0) / 6000) / 10,
    };
  });
}

const clip = (list: [number, number][], a: number, b: number) =>
  list.map(([s, e]) => [Math.max(s, a), Math.min(e, b)] as [number, number]).filter(([s, e]) => e > s);

/** One day from the raw events (which may start before and end after it). */
export function summarise(key: string, evs: HushEvent[], now = Date.now(), manual: ManualSleep[] = []): Night | null {
  const a = dayStart(key), b = nextDay(key);
  const listening = mergeSpans(clip(spans(evs, "listen_start", "listen_stop", now), a, b));
  const sleeps = sleepsOf(evs, now, manual).filter((s) => s.to > a && s.from < b);
  if (!listening.length && !sleeps.length) return null;
  const logged = clip(sleeps.filter((x) => x.logged).map((x) => [x.from, x.to] as [number, number]), a, b);
  const asleep = mergeSpans(clip(sleeps.map((x) => [x.from, x.to] as [number, number]), a, b));
  const noise = clip(spans(evs, "noise_start", "noise_stop", now), a, b);
  const cries = evs.filter((e): e is Cry => e.type === "cry" && e.start >= a && e.start < b);
  const spells = cries.map((c) => [c.start, Math.max(c.end, c.start + 1000)] as [number, number]);
  const spanAll = [...listening, ...logged];
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
    from: Math.min(...spanAll.map((x) => x[0])),
    to: Math.max(...spanAll.map((x) => x[1])),
    listenedMin: min(listening.reduce((n, [s, e]) => n + (e - s), 0)),
    sleptMin: min(asleep.reduce((n, [s, e]) => n + (e - s), 0)),
    logged,
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
function daysOf(evs: HushEvent[], now: number, manual: ManualSleep[] = []) {
  const keys = new Set<string>();
  const all = [...spans(evs, "listen_start", "listen_stop", now), ...manual.map((x) => [x.from, x.to ?? now] as [number, number])];
  for (const [a, b] of all) {
    for (let k = dayKey(a); dayStart(k) < b; k = dayKey(nextDay(k))) keys.add(k);
  }
  return [...keys];
}

/**
 * All days, newest first: recent ones computed from raw events, older ones from summaries.
 * Also rolls up raw events older than RAW_DAYS.
 */
/** This phone's id, so days recorded here can be told apart from days received. */
export async function deviceId(): Promise<string> {
  const have = await AsyncStorage.getItem(DEVICE).catch(() => null);
  if (have) return have;
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  await AsyncStorage.setItem(DEVICE, id).catch(() => {});
  return id;
}

/** All days, newest first, with days recorded on several phones combined into one. */
export async function loadNights(now = Date.now()): Promise<Night[]> {
  return combineByDay(await loadAllRecords(now));
}

/** Only the days this phone recorded (what a sync sends), newest first. */
export async function ownNights(now = Date.now()): Promise<Night[]> {
  return (await loadAllRecords(now)).filter((n) => !n.device);
}

/** One record per day per phone. */
async function loadAllRecords(now = Date.now()): Promise<Night[]> {
  let events = await read<HushEvent[]>(EVENTS, []);
  let stored = await read<Night[]>(NIGHTS, []);
  const manual = await loadManual();

  // Roll up days that ended more than RAW_DAYS ago.
  const cutoff = dayStart(dayKey(now - RAW_DAYS * 24 * HOUR));
  if (events.some((e) => e.t < cutoff) || manual.list.some((x) => x.to != null && x.to < cutoff)) {
    const oldDays = daysOf(events, now, manual.list).filter((k) => nextDay(k) <= cutoff);
    const rolled = oldDays
      .map((k) => summarise(k, events, now, manual.list))
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
    manual.list = manual.list.filter((x) => x.to == null || x.to >= cutoff);
    for (const k of Object.keys(manual.cleared)) if (nextDay(k) <= cutoff) delete manual.cleared[k];
    await saveManual(manual);
  }

  const live = daysOf(events, now, manual.list).map((k) => summarise(k, events, now, manual.list)).filter((n): n is Night => !!n);
  // A day whose logged sleeps were all deleted: an empty copy tells other phones to drop theirs.
  const liveKeys = new Set(live.map((n) => n.key));
  const cleared: Night[] = Object.entries(manual.cleared)
    .filter(([k]) => !liveKeys.has(k))
    .map(([k, rev]) => ({ key: k, from: dayStart(k), to: dayStart(k), listenedMin: 0, sleptMin: 0, cries: 0, cryMin: 0, longestQuietMin: 0, firstWake: null, alerts: 0, hours: new Array(24).fill(0), sleeps: [], spells: [], listening: [], noise: [], logged: [], rev }));
  return mergeNights(stored, [...live, ...cleared]);
}

/** Merge by day and phone; a newer or more detailed copy of the same record wins. Newest first. */
export function mergeNights(a: Night[], b: Night[]): Night[] {
  const m = new Map<string, Night>();
  for (const n of [...a, ...b]) {
    const id = `${n.key}|${n.device ?? ""}`;
    const cur = m.get(id);
    const newer = (n.rev ?? 0) !== (cur?.rev ?? 0) ? (n.rev ?? 0) > (cur?.rev ?? 0) : !cur || n.to > cur.to || (n.to === cur.to && n.spells.length >= cur.spells.length);
    if (!cur || newer) m.set(id, n);
  }
  return [...m.values()].sort((x, y) => (x.key < y.key ? 1 : -1));
}

/** Several phones listened on the same day: add their records up into one day. */
function combine(list: Night[]): Night {
  if (list.length === 0) return { key: "", from: 0, to: 0, listenedMin: 0, cries: 0, cryMin: 0, longestQuietMin: 0, firstWake: null, alerts: 0, hours: [], spells: [], listening: [], noise: [] };
  const byStart = <T extends [number, number]>(xs: T[]) => xs.sort((p, q) => p[0] - q[0]);
  const firsts = list.map((n) => n.firstWake).filter((x): x is number => x != null);
  // Time is joined across phones, not added: two phones on the same night is still one night.
  const d0 = dayStart(list[0].key), d1 = nextDay(list[0].key);
  // Copies made by older versions (or another phone) may still hold one huge sleep: split it too.
  const sleeps = dedupe(list.flatMap((n) => n.sleeps ?? []).flatMap((x) =>
    x.to - x.from <= LONG ? [x] : sleepSpans(x.from, x.to).map(([from, to], i) => ({ ...x, from, to, kind: "night" as const, cries: i ? 0 : x.cries, cryMin: i ? 0 : x.cryMin }))));
  const listening = list.flatMap((n) => n.listening);
  const min = (ms: number) => Math.min(24 * 60, Math.round(ms / 60000));
  const most = (f: (n: Night) => number) => Math.min(24 * 60, Math.max(...list.map(f)));
  return {
    key: list[0].key,
    from: Math.min(...list.map((n) => n.from)),
    to: Math.max(...list.map((n) => n.to)),
    listenedMin: listening.length ? min(spanMs(clip(listening, d0, d1))) : most((n) => n.listenedMin),
    sleptMin: sleeps.length ? min(spanMs(clip(sleeps.map((x) => [x.from, x.to] as [number, number]), d0, d1))) : most((n) => n.sleptMin ?? n.listenedMin),
    logged: byStart(list.flatMap((n) => n.logged ?? [])),
    cries: list.reduce((a, n) => a + n.cries, 0),
    cryMin: Math.round(list.reduce((a, n) => a + n.cryMin, 0) * 10) / 10,
    longestQuietMin: Math.max(...list.map((n) => n.longestQuietMin)),
    firstWake: firsts.length ? Math.min(...firsts) : null,
    alerts: list.reduce((a, n) => a + n.alerts, 0),
    hours: Array.from({ length: 24 }, (_, h) => Math.round(list.reduce((a, n) => a + (n.hours[h] ?? 0), 0) * 10) / 10),
    sleeps,
    spells: byStart(list.flatMap((n) => n.spells)),
    listening: mergeSpans(listening),
    noise: byStart(list.flatMap((n) => n.noise)),
    baby: list.find((n) => n.baby)?.baby,
  };
}

function combineByDay(records: Night[]): Night[] {
  const by = new Map<string, Night[]>();
  for (const n of records) (by.get(n.key) ?? by.set(n.key, []).get(n.key)!).push(n);
  return [...by.values()]
    .map((list) => combine(list.filter((n) => n.listenedMin > 0 || (n.sleeps ?? []).length > 0 || n.spells.length > 0)))
    .filter((n) => n.listenedMin > 0 || (n.sleeps ?? []).length > 0)
    .sort((x, y) => (x.key < y.key ? 1 : -1));
}

/** Keep days that arrived from another phone (never our own, echoed back). */
let saving: Promise<void> = Promise.resolve();
export function saveReceivedNights(list: Night[]): Promise<void> {
  // Many sync messages can land at once; save them one after another so none is lost.
  saving = saving.then(() => saveNow(list)).catch(() => {});
  return saving;
}
async function saveNow(list: Night[]) {
  const me = await deviceId();
  list = list.filter((n) => n.device && n.device !== me);
  if (!list.length) return;
  const stored = await read<Night[]>(NIGHTS, []);
  await write(NIGHTS, mergeNights(stored, list).slice(0, KEEP_DAYS));
}

/** The sleep that just ended, and the days it touched (for the summary push). */
export async function lastSleep(now = Date.now()): Promise<{ sleep: Sleep; days: Night[] } | null> {
  const events = await read<HushEvent[]>(EVENTS, []);
  const all = sessionsOf(events, now);
  const sleep = all[all.length - 1];
  if (!sleep) return null;
  const days = [dayKey(sleep.from), dayKey(sleep.to)]
    .filter((k, i, l) => l.indexOf(k) === i)
    .map((k) => summarise(k, events, now))
    .filter((n): n is Night => !!n);
  return { sleep, days };
}

/** Compact days for one push (limit ~4 KB): timelines as minutes from each day's `from`. */
export function packNights(list: Night[], baby: string, device?: string) {
  return {
    type: "days",
    baby,
    device,
    d: list.slice(0, 2).map((n) => {
      const m = (t: number) => Math.round((t - n.from) / 60000);
      return {
        ...n,
        rev: n.rev ?? Date.now(),
        logged: (n.logged ?? []).slice(0, 12),
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
  const d = data as { type?: string; baby?: string; device?: string; d?: (Night & { s?: number[][]; l?: number[][]; w?: number[][] })[] } | undefined;
  if (d?.type !== "days" || !Array.isArray(d.d)) return null;
  // Older versions didn't say which phone sent it; treat that as one unnamed phone.
  const device = d.device || "paired";
  return d.d.filter((n) => n?.key).map(({ s = [], l = [], w = [], ...rest }) => {
    const t = (x: number[]) => [rest.from + x[0] * 60000, rest.from + x[1] * 60000] as [number, number];
    return { ...rest, device, baby: d.baby, spells: s.map(t), listening: l.map(t), noise: w.map(t) };
  });
}

export const fmtDur = (min: number) => {
  const m = Math.round(min);
  return m < 60 ? t("dur.min", { m }) : t("dur.hm", { h: Math.floor(m / 60), mm: String(m % 60).padStart(2, "0") });
};
export const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString(dateLocale(), { hour: "numeric", minute: "2-digit" });
