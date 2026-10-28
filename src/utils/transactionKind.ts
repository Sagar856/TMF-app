import type { Transaction, TransactionKind, FinancialAccount } from '../types/finance';
import { resolveAccountId } from './accountResolver';

const LOAN_CATEGORY = 'loans & lends';
const INVESTMENT_CATEGORY = 'investment';

const LOAN_REPAYMENT_SUBCATS = new Set(['emi repayment', 'repayment received', 'repayment', 'emi']);
const LOAN_DISBURSAL_SUBCATS = new Set(['loan received', 'lent out', 'disbursal', 'disbursement']);
const REFUND_HINT = /\b(refund|reversal|reversed|cashback|chargeback)\b/i;

/**
 * Derives the semantic kind of a transaction when it was not stored explicitly.
 * Legacy records only carry category/subcategory, so the mandatory
 * "Loans & Lends" and "Investment" categories are the classification anchors.
 */
export function inferTransactionKind(tx: Pick<Transaction, 'type' | 'category' | 'subcategory' | 'title' | 'note'>): TransactionKind {
  const category = (tx.category || '').trim().toLowerCase();
  const subcategory = (tx.subcategory || '').trim().toLowerCase();

  if (category === LOAN_CATEGORY) {
    if (LOAN_DISBURSAL_SUBCATS.has(subcategory)) return 'loan_disbursal';
    if (LOAN_REPAYMENT_SUBCATS.has(subcategory)) return 'loan_repayment';
    // Unknown loan subcategory: money in = disbursal, money out = repayment.
    return tx.type === 'credit' ? 'loan_disbursal' : 'loan_repayment';
  }

  if (category === INVESTMENT_CATEGORY) return 'investment';
  if (category === 'transfer' || subcategory === 'transfer' || subcategory === 'self transfer') return 'transfer';

  if (tx.type === 'credit' && REFUND_HINT.test(`${tx.title || ''} ${tx.note || ''} ${subcategory}`)) {
    return 'refund';
  }

  return tx.type === 'credit' ? 'income' : 'expense';
}

/** Stored kind if present, otherwise the inferred one. */
export function getTransactionKind(tx: Transaction): TransactionKind {
  return tx.kind ?? inferTransactionKind(tx);
}

/** Operating income only (salary, interest, gifts…) — excludes loan disbursals, redemptions, transfers. */
export function isOperatingIncome(tx: Transaction): boolean {
  return tx.type === 'credit' && getTransactionKind(tx) === 'income';
}

/** Operating spend only — excludes investments, EMIs, lending and transfers. */
export function isOperatingExpense(tx: Transaction): boolean {
  return tx.type === 'debit' && getTransactionKind(tx) === 'expense';
}

export function isRefund(tx: Transaction): boolean {
  return tx.type === 'credit' && getTransactionKind(tx) === 'refund';
}

/** Net operating spend for a set of transactions: expenses minus refunds. */
export function sumOperatingExpense(transactions: Transaction[]): number {
  let total = 0;
  for (const tx of transactions) {
    if (isOperatingExpense(tx)) total += tx.amount;
    else if (isRefund(tx)) total -= tx.amount;
  }
  return Math.round(total * 100) / 100;
}

export function sumOperatingIncome(transactions: Transaction[]): number {
  let total = 0;
  for (const tx of transactions) if (isOperatingIncome(tx)) total += tx.amount;
  return Math.round(total * 100) / 100;
}

/**
 * Fills in `kind` and a canonical `accountId` for records that predate those
 * fields. Returns the same array instance when nothing needed to change so
 * callers can avoid needless state updates/syncs.
 */
export function normalizeTransactions(transactions: Transaction[], accounts: FinancialAccount[]): Transaction[] {
  let changed = false;
  const next = transactions.map((tx) => {
    const kind = tx.kind ?? inferTransactionKind(tx);
    const accountId = tx.accountId ?? (resolveAccountId(accounts, tx.paymentMethod) || undefined);
    if (kind === tx.kind && accountId === tx.accountId) return tx;
    changed = true;
    return { ...tx, kind, ...(accountId ? { accountId } : {}) };
  });
  return changed ? next : transactions;
}

/** True when the transaction belongs to the given account (canonical id first, legacy string fallback). */
export function transactionBelongsToAccount(tx: Transaction, account: FinancialAccount, accounts: FinancialAccount[]): boolean {
  if (tx.accountId) return tx.accountId === account.id || tx.toAccountId === account.id;
  const resolved = resolveAccountId(accounts, tx.paymentMethod);
  return resolved === account.id;
}
