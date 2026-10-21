# Play Store listing

Texts and form answers to paste into the Play Console. Graphics in this folder
come from `npm run store-art`; screenshots are taken on a phone.

## Main store listing

**App name** (30 max)

hush: Baby White Noise

**Short description** (80 max)

Calm white noise for babies, with a volume limit that keeps it gentle at the crib.

**Full description** (4000 max)

hush plays calm, steady sound to help your baby fall asleep and stay asleep, and it keeps the volume gentle.

Many sleep sounds can get loud at the crib. Tell hush how far the phone is from your baby and it works out a safe volume step for that distance. While it plays, your phone's volume buttons can't go past it, even with the screen locked. hush shows the estimated level at the crib next to a 50 dB limit, the level used for hospital nurseries.

SIX SOOTHING SOUNDS
• Womb: a slow heartbeat, like before birth
• Shush: gentle, rhythmic shh… shh…
• Brown: a deep, soft rumble
• Pink: steady light rain
• White: the classic fan hiss
• Ocean: slow rolling waves

Every sound is a seamless loop, with no gap or click to wake a light sleeper.

MADE FOR BEDTIME
• Sleep timer (15 min to 2 hours, or all night) with a gentle one-minute fade-out
• Keeps playing with the screen locked, with controls on the lock screen
• Dark, calm design that is easy on tired eyes at 3 a.m.
• Works offline

PRIVATE BY DESIGN
• No ads
• No account
• No tracking or analytics
• No internet connection needed

A note on the numbers: levels are estimates for a typical phone speaker. For an exact reading, hold a decibel-meter app at the crib.

**App icon:** `store/icon-512.png`
**Feature graphic:** `store/feature-graphic.png`
**Phone screenshots:** 4 to 6 from a phone, in this order:
1. A sound playing (moon animating, "Stops in …" shown)
2. The sound grid
3. The crib-distance card with the dB gauge
4. Lock-screen controls
5. The sleep timer chips

## Categorisation

- **App category:** Parenting
- **Tags:** white noise, sleep, baby
- **Contact email:** required, and shown publicly on the listing
- **Privacy policy URL:** https://mrmarioruci.github.io/hush/privacy.html (after GitHub Pages is on)

## App content forms

**Privacy policy:** the URL above.

**Ads:** No, the app does not contain ads.

**App access:** All functionality is available without special access.

**Content rating questionnaire:** category "All other app types"; answer No to
every content question (no violence, sexuality, language, controlled substances,
gambling, user interaction, sharing of location or personal info, digital
purchases). Expected result: Everyone / PEGI 3.

**Target audience and content:** 18 and over only. The app is used by parents;
it is not designed for children to use. Answer "No" to "could the store listing
unintentionally appeal to children".

**Data safety:**
- Does your app collect or share any of the required user data types? **No**
- (Settings are stored only on the device, which Google does not count as collection.)
- Is all user data encrypted in transit? Not applicable, nothing is sent.
- Do you provide a way for users to request data deletion? Not applicable.

**Government apps:** No. **Financial features:** None. **News app:** No.

**Health apps declaration:** hush is a sleep-sound app, not a medical device and
not a health app. If the form asks, choose the closest "sleep" or "none of the
above" option, and keep the listing wording to estimates, never "medically safe"
or "protects hearing".

**Foreground service permissions:** hush uses `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
(added by expo-audio for background playback). Declare it as **Media
playback**: "Plays the white-noise sound the user started while the screen is
locked, with media controls on the lock screen." Attach a link to a short video
(an unlisted YouTube upload is fine): start a sound, lock the phone, show it
still playing and the lock-screen controls. Check the merged manifest of the
first build to confirm which permissions it lists.

## Closed testing

- Track: Closed testing (EAS calls it `alpha`)
- Testers: the Google Group (add its address under Testers, not the members one by one)
- 12 or more testers opted in for 14 days in a row, then apply for production access
