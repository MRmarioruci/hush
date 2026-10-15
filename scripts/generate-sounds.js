// Generates the six seamless 24-second loops in assets/sounds as 16-bit mono WAV.
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

function gen(id, seed) {
  const rand = rng(seed);
  const n = SR * (LOOP + FADE), d = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
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
["womb", "shush", "brown", "pink", "white", "ocean"].forEach((id, i) => {
  fs.writeFileSync(path.join(dir, `${id}.wav`), wav(gen(id, 1000 + i)));
  console.log("wrote", id);
});
