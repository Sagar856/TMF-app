import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const onlineStart = source.indexOf('  const requireOnlineForTransactionChange =');
const onlineEnd = source.indexOf('\n  const [isUnlocked', onlineStart);
const actionsStart = source.indexOf('  const handleSaveTransaction =');
const actionsEnd = source.indexOf('\n  // Account Actions', actionsStart);
assert.ok(onlineStart >= 0 && onlineEnd > onlineStart && actionsStart >= 0 && actionsEnd > actionsStart);
const actions = transformSync(
  `${source.slice(onlineStart, onlineEnd)}\n${source.slice(actionsStart, actionsEnd)}\n` +
  '({ handleSaveTransaction, handleDeleteTransaction });',
  { loader: 'tsx' },
).code;

test('existing transactions cannot be edited or deleted when offline', () => {
  const transaction = { id: 'tx', title: 'Coffee', type: 'debit', category: 'Food', subcategory: 'General' };
  const messages: string[] = [];
  let writes = 0;
  const state = {
    transactions: [transaction], navigator: { onLine: false }, financialEpoch: 1, authUser: { id: 'owner' },
    transactionDeletesInFlight: { current: new Set<string>() },
    showToast: (message: string) => messages.push(message),
    setTransactions: () => { writes++; }, setAccounts: () => { writes++; },
  };
  const handlers = runInNewContext(actions, state) as {
    handleSaveTransaction: (value: typeof transaction) => void;
    handleDeleteTransaction: (id: string) => void;
  };
  handlers.handleSaveTransaction({ ...transaction, title: 'Changed' });
  handlers.handleDeleteTransaction(transaction.id);
  assert.equal(writes, 0);
  assert.equal(messages.length, 2);
  assert.match(messages[0], /Connect to the internet/);
});

test('a failed or conflicted cloud deletion leaves local transaction and balances unchanged', async () => {
  const transaction = { id: 'tx', title: 'Coffee', syncRevision: 3 };
  const messages: string[] = [];
  let writes = 0;
  const state = {
    transactions: [transaction], accounts: [], navigator: { onLine: true }, financialEpoch: 1, authUser: { id: 'owner' },
    transactionDeletesInFlight: { current: new Set<string>() },
    cloudGenerationRef: { current: 1 }, cloudReady: true, cloudHydrated: true,
    isCloudBackendConfigured: () => true,
    deleteMultipleTransactionsFromSupabase: async () => ({ success: false, conflict: true, error: 'Transaction changed elsewhere.' }),
    showToast: (message: string) => messages.push(message),
    setSyncStatus: () => {},
    setTransactions: () => { writes++; }, setAccounts: () => { writes++; },
  };
  const handlers = runInNewContext(actions, state) as { handleDeleteTransaction: (id: string) => Promise<void> };
  await handlers.handleDeleteTransaction(transaction.id);
  assert.equal(writes, 0);
  assert.deepEqual(messages, ['Transaction changed elsewhere.']);
  assert.equal(state.transactionDeletesInFlight.current.size, 0);
});

test('a cloud deletion waits for confirmation and ignores duplicate requests', async () => {
  const transaction = { id: 'tx', title: 'Coffee', syncRevision: 3 };
  let finish!: (result: { success: boolean }) => void;
  let calls = 0;
  let writes = 0;
  const state = {
    transactions: [transaction], accounts: [], navigator: { onLine: true }, financialEpoch: 1, authUser: { id: 'owner' },
    transactionDeletesInFlight: { current: new Set<string>() },
    cloudGenerationRef: { current: 1 }, cloudReady: true, cloudHydrated: true,
    isCloudBackendConfigured: () => true,
    deleteMultipleTransactionsFromSupabase: () => {
      calls++;
      return new Promise<{ success: boolean }>(resolve => { finish = resolve; });
    },
    showToast: () => {}, safeGetStringArray: () => [], safeSetItem: () => true,
    deleteReceiptAttachmentsForTransaction: async () => {},
    setTransactions: () => { writes++; }, setAccounts: () => { writes++; },
  };
  const handlers = runInNewContext(actions, state) as { handleDeleteTransaction: (id: string) => Promise<void> };
  const deletion = handlers.handleDeleteTransaction(transaction.id);
  await handlers.handleDeleteTransaction(transaction.id);
  assert.equal(calls, 1);
  assert.equal(writes, 0);
  finish({ success: true });
  await deletion;
  assert.equal(writes, 2);
});

test('cloud-load cleanup does not retry pending deletions using newly fetched revisions', () => {
  const start = source.indexOf('      const cleanup = [');
  const end = source.indexOf('      const results =', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(source.slice(start, end), /deleteMultipleTransactionsFromSupabase|tmf_deleted_tx_ids|deleteMultipleAccountsFromSupabase|tmf_deleted_account_ids/);
});

test('a failed or superseded cloud reset keeps local records and receipt images', async () => {
  const start = source.indexOf('  const handleRequestResetAllData =');
  const end = source.indexOf('\n  if (passcodeMigrationError)', start);
  assert.ok(start >= 0 && end > start);
  const code = transformSync(`${source.slice(start, end)}\nhandleRequestResetAllData();`, { loader: 'tsx' }).code;
  for (const changedUser of [false, true]) {
    let confirm!: { onConfirm: () => Promise<void> };
    let writes = 0;
    const messages: string[] = [];
    const generation = { current: 1 };
    const state = {
      transactions: [{ id: 'existing' }], cloudGenerationRef: generation, authUser: { id: 'owner' },
      setConfirmConfig: (config: typeof confirm) => { confirm = config; },
      requireOnlineForTransactionChange: () => true, isCloudBackendConfigured: () => true,
      deleteAllUserDataFromSupabase: async () => {
        if (changedUser) generation.current++;
        return { success: false, error: 'Cloud reset failed.' };
      },
      setSettings: () => { writes++; }, safeSetItem: () => { writes++; },
      deleteAllReceiptAttachments: () => { writes++; },
      setSyncStatus: () => {}, showToast: (message: string) => messages.push(message),
    };
    runInNewContext(code, state);
    await confirm.onConfirm();
    assert.equal(writes, 0);
    assert.deepEqual(messages, changedUser ? [] : ['Cloud reset failed.']);
  }
});
