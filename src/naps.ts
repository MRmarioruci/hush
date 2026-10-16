// Nap timing by age. Typical ranges, nudged toward the baby's own recent awake times.
//
// Awake times and nap counts: common baby-sleep guidance (no official standard exists).
// Total sleep: American Academy of Sleep Medicine consensus (4–12 months 12–16 h, 1–2 years
// 11–14 h, 3–5 years 10–13 h per 24 h; none given under 4 months).
import type { Sleep } from "./nights";

export type AgeBand = {
  /** Upper age bound in months (exclusive). */
  until: number;
  wake: [number, number]; // minutes awake between sleeps
  naps: [number, number];
  total: [number, number] | null; // hours per 24 h
  /** Index into the "coming up" texts. */
  stage: number;
};

export const BANDS: AgeBand[] = [
  { until: 1, wake: [35, 60], naps: [5, 7], total: null, stage: 0 },
  { until: 3, wake: [60, 90], naps: [4, 5], total: null, stage: 1 },
  { until: 5, wake: [90, 150], naps: [3, 4], total: [12, 16], stage: 2 },
  { until: 8, wake: [120, 180], naps: [2, 3], total: [12, 16], stage: 3 },
  { until: 12, wake: [150, 210], naps: [2, 2], total: [12, 16], stage: 4 },
  { until: 18, wake: [180, 300], naps: [1, 2], total: [11, 14], stage: 5 },
  { until: 36, wake: [300, 360], naps: [1, 1], total: [11, 14], stage: 6 },
  { until: 999, wake: [300, 420], naps: [0, 1], total: [10, 13], stage: 6 },
];

const MIN = 60_000;

/** Age in months (fractional) from a YYYY-MM-DD birthday. */
export function ageMonths(birthday: string | null, now = Date.now()): number | null {
  if (!birthday) return null;
  const [y, m, d] = birthday.split("-").map(Number);
  if (!y || !m || !d) return null;
  const born = new Date(y, m - 1, d).getTime();
  if (born > now) return 0;
  return (now - born) / (30.4375 * 24 * 3600_000);
}

export const bandFor = (months: number) => BANDS.find((b) => months < b.until) ?? BANDS[BANDS.length - 1];

/** Awake gaps between recent daytime sleeps, newest first (minutes). */
function recentWakeGaps(sleeps: Sleep[], now: number): number[] {
  const list = sleeps.filter((s) => s.to <= now && s.from > now - 4 * 24 * 3600_000).sort((a, b) => a.from - b.from);
  const gaps: number[] = [];
  for (let i = 1; i < list.length; i++) {
    const woke = list[i - 1].to, slept = list[i].from;
    const h = new Date(woke).getHours();
    const gap = (slept - woke) / MIN;
    // The stretch before bedtime runs long and isn't a nap gap.
    if (list[i].kind !== "night" && h >= 6 && h < 20 && gap >= 15 && gap <= 8 * 60) gaps.push(gap);
  }
  return gaps.reverse().slice(0, 6);
}

export type NapState =
  | { asleep: true; since: number }
  | {
      asleep: false;
      awakeSince: number | null;
      band: AgeBand | null;
      /** Suggested start of the next sleep, and the window around it. */
      target: number | null;
      sweet: [number, number] | null;
      /** The baby's own recent average awake time, when there's enough to go on. */
      personal: number | null;
      /** The next sleep is likely bedtime rather than a nap. */
      bedtime: boolean;
    };

/**
 * Where things stand: asleep since when, or awake since when and when the next sleep is likely.
 * `sleeps` are all known sleeps (any phone); `openFrom` is a sleep in progress on this phone.
 */
export function napState(sleeps: Sleep[], birthday: string | null, openFrom: number | null, now = Date.now()): NapState {
  if (openFrom != null) return { asleep: true, since: openFrom };
  const done = sleeps.filter((s) => s.to <= now + MIN).sort((a, b) => b.to - a.to);
  const awakeSince = done.length ? done[0].to : null;
  const months = ageMonths(birthday, now);
  const band = months == null ? null : bandFor(months);
  const gaps = recentWakeGaps(sleeps, now);
  const personal = gaps.length >= 3 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
  if (!band || awakeSince == null) return { asleep: false, awakeSince, band, target: null, sweet: null, personal, bedtime: false };

  const [lo, hi] = band.wake;
  const mid = (lo + hi) / 2;
  // Lean toward the baby's own rhythm, but stay near the age range.
  const wake = personal == null ? mid : Math.min(hi * 1.15, Math.max(lo * 0.85, (mid + personal) / 2));
  const target = awakeSince + wake * MIN;
  const half = Math.max(10, wake * 0.15) * MIN;
  const bedtime = new Date(target).getHours() >= 18 || new Date(target).getHours() < 4;
  return { asleep: false, awakeSince, band, target, sweet: [target - half, target + half], personal, bedtime };
}
