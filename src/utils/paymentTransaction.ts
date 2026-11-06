import type { Category, FinancialAccount, ParsedNotification, Transaction } from '../types/finance';
import { resolveAccountId } from './accountResolver';
import { inferTransactionKind } from './transactionKind';
import { newId } from './ids';
import { CASH_WITHDRAWAL_SUBCATEGORY, applyCashWithdrawalLeg, ensureCashAccount, isCashWithdrawalText } from './cashAccount';

export function adjustPaymentAccountBalance(accounts: FinancialAccount[], method: string | undefined, delta: number): FinancialAccount[] {
  if (!method) return accounts;
  const isCash = method.trim().toLowerCase() === 'cash';
  const id = resolveAccountId(accounts, method);
  if (isCash && !id) return accounts;
  const index = id ? accounts.findIndex(account => account.id === id) : accounts.findIndex(account => account.isDefault);
  if (index < 0) return accounts;
  const account = accounts[index];
  const applied = account.type === 'Credit Card' ? -delta : delta;
  return accounts.map((value, position) => position === index
    ? { ...value, balance: Math.round((account.balance + applied) * 100) / 100 } : value);
}

/** Applies (direction 1) or reverts (direction -1) every balance effect of a ledger transaction. */
export function applyTransactionToAccounts(accounts: FinancialAccount[], tx: Transaction, direction: 1 | -1): FinancialAccount[] {
  const target = resolveAccountId(accounts, tx.accountId || tx.paymentMethod) || tx.paymentMethod;
  const delta = (tx.type === 'credit' ? tx.amount : -tx.amount) * direction;
  return applyCashWithdrawalLeg(adjustPaymentAccountBalance(accounts, target, delta), tx, direction);
}

export function isCashWithdrawalNotification(notification: Pick<ParsedNotification, 'type' | 'rawText' | 'paymentMethod'>): boolean {
  return notification.type === 'debit'
    && (notification.paymentMethod === 'ATM Cash' || isCashWithdrawalText(notification.rawText));
}

export function createPaymentTransaction(notification: ParsedNotification, accounts: FinancialAccount[], categories: Category[]) {
  if (isCashWithdrawalNotification(notification)) return createCashWithdrawal(notification, accounts, categories);
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
  const accountId = resolveNotificationAccountId(notification, accounts);
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

function resolveNotificationAccountId(notification: ParsedNotification, accounts: FinancialAccount[]): string | undefined {
  return accounts.find(account => notification.accountLast4 && account.accountNumberLast4 === notification.accountLast4)?.id
    || resolveAccountId(accounts, notification.appSource)
    || resolveAccountId(accounts, notification.paymentMethod)
    || accounts.find(account => account.isDefault)?.id;
}

/**
 * An ATM/cash withdrawal only moves money from a bank/card into cash in hand,
 * so it is recorded as a transfer into the Cash account rather than spend.
 */
function createCashWithdrawal(notification: ParsedNotification, accounts: FinancialAccount[], categories: Category[]) {
  const sourceId = resolveNotificationAccountId(notification, accounts);
  const source = accounts.find(account => account.id === sourceId && account.type !== 'Cash');
  // Without any tracked account the cashflow fallback already excludes transfers.
  const { accounts: withCash, cashAccount } = source
    ? ensureCashAccount(accounts) : { accounts, cashAccount: undefined };
  const transaction: Transaction = {
    id: notification.id.startsWith('native_') ? `tx_${notification.id}` : newId('tx_notif'),
    title: notification.description?.trim() || 'ATM cash withdrawal',
    amount: notification.amount, type: 'debit', kind: 'transfer',
    category: 'Transfer', subcategory: CASH_WITHDRAWAL_SUBCATEGORY,
    date: notification.date, time: notification.time,
    location: notification.location, source: 'UPI', payeeOrPayer: cashAccount?.name || 'Cash',
    accountId: source?.id, toAccountId: cashAccount?.id, paymentMethod: source?.id || 'ATM Cash',
    rawText: notification.rawText, refNumber: notification.refNumber,
  };
  return {
    transaction, categories,
    accounts: source ? applyTransactionToAccounts(withCash, transaction, 1) : accounts,
  };
}
