import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Android workflows preserve lint gates and resilient download setup', () => {
  for (const workflow of ['build-apk.yml', 'build-play-bundle.yml', 'check-android.yml']) {
    const source = readFileSync(new URL(`../../.github/workflows/${workflow}`, import.meta.url), 'utf8');
    assert.match(source, /uses: android-actions\/setup-android@v3\r?\n\s+with:\r?\n\s+packages: 'platform-tools'/);
    assert.match(source, /sdkmanager "platforms;android-36" "build-tools;36\.0\.0"/);
    assert.match(source, /runs-on: ubuntu-24\.04/);
    assert.match(source, /timeout-minutes: 30/);
    assert.match(source, /uses: gradle\/actions\/setup-gradle@v4/);
    assert.equal(source.match(/for attempt in 1 2 3; do/g)?.length, 2);
    assert.match(source, /\.\/gradlew --version --no-daemon/);
    assert.match(source, /\.\/gradlew (?:lintRelease (?:assembleRelease|bundleRelease)|lintDebug assembleDebug) --no-daemon --stacktrace --console=plain/);
    assert.match(source, /node_modules\/@capacitor\/android\/capacitor\/build\/reports\/lint-results-\*/);
    assert.doesNotMatch(source, /continue-on-error: true|abortOnError\s*=?\s*false|-x lint/);
  }
});

test('Capacitor packages stay aligned on the filename-sanitizing patch release', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));
  for (const name of ['@capacitor/android', '@capacitor/core', '@capacitor/cli']) {
    assert.equal((name === '@capacitor/cli' ? manifest.devDependencies : manifest.dependencies)[name], '6.2.3');
    assert.equal(lock.packages[`node_modules/${name}`].version, '6.2.3');
  }
});

