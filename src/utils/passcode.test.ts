import assert from 'node:assert/strict';
import { createHash, pbkdf2Sync } from 'node:crypto';
import { test } from 'node:test';
import {
  constantTimeEqual,
  createPasscodeCredentials,
  derivePasscodeHash,
  getWeakPinReason,
  hashPasscode,
  isLegacyPasscodeHash,
  PBKDF2_ITERATIONS,
  verifyPasscode,
} from './passcode';

test('legacy hashes are SHA-256 of salt plus PIN and still verify', async () => {
  const expected = createHash('sha256').update('test-salt2468').digest('hex');
  assert.equal(await hashPasscode('2468', 'test-salt'), expected);
  assert.equal(await verifyPasscode('2468', { passcodeHash: expected, passcodeSalt: 'test-salt' }), true);
  assert.equal(await verifyPasscode('2469', { passcodeHash: expected, passcodeSalt: 'test-salt' }), false);
  assert.equal(isLegacyPasscodeHash(expected), true);
});

test('new credentials use PBKDF2-SHA256 with a per-user salt and self-describing iterations', async () => {
  const creds = await createPasscodeCredentials('246810');
  assert.match(creds.passcodeSalt, /^[a-f0-9]{32}$/);
  assert.match(creds.passcodeHash, new RegExp(`^pbkdf2\\$${PBKDF2_ITERATIONS}\\$[a-f0-9]{64}$`));
  assert.equal(isLegacyPasscodeHash(creds.passcodeHash), false);

  const expected = pbkdf2Sync('246810', creds.passcodeSalt, PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
  assert.equal(creds.passcodeHash.split('$')[2], expected);

  assert.equal(await verifyPasscode('246810', creds), true);
  assert.equal(await verifyPasscode('246811', creds), false);
  assert.equal(await verifyPasscode('246810', {}), false);
});

test('two users choosing the same PIN get different salts and hashes', async () => {
  const first = await createPasscodeCredentials('7391');
  const second = await createPasscodeCredentials('7391');
  assert.notEqual(first.passcodeSalt, second.passcodeSalt);
  assert.notEqual(first.passcodeHash, second.passcodeHash);
});

test('iteration count is read from the stored hash', async () => {
  const salt = 'abc';
  const hash = await derivePasscodeHash('1357', salt, 1000);
  assert.ok(hash.startsWith('pbkdf2$1000$'));
  assert.equal(await verifyPasscode('1357', { passcodeHash: hash, passcodeSalt: salt }), true);
});

test('constantTimeEqual compares full strings', () => {
  assert.equal(constantTimeEqual('abc', 'abc'), true);
  assert.equal(constantTimeEqual('abc', 'abd'), false);
  assert.equal(constantTimeEqual('abc', 'abcd'), false);
});

test('weak PIN detection rejects repeats, sequences and common PINs', () => {
  assert.equal(getWeakPinReason('1234'), 'That PIN is too common.');
  assert.equal(getWeakPinReason('7777'), 'Avoid repeating the same digit.');
  assert.equal(getWeakPinReason('3456'), 'Avoid sequential digits like 2345 or 9876.');
  assert.equal(getWeakPinReason('8765'), 'Avoid sequential digits like 2345 or 9876.');
  assert.equal(getWeakPinReason('12'), 'PIN must be 4 to 6 digits.');
  assert.equal(getWeakPinReason('7391'), null);
  assert.equal(getWeakPinReason('480215'), null);
});
