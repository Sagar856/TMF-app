import type { FinancialAccount, Transaction } from '../types/finance';
import { transactionBelongsToAccount } from './transactionKind';

export interface TransactionFilterCriteria {
  search?: string;
  fromDate?: string;
  toDate?: string;
  /** Category name, or 'All' / 'All Categories'. */
  category?: string;
  /** `acc:<id>` for a real account, `legacy:<label>` for an unresolved payment-method string, or 'All'. */
  account?: string;
  /** PaymentSource or 'All'. */
  source?: string;
  /** 'Debit' | 'Credit' | 'All' */
  type?: string;
  /** Subcategory/tag or 'All'. */
  tag?: string;
}

export function isDateRangeInvalid(fromDate?: string, toDate?: string): boolean {
  return Boolean(fromDate && toDate && fromDate > toDate);
}

/** Newest first, then latest time, then id — stable for equal keys. */
export function compareTransactionsNewestFirst(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const ta = a.time || '00:00';
  const tb = b.time || '00:00';
  if (ta !== tb) return ta < tb ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function filterTransactions(
  transactions: readonly Transaction[],
  accounts: readonly FinancialAccount[],
  criteria: TransactionFilterCriteria
): Transaction[] {
  const search = (criteria.search || '').trim().toLowerCase();
  const rangeInvalid = isDateRangeInvalid(criteria.fromDate, criteria.toDate);
  const accountFilter = criteria.account || 'All';
  const selectedAccount = accountFilter.startsWith('acc:') ? accounts.find((a) => a.id === accountFilter.slice(4)) : undefined;
  const legacyLabel = accountFilter.startsWith('legacy:') ? accountFilter.slice(7) : undefined;
  const categoryFilter = criteria.category && criteria.category !== 'All' && criteria.category !== 'All Categories' ? criteria.category : undefined;
  const sourceFilter = criteria.source && criteria.source !== 'All' ? criteria.source : undefined;
  const typeFilter = criteria.type && criteria.type !== 'All' ? criteria.type : undefined;
  const tagFilter = criteria.tag && criteria.tag !== 'All' ? criteria.tag : undefined;

  return transactions
    .filter((tx) => {
      if (search) {
        const haystack = [tx.title, tx.payeeOrPayer, tx.category, tx.subcategory, tx.source, tx.paymentMethod, tx.location?.name, tx.note, tx.refNumber];
        if (!haystack.some((field) => field && field.toLowerCase().includes(search))) return false;
      }
      // An inverted range is ignored (the UI shows a hint) rather than producing an empty list.
      if (!rangeInvalid) {
        if (criteria.fromDate && tx.date < criteria.fromDate) return false;
        if (criteria.toDate && tx.date > criteria.toDate) return false;
      }
      if (categoryFilter && tx.category !== categoryFilter) return false;
      if (selectedAccount) {
        if (!transactionBelongsToAccount(tx, selectedAccount, accounts as FinancialAccount[])) return false;
      } else if (legacyLabel && tx.paymentMethod !== legacyLabel) {
        return false;
      }
      if (sourceFilter && tx.source !== sourceFilter) return false;
      if (typeFilter === 'Debit' && tx.type !== 'debit') return false;
      if (typeFilter === 'Credit' && tx.type !== 'credit') return false;
      if (tagFilter && tx.subcategory !== tagFilter) return false;
      return true;
    })
    .sort(compareTransactionsNewestFirst);
}
