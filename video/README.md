# hush promo video

A 35-second, 1920×1080 product video made with [Remotion](https://remotion.dev).
The finished file is `store/graphics/promo-video.mp4`.

## Script

The pitch: no white noise machine or baby monitor needed. Your phones are all you need.

| Time | Scene | On screen |
|---|---|---|
| 0–4 s | Hook | A white noise machine and a baby monitor pop in. "No white noise machine?" / "No baby monitor?" / "No problem." |
| 4–7 s | Answer | The moon rises. **hush**, "Your phones are all you need." |
| 7–11 s | Sounds | Home screen. **Calm white noise**, sound chips tick in |
| 11–16 s | Safe volume | A dial settles at 50 dB. **Never too loud** |
| 16–21 s | Smart volume | A curve eases from 50 to 44 dB, then rises at "Crying" |
| 21–27 s | Monitor | **Any phone is a baby monitor.** Ripples, then "Leo is crying" lands on the parent's phone |
| 27–31 s | Nights | **Watch the nights get calmer**, week and month views |
| 31–35 s | Outro | "No subscription. No extra device. Just the phones you already have." End card: hush, "Get it on Google Play", "Try the baby monitor free for 4 days" |

Sound: a soft music-box lullaby over pink noise (`scripts/music.py`), and small synthesised effects
for things appearing: pops, ticks, whooshes, a notification chime and a closing swell (`public/sfx-*.wav`).

## Edit and render

```bash
cd video
npm i
npx remotion studio            # preview and edit
npx remotion render HushPromo out/hush-promo.mp4
```

Screens in `public/` are captures of the app with sample data.
