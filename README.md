# MINARTH

**Clarity for your money.** Formerly MTracker / Track Money Flow.

A personal finance tracker: React 19 + TypeScript + Vite web app, packaged for
Android with Capacitor, with a native on-device UPI/SMS notification
interceptor as the flagship feature.

## For coding agents

Start with [`AGENTS.md`](AGENTS.md) for repository rules and
[`.github/skills/minarth-app/SKILL.md`](.github/skills/minarth-app/SKILL.md)
for the app architecture, key flows and focused checks. Keep the skill updated
with every feature or bug fix.

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

On Windows, Vite keeps its generated dependency cache in a per-checkout
`minarth-vite-<hash>` directory inside the user's temporary directory, outside
the watched workspace. This avoids workspace file locks preventing cache
renames and causing `504 Outdated Optimize Dep` startup failures. Other
platforms retain Vite's default cache location. Restart `npm run dev` and reload
the browser after changing dependencies.

MINARTH uses the approved logo-only lavender glass artwork in `public/icons/Designer logo only.png`. The same artwork
appears in the header, sidebar, sign-in and launch screens, browser favicon,
installed web app and Android launcher/notification icons.
Run `npm run icons:generate` to regenerate the self-contained SVG, standard and
maskable PNGs, and Android adaptive/themed/notification artwork from that image.
The source image is preserved unchanged. Adaptive icons use safe-zone padding
to keep the complete mark visible under circular launcher masks. The rectangular
source is fitted proportionally, without stretching or cropping; Android themed and
notification icons use a monochrome silhouette of the supplied M symbol.
Expanded payment notifications also use an isolated purple M-growth icon.
Android controls the tint of the small status-bar icon; it cannot be forced
purple on every device. Launcher resources use MINARTH-specific names and
explicit manifest references so Capacitor's default robot artwork cannot
override the approved logo. Rebuild and install the APK to update native icons.
Run `npm run android:patch` after Capacitor sync to install native branding.
The Android application ID, storage keys, backup format and existing download
URLs remain unchanged so the rename preserves existing installations and data.

