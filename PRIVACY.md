# hush privacy policy

_Last updated: 16 October 2026_

hush is a white-noise and baby-monitor app for Android, made by Mario Ruci.
This policy explains what the app does with your information. The short version:
**hush has no accounts, no ads and no analytics. It never records or uploads
sound, except for the optional "listen in" clips you turn on yourself (below).**

## Microphone

When a phone is set up as the baby's phone (or when smart white noise is set to
respond to crying), hush listens through the microphone to notice crying.

- Sound is analysed on the phone itself, half a second at a time, by a small
  built-in sound model.
- Audio is never saved or sent anywhere. While listening, only the last 20 seconds
  are kept in the phone's memory (so a "listen in" clip is ready at once); older
  sound is overwritten continuously, and all of it is discarded when listening stops.
- Android shows a notification the whole time hush is listening, and you can stop
  it at any time from the app.

### Optional: listen in

If you turn on **Let parents listen in** on the baby's phone (it's off unless you
turn it on):

- A paired parent's phone can ask for the last 5, 10 or 15 seconds of the room. The
  baby's phone shows a notice each time a parent listens.
- Crying alerts can include a 5- or 10-second clip of the cry, sent to the paired
  parents. You can turn this off (or change its length) under the same switch.
- Clips are uploaded to Google's Firebase Storage
  ([policy](https://policies.google.com/privacy)) under a long random name, and the
  link is sent only to the paired parent phones.
- Clips are deleted automatically after one day. Turning the switch off stops new clips.

## Camera

The camera is used only to scan the pairing code shown on the baby's phone.
No pictures or video are saved or sent.

## What is sent between your phones

To deliver alerts, hush uses Expo's push notification service
([expo.dev](https://expo.dev/privacy)), which delivers them through Google's
Firebase Cloud Messaging ([policy](https://policies.google.com/privacy)).
Only these things are sent, and only to phones you paired yourself:

- a push token for each paired phone (a random address for notifications),
  exchanged when you scan the pairing code;
- the names you typed: your baby's name and an optional name for each parent's phone;
- alert messages, such as "Leo is crying", "battery is low" or "stopped listening",
  including the baby phone's battery level for battery alerts;
- a short morning summary of the night: times, number and length of crying spells.

These services pass the messages on and do not receive any audio. hush does not
run its own servers and does not keep copies of these messages.

## What stays on your phone

Settings, the paired phones list, received alerts and the night history (when
crying happened, when hush was listening or playing) are stored only on your
phones. Detailed events are kept for 14 nights and then reduced to a short
summary per night. Uninstalling hush, or clearing its storage, deletes all of it.

## What hush does not do

- No account or sign-in, and no email, phone number or location is collected.
- No advertising, tracking or analytics SDKs.
- No data is sold or shared with anyone beyond delivering your alerts as described above.

## Children

hush is meant to be used by parents and caregivers. It does not collect information
from children. The baby's name is entered by the parent and is only used in alerts.

## Not a medical device

hush is a helper. It does not replace checking on your baby yourself, and its volume
levels are estimates.

## Changes and contact

If this policy changes, the new version will be posted here with a new date.
Questions: open an issue at https://github.com/MRmarioruci/hush/issues,
or use the contact email on hush's Google Play page.
