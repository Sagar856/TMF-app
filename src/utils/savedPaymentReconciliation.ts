import type { InterceptedPayment } from '../services/notificationListener';
import type { FinancialAccount, Transaction } from '../types/finance';
import { isFinancialAccount, isTransaction } from './backup';

export function reconcileSavedPayments(
  receipts: InterceptedPayment[], transactions: Transaction[], accounts: FinancialAccount[],
) {
  const existingIds = new Set(transactions.map(transaction => transaction.id));
  const additions: Transaction[] = [];
  const latestAccounts = new Map<string, { account: FinancialAccount; localBalance?: number }>();
  for (const receipt of [...receipts].sort((left, right) => (left.savedRevision || 0) - (right.savedRevision || 0))) {
    const transaction = receipt.transaction;
    if (!transaction) continue;
    if (!isTransaction(transaction) || transaction.id !== `tx_native_${receipt.id}` || transaction.amount <= 0) {
      throw new Error('Invalid background transaction receipt');
    }
    if (existingIds.has(transaction.id)) continue;
    existingIds.add(transaction.id);
    additions.push(transaction);
    if (receipt.account) {
      if (!isFinancialAccount(receipt.account) || receipt.account.id !== transaction.accountId
        || (receipt.localBalance !== undefined && !Number.isFinite(receipt.localBalance))) {
        throw new Error('Invalid background account receipt');
      }
      latestAccounts.set(receipt.account.id, { account: receipt.account, localBalance: receipt.localBalance });
    }
    if (receipt.cashAccount) {
      if (!isFinancialAccount(receipt.cashAccount) || receipt.cashAccount.type !== 'Cash'
        || receipt.cashAccount.id !== transaction.toAccountId
        || (receipt.localCashBalance !== undefined && !Number.isFinite(receipt.localCashBalance))) {
        throw new Error('Invalid background cash account receipt');
      }
      latestAccounts.set(receipt.cashAccount.id, { account: receipt.cashAccount, localBalance: receipt.localCashBalance });
    }
  }
  const projected = accounts.map(account => {
    const latest = latestAccounts.get(account.id);
    if (!latest) return account;
    const localDelta = latest.localBalance === undefined ? 0 : account.balance - latest.localBalance;
    return { ...account, balance: Math.round((latest.account.balance + localDelta) * 100) / 100 };
  });
  // A cash account first created by a background save is not on the device yet.
  const created = [...latestAccounts.values()]
    .filter(({ account }) => account.type === 'Cash' && !accounts.some(existing => existing.id === account.id))
    .map(({ account }) => account);
  return {
    transactions: [...additions.reverse(), ...transactions],
    accounts: [...projected, ...created],
  };
}
