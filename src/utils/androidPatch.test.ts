import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Android patch installs background queue and non-exported actions idempotently', () => {
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
    writeFileSync(join(root, 'android', 'app', 'build.gradle'), 'android { defaultConfig { versionCode 1; versionName "1.0" } }');
    const script = join(scripts, 'patch-android.mjs');
    writeFileSync(script, readFileSync(new URL('../../scripts/patch-android.mjs', import.meta.url)));
    writeFileSync(join(app, 'AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application></application></manifest>');
    writeFileSync(join(java, 'MainActivity.java'), 'package com.trackmoneyflow.app;\npublic class MainActivity extends BridgeActivity {}');
    for (let run = 0; run < 2; run++) {
      if (run === 1) {
        writeFileSync(join(app, 'AndroidManifest.xml'),
          readFileSync(join(app, 'AndroidManifest.xml'), 'utf8')
            .replace('MINARTH Transaction Interceptor', 'Track Money Flow Transaction Interceptor'));
      }
      const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.match(readFileSync(join(app, 'AndroidManifest.xml'), 'utf8'),
        /android:label="MINARTH Transaction Interceptor"/);
    }
    const manifest = readFileSync(join(app, 'AndroidManifest.xml'), 'utf8');
    assert.match(manifest, /android:allowBackup="false"/);
    assert.match(manifest, /android:usesCleartextTraffic="false"/);
    assert.match(readFileSync(join(root, 'android', 'variables.gradle'), 'utf8'), /targetSdkVersion = 36/);
    assert.match(readFileSync(join(root, 'android', 'build.gradle'), 'utf8'), /gradle:8.13.2/);
    assert.match(readFileSync(join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties'), 'utf8'), /gradle-8.13-all.zip/);
    assert.equal(readFileSync(join(root, 'android', 'app', 'build.gradle'), 'utf8').match(/apply from: 'minarth-release.gradle'/g)?.length, 1);
    assert.equal(manifest.match(/<service/g)?.length, 1);
    assert.equal(manifest.match(/<receiver/g)?.length, 1);
    assert.match(manifest, /PaymentActionReceiver" android:exported="false"/);
    assert.equal(manifest.match(/android.permission.POST_NOTIFICATIONS/g)?.length, 1);
    assert.match(manifest, /android:label="MINARTH Transaction Interceptor"/);
    const strings = readFileSync(join(app, 'res', 'values', 'strings.xml'), 'utf8');
    assert.match(strings, /name="app_name">MINARTH</);
    assert.match(strings, /name="title_activity_main">MINARTH</);
    assert.match(strings, /com.trackmoneyflow.app/);
    assert.match(readFileSync(join(app, 'res', 'mipmap-anydpi-v26', 'ic_launcher.xml'), 'utf8'),
      /@drawable\/ic_launcher_foreground/);
    assert.match(readFileSync(join(app, 'res', 'drawable', 'ic_launcher_foreground.xml'), 'utf8'),
      /viewportWidth="512"/);
    for (const path of [
      join(app, 'res', 'mipmap-mdpi', 'ic_launcher.png'),
      join(app, 'res', 'mipmap-xxxhdpi', 'ic_launcher_round.png'),
      join(app, 'res', 'drawable', 'splash.png'),
    ]) {
      assert.deepEqual(readFileSync(path), readFileSync(join(root, 'public', 'icons', 'icon-512.png')));
    }
    assert.equal(readFileSync(join(java, 'MainActivity.java'), 'utf8').match(/registerPlugin\(/g)?.length, 1);
    for (const file of ['InterceptedPaymentStore.java', 'PaymentActionReceiver.java', 'TransactionEligibility.java', 'NotificationInterceptPlugin.java', 'TmfNotificationListenerService.java']) {
      assert.ok(readFileSync(join(java, file), 'utf8').length > 0);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
