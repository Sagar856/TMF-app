import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { playReleaseErrors } from '../../scripts/check-play-release.mjs';

const publicKey = `e30.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.test-signature`;
const env = {
  VITE_SUPABASE_URL: 'https://test.supabase.co',
  VITE_SUPABASE_ANON_KEY: publicKey,
  ANDROID_VERSION_CODE: '42',
  VITE_PUBLIC_APP_URL: 'https://app.example.org/',
};
const privacy = '<p>Contact <a href="mailto:privacy@example.org">Privacy</a>. BigDataCloud and Nominatim. Records retained until deletion; backups expire after the documented provider period.</p>';
const deletion = '<p>Danger zone</p><a href="./?delete-account=1">Delete</a>';

test('Play release check accepts complete inputs and never prints secret values', () => {
  assert.deepEqual(playReleaseErrors(env, privacy, deletion), []);
  assert.deepEqual(playReleaseErrors({ ...env, VITE_SUPABASE_ANON_KEY: 'sb_publishable_test' }, privacy, deletion), []);
  const secret = `e30.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.secret-signature`;
  const errors = playReleaseErrors({ ...env, VITE_SUPABASE_ANON_KEY: secret }, privacy, deletion);
  assert.ok(errors.some(error => error.includes('never service_role')));
  assert.ok(!errors.join().includes(secret));
});

test('Play release check rejects missing configuration, private keys, invalid versions and draft policies', () => {
  for (const key of ['', 'sb_secret_test', 'invalid-key']) {
    assert.ok(playReleaseErrors({ ...env, VITE_SUPABASE_ANON_KEY: key }, privacy, deletion).length > 0);
  }
  for (const code of ['', '0', '-1', '4e2', '42.0', '2100000001']) {
    assert.ok(playReleaseErrors({ ...env, ANDROID_VERSION_CODE: code }, privacy, deletion).some(error => error.includes('VERSION_CODE')));
  }
  for (const url of ['', 'http://app.example.org/', 'https://localhost/', 'https://app.example.org/?secret=test']) {
    assert.ok(playReleaseErrors({ ...env, VITE_PUBLIC_APP_URL: url }, privacy, deletion).some(error => error.includes('PUBLIC_APP_URL')));
  }
  assert.ok(playReleaseErrors(env, privacy + '[Actual retention]', deletion).some(error => error.includes('privacy policy')));
  assert.ok(playReleaseErrors(env, privacy, '<p>Old instructions</p>').some(error => error.includes('account-deletion')));
});

test('published policy metadata and release workflow retain their required safeguards', () => {
  const policy = readFileSync(new URL('../../public/privacy.html', import.meta.url), 'utf8');
  assert.match(policy, /Sagar Nanasaheb Bodkhe, India/);
  assert.match(policy, /mailto:minarth.co@gmail.com/);
  assert.match(policy, /BigDataCloud/);
  assert.match(policy, /Nominatim/);
  const page = readFileSync(new URL('../../public/delete-account.html', import.meta.url), 'utf8');
  const errors = playReleaseErrors(env, policy, page);
  if (/\[[^\]]+\]/.test(policy)) assert.ok(errors.some(error => error.includes('retention')));
  else assert.deepEqual(errors, []);
  const workflow = readFileSync(new URL('../../.github/workflows/build-play-bundle.yml', import.meta.url), 'utf8');
  assert.ok(workflow.indexOf('npm run play:check') < workflow.indexOf('Decode upload key'));
  assert.match(workflow, /lintRelease bundleRelease/);
});
