# Track Money Flow (TMF)

A personal finance tracker: React 19 + TypeScript + Vite web app, packaged for
Android with Capacitor, with a native on-device UPI/SMS notification
interceptor as the flagship feature.

## Architecture (kept at $0 running cost)

| Layer | Choice | Cost |
|---|---|---|
| Frontend | React + Vite + Tailwind | Free (static hosting) |
| Web hosting | Netlify **and/or** GitHub Pages | Free tier |
| Backend / Auth / DB | Supabase (Postgres + Auth, RLS enabled) | Free tier |
| Mobile packaging | Capacitor (wraps the same web app) | Free, open-source |
| APK build & release | GitHub Actions | Free (public repo / free minutes) |

No server you have to run or pay for. Supabase is optional — the app works
fully offline via `localStorage` if you never configure it.

## Running locally

```bash
npm install
npm run dev
```

## Configuring Supabase (optional, enables cloud sync + real accounts)

1. Create a free project at supabase.com.
2. Run [`supabase_schema.sql`](supabase_schema.sql) in the Supabase SQL editor.
3. In Supabase Auth settings, enable **Email** provider (default). Real email
   confirmation and password-reset links work out of the box on the free tier.
4. In the app: Settings → Supabase Backend Sync → paste your Project URL and
   anon key.

## Deploying the web app

### Netlify
Connect the repo in the Netlify dashboard — `netlify.toml` already configures
the build command (`npm run build`) and publish directory (`dist`). No extra
setup needed.

### GitHub Pages
`.github/workflows/deploy-web.yml` builds and publishes to GitHub Pages
automatically on every push to `main`. Enable Pages once in the repo's
Settings → Pages → Source: "GitHub Actions".

## Building the Android APK

`.github/workflows/build-apk.yml` runs on every push to `main` and:
1. Builds the web app.
2. Runs `npx cap add android` (Capacitor generates the native project fresh).
3. Merges the custom notification-listener plugin
   (`native/notification-intercept-plugin/`, see its README) via
   `scripts/patch-android.mjs`.
4. Builds a debug APK and publishes it to the `latest-apk` GitHub Release —
   this is the link the in-app "Download App" button points to.

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
