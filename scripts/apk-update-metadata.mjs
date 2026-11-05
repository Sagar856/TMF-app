import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [apkPath, outputPath] = process.argv.slice(2);
if (!apkPath || !outputPath) throw new Error('Usage: node scripts/apk-update-metadata.mjs <apk> <update.json>');
const versionCode = Number(process.env.ANDROID_VERSION_CODE);
if (!/^[1-9]\d*$/.test(process.env.ANDROID_VERSION_CODE || '') || !Number.isSafeInteger(versionCode) || versionCode > 2100000000) {
  throw new Error('A valid ANDROID_VERSION_CODE is required.');
}
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const size = statSync(apkPath).size;
if (size < 1 || size > 150 * 1024 * 1024) throw new Error('APK size is outside the supported update limit.');
const metadata = {
  schemaVersion: 1,
  appId: 'com.trackmoneyflow.app',
  versionName: version,
  versionCode,
  apkUrl: 'https://sagar856.github.io/TMF-app/downloads/TMF-app.apk',
  sha256: createHash('sha256').update(readFileSync(apkPath)).digest('hex'),
  size,
  publishedAt: new Date().toISOString(),
};
writeFileSync(resolve(outputPath), `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`Published update metadata for ${version} (${versionCode}).`);
