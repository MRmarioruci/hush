# Soft music-box lullaby over a quiet pink-noise bed. Writes public/music.wav.
# Usage: python3 scripts/music.py [seconds]
import sys, wave
import numpy as np
from scipy.signal import lfilter

sr = 44100
dur = float(sys.argv[1]) if len(sys.argv) > 1 else 35.5
n = int(sr * dur); t = np.arange(n) / sr
out = np.zeros(n)
hz = lambda m: 440 * 2 ** ((m - 69) / 12)

def note(f, start, length=2.6, amp=0.18):
    i0 = int(start * sr); i1 = min(n, i0 + int(length * sr))
    if i0 >= n: return
    tt = np.arange(i1 - i0) / sr
    env = np.exp(-tt * 2.2) * (1 - np.exp(-tt * 80))
    w = np.sin(2*np.pi*f*tt) + 0.35*np.sin(4*np.pi*f*tt)*np.exp(-tt*3) + 0.12*np.sin(6*np.pi*f*tt)*np.exp(-tt*5)
    out[i0:i1] += amp * env * w

beat = 60 / 76 / 2
chords = [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]]
pattern = [0, 1, 2, 3, 2, 1, 2, 1]
k, time = 0, 0.6
while time < dur - 3:
    ch = chords[(k // 8) % 4]
    note(hz(ch[pattern[k % 8]] + 12), time, amp=0.13 if k % 8 else 0.17)
    if k % 8 == 0: note(hz(ch[0] - 12), time, length=4.5, amp=0.16)
    k += 1; time += beat
i = 0
while True:
    s = 0.6 + i * beat * 8
    if s > dur - 2: break
    ch = chords[i % 4]
    i0 = int(s * sr); i1 = min(n, int((s + beat * 8 + 0.8) * sr)); tt = np.arange(i1 - i0) / sr; L = tt[-1]
    env = np.minimum(1, tt / 0.8) * np.minimum(1, (L - tt) / 0.8)
    for m in ch[:3]: out[i0:i1] += 0.025 * env * np.sin(2 * np.pi * hz(m) * tt)
    i += 1
rev = out.copy()
for d, g in [(0.113, 0.35), (0.167, 0.3), (0.241, 0.25), (0.337, 0.2)]:
    D = int(d * sr); r = np.zeros(n); r[D:] = out[:-D] * g; rev += r
wn = np.random.default_rng(1).standard_normal(n)
pink = lfilter([0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400], wn)
rev += 0.035 * pink / np.abs(pink).max()
y = rev * np.minimum(1, t / 1.5) * np.minimum(1, (dur - t) / 2.5)
y /= np.abs(y).max() * 1.12
st = np.stack([y, np.roll(y, int(0.012 * sr))], 1)
with wave.open("public/music.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes((st * 32767).astype("<i2").tobytes())
print(f"music.wav {dur}s")
