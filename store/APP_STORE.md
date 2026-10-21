# hush on the App Store: what's left for you

The iPhone app is built by GitHub (`.github/workflows/ios.yml`) on every push to `main` or
`monitor`. Without the secrets below it only checks that the app compiles. With them, it signs
the app and uploads it to TestFlight automatically.

## 1. Apple Developer account (once)
- Join the Apple Developer Program (99 USD a year): https://developer.apple.com/programs/
- An individual account is fine. The seller name on the App Store will be your legal name.

## 2. App Store Connect: create the app (once)
- https://appstoreconnect.apple.com → Apps → + → New App
  - Platform: iOS · Name: `hush: White Noise & Monitor` · Primary language: English (U.S.)
  - Bundle ID: register `com.mrmarioruci.hush` first (Certificates, IDs & Profiles → Identifiers → +).
    When registering, tick **Push Notifications** and **Time Sensitive Notifications**.
  - SKU: `hush`
- **In-App Purchase** → + → **Non-Consumable**, Product ID `hush_unlock` (same as Google Play),
  price 2.99 EUR, display name "Baby monitor unlock". Add a review screenshot of the paywall.
- **Agreements, Tax and Banking**: accept the Paid Apps agreement and add bank details, or the
  purchase won't work.

## 3. Keys GitHub needs (once)
In App Store Connect → Users and Access → Integrations → **App Store Connect API** → Team Keys → +
- Name `github`, access **Admin** (needed so the build can create its own signing certificate).
- Download the `.p8` file (only possible once). Note the **Key ID** and the **Issuer ID**.
- Your **Team ID** is on https://developer.apple.com/account (Membership details).

Add these as GitHub repo secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `APPLE_TEAM_ID` | Team ID, e.g. `AB12CD34EF` |
| `ASC_KEY_ID` | Key ID |
| `ASC_ISSUER_ID` | Issuer ID |
| `ASC_KEY_P8_BASE64` | the .p8 file in base64: `base64 -i AuthKey_XXXX.p8 \| pbcopy` (Mac) or `base64 -w0 AuthKey_XXXX.p8` (Linux) |

Then re-run the **iOS** workflow. The build shows up in TestFlight 10–30 minutes later.

## 4. Push notifications for iPhones (once)
Cry alerts reach iPhones through Apple's push service, and Expo needs a key for it:
- developer.apple.com → Certificates, IDs & Profiles → **Keys** → + → tick **Apple Push Notifications service (APNs)** → download the `.p8`.
- expo.dev → project **hush** → Credentials → iOS → `com.mrmarioruci.hush` → **Push Key** → upload that `.p8` (with its Key ID and your Team ID).

Without this, Android phones still get alerts, but iPhones don't.

## 5. Test on real iPhones (TestFlight)
Install TestFlight on your iPhone and add yourself as an internal tester. Please check:
- [ ] White noise plays with the screen locked, and the timer stops it
- [ ] Baby's phone = iPhone: listening keeps going with the screen locked for a whole night (plugged in)
- [ ] A cry on the baby's phone alerts both an iPhone and an Android parent phone
- [ ] Alert sound plays and it comes through with Focus / Do Not Disturb on
- [ ] Pairing works both ways (iPhone ↔ Android)
- [ ] Remote control from the parent's phone while the baby's iPhone plays white noise
- [ ] Smart volume reacts to crying while white noise plays from the same iPhone
- [ ] Unlock purchase (TestFlight purchases are free) and "Restore purchase"
- [ ] Nap reminders arrive

## 6. Store listing
Texts in 7 languages: `store/appstore/<locale>.json` (name, subtitle, promotional text,
keywords, description, what's new). All are within Apple's limits.
- **Screenshots**: iPhone 6.9" (1320 × 2868 or 1290 × 2796). Take them in TestFlight, or ask me to make them.
- **Privacy** ("App Privacy" questions): Data Not Collected. The push token is used only to
  deliver alerts between your own phones, and no data is linked to the user or used for tracking.
- **Privacy Policy URL**: https://github.com/MRmarioruci/hush/blob/main/PRIVACY.md
- **Age rating**: 4+. **Category**: Health & Fitness (or Lifestyle).
- **App Review notes** (paste):
  > hush uses two phones. On the first, open Monitor → "This is the baby's phone" and start
  > listening; on the second, choose "I'm a parent" and scan the code. Play a baby cry video near
  > the first phone to get an alert. The microphone is used only on the baby's phone, to hear
  > crying while the app runs in the background (UIBackgroundModes audio); audio is analysed on the
  > device and never recorded or sent. The monitor has a 4-day free trial, then a one-time purchase.

## 7. Optional: Critical alerts
Alerts already break through Focus (time-sensitive). They can't ring when the mute switch is on
unless Apple grants the **Critical Alerts** entitlement:
https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/
Explain it's a baby monitor that alerts parents to a crying baby. If Apple approves, tell me and
I'll switch the alerts over (one entitlement plus a flag in the push messages).

## Known iPhone differences
- **Volume.** iOS doesn't let apps set the phone's volume. hush caps its own sound as if the
  volume were at maximum, so it stays under 50 dB however loud the phone is set.
- **Closing hush.** Listening stops if hush is swiped away or the iPhone restarts. Parents get a
  "stopped listening" alert when iOS allows it.
- **Remote control and sync.** These arrive reliably while hush is open or playing or listening.
  iOS may delay them when hush is fully in the background and idle.
