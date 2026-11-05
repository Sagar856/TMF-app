import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseApkUpdate, APK_DOWNLOAD_URL } from '../services/appUpdates';
import type * as UpdateService from '../services/appUpdates';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const metadata = {
  schemaVersion: 1, appId: 'com.trackmoneyflow.app', versionName: '1.0.4',
  versionCode: 100201, apkUrl: APK_DOWNLOAD_URL, sha256: 'a'.repeat(64),
  size: 1024, publishedAt: '2026-11-05T12:00:00.000Z',
};

test('APK metadata validation rejects untrusted URLs, packages, hashes and versions', () => {
  assert.deepEqual(parseApkUpdate(metadata), metadata);
  for (const invalid of [
    null, {}, { ...metadata, appId: 'other.app' }, { ...metadata, apkUrl: 'http://example.com/app.apk' },
    { ...metadata, apkUrl: `${APK_DOWNLOAD_URL}?redirect=other` }, { ...metadata, sha256: 'bad' },
    { ...metadata, versionCode: 0 }, { ...metadata, versionCode: 1.5 }, { ...metadata, versionCode: 2100000001 },
    { ...metadata, size: -1 }, { ...metadata, size: 151 * 1024 * 1024 },
    { ...metadata, publishedAt: 'invalid' }, { ...metadata, schemaVersion: 2 },
  ]) assert.throws(() => parseApkUpdate(invalid), /metadata/);
});

test('APK checks compare build numbers, skip store-managed installs and surface failed requests', async context => {
  const originalFetch = globalThis.fetch;
  let installed = { appId: 'com.trackmoneyflow.app', versionName: '1.0.4', versionCode: 100101, supported: true };
  let fetches = 0;
  const bundle = buildSync({
    entryPoints: [fileURLToPath(new URL('../services/appUpdates.ts', import.meta.url))],
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  });
  const module: { exports: Partial<typeof UpdateService> } = { exports: {} };
  const require = createRequire(import.meta.url);
  runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports, Date, setTimeout, clearTimeout, AbortController,
    fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
    require: (name: string) => name === '@capacitor/core'
      ? { Capacitor: { getPlatform: () => 'android' }, registerPlugin: () => ({ getInfo: async () => installed }) }
      : require(name),
  });
  const { checkForApkUpdate } = module.exports;
  assert.ok(checkForApkUpdate);
  globalThis.fetch = async () => { fetches++; return new Response(JSON.stringify(metadata), { status: 200 }); };
  context.after(() => { globalThis.fetch = originalFetch; });
  assert.equal((await checkForApkUpdate()).update?.versionCode, 100201);
  installed = { ...installed, versionCode: 100201 };
  assert.equal((await checkForApkUpdate()).update, null);
  installed = { ...installed, versionCode: 100301 };
  assert.equal((await checkForApkUpdate()).update, null);
  installed = { ...installed, supported: false };
  const before = fetches;
  assert.equal((await checkForApkUpdate()).update, null);
  assert.equal(fetches, before);
  installed = { ...installed, supported: true };
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });
  await assert.rejects(checkForApkUpdate(), /HTTP 503/);
  globalThis.fetch = async () => new Response(JSON.stringify({ ...metadata, apkUrl: 'https://other.example/app.apk' }));
  await assert.rejects(checkForApkUpdate(), /untrusted metadata/);
});

test('release metadata records the exact APK checksum, size and explicit versionCode', () => {
  const directory = mkdtempSync(join(tmpdir(), 'minarth-update-'));
  try {
    const apk = join(directory, 'test.apk');
    const output = join(directory, 'update.json');
    const bytes = Buffer.from('fixture APK bytes');
    writeFileSync(apk, bytes);
    const script = fileURLToPath(new URL('../../scripts/apk-update-metadata.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script, apk, output], { env: { ...process.env, ANDROID_VERSION_CODE: '100201' }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const update = parseApkUpdate(JSON.parse(readFileSync(output, 'utf8')));
    assert.equal(update.versionCode, 100201);
    assert.equal(update.size, bytes.length);
    assert.equal(update.sha256, createHash('sha256').update(bytes).digest('hex'));
    const invalid = spawnSync(process.execPath, [script, apk, output], { env: { ...process.env, ANDROID_VERSION_CODE: '1e4' }, encoding: 'utf8' });
    assert.notEqual(invalid.status, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
