import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { parseCloudSettings, portableSettings, type CloudSettings } from '../utils/cloudSettings';
import type { SyncResult } from '../services/supabaseClient';

const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// Execute the production effect and manual handler with deterministic timers and uploads.
const start = source.indexOf('  useEffect(() => {\n    if (!cloudReady || !cloudHydrated || !authUser) return;');
const endMarker = '}, [settings, cloudReady, cloudHydrated, authUser?.id, preferencesRevision]);';
assert.ok(start >= 0 && source.indexOf(endMarker, start) > start);
const effect = transformSync(source.slice(start, source.indexOf(endMarker, start) + endMarker.length), { loader: 'tsx' }).code;
const manualStart = source.indexOf('  const handleForceSyncNow = async');
const manualEnd = source.indexOf('  // When connectivity returns', manualStart);
assert.ok(manualStart >= 0 && manualEnd > manualStart);
const manual = transformSync(source.slice(manualStart, manualEnd) + '\nhandleForceSyncNow();', { loader: 'tsx' }).code;

function harness(upload: (payload: CloudSettings) => Promise<SyncResult> = async () => ({ success: true })) {
  let cleanup: (() => void) | undefined;
  let now = 0;
  let nextTimer = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const storage = new Map<string, string>();
  const requests: CloudSettings[] = [];
  const results: SyncResult[] = [];
  const synced: string[] = [];
  const state = {
    settings: { theme: 'dark' },
    cloudReady: true, cloudHydrated: true, authUser: { id: 'account-a' },
    preferencesRevision: 0,
    cloudGenerationRef: { current: 1 },
    lastPushedRef: { current: { preferences: '' } },
    preferencesSyncInFlight: { current: null as Promise<SyncResult> | null },
    navigator: { onLine: true },
    parseCloudSettings, portableSettings,
    safeGetJson: () => null,
    safeGetItem: (key: string) => storage.get(key) ?? null,
    safeSetItem: (key: string, value: string) => { storage.set(key, value); return true; },
    recordSettingsSync: (id: string) => synced.push(id),
    reportSyncResult: (_collection: string, result: SyncResult) => results.push(result),
    setPreferencesRevision: (update: (value: number) => number) => { state.preferencesRevision = update(state.preferencesRevision); },
    syncSettingsToSupabase: (payload: CloudSettings) => { requests.push(payload); return upload(payload); },
    categories: [], accounts: [], transactions: [], investments: [], loans: [],
    syncCategoriesToSupabase: async () => ({ success: true }),
    syncAccountsToSupabase: async () => ({ success: true }),
    syncTransactionsToSupabase: async () => ({ success: true }),
    syncInvestmentsToSupabase: async () => ({ success: true }),
    syncLoansToSupabase: async () => ({ success: true }),
    setSyncStatus: () => {},
    console,
    setTimeout: (run: () => void, delay: number) => {
      const id = ++nextTimer;
      timers.set(id, { at: now + delay, run });
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
    useEffect: (run: () => (() => void) | undefined) => { cleanup = run(); },
  };
  return {
    state, storage, requests, results, synced,
    render: () => { cleanup?.(); runInNewContext(effect, state); },
    manual: (): Promise<SyncResult> => runInNewContext(manual, state),
    async advance(ms: number) {
      const target = now + ms;
      while (true) {
        const entry = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        now = entry[1].at;
        timers.delete(entry[0]);
        entry[1].run();
        for (let i = 0; i < 8; i++) await Promise.resolve();
      }
      now = target;
      for (let i = 0; i < 8; i++) await Promise.resolve();
    },
  };
}

test('automatic settings sync coalesces rapid edits and saves without manual Sync', async () => {
  const h = harness();
  h.render();
  await h.advance(300);
  h.state.settings = { theme: 'light' };
  h.render();
  await h.advance(599);
  assert.equal(h.requests.length, 0);
  await h.advance(1);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].settings.theme, 'light');
  assert.equal(h.storage.get('tmf_settings_pending_account-a'), '');
  assert.deepEqual(h.synced, ['account-a']);
});

test('failed settings uploads retain the pending snapshot and retry automatically', async () => {
  let attempts = 0;
  const h = harness(async () => ++attempts < 4 ? { success: false, error: 'Temporary server failure' } : { success: true });
  h.render();
  await h.advance(600);
  assert.ok(h.storage.get('tmf_settings_pending_account-a'));
  assert.equal(h.synced.length, 0);
  await h.advance(5000);
  await h.advance(10000);
  await h.advance(15000);
  assert.equal(h.requests.length, 4);
  assert.equal(h.storage.get('tmf_settings_pending_account-a'), '');
  assert.equal(h.results.filter(result => !result.success).length, 3);
});

