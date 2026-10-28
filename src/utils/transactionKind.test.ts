import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferTransactionKind,
  normalizeTransactions,
  sumOperatingExpense,
  sumOperatingIncome,
  transactionBelongsToAccount,
} from './transactionKind';
import type { Transaction, FinancialAccount } from '../types/finance';

const base = (over: Partial<Transaction>): Transaction => ({
  id: over.id || 't',
  title: 'x',
  amount: 100,
  type: 'debit',
  category: 'Food & Dining',
  subcategory: 'Lunch',
  date: '2026-10-01',
  time: '10:00',
  source: 'Manual',
  ...over,
});

const accounts: FinancialAccount[] = [
  { id: 'acc_hdfc', name: 'HDFC Savings', bankName: 'HDFC Bank', type: 'Bank', accountNumberLast4: '1204', balance: 0 },
  { id: 'acc_cc', name: 'Amex Card', bankName: 'American Express', type: 'Credit Card', accountNumberLast4: '9001', balance: 0 },
];

test('infers loan and investment kinds from the mandatory categories', () => {
  assert.equal(inferTransactionKind(base({ category: 'Loans & Lends', subcategory: 'EMI Repayment' })), 'loan_repayment');
  assert.equal(inferTransactionKind(base({ category: 'Loans & Lends', subcategory: 'Loan Received', type: 'credit' })), 'loan_disbursal');
  assert.equal(inferTransactionKind(base({ category: 'Loans & Lends', subcategory: 'Lent Out' })), 'loan_disbursal');
  assert.equal(inferTransactionKind(base({ category: 'Loans & Lends', subcategory: 'Repayment Received', type: 'credit' })), 'loan_repayment');
  assert.equal(inferTransactionKind(base({ category: 'Investment', subcategory: 'SIP' })), 'investment');
  assert.equal(inferTransactionKind(base({ category: 'Investment', subcategory: 'Redemption', type: 'credit' })), 'investment');
});

test('plain debits/credits are expense/income; refund hints become refunds', () => {
  assert.equal(inferTransactionKind(base({})), 'expense');
  assert.equal(inferTransactionKind(base({ type: 'credit', category: 'Income', subcategory: 'Salary' })), 'income');
  assert.equal(inferTransactionKind(base({ type: 'credit', title: 'Amazon refund' })), 'refund');
  assert.equal(inferTransactionKind(base({ type: 'credit', title: 'Cashback credited' })), 'refund');
});

test('operating sums exclude balance-sheet movements and net refunds', () => {
  const txs = [
    base({ id: '1', amount: 500 }), // expense
    base({ id: '2', amount: 200, type: 'credit', title: 'Refund from store' }), // refund
    base({ id: '3', amount: 10000, category: 'Investment', subcategory: 'SIP' }), // investment
    base({ id: '4', amount: 3000, category: 'Loans & Lends', subcategory: 'EMI Repayment' }), // emi
    base({ id: '5', amount: 50000, type: 'credit', category: 'Income', subcategory: 'Salary' }), // income
    base({ id: '6', amount: 20000, type: 'credit', category: 'Loans & Lends', subcategory: 'Loan Received' }), // disbursal
  ];
  assert.equal(sumOperatingExpense(txs), 300);
  assert.equal(sumOperatingIncome(txs), 50000);
});

test('normalizeTransactions back-fills kind and accountId and is identity when nothing changes', () => {
  const legacy = [
    base({ id: 'a', paymentMethod: 'acc_hdfc' }),
    base({ id: 'b', paymentMethod: 'American Express (**9001)' }),
    base({ id: 'c', paymentMethod: 'Cash' }),
  ];
  const normalized = normalizeTransactions(legacy, accounts);
  assert.notEqual(normalized, legacy);
  assert.equal(normalized[0].kind, 'expense');
  assert.equal(normalized[0].accountId, 'acc_hdfc');
  assert.equal(normalized[1].accountId, 'acc_cc');
  assert.equal(normalized[2].accountId, undefined);
  // Stored kind wins over inference
  const explicit = [base({ id: 'd', kind: 'transfer', accountId: 'acc_hdfc' })];
  assert.equal(normalizeTransactions(explicit, accounts), explicit);
});

test('transactionBelongsToAccount prefers canonical ids and falls back to legacy strings', () => {
  const [hdfc, cc] = accounts;
  assert.equal(transactionBelongsToAccount(base({ accountId: 'acc_cc' }), cc, accounts), true);
  assert.equal(transactionBelongsToAccount(base({ accountId: 'acc_cc' }), hdfc, accounts), false);
  assert.equal(transactionBelongsToAccount(base({ paymentMethod: 'HDFC Bank' }), hdfc, accounts), true);
  assert.equal(transactionBelongsToAccount(base({ kind: 'transfer', accountId: 'acc_hdfc', toAccountId: 'acc_cc' }), cc, accounts), true);
});
