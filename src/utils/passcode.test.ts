import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createPasscodeCredentials, hashPasscode, verifyPasscode } from './passcode';

test('passcodes use SHA-256 of salt plus PIN', async () => {
  const expected = createHash('sha256').update('test-salt2468').digest('hex');
  assert.equal(await hashPasscode('2468', 'test-salt'), expected);
});

test('credentials are salted, contain no plaintext, and verify only the correct PIN', async () => {
  const first = await createPasscodeCredentials('246810');
  const second = await createPasscodeCredentials('246810');
  assert.match(first.passcodeSalt, /^[a-f0-9]{32}$/);
  assert.match(first.passcodeHash, /^[a-f0-9]{64}$/);
  assert.notEqual(first.passcodeSalt, second.passcodeSalt);
  assert.notEqual(first.passcodeHash, second.passcodeHash);
  assert.deepEqual(Object.keys(first).sort(), ['passcodeHash', 'passcodeSalt']);
  assert.equal(await verifyPasscode('246810', first), true);
  assert.equal(await verifyPasscode('246811', first), false);
  assert.equal(await verifyPasscode('246810', {}), false);
});
