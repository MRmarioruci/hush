// How loud Hush is at the crib, and how high the phone's volume may go.
//
// Model (an estimate, phones vary):
//  - A phone speaker playing noise at full volume is about 80 dB at 30 cm.
//  - Sound drops about 6 dB each time the distance doubles.
//  - Android's media volume steps follow its default media curve (percent → dB).
// Target: no more than 50 dB at the baby, the hospital-nursery limit used in the
// 2014 Pediatrics study of infant sleep machines.

export const LIMIT_DB = 50;
const PHONE_DB = 80;

export const fullVolumeDb = (meters: number) => PHONE_DB - 20 * Math.log10(meters / 0.3);

// Android's DEFAULT_MEDIA_VOLUME_CURVE: [percent of max, dB].
const CURVE: [number, number][] = [[1, -58], [20, -40], [60, -17], [100, 0]];

export function stepDb(step: number, max: number) {
  if (step <= 0) return -Infinity;
  const p = Math.max(1, (step / max) * 100);
  for (let i = 1; i < CURVE.length; i++) {
    const [p0, d0] = CURVE[i - 1], [p1, d1] = CURVE[i];
    if (p <= p1) return d0 + ((p - p0) / (p1 - p0)) * (d1 - d0);
  }
  return 0;
}

/**
 * Highest phone volume step allowed at this distance, plus extra quieting Hush
 * applies itself when even the lowest step would be too loud.
 */
export function safePlan(meters: number, max: number) {
  const allowed = LIMIT_DB - fullVolumeDb(meters); // ≤ 0: how many dB must come off
  if (allowed >= 0) return { ceiling: max, appGain: 1 };
  let ceiling = 0;
  for (let s = 1; s <= max; s++) if (stepDb(s, max) <= allowed) ceiling = s;
  if (ceiling === 0) return { ceiling: 1, appGain: Math.pow(10, (allowed - stepDb(1, max)) / 20) };
  return { ceiling, appGain: 1 };
}

/** How loud the phone is 30 cm away at this volume step and app gain, in dB. */
export function outputDb(step: number, max: number, appGain = 1) {
  if (step <= 0 || appGain <= 0) return null;
  return PHONE_DB + stepDb(step, max) + 20 * Math.log10(appGain);
}

/** The closest the phone may be to the crib so it's no louder than LIMIT_DB there (m). */
export function safeDistance(db30: number) {
  return Math.max(0.3, 0.3 * Math.pow(10, (db30 - LIMIT_DB) / 20));
}
/** Beyond this the phone is simply too loud for a bedroom. */
export const ROOM_M = 3;

/** Estimated level at the crib for a given phone step. Null when silent. */
export function levelAtCrib(meters: number, step: number, max: number, appGain: number) {
  if (step <= 0 || appGain <= 0) return null;
  return fullVolumeDb(meters) + stepDb(step, max) + 20 * Math.log10(appGain);
}

/** Fallback when the phone's volume can't be read: the app's own 0–100 bar, capped. */
export function capGain(meters: number) {
  return Math.min(1, Math.pow(10, -Math.max(0, fullVolumeDb(meters) - LIMIT_DB) / 20));
}
