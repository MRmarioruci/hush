# hush promo video

A 33-second, 1920×1080 product video made with [Remotion](https://remotion.dev).
The finished file is `store/graphics/promo-video.mp4`.

## Script

| Time | Scene | On screen |
|---|---|---|
| 0–4 s | Intro | The moon rises. "Bedtime, every night." then **hush**, "White noise & baby monitor" |
| 4–9 s | Sounds | Home screen. **Calm white noise**: six gentle sounds that keep playing with the screen off. Sound chips pop in |
| 9–14 s | Safe volume | Sounds screen and a dial settling at 50. **Never too loud**: it keeps the sound under 50 dB at the crib |
| 14–19 s | Smart volume | A curve draws from 50 dB down to 44 dB, then bumps up at "Crying" |
| 19–25 s | Monitor | Baby's phone and your phone. Ripples leave the baby's phone and "Leo is crying" lands on yours |
| 25–29 s | Nights | Week and month views. **Watch the nights get calmer** |
| 29–33 s | Outro | "No account. No ads. Sound never leaves the phone." End card: hush, "Free on Google Play" |

Music: a soft music-box lullaby over a quiet pink-noise bed, synthesised for this video (`public/music.wav`).

## Edit and render

```bash
cd video
npm i
npx remotion studio            # preview and edit
npx remotion render HushPromo out/hush-promo.mp4
```

Screens in `public/` are captures of the app with sample data.
