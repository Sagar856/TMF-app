import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import type { Transaction } from '../types/finance';
import { applyAccountSyncRevisions, applyTransactionSyncRevisions, parseTransactionSyncRevisions, pendingDeletionsToRestore } from './transactionSync';

const transaction: Transaction = {
  id: 'tx-1', title: 'Coffee', amount: 4, type: 'debit', category: 'Food',
  subcategory: 'Coffee', date: '2026-11-20', time: '09:00', source: 'Manual',
};

test('only restores pending deletions when a live cloud transaction is available', () => {
  const live = { ...transaction, syncRevision: 7 };
  assert.deepEqual(pendingDeletionsToRestore(
    ['tx-1', 'already-deleted', 'missing', 'cloud-tombstone'],
    [live, { ...live, id: 'cloud-tombstone' }],
    ['already-deleted', 'cloud-tombstone'],
  ), ['tx-1']);
});

test('accepts one revision for each expected transaction and rejects malformed responses', () => {
  assert.deepEqual(parseTransactionSyncRevisions([
    { id: 'tx-1', sync_revision: 3 }, { id: 'tx-2', sync_revision: 1 },
  ], ['tx-1', 'tx-2']), { 'tx-1': 3, 'tx-2': 1 });
  assert.equal(parseTransactionSyncRevisions([{ id: 'tx-1', sync_revision: 3 }], ['tx-1', 'tx-2']), undefined);
  assert.equal(parseTransactionSyncRevisions([
    { id: 'tx-1', sync_revision: 3 }, { id: 'tx-1', sync_revision: 4 },
  ], ['tx-1', 'tx-2']), undefined);
  assert.equal(parseTransactionSyncRevisions([{ id: 'unexpected', sync_revision: 1 }], ['tx-1']), undefined);
  assert.equal(parseTransactionSyncRevisions([{ id: 'tx-1', sync_revision: 0 }], ['tx-1']), undefined);
});

test('applies sync revisions without replacing transaction edits made while the request was in flight', () => {
  const changedWhileSyncing = { ...transaction, title: 'Updated coffee', amount: 5 };
  const unchanged = { ...transaction, id: 'tx-2', syncRevision: 4 };
  const result = applyTransactionSyncRevisions([changedWhileSyncing, unchanged], { 'tx-1': 2, 'tx-2': 4 });

  assert.deepEqual(result, [{ ...changedWhileSyncing, syncRevision: 2 }, unchanged]);
  assert.equal(result[0].title, 'Updated coffee');
  assert.equal(result[0].amount, 5);
});

test('a late retry receipt cannot regress newer transaction or account revisions', () => {
  assert.equal(applyTransactionSyncRevisions([{ ...transaction, syncRevision: 8 }], { 'tx-1': 2 })[0].syncRevision, 8);
  const account = { id: 'bank', name: 'Bank', bankName: 'Bank', type: 'Bank' as const, accountNumberLast4: '', balance: 80, syncRevision: 8 };
  assert.deepEqual(applyAccountSyncRevisions([account], { bank: 2 }), [account]);
});

test('missing transaction RPCs do not instruct users to deploy the unsafe migration', async () => {
  const source = readFileSync(new URL('../services/supabaseClient.ts', import.meta.url), 'utf8');
  const helper = source.slice(source.indexOf('function transactionSyncRows('), source.indexOf('// Metadata-only transaction writes'));
  for (const [name, next, argumentsText] of [
    ['syncTransactionsToSupabase', 'deleteMultipleTransactionsFromSupabase', '[transaction]'],
    ['syncFinancialStateToSupabase', 'deleteAccountFromSupabase', '[transaction], []'],
  ]) {
    const start = source.indexOf(`export async function ${name}(`);
    const end = source.indexOf(`export async function ${next}(`, start);
    assert.ok(start >= 0 && end > start);
    const code = transformSync(
      `${helper}\n${source.slice(start, end).replace('export ', '')}\n${name}(${argumentsText});`,
      { loader: 'ts' },
    ).code;
    for (const errorCode of ['PGRST202', '42883']) {
      const result = await runInNewContext(code, {
        transaction,
        crypto, TextEncoder,
        readFinancialEpoch: () => 1,
        safeGetItem: () => 'user-1',
        getSupabaseClient: () => ({
          auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
          rpc: async () => ({ error: { code: errorCode } }),
        }),
      });
      assert.equal(result.success, false);
      assert.equal(result.schemaOutdated, true);
      assert.match(result.error, /do not deploy/i);
    }
  }
});
