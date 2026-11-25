import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSampleData, isSampleRecordId, INITIAL_TRANSACTIONS, SAMPLE_ACCOUNT_IDS,
  SAMPLE_TRANSACTION_IDS, SAMPLE_INVESTMENT_IDS, SAMPLE_LOAN_IDS,
} from '../data/initialData';

test('fresh demo loads do not reuse tombstoned IDs and keep account links within their generation', () => {
  const first = createSampleData();
  const second = createSampleData();
  const firstIds = new Set([...first.accounts, ...first.transactions, ...first.investments, ...first.loans].map(item => item.id));
  assert.ok([...second.accounts, ...second.transactions, ...second.investments, ...second.loans].every(item => !firstIds.has(item.id)));
  const accounts = new Set(first.accounts.map(account => account.id));
  for (const transaction of first.transactions) {
    if (transaction.accountId) assert.ok(accounts.has(transaction.accountId));
    if (transaction.toAccountId) assert.ok(accounts.has(transaction.toAccountId));
  }
  for (const item of [...first.investments, ...first.loans]) {
    if (item.linkedAccountId) assert.ok(accounts.has(item.linkedAccountId));
  }
  for (const [items, ids] of [
    [first.accounts, SAMPLE_ACCOUNT_IDS], [first.transactions, SAMPLE_TRANSACTION_IDS],
    [first.investments, SAMPLE_INVESTMENT_IDS], [first.loans, SAMPLE_LOAN_IDS],
  ] as const) {
    assert.ok(items.every(item => isSampleRecordId(item.id, ids)));
    assert.equal(isSampleRecordId('custom-record', ids), false);
  }
  assert.equal(isSampleRecordId(INITIAL_TRANSACTIONS[0].id, SAMPLE_TRANSACTION_IDS), true);
  assert.equal(INITIAL_TRANSACTIONS[0].id.startsWith('tmf-demo:'), false);
});
