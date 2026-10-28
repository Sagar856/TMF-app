import { Transaction } from '../types/finance';
import { normalizeTransactionType } from './transactionType';

export interface TransactionMetrics {
  creditCount: number;
  debitCount: number;
  totalCredit: number;
  totalDebit: number;
}

export function calculateTransactionMetrics(transactions: readonly Transaction[]): TransactionMetrics {
  return transactions.reduce<TransactionMetrics>((metrics, transaction) => {
    const type = normalizeTransactionType(transaction.type);
    if (type === 'credit') {
      metrics.creditCount += 1;
      metrics.totalCredit += transaction.amount;
    } else if (type === 'debit') {
      metrics.debitCount += 1;
      metrics.totalDebit += transaction.amount;
    }
    return metrics;
  }, { creditCount: 0, debitCount: 0, totalCredit: 0, totalDebit: 0 });
}
