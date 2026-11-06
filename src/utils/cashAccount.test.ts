import test from 'node:test';
import assert from 'node:assert/strict';
import type { FinancialAccount, Transaction } from '../types/finance';
import {
  CASH_WITHDRAWAL_SUBCATEGORY,
  applyCashWithdrawalLeg,
  ensureCashAccount,
  isCashWithdrawal,
  isCashWithdrawalText,
  isLiquidAccount,
} from './cashAccount';

const bank: FinancialAccount = { id: 'acc_bank', name: 'Savings', bankName: 'HDFC', type: 'Bank', accountNumberLast4: '1234', balance: 5000 };

const withdrawal = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx_1',
  amount: 1000,
  type: 'debit',
  kind: 'transfer',
  category: 'Transfer',
  subcategory: CASH_WITHDRAWAL_SUBCATEGORY,
  accountId: 'acc_bank',
  toAccountId: 'acc_cash_1',
  date: '2025-06-01',
  description: 'ATM withdrawal',
  ...overrides,
} as Transaction);

test('cash accounts count as liquid money', () => {
  assert.equal(isLiquidAccount({ type: 'Cash' }), true);
  assert.equal(isLiquidAccount({ type: 'Credit Card' }), false);
});

test('ensureCashAccount reuses an existing cash account or creates one', () => {
  const created = ensureCashAccount([bank]);
  assert.equal(created.accounts.length, 2);
  assert.equal(created.cashAccount.type, 'Cash');
  assert.match(created.cashAccount.id, /^acc_cash_/);

  const reused = ensureCashAccount(created.accounts);
  assert.equal(reused.accounts, created.accounts);
  assert.equal(reused.cashAccount.id, created.cashAccount.id);
});

test('isCashWithdrawalText detects ATM withdrawals but not ATM-card purchases', () => {
  assert.equal(isCashWithdrawalText('Rs 2000 withdrawn at ATM XYZ'), true);
  assert.equal(isCashWithdrawalText('Cash withdrawal of INR 500'), true);
  assert.equal(isCashWithdrawalText('NFS CASH WDL'), true);
  assert.equal(isCashWithdrawalText('ATM card used at Amazon'), false);
  assert.equal(isCashWithdrawalText(undefined), false);
});

test('isCashWithdrawal requires a debit transfer into a target account', () => {
  assert.equal(isCashWithdrawal(withdrawal()), true);
  assert.equal(isCashWithdrawal(withdrawal({ toAccountId: undefined })), false);
  assert.equal(isCashWithdrawal(withdrawal({ kind: 'expense' } as Partial<Transaction>)), false);
});

test('applyCashWithdrawalLeg credits and reverts the cash account', () => {
  const credited = applyCashWithdrawalLeg([bank], withdrawal(), 1);
  const cash = credited.find((account) => account.id === 'acc_cash_1');
  assert.equal(cash?.balance, 1000);
  assert.equal(credited.find((account) => account.id === 'acc_bank')?.balance, 5000);

  const reverted = applyCashWithdrawalLeg(credited, withdrawal(), -1);
  assert.equal(reverted.find((account) => account.id === 'acc_cash_1')?.balance, 0);

  assert.equal(applyCashWithdrawalLeg([bank], withdrawal({ subcategory: 'Groceries' }), 1).length, 1);
});
