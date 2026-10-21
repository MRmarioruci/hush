// Smart volume: louder while the baby falls asleep, quieter once settled, louder again when
// the baby cries. Levels are dB at the crib and never go above the safe limit.
import { LIMIT_DB } from "./safety";

export const SMART = {
  startDb: LIMIT_DB, // while falling asleep
  sleepDb: LIMIT_DB - 6, // once settled (about half as loud to the ear)
  holdMin: 20, // stay at the start level this long
  easeMin: 30, // then lower over this long
  calmHoldMin: 5, // after crying stops, stay up this long
  calmEaseMin: 10, // then lower again over this long
};

export type SmartPhase = "settling" | "easing" | "sleeping" | "calming";

const lerp = (a: number, b: number, f: number) => a + (b - a) * Math.min(1, Math.max(0, f));

/** Where the level should be right now, and why. */
export function smartTarget(now: number, startedAt: number, lastCryAt: number | null): { db: number; phase: SmartPhase; nextChange: number | null } {
  const min = 60_000;
  const t = (now - startedAt) / min;
  let db: number, phase: SmartPhase, nextChange: number | null;
  if (t < SMART.holdMin) {
    db = SMART.startDb; phase = "settling"; nextChange = startedAt + SMART.holdMin * min;
  } else if (t < SMART.holdMin + SMART.easeMin) {
    db = lerp(SMART.startDb, SMART.sleepDb, (t - SMART.holdMin) / SMART.easeMin); phase = "easing";
    nextChange = startedAt + (SMART.holdMin + SMART.easeMin) * min;
  } else {
    db = SMART.sleepDb; phase = "sleeping"; nextChange = null;
  }
  if (lastCryAt != null) {
    const c = (now - lastCryAt) / min;
    const boost = c < SMART.calmHoldMin ? SMART.startDb : lerp(SMART.startDb, SMART.sleepDb, (c - SMART.calmHoldMin) / SMART.calmEaseMin);
    if (c < SMART.calmHoldMin + SMART.calmEaseMin && boost >= db) {
      db = boost; phase = "calming"; nextChange = lastCryAt + (SMART.calmHoldMin + SMART.calmEaseMin) * min;
    }
  }
  return { db, phase, nextChange };
}
