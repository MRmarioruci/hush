# Play Console answers for hush

Copy these into Play Console. Section names follow the console menu
(**Policy and programs → App content**, **Grow users → Store presence**, and so on).

| What | Where it is |
|---|---|
| Listing text (7 languages) | `store/listings/<locale>/` (title, short description, full description) |
| Phone screenshots (6 per language, 1080×1920) | `store/graphics/<locale>/` |
| App icon 512×512 | `store/graphics/icon-512.png` |
| Feature graphic 1024×500 | `store/graphics/feature-graphic.png` |
| Privacy policy URL | https://github.com/MRmarioruci/hush/blob/main/PRIVACY.md (works once `PRIVACY.md` is on `main`) |
| App bundle | `hush-<version>-play.aab` on the GitHub release (built when the upload-key secrets are set) |

---

## Create app

- App name: **hush: white noise & monitor**
- Default language: **English (United States) – en-US**
- App or game: **App**
- Free or paid: **Free**. Once an app is free it can't become paid.

## Store settings

- App category: **Parenting**
- Tags (pick up to 5): Baby, Sleep, White noise, Baby monitor, Parenting
- Contact email: an address you're happy to show publicly (Play requires one)
- Website (optional): https://github.com/MRmarioruci/hush

## Main store listing

For each language, add a translation (Store listing → Manage translations →
Add your own translations) and paste the three text files. Upload the six screenshots from that
language's folder. The icon and feature graphic are the same for every language.

Folders map to Play languages like this: en-US English (US), el-GR Greek, de-DE German,
fr-FR French (France), es-ES Spanish (Spain), pt-BR Portuguese (Brazil), zh-CN Chinese (Simplified).

---

## App content

### Privacy policy
https://github.com/MRmarioruci/hush/blob/main/PRIVACY.md

### App access
**All functionality is available without any access restrictions.** Add this note:

> No account or login. The baby monitor needs two Android phones: on phone A choose
> Monitor → "Stays in the baby's room" and tap Start listening; on phone B choose
> "Gets the alerts" and scan the code on phone A. Play a crying-baby sound near phone A
> and phone B gets a notification. White noise and Nights work on a single phone.

### Ads
**No, my app does not contain ads.**

### Content rating (IARC questionnaire)
- Category: **All other app types** (utility / productivity / reference / other)
- Violence, fear, sexuality, language, controlled substances, crude humour, gambling: **No** to all
- Does the app let users interact or exchange content with other users? **No.** Alerts only go
  between the user's own paired phones, and there's no chat or public content.
- Does it share the user's current physical location with other users? **No**
- Does it allow purchases of digital goods? **No**
- Is it a web browser or search engine? **No**

Expected result: Everyone / PEGI 3 / USK 0.

### Target audience and content
- Target age groups: **18 and over** only.
- "Could your app unintentionally appeal to children?" **No.** It's a tool for parents: white noise,
  volume limits, cry alerts and sleep history. There are no characters, games or child-directed content.

This keeps hush out of the Families programme, which has extra rules.

### News app
**No**

### Health apps declaration
If the console asks about health features, pick **Sleep management** (or the nearest sleep
option) and nothing medical. hush is not a medical device, and the listing and app say so.

### Government / financial / COVID apps
**No** to each.

### Data safety

**Overview**
- Does your app collect or share any of the required user data types? **Yes**
- Is all of the user data collected by your app encrypted in transit? **Yes** (HTTPS to Expo push)
- Do you provide a way for users to request that their data is deleted? **No.** There's no account
  and nothing is kept on a server; all history is on the phone and is removed by uninstalling.
  If the form needs more, add that explanation.

**Data types: mark these as collected, and none as shared**

Sending data to a service provider (Expo / Firebase) that works for you counts as *collected*, not *shared*.

| Data type | Collected | Shared | Ephemeral | Required? | Purpose |
|---|---|---|---|---|---|
| Personal info → **Name** (baby's name, parent phone names in alerts) | Yes | No | No | Optional | App functionality |
| App activity → **Other actions** (crying events, night summaries sent to paired phones) | Yes | No | No | Optional | App functionality |
| Device or other IDs → **Device or other IDs** (push notification token) | Yes | No | No | Optional | App functionality |

They're **optional** because they're only sent once the user pairs phones for the baby monitor.

**Do not mark these:**
- Audio → Voice or sound recordings. Sound is analysed on the device and never leaves it.
  On-device processing isn't "collection" in Play's definition.
- Photos/videos: the camera only scans the QR code and nothing is saved or sent.
- Location, contacts, financial info, health info, messages, files, calendar, web history,
  app performance / crash logs: not collected.

### Foreground service permissions
Play asks for this because hush uses two foreground service types.

**Microphone (`FOREGROUND_SERVICE_MICROPHONE`)**
- Use case: **Other**, then describe:
  > hush works as a baby monitor. When the user taps "Start listening" on the phone left in the
  > baby's room, a microphone foreground service analyses sound on the device to detect crying,
  > and sends a notification to the parent's paired phone. It must keep running with the screen
  > locked all night, which is the purpose of the feature. A persistent notification shows while it
  > listens, and the user can stop listening at any time from the app. Audio is never recorded or uploaded.
- Video: screen recording (30–60 s, uploaded to YouTube as unlisted). Show: Monitor → Start
  listening → lock the screen → the "Listening" notification stays visible → a cry sound plays →
  the second phone gets the alert.

**Media playback (`FOREGROUND_SERVICE_MEDIA_PLAYBACK`)**
- Use case: **Media playback**. White noise keeps playing with the screen off and shows media
  controls in the notification. The same video can show this (tap the moon, lock the screen).

### Sensitive permissions (no form, but reviewers check them)
- `RECORD_AUDIO`: cry detection, asked only when the user turns on monitoring or "respond to crying".
- `CAMERA`: scanning the pairing QR code.
- `POST_NOTIFICATIONS`: crying alerts and the listening notification.
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`: an overnight baby monitor is stopped by battery
  optimisation, which breaks its core purpose. That's an accepted reason, but if review rejects it
  the fallback is opening the battery settings screen instead, which needs no permission (a small code change).

---

## Testing and release

1. **Testing → Closed testing → Create track** (or use the default "Alpha").
2. Testers: an email list, or a Google Group that people join. Add at least 12 people.
3. Upload `hush-<version>-play.aab`, write release notes, and roll out to the closed track.
4. Send testers the **opt-in link** from the track page. Each tester opens it, taps "Become a tester",
   then installs from Play. Sideloaded copies must be uninstalled first, because they're signed with a different key.
5. Keep at least 12 testers opted in for **14 days in a row**.
6. Then **Dashboard → Apply for production**, answer the short questions about the test, and once
   approved, create a production release with the same (or newer) bundle.

Every upload needs a higher version. Bump `version` in `package.json` (1.5.0 → 1.5.1); the build
turns it into versionCode 10501 automatically.

## Play App Signing
On first upload, accept **Play App Signing** (Google keeps the app signing key). The key in the
GitHub secrets is your **upload key**. If you lose it, Play support can reset it, so keep a copy of
`hush-upload.jks` and its password somewhere safe.
