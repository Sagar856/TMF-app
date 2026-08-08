# TMF Native Notification Intercept Plugin

This is a hand-authored Capacitor Android plugin that is merged into the
generated `android/` project by CI (see `scripts/patch-android.mjs` and
`.github/workflows/build-apk.yml`). It is **not** committed inside `android/`
directly because that folder (including the binary Gradle wrapper jar) is
generated fresh by `npx cap add android` during the build, which is far more
reliable than hand-crafting a full native Android project by hand.

## What it does

`TmfNotificationListenerService` is an Android `NotificationListenerService`.
Once the user grants the special system "Notification Access" permission
(`requestNotificationAccess()` in `src/services/notificationListener.ts` deep
links them straight to that settings screen), Android calls
`onNotificationPosted()` **in real time** every time any app on the phone
(GPay, PhonePe, Paytm, the stock SMS app, bank apps, etc.) posts a
notification — including transaction alerts.

The service extracts the notification's package name, title and text, and
forwards it to `NotificationInterceptPlugin`, which relays it to JavaScript
via a Capacitor plugin event (`notificationReceived`). The web-side listener
in `src/services/notificationListener.ts` filters for bank/UPI-looking text,
then feeds it straight into the existing `parseSmsNotification()` logic —
the exact same parser already used by the manual SMS Simulator — so a real
incoming UPI/bank notification is parsed and queued for the user to
add/edit/ignore, and (if enabled) a local "Add this transaction?" push
notification is posted immediately.

## Files

- `NotificationInterceptPlugin.java` — the `@CapacitorPlugin`-annotated
  bridge exposing `isPermissionGranted`, `requestPermission`, and emitting the
  `notificationReceived` event to JS.
- `TmfNotificationListenerService.java` — the actual
  `NotificationListenerService` implementation.
- `AndroidManifestSnippet.xml` — the exact `<uses-permission>` and `<service>`
  entries that `scripts/patch-android.mjs` inserts into the generated
  `android/app/src/main/AndroidManifest.xml`.

## Why "Notification Access" instead of reading raw SMS?

Android's `RECEIVE_SMS`/`READ_SMS` permissions are heavily restricted by
Google Play policy (only the user's default SMS/dialer app may declare them).
`NotificationListenerService` + the "Notification Access" special permission
is the standard, Play-Store-compliant way for a non-default-SMS-app to
observe bank/UPI transaction alerts (which arrive as notifications from the
banking app itself, or from the phone's SMS/messaging app), without needing
to become the default SMS handler.
