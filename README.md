# MINARTH

**Clarity for your money.** Formerly MTracker / Track Money Flow.

A personal finance tracker: React 19 + TypeScript + Vite web app, packaged for
Android with Capacitor, with a native on-device UPI/SMS notification
interceptor as the flagship feature.

## Architecture (kept at $0 running cost)

| Layer | Choice | Cost |
|---|---|---|
| Frontend | React + Vite + Tailwind | Free (static hosting) |
| Web hosting | Netlify **and/or** GitHub Pages | Free tier |
| Backend / Auth / DB | Supabase (Postgres + Auth, RLS enabled, one shared project) | Free tier |
| Mobile packaging | Capacitor (wraps the same web app) | Free, open-source |
| APK build & release | GitHub Actions | Free (public repo / free minutes) |

No server you have to run or pay for. **This is a real multi-tenant app**:
every user shares the one Supabase project you configure (below) via a real
email/password account — nobody needs their own Supabase account, and nobody
can see another user's data (enforced by Postgres Row Level Security, not by
the app). Authentication is mandatory. A build without Supabase configuration
shows a sign-in-unavailable screen rather than falling through to cached data.

## App appearance

MINARTH uses an original faceted violet **M** on charcoal glass. The same mark
appears in the header, sidebar, sign-in and launch screens, browser favicon,
installed web app and Android launcher/notification icons.
Run `node scripts/generate-icons.mjs` to regenerate the SVG, standard and
maskable PNGs, and native vectors from the shared artwork source.
Run `npm run android:patch` after Capacitor sync to install native branding.
The Android application ID, storage keys, backup format and existing download
URLs remain unchanged so the rename preserves existing installations and data.

All pages share theme-aware glass surfaces and translucent nested controls.
The reference-inspired design uses a charcoal geometric backdrop, smoked
reflective panels, violet focal cards and chart gradients. Mobile and desktop
retain their existing layouts, stacked metrics, navigation and financial
actions. Light mode uses the same palette on transparent pearl surfaces.
The rounded mobile glass dock keeps all six destinations and safe-area spacing.
Surface entrance fades, chart drawing and hover highlights respect reduced-motion
preferences. Actions use violet gradients; losses and alerts retain status colors.
The net-worth summary uses a compact, half-height card with reduced surrounding space.
Dark-mode metric cards in Transactions, Accounts, Investments and Loans share
Home's violet first card and smoked-glass lower cards, stacked or expanded.
Profile and sign-in (including registration and password recovery) use the
same glass palette, with scrollable mobile dialogs and reduced-motion support.
Monitor Budget keeps its gradient when collapsed or expanded. Light-mode KPI
cards have no drop shadows; hidden lower-card content prevents text bleed in
translucent stacks. Warning colors and themed bank cards retain their contrast.
Settings keeps Categories & Budgets below and separate from Preferences.
Budgets, Categories, Accounts and Auto-categorise each open a settings subpage
with a Back button. Light-mode settings and table hovers use readable pearl glass.
On screens at least 1280px wide, the cash-flow trajectory and 7-day spending
trend sit side by side. The 30-day forecast, savings goals and category spending
flow below the trajectory; Monitor Budget and recurring bills flow below the
7-day trend. Independent columns avoid empty grid-row gaps when panels expand.
Paired category/merchant rankings follow both columns. Smaller screens retain
the existing single-column panel order and expansion controls.

## Running locally

```bash
npm install
npm run dev
```

## Configuring the shared Supabase backend (one-time, by you the app owner)

Users of your deployed app never see or enter Supabase credentials — you
configure ONE shared project at build time, and every signed-up user's data
is automatically kept private from every other user via RLS.

