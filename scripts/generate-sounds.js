// Generates the seamless 16-second loops in assets/sounds as 16-bit mono WAV.
// Run with `npm run sounds`. Output is committed, so this only needs re-running when a sound changes.
const fs = require("fs");
const path = require("path");

const SR = 16000, LOOP = 16, FADE = 1; // modulation periods (0.8 s, 2 s, 8 s) divide 16 s, so loops are seamless

// Small seeded PRNG so the files are reproducible.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// RBJ biquad filter (lowpass / highpass / bandpass), run sample by sample.
function biquad(type, f0, q) {
  const w = (2 * Math.PI * f0) / SR, c = Math.cos(w), a = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === "lp") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
  else if (type === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
  else { b0 = a; b1 = 0; b2 = -a; }
  const a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}

// A soft music-box note (sine with a little bell overtone).
const note = (f, t) => (t < 0 || t > 3 ? 0 : (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 4)) * Math.exp(-t * 1.6) * (1 - Math.exp(-t * 300)));
// An original lullaby line over 16 s: [start s, MIDI note].
const LULLABY = [[0, 72], [1, 76], [2, 79], [3, 76], [4, 74], [5, 77], [6, 81], [7, 77], [8, 72], [9, 76], [10, 79], [11, 84], [12, 83], [13, 79], [14, 74], [15, 71]];
const BASS = [[0, 48], [4, 53], [8, 48], [12, 55]];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function gen(id, seed) {
  const rand = rng(seed);
  const n = SR * (LOOP + FADE), d = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  const lp1 = biquad("lp", 900, 0.7), hp1 = biquad("hp", 1200, 0.7), bp1 = biquad("bp", 2200, 1.5), bp2 = biquad("bp", 650, 0.9), lp2 = biquad("lp", 180, 0.7);
  const r2 = rng(seed + 999); // separate stream so the original sounds stay byte-identical
  const drops = []; // rain: [time, pitch]
  for (let k = 0; k < 900; k++) drops.push([r2() * (LOOP + FADE), 2500 + r2() * 4000, 0.2 + r2() * 0.8]);
  drops.sort((a, b) => a[0] - b[0]);
  let di = 0; const live = [];
  const bubbles = []; for (let k = 0; k < 260; k++) bubbles.push([r2() * (LOOP + FADE), 500 + r2() * 900, 0.3 + r2() * 0.7]);
  bubbles.sort((a, b) => a[0] - b[0]);
  let bi = 0; const liveB = [];
  const thump = (x) => (x > 0 && x < 0.12 ? Math.sin(2 * Math.PI * 48 * x) * Math.exp(-x * 30) : 0);
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016834;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    last = (last + 0.02 * w) / 1.02; const brown = last * 3.5;
    const t = i / SR;
    let v;
    switch (id) {
      case "white": v = w * 0.35; break;
      case "pink": v = pink * 0.9; break;
      case "brown": v = brown * 0.9; break;
      case "shush": { const ph = (t % 2) / 2, env = Math.pow(Math.sin(Math.PI * Math.min(1, ph / 0.8)), 2); v = pink * (0.25 + 0.9 * env) * 0.8; break; }
      case "ocean": { const env = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 8); v = (brown * 0.7 + pink * 0.4 * env) * (0.35 + 0.75 * env) * 0.8; break; }
      case "womb": { const p = t % 0.8; v = brown * 0.75 + thump(p) * 0.9 + thump(p - 0.22) * 0.6; break; }
      case "rain": {
        // soft hiss plus many tiny drops
        while (di < drops.length && drops[di][0] <= t) live.push(drops[di++]);
        let d = 0;
        for (let k = live.length - 1; k >= 0; k--) {
          const [t0, f, a] = live[k], x = t - t0;
          if (x > 0.03) { live.splice(k, 1); continue; }
          d += Math.sin(2 * Math.PI * f * x) * Math.exp(-x * 220) * a;
        }
        v = hp1(pink) * 0.9 + lp1(brown) * 0.35 + d * 0.12; break;
      }
      case "fan": {
        // airy whoosh with a low motor hum and a gentle blade beat (4 per second)
        const beat = 1 + 0.12 * Math.sin(2 * Math.PI * 4 * t);
        v = (lp1(pink) * 1.4 + brown * 0.3) * beat + Math.sin(2 * Math.PI * 100 * t) * 0.04 + Math.sin(2 * Math.PI * 200 * t) * 0.015; break;
      }
      case "dryer": {
        // hair dryer: bright rushing air plus a motor whine
        v = bp1(w) * 1.6 + pink * 0.35 + (Math.sin(2 * Math.PI * 310 * t) * 0.05 + Math.sin(2 * Math.PI * 620 * t) * 0.025) * (1 + 0.05 * Math.sin(2 * Math.PI * 0.5 * t)); break;
      }
      case "car": {
        // car ride: deep road rumble, engine hum, slow swells
        const swell = 0.85 + 0.15 * Math.sin((2 * Math.PI * t) / 8);
        v = (lp2(brown * 2.2) * 1.2 + bp2(pink) * 0.35) * swell + Math.sin(2 * Math.PI * 38 * t) * 0.05 * swell; break;
      }
      case "stream": {
        // babbling brook: watery band noise with little bubbles
        while (bi < bubbles.length && bubbles[bi][0] <= t) liveB.push(bubbles[bi++]);
        let b = 0;
        for (let k = liveB.length - 1; k >= 0; k--) {
          const [t0, f, a] = liveB[k], x = t - t0;
          if (x > 0.08) { liveB.splice(k, 1); continue; }
          b += Math.sin(2 * Math.PI * (f + 900 * x) * x) * Math.exp(-x * 45) * a;
        }
        const ripple = 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.5 * t);
        v = bp2(pink) * 1.1 * ripple + hp1(pink) * 0.25 + b * 0.18; break;
      }
      case "lullaby": {
        // music box over a whisper of pink noise
        let m = 0;
        for (const [st, n] of LULLABY) m += note(hz(n), t - st) + note(hz(n), t - st - LOOP) * 0;
        for (const [st, n] of BASS) m += note(hz(n), t - st) * 0.5;
        // let the last notes ring into the loop start
        for (const [st, n] of LULLABY) if (st >= 13) m += note(hz(n), t + LOOP - st);
        v = m * 0.22 + pink * 0.12; break;
      }
    }
    d[i] = v;
  }
  // Crossfade the extra tail into the head so the loop point is inaudible.
  const L = SR * LOOP, F = SR * FADE, out = new Float32Array(L);
  for (let i = 0; i < L; i++) out[i] = d[i];
  for (let i = 0; i < F; i++) { const a = i / F; out[i] = d[i] * a + d[L + i] * (1 - a); }
  let pk = 0; for (let i = 0; i < L; i++) pk = Math.max(pk, Math.abs(out[i]));
  for (let i = 0; i < L; i++) out[i] *= 0.9 / pk;
  return out;
}

function wav(f) {
  const buf = Buffer.alloc(44 + f.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + f.length * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(f.length * 2, 40);
  for (let i = 0; i < f.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, f[i])) * 32767), 44 + i * 2);
  return buf;
}

const dir = path.join(__dirname, "..", "assets", "sounds");
fs.mkdirSync(dir, { recursive: true });
["womb", "shush", "brown", "pink", "white", "ocean", "rain", "fan", "dryer", "car", "stream", "lullaby"].forEach((id, i) => {
  fs.writeFileSync(path.join(dir, `${id}.wav`), wav(gen(id, 1000 + i)));
  console.log("wrote", id);
});
