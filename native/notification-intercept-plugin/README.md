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
with a lavender structured expanded card and Add, Description and Ignore actions.
Description uses Android RemoteInput and persists a trimmed, 200-character
description without adding the payment or changing the raw bank notification.
Add uses an immutable broadcast PendingIntent and a unique WorkManager job,
without launching an Activity or bypassing the app's PIN/biometric screen.
A separate application-context WebView loads only the bundled background entry
and reuses the production TypeScript payment parser and transaction mapper.
The existing verified Supabase session must still belong to the capture's owner.
The `add_notification_payment` RPC inserts the transaction and updates its
account balance atomically; transaction IDs make retries idempotent, including
after a process dies between the cloud commit and native receipt persistence.
The resulting transaction/account receipt is committed to private native storage
and reconciled with the app on its next resume. It is not an Add confirmation
deferred until the user opens the app.

**Deployment requirement:** run `supabase_background_payments.sql` after the
latest `supabase_schema.sql`, then build/install the updated APK. Missing schema,
offline service or expired sign-in leaves the notification visibly retryable;
it is never dismissed as a successful save. WorkManager retries automatically,
and Add can restart a failed attempt. Android scheduling, connectivity and OEM
restrictions can delay completion; force-stop prevents workers until Android
allows the app to run again.

Description and Ignore remain broadcasts and never launch the app.
Edit (inside the card) opens
the prefilled editor after unlock and retains the capture until Save; Ignore
is persisted by a non-exported receiver without opening the app. The bridge
replays captures on startup/resume and forwards live events. JavaScript
persists its pending queue before handling actions or resolving native entries.
Original notification timestamps are preserved; transaction details stay
private on the lock screen.

The notification-only Java summary is not the authoritative transaction parser.
Missing details show "Review in app"; JavaScript still parses the original
message. A purple M is used in the card and as the large icon. Android requires
a monochrome small-icon mask and controls its tint and the surrounding shell.
Exact layout, available space and collapsed appearance depend on Android/OEM.
Service and permission lookups use AndroidX compatibility APIs to retain the
app's API 22 minimum. Notifications and inline replies use NotificationCompat
and RemoteInput compatibility support; notification channels are created only
on Android 8+. Automatic listener rebinding is requested only on Android 7+;
older versions log the disconnection and depend on Android reconnecting the
listener (the user may need to toggle Notification Access). Verify notification
actions and capture on API 22 as well as a current Android device.
Only the explicit RemoteInput PendingIntent is mutable; other actions remain
immutable and the broadcast receiver is non-exported.

With location tagging enabled and foreground precise/approximate permission
already granted, capture checks for a last-known position within two minutes
of the payment timestamp. It does not request background permission or run
continuous tracking. Native geocoding enriches saved coordinates asynchronously;
the bridge forwards that update along with descriptions. Foreground replay
may locate recent payments, but never tags old payments with current position.
Android background restrictions can leave payments without a location.

Native configuration follows the interceptor and push-notification switches.
Notification Access and Android 13+ display permission must both be granted.
Normal backgrounding does not require a foreground service or the app Activity.
Force-stop, revoked access, hidden SMS notification text, notification-disabled
source apps, and manufacturer battery/autostart restrictions can prevent delivery.
This does not read the SMS inbox, recover missing notifications, authenticate
bank senders, or support background interception on web/iOS.

Rebuild/install the APK after changes: `npm run cap:sync`, then
`node scripts/patch-android.mjs`, then build with Gradle. Device verification:
send real bank/UPI alerts with the app open, backgrounded, screen off and after
swiping its Activity away; confirm a single pending capture and three system
actions. Test inline Description while the app is closed, Description then Add,
Ignore without opening, Edit then cancel/save, Add with the Activity absent,
duplicate Add taps, offline failures/reconnection, expired sign-in, account
switches and app-resume reconciliation without duplicate balance changes,
permission denial, and rejected promotional/OTP/request/failed messages.

## Files

- `NotificationInterceptPlugin.java` — the `@CapacitorPlugin`-annotated
  bridge exposing `isPermissionGranted`, `requestPermission`, and emitting the
  `notificationReceived` event to JS.
- `TmfNotificationListenerService.java` — the actual
  `NotificationListenerService` implementation.
- `TransactionEligibility.java` — native source and completed-payment filter.
- `InterceptedPaymentStore.java` — durable captures, settings and system alerts.
- `PaymentNotificationDetails.java` — display-only payment summary.
- `PaymentActionReceiver.java` — durable, non-exported Ignore/inline-description receiver.
- `res/layout/payment_notification.xml` — expanded purple notification card.
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
