import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCloudSettings, portableSettings } from './cloudSettings';

test('portable settings retain preferences but never device credentials or permissions', () => {
  const result = portableSettings({
    userName: 'Test', currencySymbol: '$', currencyCode: 'USD', theme: 'light',
    defaultNetWorthMasked: false, autoCollapseExpandOnScroll: true,
    passcodeHash: 'secret', passcodeSalt: 'secret', passcodeEnabled: true,
    biometricUnlockEnabled: true, locationTracking: true, autoExtractSms: true,
    notificationsEnabled: true, connectedDematAccounts: [{ apiKey: 'secret' }],
  });
  assert.deepEqual(result, {
    userName: 'Test', currencySymbol: '$', currencyCode: 'USD', theme: 'light',
    defaultNetWorthMasked: false, autoCollapseExpandOnScroll: true,
  });
});

test('cloud settings round-trip category rules and preserve an explicitly empty rule list', () => {
  const payload = {
    settings: { theme: 'dark', skipDeleteConfirmation: false },
    smartRules: [{ id: 'rule', keyword: 'cafe', category: 'Food', subcategory: 'Coffee' }],
  };
  assert.deepEqual(parseCloudSettings(JSON.parse(JSON.stringify(payload))), payload);
  assert.deepEqual(parseCloudSettings({ settings: {}, smartRules: [] }).smartRules, []);
  assert.equal(parseCloudSettings({ settings: {}, smartRules: null }).smartRules, null);
});

test('cloud settings reject invalid preferences and malformed rules', () => {
  assert.throws(() => portableSettings({ theme: 'invalid' }), /Invalid theme/);
  assert.throws(() => portableSettings({ defaultNetWorthMasked: 'false' }), /Invalid setting/);
  assert.throws(() => parseCloudSettings({ settings: {}, smartRules: [{}] }), /Invalid category rule/);
});