test('newer edits during an upload are never cleared or skipped', async () => {
  let finish!: (result: SyncResult) => void;
  const h = harness(() => h.requests.length === 1
    ? new Promise(resolve => { finish = resolve; })
    : Promise.resolve({ success: true }));
  h.render();
  await h.advance(600);
  h.state.settings = { theme: 'light' };
  h.render();
  await h.advance(600);
  assert.equal(h.requests.length, 1);
  finish({ success: true });
  await h.advance(0);
  assert.match(h.storage.get('tmf_settings_pending_account-a')!, /light/);
  await h.advance(600);
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].settings.theme, 'light');
  assert.equal(h.storage.get('tmf_settings_pending_account-a'), '');
});

test('offline edits remain pending and sync after reconnect or resume', async () => {
  const h = harness();
  h.state.navigator.onLine = false;
  h.render();
  await h.advance(600);
  assert.equal(h.requests.length, 0);
  assert.ok(h.storage.get('tmf_settings_pending_account-a'));
  assert.match(h.results[0].error!, /Offline/);
  h.state.navigator.onLine = true;
  h.render();
  await h.advance(600);
  assert.equal(h.requests.length, 1);
});

test('uploads from a previous account cannot change the current account sync state', async () => {
  let finish!: (result: SyncResult) => void;
  const h = harness(() => new Promise(resolve => { finish = resolve; }));
  h.render();
  await h.advance(600);
  h.state.cloudGenerationRef.current++;
  finish({ success: true });
  await h.advance(0);
  assert.equal(h.synced.length, 0);
  assert.equal(h.results.length, 0);
  assert.equal(h.state.lastPushedRef.current.preferences, '');
  assert.ok(h.storage.get('tmf_settings_pending_account-a'));
});

test('automatic retries stop after three failures and do not run after cleanup', async () => {
  const h = harness(async () => ({ success: false, error: 'Unavailable' }));
  h.render();
  await h.advance(30600);
  assert.equal(h.requests.length, 4);
  await h.advance(60000);
  assert.equal(h.requests.length, 4);
  h.render();
  h.state.cloudReady = false;
  h.render();
  await h.advance(60000);
  assert.equal(h.requests.length, 4);
});

test('manual and automatic preference uploads are serialized and the latest edit wins', async () => {
  const completions: ((result: SyncResult) => void)[] = [];
  const h = harness(() => new Promise(resolve => completions.push(resolve)));
  h.render();
  await h.advance(600);
  const manualResult = h.manual();
  h.state.settings = { theme: 'light' };
  h.render();
  await h.advance(600);
  assert.equal(h.requests.length, 1);
  completions[0]({ success: true });
  await h.advance(0);
  assert.equal(h.requests.length, 2);
  completions[1]({ success: true });
  await manualResult;
  assert.match(h.storage.get('tmf_settings_pending_account-a')!, /light/);
  await h.advance(600);
  assert.equal(h.requests.length, 3);
  assert.equal(h.requests[2].settings.theme, 'light');
  completions[2]({ success: true });
  await h.advance(0);
  assert.equal(h.storage.get('tmf_settings_pending_account-a'), '');
});

test('reverting to the last saved preference during an upload still syncs the revert', async () => {
  let finish!: (result: SyncResult) => void;
  const h = harness(() => h.requests.length === 1
    ? new Promise(resolve => { finish = resolve; })
    : Promise.resolve({ success: true }));
  h.state.lastPushedRef.current.preferences = JSON.stringify({ settings: { theme: 'dark' }, smartRules: null });
  h.state.settings = { theme: 'light' };
  h.render();
  await h.advance(600);
  h.state.settings = { theme: 'dark' };
  h.render();
  finish({ success: true });
  await h.advance(0);
  await h.advance(600);
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].settings.theme, 'dark');
  assert.equal(h.storage.get('tmf_settings_pending_account-a'), '');
});

test('local storage failures are explicit and do not pretend settings were queued', async () => {
  const h = harness();
  h.state.safeSetItem = () => false;
  h.render();
  await h.advance(600);
  assert.equal(h.requests.length, 0);
  assert.match(h.results[0].error!, /Could not save pending settings/);
});

test('a revert after an unconfirmed failed upload is sent instead of trusting the old cache', async () => {
  const h = harness(async () => h.requests.length === 1
    ? { success: false, error: 'Response lost after server write' }
    : { success: true });
  h.state.lastPushedRef.current.preferences = JSON.stringify({ settings: { theme: 'dark' }, smartRules: null });
  h.state.settings = { theme: 'light' };
  h.render();
  await h.advance(600);
  h.state.settings = { theme: 'dark' };
  h.render();
  await h.advance(600);
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].settings.theme, 'dark');
  assert.equal(h.storage.get('tmf_settings_pending_account-a'), '');
});
