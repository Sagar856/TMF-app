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
After the first successful sign-in on a device, an account-specific glass
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
sender IDs in supported SMS apps. Only completed payments with an amount
are queued; promotions, OTPs, requests, scheduled and failed payments are rejected.
The Android service persists captures before forwarding them to the WebView,
so ordinary backgrounding, screen-off and Activity closure do not discard them.
Native payment notifications show a structured lavender expanded card with
amount, direction, account, date/time, payment mode, merchant and bank.
The three system actions are **Add**, **Description**, and **Ignore**.
Description opens Android's inline reply field and saves up to 200 characters
without adding the transaction. The description becomes its title when added;
the original merchant, amount and SMS remain intact. **Edit transaction in app**
is available inside the expanded card. Android/OEM notification layouts and
collapsed presentation may differ from the reference image.
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