1. Create a free project at supabase.com.
2. Run [`supabase_schema.sql`](supabase_schema.sql) in the Supabase SQL editor
   (this creates the tables AND the strict per-user Row Level Security
   policies — no user can ever read/write another user's rows). The script
   is idempotent: **re-run it whenever you upgrade the app**, since new
   releases add columns (`ref_number`, `kind`, `account_id`, `updated_at`,
   `deleted_at` tombstones…). If the live schema is behind, the app keeps
   working and shows an amber *"Cloud schema is outdated"* banner instead of
   failing — the skipped columns simply aren't synced until you re-run it.
3. In Supabase Auth settings, enable **Email**, **Allow new users to sign up**
   and **Confirm email**. Update **both Confirm signup and Magic Link** email
   templates to display the code, for example:
   ```html
   <h2>Verify your MINARTH email</h2>
   <p>Your verification code is: <strong>{{ .Token }}</strong></p>
   <p>Enter this code in MINARTH. Ignore this email if you did not request it.</p>
   ```
   Use the case-sensitive `{{ .Token }}` with braces, not `.token` or just
   `{{ .ConfirmationURL }}`, and save each template. The user's screenshot of
   `{{ .Token }}` is correct for **Confirm signup**; it does not change emails
   sent by **Magic Link**. Existing email addresses and retries may use that
   template. Request a **fresh** code after saving: already-delivered emails
   cannot change. Check the same Supabase project used by the deployed build.
   The registration form's **Verify** button uses `signInWithOtp` (which sends a
   link by default unless the template is changed), then `verifyOtp` with
   `type: 'email'`. This runs on a separate, nonpersistent client. No app sign-in
   occurs until the code is verified and **Create account** sets the password.
   Supabase may create the pending Auth identity when requesting the code;
   this is not completion of the in-app registration. Abandoned identities can
   finish registration later by requesting a fresh code.
   OTP email possession also authorizes setting the password for that address;
   existing users should normally use Sign in / Forgot Password.
   Configure production SMTP, sender identity, OTP expiry and server-side rate
   limits; Supabase's development email limits are not suitable for public launch.
   Email templates, confirmation settings and SMTP cannot be enabled from app code.
   In Auth password security, configure the same policy the app displays:
   **8+ characters, uppercase, lowercase, a number and a symbol**. New-password
   and reset forms show each met/pending rule, require matching confirmation,
   and turn valid borders green. Existing login passwords are not blocked by
   the new strength checker. Confirm email being disabled previously may have
   created automatically confirmed accounts: enabling it now does not prove
   historical mailbox ownership. Review those accounts and require fresh email
   OTP verification; never infer verification solely from old autoconfirm dates.
4. Copy `.env.example` to `.env` and fill in your project's URL + anon key
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), or set them as build
   secrets/environment variables in Netlify / GitHub Actions. These are baked
   in at build time — there is no Settings UI for end users to change them.
5. **Required for Sign Up / Forgot Password to work:** in the Supabase
   dashboard go to Authentication → URL Configuration → Redirect URLs, and add
   every URL your deployed app is actually served from, e.g.:
   - `http://localhost:3000/` (local dev)
   - `https://<your-site>.netlify.app/` (Netlify)
   - `https://<your-username>.github.io/TMF-app/` (GitHub Pages)

   If a URL you use isn't in that list, Supabase rejects sign-up confirmation
   and password-reset emails with `"requested path is invalid"` — this is a
   Supabase project setting, not a bug in the app, and can only be fixed from
   the Supabase dashboard. The in-app error message always tells you the
   exact URL it tried to use, so you know exactly what to paste in.

Signing in is now mandatory to use the app at all once Supabase is
configured (there is no close/skip button on the login screen) — this is
what makes per-user data isolation possible in the first place.

## Settings cloud sync

The **Sync settings** action beside the Settings heading uploads profile,
currency/locale, theme, dashboard/display preferences, budget-alert and deletion
preferences, category rules, and the financial collections (including categories,
budgets, and accounts). Saved preferences are restored on sign-in or reload.
Preferences and category rules upload automatically after a short debounce.
Returning connectivity retries settings and financial collections. Pending
preferences survive reload and take precedence over older cloud preferences.
The manual Sync action remains available for an immediate full upload.
**Settings > Account > Cloud sync** shows the last successful settings-upload
date/time, retained across restarts. Failed attempts never advance that timestamp.

Run the latest [`supabase_schema.sql`](supabase_schema.sql) to create the
RLS-protected `user_preferences` table. A missing table or failed upload is
reported as a sync failure, not success.

