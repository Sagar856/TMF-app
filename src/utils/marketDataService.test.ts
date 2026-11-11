import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchMutualFundNav, refreshMutualFundNavs } from '../services/marketDataService';

test('mutual fund refresh uses latest NAVs, retries old publications and preserves cached data on failure', async (t) => {
  const storage = new Map<string, string>();
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  let now = Date.parse('2026-11-11T12:00:00Z');
  t.mock.method(Date, 'now', () => now);
  let calls = 0;
  const fetchMock = t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    assert.equal(String(input), 'https://api.mfapi.in/mf/120503/latest');
    calls += 1;
    return new Response(JSON.stringify({
      meta: { scheme_name: 'Selected scheme' },
      data: [{ date: '10-11-2026', nav: '114.96820' }],
    }));
  });
  let result = await refreshMutualFundNavs(['120503', '120503']);
  assert.equal(calls, 1);
  assert.deepEqual(result['120503'], { nav: 114.9682, date: '2026-11-10', schemeName: 'Selected scheme' });
  await refreshMutualFundNavs(['120503']);
  assert.equal(calls, 1, 'fresh cache avoids duplicate requests');
  now += 61 * 60 * 1000;
  await refreshMutualFundNavs(['120503']);
  assert.equal(calls, 2, 'old publication is retried hourly, not held for twelve hours');
  await refreshMutualFundNavs(['120503'], { force: true });
  assert.equal(calls, 3, 'manual refresh bypasses cache');

  fetchMock.mock.mockImplementation(async () => new Response('', { status: 503 }));
  const unavailable: string[] = [];
  result = await refreshMutualFundNavs(['120503'], { force: true, onUnavailable: (code) => unavailable.push(code) });
  assert.equal(result['120503'].nav, 114.9682);
  assert.deepEqual(unavailable, ['120503']);

  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({
    data: [{ date: '11-11-2026', nav: 'not-a-price' }],
  })));
  assert.equal(await fetchMutualFundNav('120503'), null);
});
