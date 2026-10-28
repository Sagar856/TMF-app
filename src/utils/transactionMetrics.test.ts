import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Transaction } from '../types/finance';
import { calculateTransactionMetrics } from './transactionMetrics';

const transactions: Transaction[] = [
  {
    id: 'credit-lowercase',
    title: 'Deposit',
    amount: 125,
    type: 'credit',
    category: 'Income',
    subcategory: '',
    date: '2026-10-12',
    time: '10:00',
    source: 'Manual',
  },
  {
    id: 'credit-legacy-case',
    title: 'Refund',
    amount: 25,
    type: 'Credit' as Transaction['type'],
    category: 'Income',
    subcategory: '',
    date: '2026-10-13',
    time: '11:00',
    source: 'Manual',
  },
  {
    id: 'debit-lowercase',
    title: 'Purchase',
    amount: 40,
    type: 'debit',
    category: 'Shopping',
    subcategory: '',
    date: '2026-10-14',
    time: '12:00',
    source: 'Manual',
  },
];

test('transaction totals and counts use the same normalized transaction types', () => {
  assert.deepEqual(calculateTransactionMetrics(transactions), {
    creditCount: 2,
    debitCount: 1,
    totalCredit: 150,
    totalDebit: 40,
  });
});

test('unknown legacy transaction types are excluded rather than counted on either side', () => {
  const unknown = { ...transactions[0], id: 'unknown', type: 'transfer' as Transaction['type'] };
  assert.deepEqual(calculateTransactionMetrics([unknown]), {
    creditCount: 0,
    debitCount: 0,
    totalCredit: 0,
    totalDebit: 0,
  });
});