Passcodes/hashes/salts, biometric and auto-lock settings, device permission
switches, broker connections, and sample-data state remain device-local.
Savings goals, receipt files, and recurring-bill overrides remain local as before.

## Google Play readiness audit (2 November 2026)

The repository is **not yet certified ready for publication**. Implemented:

- Signup email-code verification, resend and expired/invalid-code feedback.
- Free manual transactions, loans, investments and notification capture.
  Real-time balances/quotes are explicitly **Premium: Coming soon**; quote
  auto-refresh is disabled. No checkout or subscription charge exists yet.
- Automatic portable-settings/rules sync and a successful-sync timestamp.
- Self-service **Settings > Account > Delete account**. Apply the latest schema
  to install `delete_own_account()`. It has no user-ID parameter, derives identity
  from `auth.uid()`, is executable only by authenticated users, and cascades
  deletion through user-owned database rows.
- Public `privacy.html` and `delete-account.html` pages, including a web-only
  sign-in/deletion route. Host these pages on the deployed site and use their
  HTTPS URLs in Play Console. **Complete the privacy page's operator identity,
  contact and retention information before submission.**
- Explicit notification-data disclosure before granting access; GPS tagging and
  auto-extraction are off by default for new installs. Saved source message text
  and transaction locations can sync: do not claim that all information stays
  on-device. No SMS inbox/call-log permissions are requested.
- Sign-out clears preferences, rules, tombstones, goals, receipt attachments,
  notification queues and financial caches. User ownership and stale-load
  guards prevent a previous account's cloud load being applied after sign-out.
  The local cache is still WebView/browser storage, **not an encrypted vault**.
  Missing ownership markers are treated as untrusted, not adopted by the next
  user. Legacy unowned local caches are discarded; recover records only from
  the correct user's cloud data or an intentionally selected backup. Private
  UI is blocked until authentication and account hydration finish. Cloud
  preference documents without a photo restore a blank photo, never another
  account's cached image. If an earlier bug already uploaded a wrong photo to
  someone's own cloud record, that user should remove/re-upload it in Profile;
  the app cannot determine who originally owned arbitrary image bytes.
- Generated Android builds target/compile API 36 with AGP 8.13.2 and Gradle 8.13;
  Android backup and cleartext traffic are disabled. The original package ID
  `com.trackmoneyflow.app` and Supabase auth storage remain unchanged.
- Desktop Home has a wide two-column glass workspace; mobile remains stacked.
  Missing `animate-in` CSS has been implemented. OS **Reduce motion** is respected:
  if all motion is disabled, check Android/browser/OS accessibility settings.
  The startup screen now uses the same glass styling.

### Remaining launch gates (operator/device validation required)

1. Apply the SQL migration to the actual Supabase project; test user A/B RLS,
   OTP delivery/expiry/resend, password recovery, offline/reconnect sync and
   account deletion using disposable accounts. No production backend migration
   or real-email round trip is performed by editing this repository.
2. Complete operator details in the privacy policy, the Data safety form
   (financial information, profile/email, notification-derived message text and
   optional location), Financial features declaration, content rating, app
   access/reviewer credentials, support contact and store screenshots.
   Review applicable financial-services and notification-access policies.
3. Run signed AAB builds and test on physical Android devices, including API 36,
   edge-to-edge/safe areas, notification consent/background behavior, app lock,
   update-in-place and deletion. Check native dependency/16-KB page-size
   compatibility in Play's bundle analysis. Source patch tests do not replace
   a native build or Play pre-launch report.
4. Enroll in Play App Signing, retain your upload key securely, configure required
   Play testing tracks and resolve Play Console/pre-launch checks. Verify
   requirements for your developer-account type and country.
5. Before activating subscriptions, implement Google Play Billing plus
   server-verified entitlements, renewal/cancellation handling and authorized
   financial-data integrations. A client flag is not an entitlement system.

Sources: [current target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878),
[account/data deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).
For new phone-app submissions after August 31, 2026 the required target is
Android 16 / API 36. Recheck Play Console at submission time.

### Completing the privacy policy

