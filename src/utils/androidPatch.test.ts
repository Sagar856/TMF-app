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
    cpSync(new URL('../../native', import.meta.url), join(root, 'native'), { recursive: true });
    const script = join(scripts, 'patch-android.mjs');
    writeFileSync(script, readFileSync(new URL('../../scripts/patch-android.mjs', import.meta.url)));
    writeFileSync(join(app, 'AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application></application></manifest>');
    writeFileSync(join(java, 'MainActivity.java'), 'package com.trackmoneyflow.app;\npublic class MainActivity extends BridgeActivity {}');
    for (let run = 0; run < 2; run++) {
      const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
    const manifest = readFileSync(join(app, 'AndroidManifest.xml'), 'utf8');
    assert.equal(manifest.match(/<service/g)?.length, 1);
    assert.equal(manifest.match(/<receiver/g)?.length, 1);
    assert.match(manifest, /PaymentActionReceiver" android:exported="false"/);
    assert.equal(manifest.match(/android.permission.POST_NOTIFICATIONS/g)?.length, 1);
    assert.equal(readFileSync(join(java, 'MainActivity.java'), 'utf8').match(/registerPlugin\(/g)?.length, 1);
    for (const file of ['InterceptedPaymentStore.java', 'PaymentActionReceiver.java', 'TransactionEligibility.java', 'NotificationInterceptPlugin.java', 'TmfNotificationListenerService.java']) {
      assert.ok(readFileSync(join(java, file), 'utf8').length > 0);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
