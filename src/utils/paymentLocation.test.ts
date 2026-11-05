import test from 'node:test';
import assert from 'node:assert/strict';
import { canLocatePaymentNow, isReadableLocation, resolvePaymentLocation } from '../services/paymentLocation';
import type { InterceptedPayment } from '../services/notificationListener';

test('current payment location policy has an exact two-minute boundary', () => {
  const now = 1_800_000_000_000;
  assert.equal(canLocatePaymentNow(now - 120_000, now), true);
  assert.equal(canLocatePaymentNow(now - 120_001, now), false);
  assert.equal(canLocatePaymentNow(now + 120_000, now), true);
  assert.equal(canLocatePaymentNow(now + 120_001, now), false);
  for (const value of [NaN, Infinity, -Infinity]) assert.equal(canLocatePaymentNow(value, now), false);
  for (const value of [undefined, '', '12.3456, 76.5432', '-1.23, -45.67', 'Location name unavailable']) {
    assert.equal(isReadableLocation(value), false);
  }
  assert.equal(isReadableLocation('Bandra West, Mumbai'), true);
});

test('SMS location resolves captured coordinates, respects consent and never tags historical payments with current position', async t => {
  const descriptors = ['window', 'navigator', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  let visible = true;
  let granted = true;
  let permissionChecks = 0;
  let gpsRequests = 0;
  let lookupAvailable = true;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    get visibilityState() { return visible ? 'visible' : 'hidden'; },
  } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    permissions: { query: async () => { permissionChecks++; return { state: granted ? 'granted' : 'denied' }; } },
    geolocation: {
      getCurrentPosition: (success: (position: { coords: { latitude: number; longitude: number } }) => void) => {
        gpsRequests++;
        success({ coords: { latitude: 19.11, longitude: 72.91 } });
      },
    },
  } });
  t.mock.method(globalThis, 'fetch', async () => new Response(
    lookupAvailable ? JSON.stringify({ locality: 'Bandra West', city: 'Mumbai' }) : '{}',
    { status: lookupAvailable ? 200 : 503 },
  ));
  const payment: InterceptedPayment = {
    id: 'test', packageName: 'sms', title: 'Axis Bank', text: 'INR 500 debited',
    postedAt: Date.now() - 86400000, action: 'review',
  };
  try {
    assert.equal(await resolvePaymentLocation(payment, true), undefined);
    assert.equal(permissionChecks, 0);
    const captured = { lat: 19.06, lng: 72.83, name: '19.0600, 72.8300' };
    assert.deepEqual(await resolvePaymentLocation({ ...payment, location: captured }, true), {
      ...captured, name: 'Bandra West, Mumbai',
    });
    assert.equal(gpsRequests, 0);
    const named = { ...captured, name: 'Bandra West, Mumbai' };
    assert.deepEqual(await resolvePaymentLocation(payment, false, named), named);
    assert.equal(await resolvePaymentLocation({ ...payment, location: named }, false), undefined);
    lookupAvailable = false;
    const unresolved = { lat: 19.07, lng: 72.84, name: '19.0700, 72.8400' };
    assert.deepEqual(await resolvePaymentLocation({ ...payment, location: unresolved }, true), {
      ...unresolved, name: 'Location name unavailable',
    });
    lookupAvailable = true;
    assert.equal((await resolvePaymentLocation({ ...payment, location: {
      ...unresolved, name: 'Location name unavailable',
    } }, true))?.name, 'Bandra West, Mumbai', 'Unavailable labels must be retried on replay');
    await assert.rejects(resolvePaymentLocation({ ...payment, location: { lat: 91, lng: 72 } }, true), /Invalid captured/);
    const recent = { ...payment, postedAt: Date.now() };
    visible = false;
    assert.equal(await resolvePaymentLocation(recent, true), undefined);
    assert.equal(permissionChecks, 0);
    visible = true;
    granted = false;
    assert.equal(await resolvePaymentLocation(recent, true), undefined);
    assert.equal(gpsRequests, 0, 'SMS processing must not trigger permission prompts');
    granted = true;
    assert.deepEqual(await resolvePaymentLocation(recent, true), {
      lat: 19.11, lng: 72.91, name: 'Bandra West, Mumbai',
    });
    assert.equal(gpsRequests, 1);
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
