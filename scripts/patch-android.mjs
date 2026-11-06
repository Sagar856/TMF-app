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
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const androidAppDir = join(repoRoot, 'android', 'app');
const javaPackageDir = join(androidAppDir, 'src', 'main', 'java', 'com', 'trackmoneyflow', 'app');
const manifestPath = join(androidAppDir, 'src', 'main', 'AndroidManifest.xml');
const mainActivityPath = join(javaPackageDir, 'MainActivity.java');
const drawableDir = join(androidAppDir, 'src', 'main', 'res', 'drawable');
const resDir = dirname(drawableDir);

const pluginSrcDir = join(repoRoot, 'native', 'notification-intercept-plugin');
const updateSrcDir = join(repoRoot, 'native', 'app-update-plugin');
const distribution = process.env.ANDROID_DISTRIBUTION || 'play';
if (!['play', 'sideload'].includes(distribution)) throw new Error('ANDROID_DISTRIBUTION must be play or sideload');

function fail(msg) {
  console.error(`[patch-android] ERROR: ${msg}`);
  process.exit(1);
}

if (!existsSync(join(repoRoot, 'android'))) {
  fail('android/ folder not found. Run "npx cap add android" first.');
}

// API 36 is required for new Play submissions from August 2026.
const variablesPath = join(repoRoot, 'android', 'variables.gradle');
const rootGradlePath = join(repoRoot, 'android', 'build.gradle');
const wrapperPath = join(repoRoot, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties');
const appGradlePath = join(androidAppDir, 'build.gradle');
for (const path of [variablesPath, rootGradlePath, wrapperPath, appGradlePath]) {
  if (!existsSync(path)) fail(`Generated Gradle file missing: ${path}`);
}
let variables = readFileSync(variablesPath, 'utf8');
for (const key of ['compileSdkVersion', 'targetSdkVersion']) {
  const pattern = new RegExp(`${key}\\s*=\\s*\\d+`);
  if (!pattern.test(variables)) fail(`Missing ${key} in variables.gradle`);
  variables = variables.replace(pattern, `${key} = 36`);
}
writeFileSync(variablesPath, variables);
let rootGradle = readFileSync(rootGradlePath, 'utf8');
if (!/com\.android\.tools\.build:gradle:[\d.]+/.test(rootGradle)) fail('Android Gradle Plugin version not found');
rootGradle = rootGradle.replace(/com\.android\.tools\.build:gradle:[\d.]+/g, 'com.android.tools.build:gradle:8.13.2');
writeFileSync(rootGradlePath, rootGradle);
let wrapper = readFileSync(wrapperPath, 'utf8');
if (!/gradle-[\d.]+-(?:all|bin)\.zip/.test(wrapper)) fail('Gradle wrapper version not found');
wrapper = wrapper.replace(/gradle-[\d.]+-(?:all|bin)\.zip/g, 'gradle-8.13-bin.zip');
if (/^networkTimeout[ \t]*[=:]/m.test(wrapper)) {
  wrapper = wrapper.replace(/^networkTimeout[ \t]*[=:][^\r\n]*/gm, 'networkTimeout=120000');
} else {
  wrapper = `${wrapper.trimEnd()}\nnetworkTimeout=120000\n`;
}
writeFileSync(wrapperPath, wrapper);
const { version } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
let appGradle = readFileSync(appGradlePath, 'utf8');
if (!/versionCode\s+\d+/.test(appGradle) || !/versionName\s+"[^"]+"/.test(appGradle)) fail('Generated Android version fields missing');
const suppliedVersionCode = process.env.ANDROID_VERSION_CODE;
if (suppliedVersionCode !== undefined && !/^[1-9]\d*$/.test(suppliedVersionCode)) fail('Invalid ANDROID_VERSION_CODE');
const versionCode = Number(suppliedVersionCode ?? appGradle.match(/versionCode\s+(\d+)/)[1]);
if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2100000000) fail('Invalid ANDROID_VERSION_CODE');
appGradle = appGradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
if (!appGradle.includes("apply from: 'minarth-release.gradle'")) appGradle += "\napply from: 'minarth-release.gradle'\n";
if (!appGradle.includes('androidx.work:work-runtime:2.9.1')) {
  appGradle += "\ndependencies { implementation 'androidx.work:work-runtime:2.9.1' }\n";
}
writeFileSync(appGradlePath, appGradle);
copyFileSync(join(repoRoot, 'scripts', 'android-release.gradle'), join(androidAppDir, 'minarth-release.gradle'));

// 1. Copy Java plugin sources
mkdirSync(javaPackageDir, { recursive: true });
for (const file of ['NotificationInterceptPlugin.java', 'TmfNotificationListenerService.java', 'TransactionEligibility.java', 'PaymentNotificationDetails.java', 'InterceptedPaymentStore.java', 'PaymentActionReceiver.java', 'PaymentSaveWorker.java']) {
  copyFileSync(join(pluginSrcDir, file), join(javaPackageDir, file));
  console.log(`[patch-android] Copied ${file}`);
}

