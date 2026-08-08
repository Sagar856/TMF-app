#!/usr/bin/env node
/**
 * Merges the hand-written native/notification-intercept-plugin sources into
 * the Capacitor-generated `android/` project. Run this AFTER `npx cap add
 * android` (or `npx cap sync android`) and BEFORE building with Gradle.
 *
 * Why a script instead of committing android/ directly: `npx cap add android`
 * generates the full native project (including the binary Gradle wrapper jar)
 * fresh from Capacitor's own templates, which is far more reliable than
 * hand-authoring/maintaining an entire Android Studio project by hand. This
 * script only injects the small, reviewable pieces that make the real
 * notification-listener feature work.
 *
 * Usage: node scripts/patch-android.mjs
 */
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const androidAppDir = join(repoRoot, 'android', 'app');
const javaPackageDir = join(androidAppDir, 'src', 'main', 'java', 'com', 'trackmoneyflow', 'app');
const manifestPath = join(androidAppDir, 'src', 'main', 'AndroidManifest.xml');
const mainActivityPath = join(javaPackageDir, 'MainActivity.java');
const drawableDir = join(androidAppDir, 'src', 'main', 'res', 'drawable');

const pluginSrcDir = join(repoRoot, 'native', 'notification-intercept-plugin');

function fail(msg) {
  console.error(`[patch-android] ERROR: ${msg}`);
  process.exit(1);
}

if (!existsSync(join(repoRoot, 'android'))) {
  fail('android/ folder not found. Run "npx cap add android" first.');
}

// 1. Copy Java plugin sources
mkdirSync(javaPackageDir, { recursive: true });
for (const file of ['NotificationInterceptPlugin.java', 'TmfNotificationListenerService.java']) {
  copyFileSync(join(pluginSrcDir, file), join(javaPackageDir, file));
  console.log(`[patch-android] Copied ${file}`);
}

// 2. Copy notification icon drawable
mkdirSync(drawableDir, { recursive: true });
copyFileSync(join(pluginSrcDir, 'res', 'drawable', 'ic_stat_tmf.xml'), join(drawableDir, 'ic_stat_tmf.xml'));
console.log('[patch-android] Copied ic_stat_tmf.xml notification icon');

// 3. Patch AndroidManifest.xml (idempotent — skips if already patched)
if (!existsSync(manifestPath)) fail(`AndroidManifest.xml not found at ${manifestPath}`);
let manifest = readFileSync(manifestPath, 'utf8');

if (!manifest.includes('BIND_NOTIFICATION_LISTENER_SERVICE')) {
  manifest = manifest.replace(
    /(<manifest[^>]*>)/,
    `$1\n    <uses-permission android:name="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE" />\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />`
  );

  const serviceBlock = `        <service\n            android:name="com.trackmoneyflow.app.TmfNotificationListenerService"\n            android:label="Track Money Flow Transaction Interceptor"\n            android:exported="false"\n            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">\n            <intent-filter>\n                <action android:name="android.service.notification.NotificationListenerService" />\n            </intent-filter>\n        </service>\n    </application>`;

  manifest = manifest.replace(/\s*<\/application>/, `\n${serviceBlock}`);

  writeFileSync(manifestPath, manifest, 'utf8');
  console.log('[patch-android] Patched AndroidManifest.xml with permission + service declaration');
} else {
  console.log('[patch-android] AndroidManifest.xml already patched, skipping');
}

// 4. Register the plugin class in MainActivity.java (idempotent)
if (!existsSync(mainActivityPath)) fail(`MainActivity.java not found at ${mainActivityPath}`);
let mainActivity = readFileSync(mainActivityPath, 'utf8');

if (!mainActivity.includes('NotificationInterceptPlugin')) {
  if (!mainActivity.includes('public class MainActivity extends BridgeActivity {')) {
    fail('Unexpected MainActivity.java content — cannot safely patch. Please register NotificationInterceptPlugin manually.');
  }

  mainActivity = mainActivity.replace(
    'public class MainActivity extends BridgeActivity {',
    'public class MainActivity extends BridgeActivity {\n    // Registers our custom native notification-listener plugin (instance\n    // initializer runs before Android calls onCreate()).\n    {\n        registerPlugin(NotificationInterceptPlugin.class);\n    }'
  );
  writeFileSync(mainActivityPath, mainActivity, 'utf8');
  console.log('[patch-android] Registered NotificationInterceptPlugin in MainActivity.java');
} else {
  console.log('[patch-android] MainActivity.java already patched, skipping');
}

console.log('[patch-android] Done.');
