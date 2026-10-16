# Turning on "listen in" clips (Firebase Storage)

Parents can hear 10 seconds of the baby's room. The baby's phone uploads a WAV clip to the
Firebase project's Storage bucket (`hush-20c75.firebasestorage.app`, read from
google-services.json) and sends the link to the parent who asked. You need to do these once:

1. **Firebase console → Build → Storage → Get started.** New projects have to be on the
   pay-as-you-go (Blaze) plan to use Storage. A family's clips stay far inside the free allowance
   (each clip is about 320 KB). Set a budget alert of 1 € in Google Cloud Billing if you like.
   Pick a location near you (e.g. `europe-west1`).
2. **Storage → Rules**, replace everything with this and **Publish**:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /clips/{name} {
      // Anyone with the exact (random, 24-character) name can fetch it; nobody can list.
      allow get: if name.matches('[a-z0-9]{24}[.]wav');
      allow create: if name.matches('[a-z0-9]{24}[.]wav')
        && request.resource.size < 1024 * 1024
        && request.resource.contentType == 'audio/wav';
    }
  }
}
```

3. **Delete clips after a day:** Google Cloud console → Cloud Storage → Buckets →
   `hush-20c75.firebasestorage.app` → **Lifecycle** → Add a rule → Action **Delete object** →
   Condition **Age: 1 day** → Create.

That's it. Then on the baby's phone: Monitor → turn on **Let parents listen in**. On the
parent's phone: **Listen 10 s** on Home or the Monitor tab.
