import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import type { SettingsView as SettingsViewComponent } from './SettingsView';
import { SETTINGS_SEARCH_ENTRIES } from '../utils/settingsSearch';

test('categories and budgets remain a separate menu below preferences', (context) => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const originalVersion = Object.getOwnPropertyDescriptor(globalThis, '__APP_VERSION__');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  Object.defineProperty(globalThis, '__APP_VERSION__', { configurable: true, value: 'test' });
  context.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
    if (originalVersion) Object.defineProperty(globalThis, '__APP_VERSION__', originalVersion);
    else Reflect.deleteProperty(globalThis, '__APP_VERSION__');
  });
  const bundle = buildSync({
    entryPoints: [fileURLToPath(new URL('./SettingsView.tsx', import.meta.url))],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    write: false,
    define: { 'import.meta.env': '{"BASE_URL":"/"}', '__APP_VERSION__': '"test"' },
  });
  const module: { exports: Partial<{ SettingsView: typeof SettingsViewComponent }> } = { exports: {} };
  let platform = 'web';
  const require = createRequire(import.meta.url);
  runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports, require: (name: string) => name === '@capacitor/core' ? {
      ...require(name), Capacitor: { getPlatform: () => platform, isNativePlatform: () => platform !== 'web' },
    } : require(name),
    console, localStorage: globalThis.localStorage,
    setTimeout, clearTimeout, setInterval, clearInterval,
  });
  const { SettingsView } = module.exports;
  assert.ok(SettingsView);
  const view = (
    <SettingsView
      settings={{
        userName: 'Test', userEmail: '', currencySymbol: '$', currencyCode: 'USD',
        passcodeEnabled: false, locationTracking: false, autoExtractSms: false,
        notificationsEnabled: false,
      }}
      categories={[]}
      onUpdateSettings={() => {}}
      onAddCategory={() => {}}
      onUpdateCategory={() => {}}
      onDeleteCategory={() => {}}
      onExportBackupJSON={() => {}}
      onRestoreBackupJSON={() => {}}
      onResetAllData={() => {}}
      lastSettingsSyncAt={1700000000000}
      syncStatus={{ collection: 'settings', success: false, error: 'Offline', timestamp: 1800000000000 }}
      onDeleteUserAccount={() => {}}
      onSignOut={() => {}}
      authUserEmail="test@example.com"
      isAuthenticated
    />
  );
  const markup = renderToStaticMarkup(view);
  assert.doesNotMatch(markup, /id="settings-source"|Open source/);
  assert.ok(!SETTINGS_SEARCH_ENTRIES.some(entry => entry.targetId === 'settings-source'));
  assert.doesNotMatch(markup, /data-settings-group="categories"/);
  assert.match(markup, /<section aria-label="Categories &amp; Budgets"/);
  assert.match(markup, /aria-label="Categories and budgets sections"/);
  assert.doesNotMatch(markup, /id="categories-budgets-heading"/);
  assert.match(markup, /Last successful settings sync/);
  assert.ok(markup.includes(new Date(1700000000000).toLocaleString()));
  assert.ok(!markup.includes(new Date(1800000000000).toLocaleString()));
  assert.match(markup, /Delete account/);
  assert.match(markup, /data-settings-group="profile"[\s\S]*?Profile settings/);
  assert.match(markup, /data-settings-group="account"[\s\S]*?Account setting/);
  assert.match(markup, /data-section="accounts"[\s\S]*?Manage accounts/);
  assert.doesNotMatch(markup, /Edit profile|Profile &amp; Account|profile-settings-panel/);
  assert.match(markup, /id="settings-profile"[\s\S]*?profile-display-name[\s\S]*?profile-contact-email/);
  assert.match(markup, /<input id="profile-contact-email"[^>]*readOnly=""[^>]*value="test@example.com"/i);
  assert.match(markup, /id="settings-password"[\s\S]*?Change password/);
  assert.match(markup, /App passcode protection/);
  assert.match(markup, /aria-label="App UI color"/);
  const colorRow = markup.match(/<button id="settings-color-palette"[\s\S]*?<\/button>/)?.[0];
  assert.ok(colorRow, 'The complete App UI color row must be a button');
  assert.equal((colorRow.match(/<button/g) || []).length, 1, 'No nested interactive control');
  assert.match(colorRow, /items-center justify-between[\s\S]*?App UI color[\s\S]*?Deep Purple/);
  assert.match(markup, /Account preferences sync automatically after changes/);
  assert.doesNotMatch(markup, /role="radiogroup" aria-label="UI color palette"/);
  assert.match(markup, /<select id="settings-currency-select"[^>]*>[\s\S]*?<option value="USD" selected=""/);
  assert.match(markup, /<select id="settings-region-select"/);
  assert.match(markup, /India · English/);
  assert.match(markup, /Germany · German/);
  assert.doesNotMatch(markup, /role="radiogroup" aria-label="Preferred currency"/);
  const imported = renderToStaticMarkup(React.cloneElement(view, { settings: {
    ...view.props.settings, colorPalette: 'blue', currencyCode: 'CAD', currencySymbol: '$', locale: 'it-IT',
  } }));
  assert.match(imported, /Celestial Blue/);
  assert.match(imported, /<option value="CAD" selected="">/);
  assert.match(imported, /<option value="it-IT" selected="">/);
  const dangerIndex = markup.indexOf('id="settings-danger"');
  assert.ok(dangerIndex > markup.indexOf('id="settings-data"'));
  assert.ok(dangerIndex < markup.indexOf('id="settings-help"'));
  assert.match(markup.slice(dangerIndex), /Reset all data[\s\S]*Delete account/);
  assert.equal((markup.match(/>Delete account<\/button>/g) || []).length, 1);
  assert.equal((markup.match(/>Sign out<\/button>/g) || []).length, 2);
  assert.ok(markup.lastIndexOf('>Sign out</button>') > markup.indexOf('aria-label="Categories &amp; Budgets"'));
  assert.doesNotMatch(markup, /id="settings-brokers"/);
  for (const entry of SETTINGS_SEARCH_ENTRIES.filter(entry => entry.group && !entry.requiresPasscode)) {
    const target = entry.id === 'biometrics' || entry.id === 'auto-lock' ? 'sw-passcode' : entry.targetId;
    assert.ok(markup.includes(`id="${target}"`), `Missing search target for ${entry.id}: ${target}`);
  }
  const secured = renderToStaticMarkup(React.cloneElement(view, { settings: { ...view.props.settings, passcodeEnabled: true } }));
  for (const entry of SETTINGS_SEARCH_ENTRIES.filter(entry => entry.group)) {
    assert.ok(secured.includes(`id="${entry.targetId}"`), `Missing secured search target for ${entry.id}`);
  }
  assert.match(markup, /Real-time tracking/);
  assert.match(markup, /Download APK/);
  platform = 'android';
  const nativeMarkup = renderToStaticMarkup(view);
  assert.doesNotMatch(nativeMarkup, /href="[^"]*\.apk"|Download test APK/);
  assert.match(nativeMarkup, /Google Play installations use store-managed updates/);
  assert.match(nativeMarkup, /Check for updates/);
  assert.match(nativeMarkup, /BigDataCloud or OpenStreetMap Nominatim/);
  platform = 'web';
  assert.ok(markup.indexOf('aria-label="Categories &amp; Budgets"') > markup.indexOf('aria-label="Settings sections"'));
  for (const section of ['budgets', 'categories', 'accounts', 'rules']) {
    assert.match(markup, new RegExp(`data-section="${section}"`));
  }
});
