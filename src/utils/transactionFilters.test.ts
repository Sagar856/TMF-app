import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTransactions, isDateRangeInvalid } from './transactionFilters';
import type { FinancialAccount, Transaction } from '../types/finance';

const accounts: FinancialAccount[] = [
  { id: 'acc_hdfc', name: 'HDFC Savings', bankName: 'HDFC Bank', type: 'Bank', accountNumberLast4: '1204', balance: 0 },
  { id: 'acc_cc', name: 'Amex', bankName: 'American Express', type: 'Credit Card', accountNumberLast4: '9001', balance: 0 },
];

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 'x',
  title: 'Item',
  amount: 10,
  type: 'debit',
  category: 'Food',
  subcategory: 'Lunch',
  date: '2026-10-10',
  time: '12:00',
  source: 'Manual',
  ...over,
});

const data: Transaction[] = [
  tx({ id: 'a', title: 'Lunch', date: '2026-10-10', time: '12:00', accountId: 'acc_hdfc', note: 'Team outing', refNumber: 'UTR999' }),
  tx({ id: 'b', title: 'Salary', type: 'credit', category: 'Income', subcategory: 'Salary', date: '2026-10-01', source: 'SMS', accountId: 'acc_hdfc' }),
  tx({ id: 'c', title: 'Amazon', date: '2026-10-10', time: '18:30', source: 'UPI', accountId: 'acc_cc', subcategory: 'Shopping' }),
  tx({ id: 'd', title: 'Legacy wallet', date: '2026-09-28', paymentMethod: 'Paytm Wallet' }),
  tx({ id: 'e', title: 'Same time', date: '2026-10-10', time: '18:30', accountId: 'acc_hdfc' }),
];

test('sorts newest first, then latest time, then id (stable)', () => {
  const ids = filterTransactions(data, accounts, {}).map((t) => t.id);
  assert.deepEqual(ids, ['e', 'c', 'a', 'b', 'd']);
});

test('search covers note and reference number', () => {
  assert.deepEqual(filterTransactions(data, accounts, { search: 'utr999' }).map((t) => t.id), ['a']);
  assert.deepEqual(filterTransactions(data, accounts, { search: 'team outing' }).map((t) => t.id), ['a']);
});

test('account filter uses canonical ids and legacy labels separately from source', () => {
  assert.deepEqual(filterTransactions(data, accounts, { account: 'acc:acc_cc' }).map((t) => t.id), ['c']);
  assert.deepEqual(filterTransactions(data, accounts, { account: 'legacy:Paytm Wallet' }).map((t) => t.id), ['d']);
  assert.deepEqual(filterTransactions(data, accounts, { source: 'SMS' }).map((t) => t.id), ['b']);
});

test('inverted date range is ignored instead of emptying the list', () => {
  assert.equal(isDateRangeInvalid('2026-10-20', '2026-10-01'), true);
  assert.equal(filterTransactions(data, accounts, { fromDate: '2026-10-20', toDate: '2026-10-01' }).length, data.length);
  assert.deepEqual(filterTransactions(data, accounts, { fromDate: '2026-10-05', toDate: '2026-10-10' }).map((t) => t.id), ['e', 'c', 'a']);
});

test('type, category and tag filters combine with AND semantics', () => {
  assert.deepEqual(filterTransactions(data, accounts, { type: 'Credit' }).map((t) => t.id), ['b']);
  assert.deepEqual(filterTransactions(data, accounts, { category: 'Food', tag: 'Shopping' }).map((t) => t.id), ['c']);
  assert.deepEqual(filterTransactions(data, accounts, { category: 'All Categories', type: 'Debit', account: 'acc:acc_hdfc' }).map((t) => t.id), ['e', 'a']);
});
