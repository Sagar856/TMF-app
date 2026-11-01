import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import type { SettingsView as SettingsViewComponent } from './SettingsView';

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
    define: { 'import.meta.env.BASE_URL': '"/"', '__APP_VERSION__': '"test"' },
  });
  const module: { exports: Partial<{ SettingsView: typeof SettingsViewComponent }> } = { exports: {} };
  runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports, require: createRequire(import.meta.url),
    console, localStorage: globalThis.localStorage,
    setTimeout, clearTimeout, setInterval, clearInterval,
  });
  const { SettingsView } = module.exports;
  assert.ok(SettingsView);
  const markup = renderToStaticMarkup(
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
    />
  );
  assert.doesNotMatch(markup, /data-settings-group="categories"/);
  assert.match(markup, /<section aria-label="Categories &amp; Budgets"/);
  assert.match(markup, /aria-label="Categories and budgets sections"/);
  assert.doesNotMatch(markup, /id="categories-budgets-heading"/);
  assert.ok(markup.indexOf('aria-label="Categories &amp; Budgets"') > markup.indexOf('aria-label="Settings sections"'));
  for (const section of ['budgets', 'categories', 'accounts', 'rules']) {
    assert.match(markup, new RegExp(`data-section="${section}"`));
  }
});