// 2. Copy notification icon drawable
copyFileSync(join(updateSrcDir, 'AppUpdatePlugin.java'), join(javaPackageDir, 'AppUpdatePlugin.java'));
copyFileSync(join(updateSrcDir, 'AppUpdateWorker.java'), join(javaPackageDir, 'AppUpdateWorker.java'));
copyFileSync(join(updateSrcDir, 'AppUpdateFileProvider.java'), join(javaPackageDir, 'AppUpdateFileProvider.java'));
const xmlDir = join(resDir, 'xml');
mkdirSync(xmlDir, { recursive: true });
copyFileSync(join(updateSrcDir, 'update_paths.xml'), join(xmlDir, 'update_paths.xml'));
mkdirSync(drawableDir, { recursive: true });
copyFileSync(join(pluginSrcDir, 'res', 'drawable', 'ic_stat_tmf.xml'), join(drawableDir, 'ic_stat_tmf.xml'));
for (const file of ['ic_minarth_notification.png', 'ic_minarth_monochrome.png']) {
  copyFileSync(join(pluginSrcDir, 'res', 'drawable', file), join(drawableDir, file));
}
copyFileSync(join(pluginSrcDir, 'res', 'drawable', 'ic_minarth_purple.png'), join(drawableDir, 'ic_minarth_purple.png'));
copyFileSync(join(pluginSrcDir, 'res', 'drawable', 'payment_card_background.xml'), join(drawableDir, 'payment_card_background.xml'));
const layoutDir = join(resDir, 'layout');
mkdirSync(layoutDir, { recursive: true });
copyFileSync(join(pluginSrcDir, 'res', 'layout', 'payment_notification.xml'), join(layoutDir, 'payment_notification.xml'));
console.log('[patch-android] Copied ic_stat_tmf.xml notification icon');

// Keep the package identity stable while updating existing and fresh installs.
const stringsPath = join(resDir, 'values', 'strings.xml');
if (!existsSync(stringsPath)) fail(`strings.xml not found at ${stringsPath}`);
let strings = readFileSync(stringsPath, 'utf8');
for (const name of ['app_name', 'title_activity_main']) {
  const entry = new RegExp(`(<string\\s+name="${name}"[^>]*>)[\\s\\S]*?(</string>)`);
  if (!entry.test(strings)) fail(`Missing ${name} in strings.xml`);
  strings = strings.replace(entry, '$1MINARTH$2');
}
writeFileSync(stringsPath, strings, 'utf8');
const foreground = join(pluginSrcDir, 'res', 'drawable', 'ic_minarth_foreground.xml');
if (!existsSync(foreground)) fail('MINARTH foreground missing. Run npm run icons:generate');
copyFileSync(foreground, join(drawableDir, 'ic_launcher_foreground.xml'));
writeFileSync(join(drawableDir, 'ic_launcher_background.xml'),
  '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#e9e9fa"/></shape>\n');
const launcherPng = join(repoRoot, 'public', 'icons', 'icon-512.png');
if (!existsSync(launcherPng)) fail('MINARTH PNG missing. Run node scripts/generate-icons.mjs');
const adaptivePng = join(repoRoot, 'public', 'icons', 'icon-adaptive-foreground.png');
if (!existsSync(adaptivePng)) fail('MINARTH adaptive PNG missing. Run npm run icons:generate');
copyFileSync(adaptivePng, join(drawableDir, 'minarth_launcher_foreground.png'));
writeFileSync(join(drawableDir, 'minarth_adaptive_foreground.xml'),
  '<bitmap xmlns:android="http://schemas.android.com/apk/res/android" android:src="@drawable/minarth_launcher_foreground" android:gravity="fill" android:filter="true"/>\n');
writeFileSync(join(drawableDir, 'minarth_adaptive_background.xml'),
  '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#e9e9fa"/></shape>\n');
for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  const folder = join(resDir, `mipmap-${density}`);
  mkdirSync(folder, { recursive: true });
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    copyFileSync(launcherPng, join(folder, name));
  }
  copyFileSync(adaptivePng, join(folder, 'ic_launcher_foreground.png'));
  copyFileSync(launcherPng, join(folder, 'minarth_launcher.png'));
  copyFileSync(launcherPng, join(folder, 'minarth_launcher_round.png'));
}
const adaptiveDir = join(resDir, 'mipmap-anydpi-v26');
mkdirSync(adaptiveDir, { recursive: true });
for (const name of ['minarth_launcher.xml', 'minarth_launcher_round.xml']) {
  writeFileSync(join(adaptiveDir, name), `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@drawable/minarth_adaptive_background"/>
  <foreground android:drawable="@drawable/minarth_adaptive_foreground"/>
  <monochrome android:drawable="@drawable/ic_minarth_monochrome"/>
</adaptive-icon>\n`);
}
for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  writeFileSync(join(adaptiveDir, name), `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@drawable/ic_launcher_background"/>
  <foreground android:drawable="@drawable/ic_launcher_foreground"/>
  <monochrome android:drawable="@drawable/ic_minarth_monochrome"/>
</adaptive-icon>\n`);
}
for (const folder of readdirSync(resDir, { withFileTypes: true })) {
  if (folder.isDirectory() && /^drawable(?:-|$)/.test(folder.name)) {
    const splash = join(resDir, folder.name, 'splash.png');
    if (existsSync(splash)) copyFileSync(launcherPng, splash);
  }
}
console.log('[patch-android] Installed MINARTH name, launcher icons and splash artwork');

