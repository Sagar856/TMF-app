import assert from 'node:assert/strict';
import test from 'node:test';
import { isThemePreference, resolveTheme } from './theme';
import { parseCloudSettings } from './cloudSettings';

test('system theme follows the device while explicit choices remain fixed', () => {
  for (const dark of [false, true]) {
    assert.equal(resolveTheme('system', dark), dark ? 'dark' : 'light');
    assert.equal(resolveTheme('dark', dark), 'dark');
    assert.equal(resolveTheme('light', dark), 'light');
    assert.equal(resolveTheme(undefined, dark), 'dark');
  }
  for (const value of ['system', 'light', 'dark']) assert.ok(isThemePreference(value));
  for (const value of [null, '', 'auto', 1]) assert.equal(isThemePreference(value), false);
  assert.equal(parseCloudSettings({ settings: { theme: 'system' }, smartRules: null }).settings.theme, 'system');
});
