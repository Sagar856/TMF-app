# Track Money Flow (TMF)

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
the app). If you never configure Supabase at all, the app still runs fully
offline via `localStorage` on a single device, but signing in becomes
unavailable.

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
   policies — no user can ever read/write another user's rows).
3. In Supabase Auth settings, enable **Email** provider (default). Real email
   confirmation and password-reset links work out of the box on the free tier.
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
every notification the OS delivers system-wide. Bank/UPI-looking
notifications (Google Pay, PhonePe, Paytm, bank SMS alerts, etc.) are parsed
in real time with the same logic used by the in-app SMS Simulator, queued for
review, and a native "Add this transaction?" push notification is posted
immediately.

On the web build (and iOS, not yet supported), this gracefully falls back to
manual entry / the SMS Simulator — no crashes, no native calls attempted.

## Local storage limits

`localStorage` (used as an offline cache/fallback on every platform, including
inside the Android WebView) is capped per-origin — typically **5–10MB**
depending on the browser/WebView vendor, with no way to request more. That's
roughly tens of thousands of transaction records as JSON, which is plenty for
normal use, but it's not unlimited and it's per-device, not per-account.

Once Supabase is configured (see above), the cloud database is the real,
durable source of truth — `localStorage` just mirrors it for instant offline
reads. If you ever hit the local quota (rare), the oldest safe fix is
`Settings → Export Backup JSON` followed by `Reset All Data`, since your
cloud copy is unaffected.