All pages share theme-aware glass surfaces and translucent nested controls.
Appearance > App UI color offers Deep Purple (the original), Forest Green,
Celestial Blue, Burgundy and Sunset Gold. Tap App UI color to open a dedicated
page with an illustrative Home preview and horizontally scrollable color tiles.
The whole App UI color row opens the picker, with the current palette shown
beside its label. The picker fits the available mobile viewport; its Home
illustration scales down while color tiles and Apply remain readable and tappable.
Very short landscape viewports or enlarged text can scroll rather than hide
the preview or controls.
Select a tile to preview it, then apply it across the app. Back returns to
Appearance without applying a draft selection. The preview never reads or
changes financial records. Palette changes preserve the existing saturation,
lightness, transparency, gradients, blur and animations in both light and
dark mode. In-app logos follow the selected hue while retaining the approved
shape, transparency and shading; the Home preview also previews its logo color.
Installed app icons and notification status icons remain unchanged. Financial
status/category colors and broker identities are not recolored. This preference is saved, included in backups and
synced with other portable appearance settings.
Currency & Region uses two themed dropdowns: preferred currency (INR, USD,
EUR or GBP) and region/number formatting. They are independent: changing
currency does not change the selected region or convert stored amounts.
Existing imported currency/locale values remain selectable.
Account preferences save automatically and sync shortly after each change,
without pressing Sync. Rapid edits are coalesced, failures retain the latest
pending preferences and trigger three automatic retries. Pending preferences
retry when connectivity returns or the app becomes visible again. Device
permissions, PIN/biometric enrollment, auto-lock and broker credentials remain
local, as does this device's sample-data state.
The reference-inspired design uses a charcoal geometric backdrop, smoked
reflective panels, violet focal cards and chart gradients. Mobile and desktop
retain their existing layouts, stacked metrics, navigation and financial
actions. Light mode uses the same palette on transparent pearl surfaces.
Desktop metric tiles on Transactions, Accounts, Investments and Loans use the
same horizontal, equal-width glass cards as Home. Mobile metric decks keep their
existing expand/collapse behavior.
Expanded mobile finance metric tiles also use palette-aware translucent glass
in both light and dark themes, with the first tile highlighted like Home.
Desktop budget and recurring panels use
translucent nested surfaces rather than opaque white fills. The mobile palette
strip and Apply button are compact while retaining touch-friendly targets.
The rounded mobile glass dock keeps all six destinations and safe-area spacing.
Surface entrance fades, chart drawing and hover highlights respect reduced-motion
preferences. Actions use violet gradients; losses and alerts retain status colors.
The net-worth summary uses a compact, half-height card with reduced surrounding space.
Dark-mode metric cards in Transactions, Accounts, Investments and Loans share
Home's violet first card and smoked-glass lower cards, stacked or expanded.
Profile and sign-in (including registration and password recovery) use the
same glass palette, with scrollable mobile dialogs and reduced-motion support.
The header profile icon opens Settings > Profile settings (there is no profile
popup). Profile settings contains the photo editor, display name, account email,
Save Changes and Sign out. The account email is read-only and uses the signed-in
Auth email when available; saving profile changes never edits the email.
Save Changes stays disabled until the display name or photo differs from the
saved profile (leading and trailing name whitespace is ignored).
Change password, app passcode protection and
device biometrics live under Privacy & Security. Account setting contains cloud
sync and Data & Backup; its nested Danger zone contains Reset all data and
Delete account. Manage accounts ends with Manual Broker Portfolios. Sign out
is also available at the end of the Settings menu.
Settings search lists individual controls with their section paths. It matches
multiple words in any order, common synonyms and minor typos, ranking exact
titles first. Selecting a result opens and highlights the control without
changing a value or running an action. Account-only actions appear only when
available; biometric and auto-lock results lead to passcode setup when needed.
Use Down/Up to navigate results, Enter to open one, and Escape or the clear
button to return to the menu.
The initial branded launch loader stays visible while restoring sign-in and
loading private account data, without a separate account-loading screen.
If account loading fails, the same loader shows the error, Retry and Sign out;
private data remains gated until loading succeeds.
After the first successful sign-in on a device, optional glass pop-ups offer
notification alerts, foreground location tagging and biometric setup, followed
by Dark, Light or Same as system theme selection. Each permission has Not now;
device prompts run only after Continue. Biometric unlock first requires an app
PIN fallback, then device verification. Denial or unavailable hardware leaves
the option disabled and offers retry or skip. These prompts precede the
walkthrough and are remembered locally per account/device; existing users who
already completed the walkthrough are not reprompted.
Same as system follows Android/WebView's `prefers-color-scheme`, updates while
the app is open or resumes, and also updates the native status bar. The theme
choice is available in Settings > Appearance, backups and account preference
sync; permissions and biometric enrollment remain device-local.
After setup, an account-specific glass
walkthrough introduces Home, Accounts, Transactions, Investments, Loans and
Settings. Next, Previous, Skip and Get started controls are available; completing
or skipping it is remembered locally for that account. It never adds sample
records or enables permissions automatically. Previous stays visible but is
disabled on the first step. The navigation footer remains visible while the
walkthrough content scrolls on smaller screens.
Android back and browser history restore UI activities within a page, including
settings sections, filter selections, account details and loan histories, before
returning to the previous page. Open dialogs close first. Saved financial records
are never undone, closed forms are not replayed, and history is cleared on sign-out.
Location tagging requires both the optional Settings toggle and device consent.
Opening a new transaction with tagging enabled asks for location access if it
has not been granted. Android builds declare foreground precise/approximate
location permissions; no background tracking is requested. If a place name
cannot be resolved, the detected coordinates are retained as the location label.
SMS payments use a recent permitted capture-time location when available, or
current location only for payments received within two minutes while the app
is visible and permission is already granted. Old payments never receive the
user's current location. Android's native geocoder is tried before online
place-name lookup. If all lookups fail, SMS coordinates are retained with
"Location name unavailable" and retried on pending-payment replay. Background
location permission is not requested; payments may remain untagged when
Android cannot supply a recent location.
Captured coordinates survive delayed review and later disabling of tagging;
the SMS editor never replaces them with the save-time position. Recent
foreground fallback coordinates are also saved into the native pending queue.
If no position was captured, historical location cannot be recovered.
To enable biometric app lock, set an app PIN, then enable biometric unlock in
Privacy & Security. An app disclosure is followed by Android's biometric
verification prompt. Biometric permissions are install-time permissions, not
a separate runtime grant dialog; fingerprint/face must already be enrolled
in device settings. Android automatically prompts when the app is locked,
with PIN fallback after cancellation or unavailable hardware. Enrollment
stays local to the device and is cleared when biometric/app lock is disabled.
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
   `deleted_at` tombstones, `sync_revision`…). For older optional columns the
   app shows an amber *"Cloud schema is outdated"* banner and skips only those
   fields. The transaction revision migration below is mandatory and does not
   fall back to unsafe snapshot writes.
   Then run [`supabase_background_payments.sql`](supabase_background_payments.sql)
   before deploying this version. Android notification **Add** uses this
   authenticated, idempotent RPC to save the transaction and account balance
   together without opening the app. **Category**, **Description** and
   **Ignore** are notification-only actions and do not add a transaction. The
   notification body opens the app for review; the expanded notification has no
   separate **Edit** section or action. Offline/expired-session/missing-migration
   failures remain visible and retryable, not silently marked saved. WorkManager
   can run after process termination, but not while Android force-stops or
   otherwise restricts the app.
   The notification shows a saving state while background Add runs; Ignore shows
   a device confirmation after it is recorded. In-app Add and Ignore confirm local
   completion only, not cloud sync.
   Finally run [`supabase_pending_notifications.sql`](supabase_pending_notifications.sql)
   to enable **cross-device sync of SMS/notification-parser payment reviews**:
   pending reviews extracted on one device become reviewable on every signed-in
   device, and each device's queued changes are applied through one atomic RPC.
   Resolving a review (**Add**/**Ignore**) tombstones it in the cloud with
   first-resolution-wins conflict handling, so a stale device can never re-add
   the same payment and double-apply account balances. Without this migration
   the app keeps working device-locally and shows the amber schema banner; the
   queued review operations are retained and sync once the script is applied.
   **The coordinated financial-sync rollout still requires hosted Supabase and
   multi-device validation before deployment.** Accounts and transactions now
   use one atomic, revision-checked batch. Stable operation IDs and server receipts
   make an identical retry safe after a lost response. Account revisions prevent
   stale foreground snapshots from overwriting background or other-device
   balances; a reset epoch rejects queued creates from before a data reset.
   Transaction deletions include their reversed account projection and retained
   pending transactions in the same commit. Category-only MINA changes remain
   balance-neutral. Direct writes from older clients are rejected.
   A paired local financial snapshot is authoritative over the legacy cache keys.
   Pending changes are retried before cloud hydration; conflicts preserve them
   and offer local backup export plus an explicit discard-and-reload choice.
   Detected offline transaction edits/deletions remain blocked. An online indicator
   does not establish backend reachability. Local PostgreSQL-compatible tests do
   not establish real Supabase or Android behavior.
   After validating the coordinated rollout, run
   [`supabase_transaction_sync.sql`](supabase_transaction_sync.sql) after the
   schema and updated notification scripts, then
   [`supabase_financial_sync.sql`](supabase_financial_sync.sql), and the updated
   [`supabase_admin.sql`](supabase_admin.sql) if admin features are enabled.
   These scripts must be deployed together with the matching client.
   Upgrade every signed-in
   device before resuming transaction edits; if any device is still on an old
   build, its direct transaction writes will fail visibly until it is upgraded.
   If the optional admin tools are installed, also apply the updated
   [`supabase_admin.sql`](supabase_admin.sql) so the authorized admin data wipe
   remains compatible with the transaction guard.

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
   this is not completion of the in-app registration.
   Before the first code request, the app calls `registration_email_exists`
   with the trimmed, lowercased email. Existing Auth identities show an
   **Account already exists** dialog with **Go to sign in** and **Use a different
   email** actions; no signup code is sent. Resends in the same registration
   flow remain possible after the pending identity is created. Returning to an
   abandoned registration in a new flow counts as an existing identity; use
   Sign in / Forgot Password to recover that account.
   **Apply the updated `supabase_schema.sql` before deploying this app version.**
   A missing lookup function or backend error blocks code sending and displays
   an error rather than assuming the email is new. The function returns only a
   boolean for an exact email, not user records, and does not require an admin
   key in the browser. This UX intentionally discloses account existence; apply
   gateway-level abuse controls/rate limits to the lookup endpoint in production
   (Supabase Auth OTP limits do not rate-limit PostgREST RPC calls).
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
Transaction writes additionally require
[`supabase_transaction_sync.sql`](supabase_transaction_sync.sql). Each synced
record carries a server revision; stale edits and deletions are rejected rather
than overwriting newer cloud data. Do not apply the migration until the
transaction and balance safety risks described above are resolved and validated. After that, apply it
and upgrade all active devices before enabling this client. Android background **Add** remains on the
authenticated balance-update RPC and requires the updated
[`supabase_background_payments.sql`](supabase_background_payments.sql).

Passcodes/hashes/salts, biometric and auto-lock settings, device permission
switches, broker connections, and sample-data state remain device-local.
Savings goals, receipt files, and recurring-bill overrides remain local as before.

## Google Play readiness audit (4 November 2026)

The repository is **not yet certified ready for publication**. Implemented:

- Signup email-code verification, resend and expired/invalid-code feedback.
- Free manual transactions, loans, investments and notification capture.
  Real-time balances/quotes are explicitly **Premium: Coming soon**; quote
  auto-refresh is disabled. No checkout or subscription charge exists yet.
- Automatic portable-settings/rules sync and a successful-sync timestamp.
- Self-service **Settings > Account setting > Data & Backup > Danger zone > Delete account**. Apply the latest schema
  to install `delete_own_account()`. It has no user-ID parameter, derives identity
  from `auth.uid()`, is executable only by authenticated users, and cascades
  deletion through user-owned database rows.
- Public `privacy.html` and `delete-account.html` pages, including a web-only
  sign-in/deletion route. Host these pages on the deployed site and use their
  HTTPS URLs in Play Console. Operator **Sagar Nanasaheb Bodkhe, India** and contact
  **minarth.co@gmail.com** are configured; **retention and request-process details
  still need completion before submission**.
- Explicit notification-data disclosure before granting access; GPS tagging and
  auto-extraction are off by default for new installs. Saved source message text
  and transaction locations can sync: do not claim that all information stays
  on-device. No SMS inbox/call-log permissions are requested.
- Location consent and the privacy policy disclose coordinate transmission to
  BigDataCloud/OpenStreetMap Nominatim, including before a transaction is saved.
  Profile photos upload with private cloud preferences.
- Native password recovery accepts an email recovery code in-app rather than
  generating WebView-localhost redirect links. Configure the Reset password
  email template as described below. Web reset-link behavior remains available.
- Native About includes Check for updates. Signed sideload installations use
  the APK updater; Play installations remain store-managed. Web downloads use
  the signed sideload APK, not a Play release.
- Release preflight blocks missing backend/public URL/version configuration,
  privileged backend keys and draft policies. The signed workflow runs Android
  release lint. Re-patching Android without a version environment variable
  preserves the existing versionCode; release builds require an explicit match.
  Unused boot/binding permission requests are removed; the notification listener
  retains its service-level binding protection.
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
  the wrapper downloads the smaller binary-only Gradle distribution with a
  120-second network timeout instead of the default 10 seconds.
  Capacitor Android/core/CLI are pinned together at 6.2.3, which sanitizes
  ContentProvider filenames and passes the newer lint rule without suppressing it.
  Android workflows use Ubuntu 24.04, cache Gradle downloads/dependencies, retry
  SDK/Gradle bootstrap at most three times, retain lint reports even on failure,
  and stop after 30 minutes. Compilation and lint failures are not retried or ignored.
  `Check Android build` validates debug lint and compilation for both
  Play and sideload distributions on pull requests, without signing secrets.
  Make both Android checks required in the GitHub `main` branch ruleset and use
  pull requests to prevent merging native build failures. Direct pushes to `main`
  bypass this pre-merge protection.
  Android backup and cleartext traffic are disabled. The original package ID
  `com.trackmoneyflow.app` and Supabase auth storage remain unchanged.
- Desktop Home has a wide two-column glass workspace; mobile remains stacked.
  Missing `animate-in` CSS has been implemented. OS **Reduce motion** is respected:
  if all motion is disabled, check Android/browser/OS accessibility settings.
  The startup screen now uses the same glass styling.

Validation for this audit: TypeScript checks and all **167 tests** passed;
the production build passed with a non-blocking large-chunk warning. Browser
checks used an isolated origin and a mocked backend to verify native recovery,
password confirmation/visibility, notification-consent gating and access refresh,
native About links, and location-provider disclosure before permission. These
checks do not certify live Supabase, SMTP delivery or physical Android behavior.

### Remaining launch gates (operator/device validation required)

1. Apply the SQL migration to the actual Supabase project; test user A/B RLS,
   OTP delivery/expiry/resend, password recovery, offline/reconnect sync and
   account deletion using disposable accounts. No production backend migration
   or real-email round trip is performed by editing this repository.
2. Complete retention/request details in the privacy policy and choose/deploy
   the production public HTTPS app URL. Complete the Data safety form
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

Edit `public/privacy.html`; the remaining bracketed retention/request fields
and draft notices must be replaced before publishing. The operator and contact
provided above are already filled in. Do not invent retention promises:

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

### Native password recovery email

In Supabase **Authentication > Email Templates > Reset password**, include
`{{ .Token }}` so Android users can enter the recovery code in MINARTH. Retain
`{{ .ConfirmationURL }}` as a reset link for web users; for example:

```html
<p>Your MINARTH password recovery code is: {{ .Token }}</p>
<p>In the Android app, enter this code on Reset Password.</p>
<p>On the web, <a href="{{ .ConfirmationURL }}">reset your password</a>.</p>
```

Configure the project Site URL to the real public app URL and whitelist the
web deployment's exact redirect URL. Native recovery does not request a
`https://localhost` redirect or require a custom deep link. Test actual delivery,
expired codes, resends and password confirmation before release. Template and
SMTP settings cannot be deployed by changing this repository.

### Building a signed Play release

The push-to-main APK workflow produces **release-signed sideload builds**,
not Play releases. Play builds default to `ANDROID_DISTRIBUTION=play`, omit
`REQUEST_INSTALL_PACKAGES`, and disable the native APK updater.
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

Also set the environment **variable** `VITE_PUBLIC_APP_URL` to the deployed
public HTTPS app root, including its subdirectory if hosted below one.
It is release metadata used by preflight; it does not deploy the site or
configure Supabase redirects automatically. Set `ANDROID_VERSION_CODE` locally
and run `npm run play:check` with the backend/public URL environment variables
before building. This checks repository prerequisites, not live URL availability,
legal sufficiency, deployed RLS, or whether Play already has a higher version.
The current incomplete policy intentionally fails this check.

The workflow checks prerequisites, runs tests and Android `lintRelease`, builds
a signed release AAB, uploads the bundle/lint reports as artifacts and deletes
the runner's temporary upload key. Upload the AAB to Play's internal testing
track first; this workflow does **not** publish to production automatically.
Local native builds need JDK 17 and Android SDK 36. Release tasks fail explicitly
if signing credentials are missing or `ANDROID_VERSION_CODE` is missing,
invalid or different from the patched Android app. Use the same explicit value
for `android:patch` and Gradle. No native build/device certification has been
performed on this workstation.

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
new signed APK or Play release.

## Deploying the web app

### Netlify
Connect the repo in the Netlify dashboard — `netlify.toml` already configures
the build command (`npm run build`) and publish directory (`dist`). No extra
setup needed.

### GitHub Pages
`.github/workflows/build-apk.yml` builds the native APK and matching website on
every push to `main`. After it succeeds, `.github/workflows/deploy-web.yml`
publishes that exact build to GitHub Pages. A failed signed build does not
replace the currently deployed site/APK. Enable Pages once in the repo's
Settings → Pages → Source: "GitHub Actions".

**Repository visibility matters for the APK download.** If this repo is
private, GitHub Releases assets return a 404 to anyone who isn't
authenticated with repo access — so the "Download App" button intentionally
does **not** link to a Release. The signed build copies the APK into
`dist/downloads/TMF-app.apk`, so it's served as a plain
static file from the GitHub Pages site itself (`https://<user>.github.io/TMF-app/downloads/TMF-app.apk`),
alongside `downloads/update.json`. Confirm unauthenticated access to both URLs;
private Pages access controls must not block mobile users. Enable Pages and
configure the signing secrets below before the workflow can publish.

## Building the Android APK

The `Build Android APK` workflow tests/builds the bundled native web app,
generates and patches Capacitor Android, runs release lint, builds a signed
APK and verifies its signature/package/version with Android build tools.
It then builds the Pages website separately with its correct base path,
publishes versioned GitHub releases (`apk-<versionCode>`) and uploads a matching
site artifact. Pages publishes the APK and metadata together, so the two
cannot come from unrelated builds. Older queued deployments cannot roll back
the advertised update version. GitHub release creation can succeed before
Pages deployment; mobile availability starts only after Pages succeeds.

### Automatic update notifications

Signed sideload builds check on launch and resume, and schedule native Android
WorkManager checks roughly every 12 hours with an available network, even when
the app is closed. The schedule survives normal process termination and reboot;
Android battery restrictions may delay it. Force-stopping the app prevents
background checks until it is opened again.

Android 13+ asks for notification permission once. Enable MINARTH notifications
and the **App updates** channel in Android Settings to receive alerts. Denying
permission does not disable in-app update checks. One notification is posted
per newer build; tapping it opens the app, where the update prompt appears
after any required sign-in/unlock. Checks only fetch small, bounded metadata:
they never download or install an APK in the background. Installation retains
the existing checksum/package/signature verification and Android approval.
Google Play-managed installations do not schedule sideload checks.

Device validation: install this signed build, allow notifications, close the
app, publish a higher versionCode, and confirm a single update notification.
Tap it and verify the update prompt and installer approval. Repeat with
notification permission/channel disabled, offline/recovery, reboot, and a
Play-managed install. Android controls background execution timing.

### One-time signing setup (required)

Configure repository Actions secrets under Settings > Secrets and variables >
Actions:

- `APK_SIGNING_KEYSTORE_BASE64`: base64 of the persistent sideload signing key.
- `APK_SIGNING_STORE_PASSWORD`: keystore password.
- `APK_SIGNING_KEY_ALIAS`: signing alias, for example `minarth`.
- `APK_SIGNING_KEY_PASSWORD`: private-key password.
- Existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` remain required.

If you have an existing compatible signing key, reuse it. Otherwise, on a
machine with JDK 17, generate a key **outside the repository**, using interactive
password prompts (never put passwords in command history):

```powershell
keytool -genkeypair -v -keystore "$env:USERPROFILE\minarth-sideload.jks" -alias minarth -keyalg RSA -keysize 3072 -validity 10000
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\minarth-sideload.jks")) | Set-Clipboard
```

Paste the clipboard content into `APK_SIGNING_KEYSTORE_BASE64`, then clear the
clipboard. Store an encrypted offline backup of the key and passwords.
Never commit or rotate this key casually: every installed sideload app must
receive updates signed by the same certificate. Missing secrets fail the
workflow explicitly; there is no debug-key fallback. Play upload keys remain
separate: a Play App Signing certificate is not necessarily your upload key.

The workflow assigns `versionCode = ANDROID_APK_VERSION_BASE + run_number * 100
+ run_attempt` (attempts must be below 100). The default base is `100000`.
Set repository variable `ANDROID_APK_VERSION_BASE` higher if existing installs
already have a larger code, or before replacing/resetting the workflow's run
number history. Never decrease it. Codes must remain at most `2100000000`.
Display versionName comes from `package.json`; bump it for user-facing releases.
Re-running a build increases its code; older installed or advertised builds
are never offered as upgrades.

### Receiving an update on the phone

Signed sideload builds check the public metadata after startup and show
**Update available** when its versionCode is higher. You can also use
Settings > About > Android app > Check for updates. Automatic network failures
are logged and do not block startup; manual checks show an error and Retry.

1. Tap **Install update**. Native Android downloads the APK over HTTPS.
2. The app checks size, SHA-256, package ID, versionCode and the installed
   signing certificate. No arbitrary download URLs or redirects are accepted.
3. If prompted, allow **Install unknown apps** for MINARTH in Android Settings.
   Return to MINARTH and tap **Install update** again; the verified cached
   download is reused.
4. Approve the update in Android's installer. Cancelling does not install it.
   “Installer opened” is not a claim that installation succeeded.
5. Open MINARTH again. A compatible in-place update preserves its storage and
   sign-in. Never uninstall as an update step.

The endpoint is fixed to
`https://sagar856.github.io/TMF-app/downloads/update.json` and its APK sibling.
If the hosting address changes, update the TypeScript constants, native URL,
metadata generator, workflow URLs and docs together. Updates contain no user
data and checks do not send authentication tokens. SHA-256 detects damaged or
mismatched downloads; the package certificate/Android installer protect the
installed signing identity. This is not silent installation or a bypass of
Android's permission/approval UI.

**Existing debug installs need a one-time migration.** They do not contain this
updater, and fresh-runner debug certificates may not match the new persistent
key. Manually install the first signed build over an old app only if signatures
match. If the original signing key is lost, Android cannot do an in-place
migration: export a backup, verify cloud sync and plan a deliberate reinstall.
Do not ask users to uninstall automatically. Future signed builds can then
update normally.

Before distributing to users, install two consecutive signed builds on a
physical Android device and verify update prompts, certificate matching,
unknown-source permission, cancellation, retry, sign-in and local-data
preservation. This repository change does not configure GitHub secrets, deploy
a build, or certify a physical-device installation.

## The UPI/SMS Interceptor (flagship feature)

See [`native/notification-intercept-plugin/README.md`](native/notification-intercept-plugin/README.md)
for full details. In short: on Android, once the user grants "Notification
Access" (Settings → UPI & SMS Interceptor → Grant Access), the app listens to
notifications from explicitly supported banking/UPI packages, or known bank
sender IDs in supported SMS apps. An optional, separate Settings switch enables
bank-payment previews posted by Gmail; it does not grant mailbox access, and
previews lacking the bank name, amount or transaction text cannot be parsed.
Bank statement and payment-due previews can produce a separate statement
alert rather than a transaction. These alerts do not import statement files.
Only completed payments with an amount
are queued; promotions, OTPs, requests, scheduled and failed payments are rejected.
The Android service persists captures before forwarding them to the WebView,
so ordinary backgrounding, screen-off and Activity closure do not discard them.
Native payment notifications show a structured lavender expanded card with
amount, direction, account, date/time, payment mode, merchant, bank and detected
category type/category. Android and the app share the ordered category rules.
The actions are **Add**, **Category**, **Description**, and **Ignore**. Android
shows Add, Category and Description as system actions; Ignore appears beside
the description in the expanded card because Android supports at most three
system actions. Category and Description have separate inline replies and save
without adding the transaction. On Add, Category text takes priority; when it is
blank, the entered Description is used. Both are matched against the user's
existing categories for that payment direction, including subcategories and
shared merchant/topic keywords. For example lunch, dinner, breakfast, Zomato
and Swiggy map to an available Food & Dining category; petrol/taxi/pharmacy
resolve to their respective available categories. Close category names work too.
Notification Add uses the same immediate local rules whether MINA is enabled or
not, so model startup does not delay saving.
Category replies are matched dynamically against current category and subcategory
names (for example, Shopping can match Shopping & Tech or a Shopping subcategory).
The local matcher can also recognize a complete custom category or subcategory
name within a longer phrase, such as "bought pencils for school". Competing
destinations remain ambiguous rather than being guessed.
Negated text such as "not lunch" is not treated as positive evidence, unless it
exactly names an available category or subcategory.
Conflicting matches never select an arbitrary destination. Unmatched Category
or Description input no longer blocks Add: the payment is saved with the
parser category and its categorisation request is retained only on this device.
MINA processes that text after saving, when the app is unlocked and financial
sync is ready; model startup does not delay Add. Category takes priority over
Description. If MINA is disabled/unavailable, or the result is uncertain, invalid
or conflicts with a rule, use **Notification bell > Pending review** to select
an existing category/subcategory and press **Save**, or Keep current.
Android posts a separate **Saved transaction** notification identifying its amount.
Its **Save** action opens that same review after unlock; it does not add another
payment or debit the account again. If notification permission is unavailable,
the request remains in the notification bell. Closed/locked apps retain the
request until the next unlocked session; inference does not run while locked.
Owner-scoped requests and reviews survive app restarts, including a cloud save
whose receipt has not yet been acknowledged. Revision checks reject intervening
edits/deletions rather than rebasing a stale suggestion. Completion markers
prevent repeated processing; signing out/resetting local data clears these
local requests. Only applied financial categories continue to sync to Supabase.
No new SQL migration is required beyond the documented financial-sync migrations.
Neither path invents a category from model output. In-app Add shows a saving spinner and
disables competing payment actions while matching and saving. It confirms the
amount/category after local persistence; Android background Add shows a brief amount/category
confirmation after cloud saving and native receipt persistence, without opening
the app. Android may limit background toast visibility. Duplicate retries do not
repeat the category confirmation. For a failed Add, tap the Android notification
body or the app's notification bell to review pending extracted payments; use
Edit to select a valid category. The expanded card allows more space for errors.
The description becomes the transaction title when added, and the category is
saved to the category column. The original merchant, amount and SMS remain
intact. Tap the notification body to open the app for further review.
Android/OEM notification layouts and collapsed presentation may differ from
the reference image.
Add saves the transaction and account balance through an authenticated background
worker without opening the app, even after its process is terminated. Apply
[`supabase_background_payments.sql`](supabase_background_payments.sql) before
deploying the updated APK. Network/authentication failures retain a visible,
retryable notification. Native receipts and a shared cloud-write lock prevent
duplicate balance changes and older foreground uploads overwriting the save.
After opening a pending payment in the app and unlocking, **Edit** opens a
prefilled editor; **Ignore** is saved natively without opening the app.
Cancelling Edit keeps the
payment pending. Replay uses the original notification date/time.
Opening a notification does not auto-dismiss it. Pending native captures survive
session expiry and sign-in; actions wait for authentication, unlock and cloud
settings hydration, and only the capture's owner can review them. Explicit
sign-out and account deletion clear native captures.

The in-app Notifications panel has a top-right **History** button, including
when no payments are pending. It keeps the last 50 extracted-payment and budget
alert summaries locally, with original timestamps and pending/added/ignored
status. Available pending and ignored captures can be edited; added entries
open their existing transaction. Older history entries without retained details,
deleted transactions and alerts are not editable. History is cleared on
sign-out, account cleanup or a financial-data reset.

An unrecognized or ambiguous account suffix is flagged for review. On Android,
an unrecognized suffix also produces a separate account suggestion with Add,
Edit and Ignore actions. Add and Edit open a prefilled account form after
unlock; neither creates an account or saves the payment without review. The
device compares the suffix against its last hydrated account list, so review
the account before saving, particularly if another device changed it. Ignoring
the suggestion does not ignore the payment. Add the account through Accounts or
select an existing account in the editor; background Add will not debit the
default account for that payment.

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

### Cash withdrawals

ATM / cash withdrawals are recorded as a **transfer** from the bank account to
a **Cash in Hand** account (type *Cash*, created automatically on first use)
instead of being counted as spending. Cash counts towards net worth and liquid
balance; spending it later is a normal expense from the Cash account. Captured
notifications such as *"withdrawn at ATM"*, *"Cash withdrawal"* or *"NFS CASH WDL"*
are detected automatically. For a manual entry, use **Add → Transfer between
accounts** with **Cash in Hand** as the destination (offered even before a Cash
account exists). Re-run [`supabase_background_payments.sql`](supabase_background_payments.sql)
so the background **Add** action also credits the Cash account.

## Daily market prices

Stock prices come from two layers. The daily file is always available; the
optional Edge Function adds intraday prices on top of it.

**1. Daily files (baseline, $0).** The
[`Update market data`](.github/workflows/market-data.yml) workflow runs on
weekdays at 19:00 IST (after the NSE/BSE bhavcopies and the IBJA PM rate are
out) and again at 08:00 IST (US closes and retries).
[`scripts/fetch-market-data.mjs`](scripts/fetch-market-data.mjs) publishes two
files:

- **`stocks.json`**, the stock directory: every listed security, about 20,000
  in total (≈1.3 MB, ≈430 KB compressed), each with its name, ISIN and latest
  daily close. There is no built-in stock list in the app; stock search and
  pricing both use this file.
  - **NSE** (about 3,000): closes from the official NSE bhavcopy. Names come
    from NSE's equity and ETF lists. ETFs use BSE's full name for the same ISIN.
    Listed stocks that didn't trade that day are included without a price.
  - **BSE** (about 5,000): the official BSE bhavcopy.
  - **NASDAQ, NYSE, NYSE American and US ETFs** (about 12,000): the Nasdaq
    screener. It runs only after the US close (the 08:00 IST run). If the
    screener is down and nothing was published before, the Nasdaq symbol
    directory is published as names only.
- **`market-data.json`**: physical gold/silver per gram from the
  [IBJA](https://ibjarates.com/) benchmark (gold per purity:
  999/995/916/750/585), and USD/INR from the ECB reference rate via
  [Frankfurter](https://frankfurter.dev/). It also keeps NSE closes for older
  app versions. Metals stay daily only, because IBJA publishes once or twice a
  day.

Both files are force-pushed to the orphan **`market-data`** branch and read from
`raw.githubusercontent.com`. The app caches the stock directory in IndexedDB, so
search works offline. When a source fails, its last published block is kept.
A block that is much smaller or older than the last one is rejected, so a bad
run never empties the stock list. A run that fetches nothing changes nothing and
still succeeds. Each run logs per-market counts.

Search matches symbol, company name or ISIN across all exchanges. Results are
ranked: exact symbol, then symbol prefix, then name prefix, then word matches.
Dual-listed stocks show both NSE and BSE, and each holding is priced from the
exchange it was added on. A ticker that isn't listed can still be added as a
custom ticker with a manual price.

**2. Intraday refresh (Supabase Edge Function, optional).** For signed-in users
the app asks [`market-quotes`](supabase/functions/market-quotes/index.ts) for
the stocks they hold, at most every 10 minutes per symbol. It does this on app
start and whenever the app returns to the foreground.

- The function tries Yahoo Finance first, then Google Finance.
- Results are cached for everyone in `market_quotes` for 15 minutes, or 2 hours
  after the market closes.
- A provider that answers 429/403 is skipped for 30 minutes.
- An intraday quote is used only if it is newer than the daily close. Holdings
  priced this way show a **LIVE** badge with the time; daily prices show
  **DAILY**.
- If the function is missing, the user is signed out, the device is offline, or
  the function is throttled, the app quietly backs off and keeps using the daily
  file.

Setup (one time, all in the browser):

1. Run [`supabase_market_quotes.sql`](supabase_market_quotes.sql) in the Supabase
   SQL editor. It creates the two service-role-only cache tables.
2. Create an access token at <https://supabase.com/dashboard/account/tokens> and
   save it as the repository secret `SUPABASE_ACCESS_TOKEN`. Then run
   **Actions → Deploy Supabase functions → Run workflow**. The project ref is
   taken from `VITE_SUPABASE_URL` (or set `SUPABASE_PROJECT_REF`). The workflow
   redeploys automatically when `supabase/functions/**` changes on `main`.

   Alternatively, create a function named `market-quotes` in the dashboard
   editor and paste both files from `supabase/functions/market-quotes/`.

**Mutual funds** use AMFI NAVs via [mfapi.in](https://www.mfapi.in/) for the
schemes you hold; the scheme picker searches the full AMFI list.
The app requests the compact latest-NAV endpoint on startup, foregrounding and
hourly while visible. Older publication dates are retried hourly rather than
cached for twelve hours. The investment page's **Market data → Refresh** button
bypasses the daily file, directory and NAV cache timers (intraday provider
backoff still applies). Failed requests retain saved prices and manual refresh
reports partial failures. The displayed update time is the latest actual quote
timestamp, not the time the refresh button was clicked; individual funds and
exchanges can have older prices.
Refresh stays to the right of the Market data heading. **Potential next refresh**
estimates the next hourly app check, not the provider's publication time; checks
resume on foregrounding. The info button contains refresh results, source
details and mutual-fund warnings instead of an always-visible success paragraph.

Mutual funds need an AMFI scheme code and units held for automatic valuation.
The market-data section flags missing links/units and NAVs over four days old.
Expand the holding and use **Edit** to select the exact scheme/plan. A closed,
merged or discontinued scheme may only have historical NAVs: do not substitute
another plan automatically. Same-day NAV corrections can update valuations.

Holding cards start collapsed, showing their type, broker, status, name, value
and return. Click the header to reveal valuation details and edit/redeem/delete
actions. The old Demat/Coming soon/Add Asset toolbar is removed; adding assets
remains available from the main add action and broker portfolios from Settings.

Holdings are repriced only when the new price is newer than the stored one. US
stocks are converted to rupees at the latest USD/INR rate. Metal values are
weight × purity rate and exclude making charges.

Run **Actions → Update market data → Run workflow** once to create the branch
(and `stocks.json`; until then the stock picker has no stocks to list).
To use different URLs, set `VITE_MARKET_DATA_URL` / `VITE_STOCK_DIRECTORY_URL`
at build time; set either to `off` to disable it. GitHub pauses scheduled workflows after 60 days
without repository activity; re-enable them from the Actions tab.

**Vercel:** the `market-data` branch is data-only and must not be built as a
Vite application. The root `vercel.json` disables deployments for that branch,
and the publishing workflow copies that configuration into every orphan data
commit. After pushing this fix, run **Update market data** from `main` once to
publish it. Previous failed Vercel previews are historical; other branches
continue deploying normally.

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

## MINA: optional on-device AI assistant

MINA is opt-in under **Settings > MINA AI Assistance**. The first use requires the user to explicitly download the pinned
Qwen2.5-0.5B-Instruct model (Apache-2.0) from Hugging Face. The model and
runtime use about **533 MB** of device storage. Download progress, checksum
verification, cancellation and removal are available in Settings. Local AI
requires browser/WebView support for module workers, WebAssembly, Cache Storage
and Web Locks; unsupported environments display an error. Check actual target
Android WebView versions before release.
In **Settings > Profile settings**, upload or edit a profile picture, adjust its
square crop, zoom and rotation, then apply it and save the profile. Category
creation and editing open in a viewport-attached sheet with the existing
category, subcategory and budget controls.
MINA uses concise MINARTH navigation and calculation guidance bundled with the
app to answer app and general finance questions; model-generated answers can
still be wrong. It does not have
access to your financial records in ordinary chat. Simple navigation questions
about budgets, categories and auto-categorisation use verified local paths.
Simple definition questions about budgets, emergency funds, compound interest
and savings rates also use bundled answers without waiting for model inference.
Exact general questions about MINARTH's budget-usage formula receive the
verified calculation and thresholds locally, without model inference; they do
not calculate a personal budget amount.
Chat and report requests take priority over categorisation requests waiting in
the same worker; an inference already running cannot be interrupted.
Synthetic browser validation also started a fresh production worker with fetch
disabled: it answered a general finance question in about 12 seconds with zero
fetch attempts. This single desktop result is not an Android performance
guarantee or proof of a fully offline app restart. Experimental synthetic-only
fine-tuned adapters have not passed the safety/ambiguity checks and are not shipped.
Editing or deleting existing transactions, including AI categorisation, is
blocked when the device reports that it is offline. New transactions and
notification capture remain available. An online indicator is not proof that
the cloud is reachable; this restriction alone does not make sync conflict-safe.
Do not enter passwords, verification codes, account numbers or other private
details into MINA. Before inference, a local best-effort filter blocks some
recognisable secrets and masks email addresses and long digit sequences,
retaining only their last four digits. It cannot recognise every name, secret,
identifier or format; undetected data may still reach the local model. The
model has no database tools or direct access to authentication or aggregator
consent data. Categorisation sends transaction descriptions and category names
to the model, but not the merchant/person or note fields. Report inference
receives derived findings rather than raw investment, demat or account records.
Categorisation uses temporary category aliases rather than stored category IDs;
if a masked subcategory label is ambiguous, no category is applied.
Model answers that appear to request credentials are rejected, but this filter
also cannot guarantee detection of every unsafe response.

When enabled, the circular **MINA** shortcut appears above the add button and
fades on scroll like the add button.
MINA opens in a palette-aware chat window with separate You/MINA message
bubbles and a scrollable conversation. Starter questions fill the message
box for you to review before sending. Press Enter to send, or Shift + Enter
for a new line; the send button is also available on mobile. Open the menu at
the top left to access **New chat**, **Previous chats**, **Clear chats** and
**Monthly report**. Open the floating three-dot menu beside a saved chat to delete it
after confirmation,
including its reports, without withdrawing consent. Expand **Monthly report** to choose a month and generate a report. Category reviews
remain in the conversation area, and privacy/capability details are available
under **Privacy & how MINA works**.

After installation, inference runs locally without a network or AI API key.
Before the first chat, MINA requires explicit privacy/security consent to save
messages, generated reports and commentary on this device. **New chat** starts
a conversation; **Previous chats** reopens one. The last-open conversation is
restored when MINA reopens or the app restarts. Only the five newest chats per
app account are retained: starting a sixth permanently deletes the oldest chat,
including its reports, even if it was reopened recently.
Unsent drafts are not saved. Closing during generation retains messages already
saved, but an unfinished response is not resumed automatically.

Chats use a separate owner-scoped IndexedDB database, outside financial sync
and app backup exports. They remain after sign-out but are displayed only when
the same account signs in and unlocks the app. No prompts, chat messages, reports
or commentary are sent to Supabase, analytics or an AI service. Account identity
is used only to isolate storage, never passed to the model. The saved data is
not a separately encrypted vault: device/browser-data access can expose it.
Clearing browser/app storage or uninstalling may remove chats. **Clear chats**
permanently deletes this account's local chats and withdraws consent; reopening
chat then requires consent again. Account deletion attempts the same local
cleanup without blocking cloud account deletion if device cleanup fails.
Copies on other devices require clearing that device's storage.
Disabling MINA or removing its model does not delete saved chats.

Saved reports retain their original snapshot date and currency rather than
recalculating from later records. CSV/PDF files are created
only when the user exports a generated report. The assistant generates a report
only when the user asks for one. Deterministic app calculations provide report
figures; the model can select only verified report findings.
For gold and silver rate questions, the assistant uses only the app's locally
saved IBJA benchmark data, labels its source/date, and calculates requested
weights deterministically. It does not browse or fetch live prices; if no
cached benchmark is available, it declines rather than guessing. Other requests
for changing market facts are also declined rather than answered with invented
figures.

Use the report button or explicitly ask MINA to generate or show a report;
questions that merely mention reports do not generate one.
Questions mentioning credentials receive a local safety reminder instead of a
model-generated answer. Do not enter credentials or other sensitive information;
free-text filtering cannot detect every secret.

Notification Add matches Category/Description replies with local rules before
saving, including while closed or locked and regardless of MINA's state. This is
separate from the unlocked-only MINA categorisation described below.

MINA can prepare a category, subcategory or monthly category budget change.
Ask, for example, `Add a new category as "Washing" in expense`; MINA asks for
missing details and shows a preview. Confirm each change before it is saved.
Proposals are not retained across chats or after closing MINA. Other actions
still require the app's normal controls. Changes are saved on this device and
use the existing separate category sync; local confirmation does not guarantee
cloud sync.

Ask `list down all available categories and budgets for current month` for an
instant device-local list and verified budget usage, without model inference.
It lists current recurring limits, not historical budgets, and acknowledges
missing/unsynced records. These derived replies stay in local chat history but
are excluded from subsequent model context. Other model requests time out
visibly after 60 seconds (including queue time) instead of waiting indefinitely.

When enabled and the app is unlocked, the assistant can automatically
categorise eligible notification transactions, imported transactions and
transactions explicitly marked as rule-categorised. Uncertain suggestions and
disagreements with an existing categorisation rule require review. Existing
transactions with an unknown category origin—including manually entered or
legacy records—are left unchanged until you explicitly request processing of
uncategorised records. User-edited categories are never automatically
overwritten. If a cloud transaction changed on another device, the suggestion
is not applied; you can keep the local record or explicitly reload the cloud
version. Applied categories are ordinary financial-record changes and continue
to sync through Supabase. Revision-checked sync requires
[`supabase_transaction_sync.sql`](supabase_transaction_sync.sql) and all active
devices upgraded to this version, together with the atomic financial-sync and
background-payment migrations described above. Hosted Supabase/multi-device
validation remains a release gate; do not deploy an incomplete migration set.

Clear titles use the same fast local matcher before MINA inference. Invalid
model categories and inference failures leave records unchanged and appear
under the notification bell's **Pending review**, with **View
transaction** and **Keep current** controls. The alert's **Pending review**
button opens this list; its X dismisses the alert without changing a record.
Automatic failures are not retried repeatedly during the same session.
These saved transactions are separate from pending extracted payments in the
notification bell.

Selecting the main Settings navigation button returns to the Settings menu,
including from Appearance, its color picker and Categories & Budgets subpages.

Explicit demo loads use fresh record IDs and linked account IDs, preserving
custom records and categories. Remove the current demo set before loading
another. Removed demo IDs remain tombstoned; reloading never revives them.
Cloud hydration retains live demo records and derives this device's demo-loaded
indicator from them; it does not omit accounts from an atomic financial snapshot.

Local AI does **not** make all MINARTH features work offline. In particular,
the normal cloud account still syncs financial records, including categories
the user applies, according to the existing Supabase sync behavior. During the
explicit model download, Hugging Face receives normal network metadata.
Downloaded model files are stored in browser/WebView Cache Storage, not an
encrypted vault; removing the model deletes that cache.

## Local storage limits

`localStorage` (used as an offline cache/fallback on every platform, including
inside the Android WebView) is capped per-origin — typically **5–10MB**
depending on the browser/WebView vendor, with no way to request more. That's
roughly tens of thousands of transaction records as JSON, which is plenty for
normal use, but it's not unlimited and it's per-device, not per-account.

Confirmed synced records are durable in Supabase; pending changes may exist
only on this device until acknowledged. The paired financial snapshot and its
legacy projections store the ledger twice, reducing the effective cache capacity.
If you hit the local quota, export a backup and free unrelated browser/device
storage first. Do not clear pending financial snapshots as a cache cleanup. **Reset All
Data also deletes cloud records**; it is not a cache-only cleanup action.