// 3. Patch AndroidManifest.xml (idempotent — skips if already patched)
if (!existsSync(manifestPath)) fail(`AndroidManifest.xml not found at ${manifestPath}`);
let manifest = readFileSync(manifestPath, 'utf8');
// Binding permission belongs on the service; no boot receiver is registered.
manifest = manifest.replace(/\s*<uses-permission\b[^>]*android:name="android\.permission\.(?:BIND_NOTIFICATION_LISTENER_SERVICE|RECEIVE_BOOT_COMPLETED)"[^>]*\/>/g, '');
manifest = manifest.replace(/\s+android:(?:allowBackup|usesCleartextTraffic)="[^"]*"/g, '');
manifest = manifest.replace('<application', '<application android:allowBackup="false" android:usesCleartextTraffic="false"');
manifest = manifest.replace(/(<application\b[^>]*?)(>)/, (_match, attributes, end) =>
  `${attributes.replace(/\s+android:(?:icon|roundIcon)="[^"]*"/g, '')} android:icon="@mipmap/minarth_launcher" android:roundIcon="@mipmap/minarth_launcher_round"${end}`);

if (!manifest.includes('com.trackmoneyflow.app.TmfNotificationListenerService')) {
  const serviceBlock = `        <service\n            android:name="com.trackmoneyflow.app.TmfNotificationListenerService"\n            android:label="MINARTH Transaction Interceptor"\n            android:exported="true"\n            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">\n            <intent-filter>\n                <action android:name="android.service.notification.NotificationListenerService" />\n            </intent-filter>\n        </service>\n    </application>`;

  manifest = manifest.replace(/\s*<\/application>/, `\n${serviceBlock}`);


  writeFileSync(manifestPath, manifest, 'utf8');
  console.log('[patch-android] Patched AndroidManifest.xml with service declaration');
} else {
  console.log('[patch-android] AndroidManifest.xml already patched, skipping');
}
if (!manifest.includes('com.trackmoneyflow.app.PaymentActionReceiver')) {
  manifest = manifest.replace('</application>', '    <receiver android:name="com.trackmoneyflow.app.PaymentActionReceiver" android:exported="false" />\n    </application>');
}
if (!manifest.includes('android.permission.POST_NOTIFICATIONS')) {
  manifest = manifest.replace(/(<manifest[^>]*>)/, '$1\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />');
}
for (const permission of ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'USE_BIOMETRIC', 'USE_FINGERPRINT']) {
  if (!manifest.includes(`android.permission.${permission}`)) {
    manifest = manifest.replace(/(<manifest[^>]*>)/, `$1\n    <uses-permission android:name="android.permission.${permission}" />`);
  }
}
manifest = manifest.replace(/android:label="Track Money Flow Transaction Interceptor"/g,
  'android:label="MINARTH Transaction Interceptor"');
manifest = manifest.replace(/\s*<uses-permission\b[^>]*android:name="android\.permission\.REQUEST_INSTALL_PACKAGES"[^>]*\/>/g, '');
manifest = manifest.replace(/\s*<meta-data\b[^>]*android:name="minarth\.sideloadUpdates"[^>]*\/>/g, '');
if (distribution === 'sideload') {
  manifest = manifest.replace(/(<manifest[^>]*>)/, '$1\n    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />');
}
manifest = manifest.replace('</application>', `    <meta-data android:name="minarth.sideloadUpdates" android:value="${distribution === 'sideload'}" />\n    </application>`);
if (!manifest.includes('${applicationId}.updates')) {
  manifest = manifest.replace('</application>', '    <provider android:name="com.trackmoneyflow.app.AppUpdateFileProvider" android:authorities="${applicationId}.updates" android:exported="false" android:grantUriPermissions="true"><meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/update_paths" /></provider>\n    </application>');
}
writeFileSync(manifestPath, manifest, 'utf8');

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

mainActivity = readFileSync(mainActivityPath, 'utf8');
if (!mainActivity.includes('registerPlugin(AppUpdatePlugin.class)')) {
  if (!mainActivity.includes('public class MainActivity extends BridgeActivity {')) fail('Could not register AppUpdatePlugin');
  mainActivity = mainActivity.replace('public class MainActivity extends BridgeActivity {',
    'public class MainActivity extends BridgeActivity {\n    { registerPlugin(AppUpdatePlugin.class); }');
  writeFileSync(mainActivityPath, mainActivity, 'utf8');
}

console.log('[patch-android] Done.');
