import { TransactionType } from '../types/finance';

export function normalizeTransactionType(type: string): TransactionType | null {
  const normalized = type.trim().toLowerCase();
  return normalized === 'credit' || normalized === 'debit' ? normalized : null;
}
