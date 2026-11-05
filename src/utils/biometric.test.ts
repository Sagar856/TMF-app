import test from 'node:test';
import assert from 'node:assert/strict';
import { Capacitor } from '@capacitor/core';
import { NativeBiometricWeb } from '@capgo/capacitor-native-biometric/dist/esm/web.js';
import { clearBiometricEnrollment, enrollBiometric, isBiometricAvailable, isBiometricEnrolled, verifyBiometric } from '../services/biometric';

test('Android biometrics do not depend on WebAuthn or a secure browser context', async t => {
  const descriptors = ['window', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const storage = new Map<string, string>();
  let cancel = false;
  let prompts = 0;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: false } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  const platform = t.mock.method(Capacitor, 'getPlatform', () => 'android');
  const availability = t.mock.method(NativeBiometricWeb.prototype, 'isAvailable', async () => ({
    isAvailable: true, biometryType: 1,
  }));
  t.mock.method(NativeBiometricWeb.prototype, 'verifyIdentity', async () => {
    prompts++;
    if (cancel) throw new Error('User cancelled biometric prompt');
  });
  try {
    assert.equal(await isBiometricAvailable(), true);
    assert.equal(await verifyBiometric(), false, 'Unenrolled devices must not unlock');
    cancel = true;
    assert.equal(await enrollBiometric('Test user'), false);
    assert.equal(isBiometricEnrolled(), false);
    cancel = false;
    assert.equal(await enrollBiometric('Test user'), true);
    assert.equal(isBiometricEnrolled(), true);
    assert.equal(await verifyBiometric(), true);
    cancel = true;
    assert.equal(await verifyBiometric(), false, 'Cancellation keeps the app locked with PIN fallback');
    assert.equal(prompts, 4);
    platform.mock.mockImplementation(() => 'web');
    assert.equal(isBiometricEnrolled(), false, 'Native enrollment must not act as a WebAuthn credential');
    assert.equal(await isBiometricAvailable(), false);
    platform.mock.mockImplementation(() => 'android');
    availability.mock.mockImplementation(async () => ({ isAvailable: false, biometryType: 0 }));
    assert.equal(await verifyBiometric(), false);
    clearBiometricEnrollment();
    assert.equal(isBiometricEnrolled(), false);
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
