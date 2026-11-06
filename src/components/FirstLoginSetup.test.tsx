import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import type { UserSettings } from '../types/finance';
import type { FirstLoginSetup } from './FirstLoginSetup';

function findElement(node: React.ReactNode, predicate: (element: React.ReactElement) => boolean): React.ReactElement | undefined {
  let found: React.ReactElement | undefined;
  React.Children.forEach(node, child => {
    if (found || !React.isValidElement(child)) return;
    if (predicate(child)) found = child;
    else {
      const children = child.props.children;
      if (children) found = findElement(children, predicate);
    }
  });
  return found;
}

async function harness(completed = false) {
  let index = 0;
  const slots: unknown[] = [];
  const storage = new Map<string, string>(completed ? [['tmf_walkthrough_v1_test', 'complete']] : []);
  const calls: string[] = [];
  let granted = true;
  let writeOk = true;
  const mock = {
    requestPushNotificationPermission: async () => { calls.push('notifications'); return granted; },
    requestDeviceLocationPermission: async () => { calls.push('location'); return granted; },
    enrollBiometric: async () => { calls.push('biometrics'); return granted; },
    safeGetItem: (key: string) => storage.get(key) ?? null,
    safeSetItem: (key: string, value: string) => { if (!writeOk) return false; storage.set(key, value); return true; },
  };
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('./FirstLoginSetup.tsx', import.meta.url))],
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    plugins: [{
      name: 'setup-mocks',
      setup(build) {
        build.onLoad({ filter: /[\\/]hooks[\\/]useDialog\.ts$/ }, () => ({ contents: 'export const useDialog = () => ({ current: null });' }));
        build.onLoad({ filter: /[\\/]services[\\/](biometric|localNotifications|locationService)\.ts$/ }, () => ({
          contents: 'export const { enrollBiometric, requestPushNotificationPermission, requestDeviceLocationPermission } = globalThis.mock;',
        }));
        build.onLoad({ filter: /[\\/]utils[\\/]storage\.ts$/ }, () => ({ contents: 'export const { safeGetItem, safeSetItem } = globalThis.mock;' }));
      },
    }],
  });
  const require = createRequire(import.meta.url);
  const module: { exports: { FirstLoginSetup?: typeof FirstLoginSetup } } = { exports: {} };
  runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports, mock, console,
    require: (name: string) => name === 'react' ? {
      ...React,
      useState: (initial: unknown) => {
        const slot = index++;
        if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
        return [slots[slot], (value: unknown) => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
      },
      useRef: (initial: unknown) => {
        const slot = index++;
        if (!(slot in slots)) slots[slot] = { current: initial };
        return slots[slot];
      },
    } : require(name),
  });
  const Component = module.exports.FirstLoginSetup!;
  let settings: UserSettings = {
    userName: 'Test', userEmail: '', currencySymbol: '$', currencyCode: 'USD',
    passcodeEnabled: false, notificationsEnabled: false, autoExtractSms: false, locationTracking: false,
  };
  return {
    calls, storage,
    get settings() { return settings; },
    setGranted(value: boolean) { granted = value; },
    failWrites() { writeOk = false; },
    render() {
      index = 0;
      return Component({ userId: 'test', settings, onNavigate: () => {}, onUpdate: patch => { settings = { ...settings, ...patch }; } }) as React.ReactElement<{
        permission?: string; onCancel: () => void; onAllow: () => Promise<void>; error?: string;
        onSave: (credentials: { passcodeHash: string; passcodeSalt: string }) => void;
      }>;
    },
  };
}

test('first login offers all permissions in order and never requests them without consent', async () => {
  const h = await harness();
  for (const permission of ['notifications', 'location', 'biometrics']) {
    const element = h.render();
    assert.equal(element.props.permission, permission);
    element.props.onCancel();
  }
  const theme = h.render();
  assert.equal(theme.type, 'div');
  assert.deepEqual(h.calls, []);
  assert.equal(h.settings.notificationsEnabled, false);
  assert.equal(h.settings.locationTracking, false);
});

test('returning users are not reprompted', async () => {
  const h = await harness(true);
  assert.equal(h.render().props.permission, undefined);
  assert.deepEqual(h.calls, []);
});

test('biometric setup requires a fallback PIN before device enrollment', async () => {
  const h = await harness();
  h.render().props.onCancel();
  h.render().props.onCancel();
  h.render().props.onAllow();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.calls, []);
  h.render().props.onSave({ passcodeHash: 'hash', passcodeSalt: 'salt' });
  assert.equal(h.settings.passcodeEnabled, true);
  h.render().props.onAllow();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.calls, ['biometrics']);
  assert.equal(h.settings.biometricUnlockEnabled, true);
});

test('denied permissions remain optional and show an explicit retry message', async () => {
  const h = await harness();
  h.setGranted(false);
  h.render().props.onAllow();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(h.render().props.error!, /Permission was not granted/);
  assert.equal(h.settings.notificationsEnabled, false);
  h.setGranted(true);
  h.render().props.onAllow();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.settings.notificationsEnabled, true);
  assert.equal(h.render().props.permission, 'location');
});

test('theme selection persists system preference and completion continues into walkthrough', async () => {
  const h = await harness();
  for (let i = 0; i < 3; i++) h.render().props.onCancel();
  const theme = h.render();
  const radio = findElement(theme, element => element.type === 'input' && element.props.value === 'system');
  radio.props.onChange();
  assert.equal(h.settings.theme, 'system');
  findElement(h.render(), element => element.type === 'button').props.onClick();
  assert.equal(h.storage.get('tmf_first_login_setup_v1_test'), 'complete');
  assert.equal(h.render().type.name, 'AppWalkthrough');
});

test('completion storage failures stay visible and setup can be retried', async () => {
  const h = await harness();
  for (let i = 0; i < 3; i++) h.render().props.onCancel();
  h.failWrites();
  findElement(h.render(), element => element.type === 'button').props.onClick();
  const alert = findElement(h.render(), element => element.props.role === 'alert');
  assert.match(alert.props.children, /Could not save/);
  assert.equal(h.storage.get('tmf_first_login_setup_v1_test'), undefined);
});