test('Payment interception preserves API 22 compatibility without suppressing lint', () => {
  const store = readFileSync(new URL('../../native/notification-intercept-plugin/InterceptedPaymentStore.java', import.meta.url), 'utf8');
  const receiver = readFileSync(new URL('../../native/notification-intercept-plugin/PaymentActionReceiver.java', import.meta.url), 'utf8');
  const listener = readFileSync(new URL('../../native/notification-intercept-plugin/TmfNotificationListenerService.java', import.meta.url), 'utf8');
  for (const source of [store, receiver]) {
    assert.doesNotMatch(source, /context\.(?:getSystemService|checkSelfPermission)\(/);
    assert.match(source, /ContextCompat\.getSystemService\(context, NotificationManager\.class\)/);
    assert.match(source, /import androidx\.core\.app\.RemoteInput;/);
    assert.doesNotMatch(source, /import android\.app\.RemoteInput;/);
  }
  assert.match(store, /ContextCompat\.checkSelfPermission\(context, Manifest\.permission\.ACCESS_COARSE_LOCATION\)/);
  assert.match(store, /ContextCompat\.checkSelfPermission\(context, Manifest\.permission\.ACCESS_FINE_LOCATION\)/);
  assert.match(store, /ContextCompat\.getSystemService\(context, LocationManager\.class\)/);
  assert.match(store, /if \(Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.O\) \{\s+NotificationChannel/);
  assert.match(store, /new NotificationCompat\.Builder\(context, CHANNEL\)/);
  assert.match(store, /new NotificationCompat\.DecoratedCustomViewStyle\(\)/);
  assert.doesNotMatch(store, /new Notification\.(?:Builder|Action\.Builder|DecoratedCustomViewStyle)/);
  assert.match(listener, /if \(Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.N\) \{\s+requestRebind\(/);
  for (const source of [store, receiver, listener]) {
    assert.doesNotMatch(source, /@SuppressLint|@RequiresApi/);
  }
});

test('Android patch installs background queue and non-exported actions idempotently', () => {
  const baseEnv = { ...process.env, ANDROID_DISTRIBUTION: 'play', ANDROID_VERSION_CODE: undefined };
  const root = mkdtempSync(join(tmpdir(), 'tmf-android-patch-'));
  try {
    const scripts = join(root, 'scripts');
    const app = join(root, 'android', 'app', 'src', 'main');
    const java = join(app, 'java', 'com', 'trackmoneyflow', 'app');
    mkdirSync(scripts, { recursive: true });
    mkdirSync(java, { recursive: true });
    mkdirSync(join(app, 'res', 'values'), { recursive: true });
    mkdirSync(join(app, 'res', 'drawable'), { recursive: true });
    mkdirSync(join(root, 'public', 'icons'), { recursive: true });
    cpSync(new URL('../../public/icons', import.meta.url), join(root, 'public', 'icons'), { recursive: true });
    writeFileSync(join(app, 'res', 'values', 'strings.xml'),
      '<resources><string name="app_name">MTracker</string><string name="title_activity_main">MTracker</string><string name="package_name">com.trackmoneyflow.app</string></resources>');
    writeFileSync(join(app, 'res', 'drawable', 'splash.png'), 'old splash');
    cpSync(new URL('../../native', import.meta.url), join(root, 'native'), { recursive: true });
    cpSync(new URL('../../scripts/android-release.gradle', import.meta.url), join(scripts, 'android-release.gradle'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.0.4' }));
    mkdirSync(join(root, 'android', 'gradle', 'wrapper'), { recursive: true });
    writeFileSync(join(root, 'android', 'variables.gradle'), 'ext { compileSdkVersion = 34; targetSdkVersion = 34 }');
    writeFileSync(join(root, 'android', 'build.gradle'), "classpath 'com.android.tools.build:gradle:8.2.1'");
    writeFileSync(join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties'), 'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.2.1-all.zip');
    writeFileSync(join(root, 'android', 'app', 'build.gradle'), 'android { defaultConfig { versionCode 7; versionName "1.0" } }');
    const script = join(scripts, 'patch-android.mjs');
    writeFileSync(script, readFileSync(new URL('../../scripts/patch-android.mjs', import.meta.url)));
    writeFileSync(join(app, 'AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" /><uses-permission android:name="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE" /><application android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher_round"></application></manifest>');
    mkdirSync(join(app, 'res', 'drawable-v24'), { recursive: true });
    writeFileSync(join(app, 'res', 'drawable-v24', 'ic_launcher_foreground.xml'), '<vector/>');
    writeFileSync(join(java, 'MainActivity.java'), 'package com.trackmoneyflow.app;\npublic class MainActivity extends BridgeActivity {}');
    for (let run = 0; run < 3; run++) {
      if (run === 1) {
        const wrapperPath = join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties');
        writeFileSync(wrapperPath, readFileSync(wrapperPath, 'utf8').replace('networkTimeout=120000', 'networkTimeout=10000'));
        writeFileSync(join(app, 'AndroidManifest.xml'),
          readFileSync(join(app, 'AndroidManifest.xml'), 'utf8')
            .replace('MINARTH Transaction Interceptor', 'Track Money Flow Transaction Interceptor'));
      }
      const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env: baseEnv });
      assert.equal(result.status, 0, result.stderr);
      const wrapper = readFileSync(join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties'), 'utf8');
      assert.match(wrapper, /gradle-8\.13-bin\.zip/);
      assert.match(wrapper, /^networkTimeout=120000\r?$/m);
      assert.equal(wrapper.match(/^networkTimeout=/gm)?.length, 1);
      assert.match(readFileSync(join(app, 'AndroidManifest.xml'), 'utf8'),
        /android:label="MINARTH Transaction Interceptor"/);
    }
    const manifest = readFileSync(join(app, 'AndroidManifest.xml'), 'utf8');
    for (const name of ['InterceptedPaymentStore.java', 'PaymentActionReceiver.java', 'TmfNotificationListenerService.java']) {
      assert.equal(readFileSync(join(java, name), 'utf8'),
        readFileSync(new URL(`../../native/notification-intercept-plugin/${name}`, import.meta.url), 'utf8'));
    }
    assert.doesNotMatch(manifest, /<uses-permission[^>]*BIND_NOTIFICATION_LISTENER_SERVICE|RECEIVE_BOOT_COMPLETED|ACCESS_BACKGROUND_LOCATION|READ_SMS|RECEIVE_SMS|READ_CALL_LOG/);
    assert.match(manifest, /android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"/);
    assert.match(manifest, /android:allowBackup="false"/);
    assert.match(manifest, /android:usesCleartextTraffic="false"/);
    assert.match(readFileSync(join(root, 'android', 'variables.gradle'), 'utf8'), /targetSdkVersion = 36/);
    assert.match(readFileSync(join(root, 'android', 'build.gradle'), 'utf8'), /gradle:8.13.2/);
    assert.match(readFileSync(join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties'), 'utf8'), /gradle-8\.13-bin\.zip/);
    assert.equal(readFileSync(join(root, 'android', 'app', 'build.gradle'), 'utf8').match(/apply from: 'minarth-release.gradle'/g)?.length, 1);
    assert.match(readFileSync(join(root, 'android', 'app', 'build.gradle'), 'utf8'), /versionCode 7/);
    const explicitVersion = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...baseEnv, ANDROID_VERSION_CODE: '42' } });
    assert.equal(explicitVersion.status, 0, explicitVersion.stderr);
    assert.match(readFileSync(join(root, 'android', 'app', 'build.gradle'), 'utf8'), /versionCode 42/);
    const invalidVersion = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...baseEnv, ANDROID_VERSION_CODE: '4e2' } });
    assert.equal(invalidVersion.status, 1);
    assert.match(invalidVersion.stderr, /Invalid ANDROID_VERSION_CODE/);
    assert.equal(manifest.match(/<service/g)?.length, 1);
    assert.equal(manifest.match(/<receiver/g)?.length, 1);
    assert.match(manifest, /PaymentActionReceiver" android:exported="false"/);
    assert.equal(manifest.match(/android.permission.POST_NOTIFICATIONS/g)?.length, 1);
    assert.equal(manifest.match(/android.permission.ACCESS_COARSE_LOCATION/g)?.length, 1);
    assert.equal(manifest.match(/android.permission.ACCESS_FINE_LOCATION/g)?.length, 1);
    assert.equal(manifest.match(/android.permission.USE_BIOMETRIC/g)?.length, 1);
    assert.equal(manifest.match(/android.permission.USE_FINGERPRINT/g)?.length, 1);
    assert.equal(manifest.match(/android:icon="@mipmap\/minarth_launcher"/g)?.length, 1);
    assert.equal(manifest.match(/android:roundIcon="@mipmap\/minarth_launcher_round"/g)?.length, 1);
    for (const name of ['minarth_launcher.xml', 'minarth_launcher_round.xml']) {
      const adaptive = readFileSync(join(app, 'res', 'mipmap-anydpi-v26', name), 'utf8');
      assert.match(adaptive, /@drawable\/minarth_adaptive_background/);
      assert.match(adaptive, /@drawable\/minarth_adaptive_foreground/);
      assert.match(adaptive, /@drawable\/ic_minarth_monochrome/);
      assert.doesNotMatch(adaptive, /@drawable\/ic_launcher_foreground/);
    }
    assert.match(readFileSync(join(app, 'res', 'drawable', 'minarth_adaptive_foreground.xml'), 'utf8'),
      /@drawable\/minarth_launcher_foreground/);
    assert.match(manifest, /android:label="MINARTH Transaction Interceptor"/);
    const strings = readFileSync(join(app, 'res', 'values', 'strings.xml'), 'utf8');
    assert.match(strings, /name="app_name">MINARTH</);
    assert.match(strings, /name="title_activity_main">MINARTH</);
    assert.match(strings, /com.trackmoneyflow.app/);
    assert.match(readFileSync(join(app, 'res', 'mipmap-anydpi-v26', 'ic_launcher.xml'), 'utf8'),
      /@drawable\/ic_launcher_foreground/);
    assert.match(readFileSync(join(app, 'res', 'drawable', 'ic_launcher_foreground.xml'), 'utf8'),
      /@drawable\/minarth_launcher_foreground/);
    for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
      const adaptive = readFileSync(join(app, 'res', 'mipmap-anydpi-v26', name), 'utf8');
      assert.match(adaptive, /<background android:drawable="@drawable\/ic_launcher_background"/);
      assert.match(adaptive, /<foreground android:drawable="@drawable\/ic_launcher_foreground"/);
      assert.match(adaptive, /<monochrome android:drawable="@drawable\/ic_minarth_monochrome"/);
    }
    assert.match(readFileSync(join(app, 'res', 'drawable', 'ic_launcher_background.xml'), 'utf8'), /#e9e9fa/);
    assert.deepEqual(
      readFileSync(join(app, 'res', 'drawable', 'minarth_launcher_foreground.png')),
      readFileSync(join(root, 'public', 'icons', 'icon-adaptive-foreground.png')),
    );
    for (const file of ['ic_minarth_monochrome.png', 'ic_minarth_notification.png', 'ic_minarth_purple.png', 'payment_card_background.xml']) {
      assert.deepEqual(
        readFileSync(join(app, 'res', 'drawable', file)),
        readFileSync(join(root, 'native', 'notification-intercept-plugin', 'res', 'drawable', file)),
      );
    }
    assert.match(readFileSync(join(app, 'res', 'drawable', 'ic_stat_tmf.xml'), 'utf8'),
      /@drawable\/ic_minarth_notification/);
    for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      assert.deepEqual(
        readFileSync(join(app, 'res', `mipmap-${density}`, 'ic_launcher_foreground.png')),
        readFileSync(join(root, 'public', 'icons', 'icon-adaptive-foreground.png')),
      );
      for (const name of ['minarth_launcher.png', 'minarth_launcher_round.png']) {
        assert.deepEqual(readFileSync(join(app, 'res', `mipmap-${density}`, name)),
          readFileSync(join(root, 'public', 'icons', 'icon-512.png')));
      }
    }
    for (const path of [
      join(app, 'res', 'mipmap-mdpi', 'ic_launcher.png'),
      join(app, 'res', 'mipmap-xxxhdpi', 'ic_launcher_round.png'),
      join(app, 'res', 'drawable', 'splash.png'),
    ]) {
      assert.deepEqual(readFileSync(path), readFileSync(join(root, 'public', 'icons', 'icon-512.png')));
    }
    assert.equal(readFileSync(join(java, 'MainActivity.java'), 'utf8').match(/registerPlugin\(/g)?.length, 2);
    assert.equal(readFileSync(join(java, 'MainActivity.java'), 'utf8').match(/registerPlugin\(AppUpdatePlugin.class\)/g)?.length, 1);
    assert.doesNotMatch(manifest, /REQUEST_INSTALL_PACKAGES/);
    assert.match(manifest, /name="minarth.sideloadUpdates" android:value="false"/);
    assert.match(manifest, /android:authorities="\$\{applicationId\}\.updates" android:exported="false"/);
    assert.match(manifest, /android:name="com.trackmoneyflow.app.AppUpdateFileProvider"/);
    assert.deepEqual(readFileSync(join(java, 'AppUpdatePlugin.java')), readFileSync(join(root, 'native', 'app-update-plugin', 'AppUpdatePlugin.java')));
    for (let run = 0; run < 2; run++) {
      const sideload = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...baseEnv, ANDROID_DISTRIBUTION: 'sideload' } });
      assert.equal(sideload.status, 0, sideload.stderr);
      const sideloadManifest = readFileSync(join(app, 'AndroidManifest.xml'), 'utf8');
      assert.equal(sideloadManifest.match(/android.permission.REQUEST_INSTALL_PACKAGES/g)?.length, 1);
      assert.equal(sideloadManifest.match(/name="minarth.sideloadUpdates" android:value="true"/g)?.length, 1);
      assert.equal(sideloadManifest.match(/android:authorities="\$\{applicationId\}\.updates"/g)?.length, 1);
    }
    const play = spawnSync(process.execPath, [script], { encoding: 'utf8', env: baseEnv });
    assert.equal(play.status, 0, play.stderr);
    assert.doesNotMatch(readFileSync(join(app, 'AndroidManifest.xml'), 'utf8'), /REQUEST_INSTALL_PACKAGES/);
    assert.deepEqual(readFileSync(join(app, 'res', 'layout', 'payment_notification.xml')),
      readFileSync(join(root, 'native', 'notification-intercept-plugin', 'res', 'layout', 'payment_notification.xml')));
    for (const file of ['InterceptedPaymentStore.java', 'PaymentNotificationDetails.java', 'PaymentActionReceiver.java', 'TransactionEligibility.java', 'NotificationInterceptPlugin.java', 'TmfNotificationListenerService.java']) {
      assert.deepEqual(readFileSync(join(java, file)), readFileSync(join(root, 'native', 'notification-intercept-plugin', file)));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
