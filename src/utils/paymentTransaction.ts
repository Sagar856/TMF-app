import type { Category, FinancialAccount, ParsedNotification, Transaction } from '../types/finance';
import { resolveAccountId } from './accountResolver';
import { inferTransactionKind } from './transactionKind';
import { newId } from './ids';
import { CASH_WITHDRAWAL_SUBCATEGORY, applyCashWithdrawalLeg, ensureCashAccount, isCashWithdrawalText } from './cashAccount';
import { categoryKeywordMatches } from '../services/notification/CategoryClassifier';

const CATEGORY_MATCH_MIN_SCORE = 0.82;
const CATEGORY_MATCH_MIN_MARGIN = 0.04;
const CATEGORY_MATCH_IGNORED_WORDS = new Set([
  'a', 'an', 'and', 'category', 'expense', 'for', 'income', 'investment', 'is', 'my', 'of', 'please', 'the', 'to',
]);
const GENERIC_SUBCATEGORY_NAMES = new Set(['general', 'misc', 'miscellaneous', 'other', 'uncategorized']);

export function applyNotificationCategoryOverride(notification: ParsedNotification, categories: Category[]): ParsedNotification {
  const name = notification.categoryOverride?.trim();
  const text = name || notification.description?.trim();
  if (!text || isCashWithdrawalNotification(notification)) return notification;
  const match = matchNotificationCategoryText(text, notification.type, categories);
  if (match.status !== 'match') {
    if (!name) return notification;
    throw new Error(`Category "${name}" was not found or matched ambiguously for this payment. Edit it in the app.`);
  }
  return { ...notification, category: match.category.name, subcategory: match.subcategory };
}

export type NotificationCategoryMatch =
  | { status: 'match'; category: Category; subcategory: string }
  | { status: 'none' | 'ambiguous' };

export function matchNotificationCategoryText(
  text: string, direction: 'credit' | 'debit', categories: readonly Category[],
): NotificationCategoryMatch {
  const type = direction === 'credit' ? 'income' : 'expense';
  const inputWords = categoryWords(text.slice(0, 200));
  const inputName = inputWords.join(' ');
  const keywordMatches = categoryKeywordMatches(text.slice(0, 200), direction);
  const matches = categories
    .filter(category => category.type === type)
    .map(category => {
      const related = keywordMatches.filter(match =>
        categoryMatchScore(categoryWords(match.category).join(' '), categoryWords(match.category), category) >= CATEGORY_MATCH_MIN_SCORE
        || tokenMatchScore(categoryWords(category.name), categoryWords(match.category), 0.78, 0.18) >= CATEGORY_MATCH_MIN_SCORE
        || categoryMatchScore(categoryWords(match.subcategory).join(' '), categoryWords(match.subcategory), category) >= CATEGORY_MATCH_MIN_SCORE);
      return { category, related, score: Math.max(categoryMatchScore(inputName, inputWords, category), related.length ? 0.94 : 0) };
    })
    .filter(match => match.score >= CATEGORY_MATCH_MIN_SCORE)
    .sort((left, right) => right.score - left.score);
  const best = matches[0];
  if (!best) return { status: 'none' };
  if (matches[1] && best.score - matches[1].score < CATEGORY_MATCH_MIN_MARGIN) {
    return { status: 'ambiguous' };
  }
  const category = best.category;
  const exactSubcategory = category.subcategories.find(subcategory => {
    const words = categoryWords(subcategory);
    return words.length > 0 && words.join(' ') === inputName && !GENERIC_SUBCATEGORY_NAMES.has(inputName);
  });
  const subcategory = exactSubcategory
    || category.subcategories.find(value => best.related.some(match =>
      categoryWords(match.subcategory).join(' ') === categoryWords(value).join(' ')))
    || category.subcategories.find(value => GENERIC_SUBCATEGORY_NAMES.has(value.toLowerCase()))
    || category.subcategories[0]
    || '';
  return subcategory ? { status: 'match', category, subcategory } : { status: 'none' };
}

