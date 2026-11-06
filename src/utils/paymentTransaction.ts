import type { Category, FinancialAccount, ParsedNotification, Transaction } from '../types/finance';
import { resolveAccountId } from './accountResolver';
import { inferTransactionKind } from './transactionKind';
import { newId } from './ids';

export function adjustPaymentAccountBalance(accounts: FinancialAccount[], method: string | undefined, delta: number): FinancialAccount[] {
  if (!method || method.toLowerCase() === 'cash') return accounts;
  const id = resolveAccountId(accounts, method);
  const index = id ? accounts.findIndex(account => account.id === id) : accounts.findIndex(account => account.isDefault);
  if (index < 0) return accounts;
  const account = accounts[index];
  const applied = account.type === 'Credit Card' ? -delta : delta;
  return accounts.map((value, position) => position === index
    ? { ...value, balance: Math.round((account.balance + applied) * 100) / 100 } : value);
}

export function createPaymentTransaction(notification: ParsedNotification, accounts: FinancialAccount[], categories: Category[]) {
  const targetType = notification.type === 'credit' ? 'income' : 'expense';
  const matched = categories.find(category => category.name.toLowerCase() === notification.category.toLowerCase());
  const category = matched || categories.find(value => value.type === targetType);
  const nextCategories = category ? categories : [...categories, {
    id: `cat_uncategorized_${targetType}`, name: 'Uncategorized', type: targetType,
    iconName: 'Tag', subcategories: ['General'],
  } satisfies Category];
  const categoryName = category?.name || 'Uncategorized';
  const subcategory = matched?.subcategories.includes(notification.subcategory)
    ? notification.subcategory : category?.subcategories[0] || 'General';
  const accountId = accounts.find(account => notification.accountLast4 && account.accountNumberLast4 === notification.accountLast4)?.id
    || resolveAccountId(accounts, notification.appSource)
    || resolveAccountId(accounts, notification.paymentMethod)
    || accounts.find(account => account.isDefault)?.id;
  const paymentMethod = accountId || notification.appSource || notification.paymentMethod || 'Other UPI';
  const transaction: Transaction = {
    id: notification.id.startsWith('native_') ? `tx_${notification.id}` : newId('tx_notif'),
    title: notification.description?.trim() || notification.payeeOrPayer,
    amount: notification.amount, type: notification.type,
    kind: inferTransactionKind({
      type: notification.type, category: categoryName, subcategory,
      title: notification.payeeOrPayer, note: notification.rawText,
    }),
    category: categoryName, subcategory, date: notification.date, time: notification.time,
    location: notification.location, source: 'UPI', payeeOrPayer: notification.payeeOrPayer,
    accountId: accountId || undefined, paymentMethod,
    rawText: notification.rawText, refNumber: notification.refNumber,
  };
  return {
    transaction, categories: nextCategories,
    accounts: adjustPaymentAccountBalance(accounts, paymentMethod, notification.type === 'credit' ? notification.amount : -notification.amount),
  };
}
