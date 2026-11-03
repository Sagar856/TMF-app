import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchSettings, SETTINGS_SEARCH_ENTRIES } from './settingsSearch';

const available = { isAuthenticated: true, canDeleteAccount: true, canSignOut: true, passcodeEnabled: true };
const ids = (query: string) => searchSettings(query, available).map(entry => entry.id);

test('settings search normalizes case, punctuation, accents and word order', () => {
  assert.equal(ids('  PREFERRED   CÚRRENCY ')[0], 'currency');
  assert.equal(ids('name display')[0], 'name');
  assert.equal(ids('auto-lock')[0], 'auto-lock');
  assert.equal(ids('how to change my password settings')[0], 'password');
  assert.equal(ids('notification settings')[0], 'notification-access');
});

test('settings search matches synonyms and requires every meaningful word', () => {
  for (const [query, expected] of [
    ['avatar', 'photo'], ['logout', 'sign-out'], ['import json', 'restore'],
    ['dark mode', 'theme'], ['bank account', 'accounts'], ['fingerprint', 'biometrics'],
    ['smart rules', 'rules'], ['portfolio', 'brokers'], ['emailid', 'email'],
  ]) assert.equal(ids(query)[0], expected, query);
  assert.deepEqual(ids('password currency'), []);
  assert.deepEqual(ids('bank unicorn'), []);
});

test('settings search tolerates a single typo or transposition but rejects unrelated terms', () => {
  for (const query of ['passwrod', 'pasword', 'passwoord', 'passwore']) assert.equal(ids(query)[0], 'password', query);
  assert.equal(ids('curency')[0], 'currency');
  assert.equal(ids('biometrcs')[0], 'biometrics');
  assert.deepEqual(ids('xyzzy'), []);
  assert.deepEqual(ids('zz'), []);
  assert.deepEqual(ids('pw'), []);
});

test('settings search ranks exact titles first, is deterministic and does not duplicate entries', () => {
  assert.equal(ids('budget threshold alerts')[0], 'budget-alerts');
  assert.equal(ids('account email')[0], 'email');
  assert.equal(ids('delete account')[0], 'delete-account');
  assert.deepEqual(ids('backup'), ids('backup'));
  assert.equal(new Set(ids('backup')).size, ids('backup').length);
});

test('settings search excludes unavailable account actions but explains passcode dependencies', () => {
  const local = searchSettings('account');
  assert.ok(!local.some(entry => entry.id === 'delete-account' || entry.id === 'sign-out'));
  assert.deepEqual(searchSettings('change password'), []);
  assert.deepEqual(searchSettings('logout', { isAuthenticated: true }), []);
  assert.deepEqual(searchSettings('delete account', { isAuthenticated: true }), []);
  assert.ok(!searchSettings('pin').some(entry => entry.id === 'change-pin'));
  assert.match(searchSettings('biometrics')[0].description, /Requires app passcode/);
  assert.ok(ids('change pin').includes('change-pin'));
});

test('settings search handles blank and punctuation-only input without returning the whole catalog', () => {
  for (const query of ['', '   ', '?!', 'how to', 'settings']) assert.deepEqual(ids(query), []);
});

test('every indexed setting has a unique ID, a reachable destination and is found by its own title', () => {
  assert.equal(new Set(SETTINGS_SEARCH_ENTRIES.map(entry => entry.id)).size, SETTINGS_SEARCH_ENTRIES.length);
  for (const entry of SETTINGS_SEARCH_ENTRIES) {
    assert.ok(Boolean(entry.group) !== Boolean(entry.section), entry.id);
    assert.ok(entry.targetId, entry.id);
    assert.ok(ids(entry.title).includes(entry.id), entry.title);
  }
});