function categoryMatchScore(inputName: string, inputWords: string[], category: Category): number {
  const categoryWordsList = categoryWords(category.name);
  if (!inputName || !categoryWordsList.length) return 0;
  if (inputName === categoryWordsList.join(' ')) return 1;

  let subcategoryScore = 0;
  for (const subcategory of category.subcategories) {
    const words = categoryWords(subcategory);
    const normalized = words.join(' ');
    if (!normalized || GENERIC_SUBCATEGORY_NAMES.has(normalized)) continue;
    if (normalized === inputName) {
      subcategoryScore = Math.max(subcategoryScore, 0.94);
    } else {
      subcategoryScore = Math.max(subcategoryScore, tokenMatchScore(inputWords, words, 0.70, 0.13));
    }
  }
  return Math.max(subcategoryScore, tokenMatchScore(inputWords, categoryWordsList, 0.78, 0.18));
}

function categoryWords(value: string): string[] {
  return value.toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(word => word && !CATEGORY_MATCH_IGNORED_WORDS.has(word));
}

function tokenMatchScore(inputWords: string[], candidateWords: string[], base: number, span: number): number {
  if (!inputWords.length || !candidateWords.length) return 0;
  const scores = inputWords.map(input => Math.max(...candidateWords.map(candidate => wordSimilarity(input, candidate))));
  const matched = scores.filter(score => score >= 0.75);
  if (matched.length / inputWords.length < 0.75) return 0;
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return base + span * average;
}

function wordSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (Math.min(left.length, right.length) < 4) return 0;
  const distance = levenshteinDistance(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function levenshteinDistance(left: string, right: string): number {
  const distances = Array.from({ length: left.length + 1 }, (_, row) =>
    Array.from({ length: right.length + 1 }, (_, column) => row === 0 ? column : column === 0 ? row : 0));
  for (let row = 1; row <= left.length; row++) {
    for (let column = 1; column <= right.length; column++) {
      const substitution = distances[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1);
      distances[row][column] = Math.min(
        distances[row - 1][column] + 1,
        distances[row][column - 1] + 1,
        substitution,
      );
      if (row > 1 && column > 1
        && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1]) {
        distances[row][column] = Math.min(distances[row][column], distances[row - 2][column - 2] + 1);
      }
    }
  }
  return distances[left.length][right.length];
}

export function hasUnmatchedPaymentAccount(notification: ParsedNotification, accounts: FinancialAccount[]): boolean {
  if (!notification.accountLast4) return false;
  return accounts.filter(account => account.accountNumberLast4 === notification.accountLast4).length !== 1;
}

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

export function applyNotificationEditOnce(
  notificationId: string, incoming: Transaction, transactions: Transaction[], accounts: FinancialAccount[],
): { transaction: Transaction; transactions: Transaction[]; accounts: FinancialAccount[]; added: boolean } {
  const id = `tx_${notificationId}`;
  const existing = transactions.find(transaction => transaction.id === id);
  if (existing) return { transaction: existing, transactions, accounts, added: false };
  const transaction = { ...incoming, id };
  return {
    transaction,
    transactions: [transaction, ...transactions],
    accounts: applyTransactionToAccounts(accounts, transaction, 1),
    added: true,
  };
}

export function isCashWithdrawalNotification(notification: Pick<ParsedNotification, 'type' | 'rawText' | 'paymentMethod'>): boolean {
  return notification.type === 'debit'
    && (notification.paymentMethod === 'ATM Cash' || isCashWithdrawalText(notification.rawText));
}

export function createPaymentTransaction(notification: ParsedNotification, accounts: FinancialAccount[], categories: Category[]) {
  if (isCashWithdrawalNotification(notification)) return createCashWithdrawal(notification, accounts, categories);
  const targetType = notification.type === 'credit' ? 'income' : 'expense';
  const matched = categories.find(category => category.name.toLowerCase() === notification.category.toLowerCase()
    && (!notification.categoryOverride || category.type === targetType));
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
