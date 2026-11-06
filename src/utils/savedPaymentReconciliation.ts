import type { InterceptedPayment } from '../services/notificationListener';
import type { FinancialAccount, Transaction } from '../types/finance';
import { isFinancialAccount, isTransaction } from './backup';

export function reconcileSavedPayments(
  receipts: InterceptedPayment[], transactions: Transaction[], accounts: FinancialAccount[],
) {
  const existingIds = new Set(transactions.map(transaction => transaction.id));
  const additions: Transaction[] = [];
  const latestAccounts = new Map<string, InterceptedPayment>();
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
      latestAccounts.set(receipt.account.id, receipt);
    }
  }
  return {
    transactions: [...additions.reverse(), ...transactions],
    accounts: accounts.map(account => {
      const receipt = latestAccounts.get(account.id);
      if (!receipt?.account) return account;
      const localDelta = receipt.localBalance === undefined ? 0 : account.balance - receipt.localBalance;
      return { ...account, balance: Math.round((receipt.account.balance + localDelta) * 100) / 100 };
    }),
  };
}
