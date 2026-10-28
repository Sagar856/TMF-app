import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  consumePendingStorageReadFailure,
  removeDeletedIds,
  safeGetJson,
  safeGetStringArray,
  safeSetItem,
} from './storage';

test('safeSetItem reports quota failure without throwing and recovers on the next write', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const originalWarn = console.warn;
  const values = new Map<string, string>();
  const warnings: unknown[][] = [];
  let full = true;
  try {
    console.warn = (...args) => { warnings.push(args); };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        setItem(key: string, value: string) {
          if (full) throw new DOMException('Quota exceeded', 'QuotaExceededError');
          values.set(key, value);
        },
        getItem(key: string) { return values.get(key) ?? null; },
      },
    });

    test('malformed stored JSON is preserved for recovery and returns a safe fallback', () => {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      const originalWarn = console.warn;
      const values = new Map<string, string>([['tmf_settings', '{broken']]);
      try {
        console.warn = () => {};
        Object.defineProperty(globalThis, 'localStorage', {
          configurable: true,
          value: {
            getItem(key: string) { return values.get(key) ?? null; },
            setItem(key: string, value: string) { values.set(key, value); },
          },
        });

        assert.deepEqual(safeGetJson('tmf_settings', { theme: 'dark' }), { theme: 'dark' });
        assert.equal(values.get('tmf_settings'), '{broken');
        assert.deepEqual(
          Array.from(values.entries()).filter(([key]) => key.startsWith('tmf_recovery_tmf_settings_')).map(([, value]) => value),
          ['{broken']
        );
        assert.equal(consumePendingStorageReadFailure(), true);
        assert.equal(consumePendingStorageReadFailure(), false);
        assert.deepEqual(safeGetStringArray('tmf_deleted_ids'), []);
      } finally {
        console.warn = originalWarn;
        if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
        else Reflect.deleteProperty(globalThis, 'localStorage');
      }
    });
    assert.equal(safeSetItem('tmf_settings', '{}'), false);
    assert.equal(warnings.length, 1);
    full = false;
    assert.equal(safeSetItem('tmf_settings', '{}'), true);
    assert.equal(values.get('tmf_settings'), '{}');

    values.set('tmf_deleted_tx_ids', JSON.stringify(['confirmed', 'new-offline-deletion']));
    assert.equal(removeDeletedIds('tmf_deleted_tx_ids', ['confirmed']), true);
    assert.deepEqual(JSON.parse(values.get('tmf_deleted_tx_ids')!), ['new-offline-deletion']);
    assert.equal(removeDeletedIds('tmf_deleted_tx_ids', ['new-offline-deletion']), true);
    assert.deepEqual(JSON.parse(values.get('tmf_deleted_tx_ids')!), []);
  } finally {
    console.warn = originalWarn;
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
