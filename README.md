# hush

A calm white-noise app for babies, with a volume limit that keeps the sound under 50 dB at the crib.

- Six sounds: Womb (heartbeat), Shush, Brown, Pink, White, Ocean. Seamless 24-second loops.
- Sleep timer with a one-minute fade-out.
- Plays with the screen locked, with lock-screen controls.
- Tell it how far the phone is from the crib. While it plays, the phone's media volume can't go past the safe step for that distance (Android). The app shows the estimated level at the crib next to the 50 dB limit.

## Install (Android)

Open the latest [release](../../releases) on your phone, download the `.apk`, and open it. If Android asks, allow your browser to install unknown apps.

## How the safe level is worked out

An estimate, since phones vary: a phone speaker playing noise at full volume is about 80 dB at 30 cm, sound drops about 6 dB per doubling of distance, and Android's volume steps follow its default media volume curve. The 50 dB target is the hospital-nursery limit used in the 2014 *Pediatrics* study of infant sleep machines. For an exact number, hold a decibel-meter app at the crib.

The math lives in `src/safety.ts`. The native volume reader and limiter is the local Expo module in `modules/hush-volume`.

## Develop

```sh
npm install
npm run android      # build and run on a connected device
npm run sounds       # regenerate assets/sounds
npm run icons        # regenerate the app icons
```

## Release

Every push to `main` builds an APK and publishes it as the release for the version in `package.json`. Bump the version (`npm version patch`) to start a new release; pushing the same version again replaces its APK.