Edit `public/privacy.html`; the bracketed operator/contact/retention fields must
be replaced before publishing. Do not invent retention promises:

1. **Operator:** enter the legal person or registered company responsible for
   MINARTH, country and any applicable business address. Keep the identity
   consistent with your Play developer profile.
2. **Contact:** provide a monitored privacy/deletion support email (for example
   an address on your own domain), ownership-verification process and realistic
   request-response timeframe.
3. **Live records:** describe how long account/financial records remain, what
   Delete account deletes, and any legally required exceptions. There is no
   automatic inactive-account deletion job in this app; do not claim one.
4. **Backups/logs:** inspect your actual Supabase plan's backup retention,
   Auth/log retention and hosting provider logs. State the real periods and
   explain that deleted records may remain in backups until those expire.
   Include any other providers you enable, such as production SMTP.
5. Keep the existing accurate data/permission descriptions, remove all
   placeholders, deploy and open the public HTTPS privacy/deletion links without
   signing in. Submit those URLs and matching Data safety answers in Play Console.

Supabase OTP reference:
[Email OTP versus Magic Link templates](https://supabase.com/docs/guides/auth/auth-email-passwordless).

### Building a signed Play release

The existing APK workflows remain **debug/sideload builds**, not Play releases.
Run `.github/workflows/build-play-bundle.yml` manually with an integer
`version_code` greater than every previously uploaded versionCode. The web
versionName comes from `package.json`. Configure the protected GitHub environment
`play-release` with these secrets (never commit a keystore/password):

- `PLAY_UPLOAD_KEYSTORE_BASE64`
- `PLAY_UPLOAD_STORE_PASSWORD`
- `PLAY_UPLOAD_KEY_ALIAS`
- `PLAY_UPLOAD_KEY_PASSWORD`
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public anon/publishable key,
  **never** a service-role key)

The workflow builds a signed release AAB, uploads it as an artifact and deletes
the runner's temporary upload key. Upload the AAB to Play's internal testing
track first; this workflow does **not** publish to production automatically.
Local native builds need JDK 17 and Android SDK 36. Release tasks fail explicitly
if signing credentials are missing.

### Updating users without losing sign-in

For each release, bump `package.json`'s version, use a higher Android
versionCode, build the signed AAB with the same package identity, and create
a new release in Play Console (test, then use a staged production rollout).
Google Play delivers updates according to the user's auto-update settings,
network/battery conditions and rollout eligibility. You cannot silently force
an immediate update on every phone.

An in-place Play update preserves app storage and the persisted Supabase session;
token refresh renews valid sessions. Keep storage keys, app ID, WebView origin and
the Play signing identity stable, and make schema migrations backward-compatible.
Do not clear app data on startup or install updates by uninstalling first.
Server-side revocation, expired/revoked refresh tokens, uninstalling or clearing
storage can still require signing in again. A debug-signed APK generally cannot
be updated directly to a differently signed Play build; test migration deliberately
and export backups before uninstalling any existing sideloaded app.
Web deployments update the PWA separately; native bundled web assets require a
new Play release.

## Deploying the web app

### Netlify
Connect the repo in the Netlify dashboard — `netlify.toml` already configures
the build command (`npm run build`) and publish directory (`dist`). No extra
setup needed.

### GitHub Pages
`.github/workflows/deploy-web.yml` builds and publishes to GitHub Pages
automatically on every push to `main`. Enable Pages once in the repo's
Settings → Pages → Source: "GitHub Actions".

**Repository visibility matters for the APK download.** If this repo is
private, GitHub Releases assets return a 404 to anyone who isn't
authenticated with repo access — so the "Download App" button intentionally
does **not** link to a Release. Instead, `deploy-web.yml` also builds the APK
and copies it into `dist/downloads/TMF-app.apk`, so it's served as a plain
static file from the GitHub Pages site itself (`https://<user>.github.io/TMF-app/downloads/TMF-app.apk`),
which is publicly reachable regardless of the repo's visibility. Make sure
GitHub Pages is enabled (see above) — that's the only requirement.

## Building the Android APK

