import test from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentDeviceLocation, requestDeviceLocationPermission } from '../services/locationService';

test('browser permission is requested and location retries work after a previous denial', async t => {
  const descriptors = ['window', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  let allowed = false;
  let requests = 0;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { geolocation: {
    getCurrentPosition: (success: (position: { coords: { latitude: number; longitude: number } }) => void, failure: (error: { code: number; PERMISSION_DENIED: number }) => void) => {
      requests++;
      if (allowed) success({ coords: { latitude: 12.3456, longitude: 76.5432 } });
      else failure({ code: 1, PERMISSION_DENIED: 1 });
    },
  } } });
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    locality: 'Test locality', city: 'Test city',
  }), { status: 200 }));
  try {
    assert.equal(await requestDeviceLocationPermission(), false);
    allowed = true;
    assert.equal(await requestDeviceLocationPermission(), true);
    const location = await getCurrentDeviceLocation();
    assert.deepEqual(location, { lat: 12.3456, lng: 76.5432, formattedLocation: 'Test locality, Test city' });
    assert.equal(requests, 3);
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('detected coordinates are retained when reverse geocoding is unavailable', async t => {
  const descriptors = ['window', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { geolocation: {
    getCurrentPosition: (success: (position: { coords: { latitude: number; longitude: number } }) => void) =>
      success({ coords: { latitude: 11.2345, longitude: 77.6543 } }),
  } } });
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 503 }));
  try {
    assert.deepEqual(await getCurrentDeviceLocation(), {
      lat: 11.2345, lng: 77.6543, formattedLocation: '11.2345, 77.6543',
    });
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
