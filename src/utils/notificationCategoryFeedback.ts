import type { Transaction } from '../types/finance';
import { formatMoney, type FormatMoneyOptions } from './money';

export function notificationCategoryConfirmation(
  transaction: Pick<Transaction, 'amount' | 'category'>, options?: FormatMoneyOptions,
): string {
  return `${formatMoney(transaction.amount, options)} transaction moved under ${transaction.category}.`;
}
