# MINARTH Native Notification Intercept Plugin

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

The service checks an exact package allowlist, bank sender IDs for SMS apps,
and completed-payment wording with a positive amount. Promotional messages,
OTPs, payment requests, scheduled and failed payments are rejected. Group
summaries are ignored to avoid re-importing aggregated notifications.
`TransactionEligibility.java` mirrors the TypeScript eligibility policy;
shared regression fixtures cover both.

Accepted alerts are committed to private SharedPreferences independently of
the Activity/WebView. `InterceptedPaymentStore` posts Android notifications
with Add, Edit and Ignore actions. Add opens the app and adds after authentication/unlock; Edit opens
the prefilled editor after unlock and retains the capture until Save; Ignore
is persisted by a non-exported receiver without opening the app. The bridge
replays captures on startup/resume and forwards live events. JavaScript
persists its pending queue before handling actions or resolving native entries.
Original notification timestamps are preserved; transaction details stay
private on the lock screen.

Native configuration follows the interceptor and push-notification switches.
Notification Access and Android 13+ display permission must both be granted.
Normal backgrounding does not require JavaScript timers or a foreground service.
Force-stop, revoked access, hidden SMS notification text, notification-disabled
source apps, and manufacturer battery/autostart restrictions can prevent delivery.
This does not read the SMS inbox, recover missing notifications, authenticate
bank senders, or support background interception on web/iOS.

Rebuild/install the APK after changes: `npm run cap:sync`, then
`node scripts/patch-android.mjs`, then build with Gradle. Device verification:
send real bank/UPI alerts with the app open, backgrounded, screen off and after
swiping its Activity away; confirm a single pending capture and three system
actions. Test Ignore without opening, Edit then cancel/save, Add after unlock,
permission denial, and rejected promotional/OTP/request/failed messages.

## Files

- `NotificationInterceptPlugin.java` — the `@CapacitorPlugin`-annotated
  bridge exposing `isPermissionGranted`, `requestPermission`, and emitting the
  `notificationReceived` event to JS.
- `TmfNotificationListenerService.java` — the actual
  `NotificationListenerService` implementation.
- `TransactionEligibility.java` — native source and completed-payment filter.
- `InterceptedPaymentStore.java` — durable captures, settings and system alerts.
- `PaymentActionReceiver.java` — durable, non-exported Ignore receiver.
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
