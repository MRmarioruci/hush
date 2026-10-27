// Smart volume: full while the baby falls asleep, then down to a quieter level, and back up when
// the baby stirs: gradually, for a while, then easing back. The parent sets each part (Sounds →
// Smart volume). Levels are a share of the volume the parent set, which is already the safe level
// for the crib, so smart volume only ever makes it quieter, never louder.

export type SmartPlan = {
  /** Minutes to fade in at the start (0 = start at full). */
  fade: number;
  /** Minutes at full before it starts dropping. */
  hold: number;
  /** Minutes the drop takes. */
  ease: number;
  /** The quiet level, % of full (amplitude). */
  low: number;
  /** When the baby stirs: seconds to rise, how high (%), minutes it stays up after the last sound, minutes to ease back. */
  riseS: number;
  peak: number;
  stay: number;
  back: number;
  /** Rise at fussing (any sound like crying), or only at real crying. */
  on: "fuss" | "cry";
};
export const PLAN_DEFAULTS: SmartPlan = { fade: 1, hold: 20, ease: 30, low: 50, riseS: 30, peak: 100, stay: 10, back: 10, on: "fuss" };
export const RISE_STEPS = [5, 10, 30, 60, 90, 120, 180];

export type SmartPhase = "fading" | "settling" | "easing" | "sleeping" | "rising" | "up" | "calming";
/** A stirring spell: when it started, and when a sound was last heard. */
export type Stir = { start: number; last: number };

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, f: number) => a + (b - a) * clamp(f);

/** The planned level (no stirring), as a share of full. */
export function planLevel(p: SmartPlan, minutes: number): { level: number; phase: SmartPhase; next: number | null } {
  const low = Math.min(100, Math.max(5, p.low)) / 100;
  const t = Math.max(0, minutes);
  if (p.fade > 0 && t < p.fade) return { level: lerp(0.15, 1, t / p.fade), phase: "fading", next: p.fade };
  const h = p.fade + p.hold;
  if (t < h) return { level: 1, phase: "settling", next: h };
  if (t < h + p.ease) return { level: lerp(1, low, (t - h) / Math.max(0.01, p.ease)), phase: "easing", next: h + p.ease };
  return { level: low, phase: "sleeping", next: null };
}

/**
 * Where the volume should be now: the plan, lifted while the baby stirs. The lift ramps up over
 * `riseS` from wherever the plan is, stays up until `stay` minutes after the last sound, then eases
 * back over `back` minutes. Never below the plan.
 */
export function smartLevel(p: SmartPlan, now: number, startedAt: number, stir: Stir | null): { level: number; phase: SmartPhase; nextChange: number | null } {
  const base = planLevel(p, (now - startedAt) / 60_000);
  let level = base.level, phase = base.phase;
  let nextChange = base.next == null ? null : startedAt + base.next * 60_000;
  if (stir) {
    const peak = Math.max(base.level, Math.min(100, p.peak) / 100);
    const from = planLevel(p, (stir.start - startedAt) / 60_000).level;
    const rise = (now - stir.start) / Math.max(1000, p.riseS * 1000);
    const stayUntil = stir.last + p.stay * 60_000;
    let lift: number, ph: SmartPhase, nx: number | null;
    if (rise < 1) { lift = lerp(from, peak, rise); ph = "rising"; nx = stir.start + p.riseS * 1000; }
    else if (now < stayUntil) { lift = peak; ph = "up"; nx = stayUntil; }
    else { lift = lerp(peak, base.level, (now - stayUntil) / Math.max(1, p.back * 60_000)); ph = "calming"; nx = stayUntil + p.back * 60_000; }
    if (lift > level + 0.001) { level = lift; phase = ph; nextChange = nx; }
  }
  return { level, phase, nextChange };
}

/** Whether a stirring spell is over (back on the plan), so a new sound starts a new one. */
export const stirOver = (p: SmartPlan, s: Stir, now: number) => now > s.last + (p.stay + p.back) * 60_000;

/** How loud a level sounds, roughly, as a share of full (10 dB quieter ≈ half as loud). */
export const sounds = (level: number) => Math.pow(2, (20 * Math.log10(Math.max(0.01, level))) / 10);
