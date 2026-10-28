import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeTransactionType } from './transactionType';

test('normalizes transaction types consistently, including legacy capitalization', () => {
  assert.equal(normalizeTransactionType('credit'), 'credit');
  assert.equal(normalizeTransactionType('Credit'), 'credit');
  assert.equal(normalizeTransactionType(' DEBIT '), 'debit');
  assert.equal(normalizeTransactionType('transfer'), null);
});