Two workflows build the APK:
- `.github/workflows/deploy-web.yml` builds it as part of every Pages deploy
  and serves it from the live site (see above) — this is what the in-app
  "Download App" button uses.
- `.github/workflows/build-apk.yml` additionally publishes it to a
  `latest-apk` GitHub Release, useful for versioned history / manual
  downloads by contributors with repo access.

Both do the same steps:
1. Build the web app.
2. Run `npx cap add android` (Capacitor generates the native project fresh).
3. Merge the custom notification-listener plugin
   (`native/notification-intercept-plugin/`, see its README) via
   `scripts/patch-android.mjs`.
4. Build a debug APK with Gradle.

The shipped APK is **debug-signed**, which is fine for direct sideloading and
testing. Before publishing to the Play Store, add a real release keystore:

1. Generate one: `keytool -genkey -v -keystore release.keystore -alias tmf -keyalg RSA -keysize 2048 -validity 10000`
2. Store `release.keystore` (base64) and its passwords as GitHub Actions secrets.
3. Switch the workflow's `assembleDebug` step to `assembleRelease` with a
   signing config in `android/app/build.gradle` that reads those secrets.

## The UPI/SMS Interceptor (flagship feature)

See [`native/notification-intercept-plugin/README.md`](native/notification-intercept-plugin/README.md)
for full details. In short: on Android, once the user grants "Notification
Access" (Settings → UPI & SMS Interceptor → Grant Access), the app listens to
notifications from explicitly supported banking/UPI packages, or known bank
sender IDs in supported SMS apps. Only completed payments with an amount
are queued; promotions, OTPs, requests, scheduled and failed payments are rejected.
The Android service persists captures before forwarding them to the WebView,
so ordinary backgrounding, screen-off and Activity closure do not discard them.
Native payment notifications include **Add**, **Edit**, and **Ignore**.
Add opens the app and adds after authentication/unlocking; Edit opens a prefilled editor after unlocking;
Ignore is saved natively without opening the app. Cancelling Edit keeps the
payment pending. Replay uses the original notification date/time.

Enable both **SMS / UPI Auto-Interceptor** and **Push Notifications**, grant
Android Notification Access and notification display permission, and install
a newly built APK for native changes. A browser refresh cannot update native code.
The listener cannot recover SMS for which no notification was posted, hidden
notification text, or alerts Android blocks while the app is force-stopped.
Some manufacturers require allowing background activity / autostart and
removing battery restrictions. No app can guarantee capture after a force-stop
or when the OS disables its listener. Source allowlisting is a heuristic, not
cryptographic proof of a bank message; keep reviewing payments before adding.

On the web build (and iOS, not yet supported), this gracefully falls back to
manual entry / the SMS Simulator — no crashes, no native calls attempted.

## Settings navigation

Preferences opens a searchable menu. Account contains profile, cloud sync,
broker connections, backup/restore and demo data. Notifications contains bank/UPI
capture and push/budget alerts. Appearance contains theme, dashboard expansion
and currency. Privacy & Security contains balance masking, location, app lock,
biometrics, delete confirmations and reset. Help and Support contains
troubleshooting and issue reporting; About contains version and APK information.
Each group has a Back action. Preferences and Categories & Budgets are shown
together on the Settings page, without switching tabs. One search bar at the
top filters both menus. Categories & Budgets has a menu for Budgets, Categories, Accounts and
Auto-categorise. Selecting an item opens its existing controls; Back returns
to that menu without clearing selected filters.

## Local storage limits

`localStorage` (used as an offline cache/fallback on every platform, including
inside the Android WebView) is capped per-origin — typically **5–10MB**
depending on the browser/WebView vendor, with no way to request more. That's
roughly tens of thousands of transaction records as JSON, which is plenty for
normal use, but it's not unlimited and it's per-device, not per-account.

Once Supabase is configured (see above), the cloud database is the real,
durable source of truth — `localStorage` just mirrors it for instant offline
reads. If you ever hit the local quota (rare), the oldest safe fix is
export a backup and free unrelated browser/device storage first. **Reset All
Data also deletes cloud records**; it is not a cache-only cleanup action.
