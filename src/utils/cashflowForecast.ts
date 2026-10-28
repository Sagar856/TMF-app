import { Category, FinancialAccount, Transaction } from '../types/finance';
import { getTransactionKind, isOperatingExpense, isRefund } from './transactionKind';

const LOOKBACK_DAYS = 90;
const FORECAST_DAYS = 30;

/** Transfers between the user's own accounts are cash-neutral and must not be forecast as income or spend. */
function isCashMovement(transaction: Transaction): boolean {
  return getTransactionKind(transaction) !== 'transfer';
}

export interface ForecastRecurringPayment {
  key: string;
  title: string;
  type: Transaction['type'];
  amount: number;
  nextDate: string;
  occurrences: number;
}

export interface BudgetForecast {
  category: string;
  spent: number;
  projected: number;
  limit: number;
  status: 'over' | 'at_risk';
}

export interface CashflowForecast {
  asOfDate: string;
  throughDate: string;
  availableBalance: number | null;
  projectedBalance: number | null;
  recurringPayments: ForecastRecurringPayment[];
  recurringIncome: number;
  recurringExpenses: number;
  recentExpenseChangePercent: number | null;
  overspendingCategories: BudgetForecast[];
  historyCount: number;
}

interface RecurringGroup {
  key: string;
  transactions: Transaction[];
  intervalDays: number;
}

function dateToOrdinal(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null;
  }
  return Math.floor(timestamp / 86_400_000);
}

function ordinalToDate(ordinal: number): string {
  return new Date(ordinal * 86_400_000).toISOString().slice(0, 10);
}

function transactionKey(transaction: Transaction): string {
  return (transaction.payeeOrPayer || transaction.title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function recurrenceInterval(gaps: number[]): number | null {
  if (gaps.length === 0) return null;
  const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  const consistent = gaps.every((gap) => Math.abs(gap - average) <= Math.max(4, average * 0.2));
  if (!consistent) return null;
  if (average >= 5 && average <= 9) return 7;
  if (average >= 12 && average <= 16) return 14;
  if (average >= 26 && average <= 35) return 30;
  return null;
}

function detectRecurringGroups(transactions: readonly Transaction[], asOfOrdinal: number): RecurringGroup[] {
  const groups = new Map<string, Transaction[]>();
  const earliest = asOfOrdinal - LOOKBACK_DAYS + 1;

  for (const transaction of transactions) {
    const ordinal = dateToOrdinal(transaction.date);
    const key = transactionKey(transaction);
    if (
      !key ||
      ordinal === null ||
      ordinal < earliest ||
      ordinal > asOfOrdinal ||
      !Number.isFinite(transaction.amount) ||
      transaction.amount < 0 ||
      !isCashMovement(transaction)
    ) {
      continue;
    }

    const groupKey = `${transaction.type}:${key}`;
    const group = groups.get(groupKey) || [];
    group.push(transaction);
    groups.set(groupKey, group);
  }

  return Array.from(groups.entries()).flatMap(([groupKey, items]) => {
    if (items.length < 2) return [];
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
    const gaps: number[] = [];
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = dateToOrdinal(sorted[index - 1].date);
      const current = dateToOrdinal(sorted[index].date);
      if (previous !== null && current !== null) gaps.push(current - previous);
    }
    const intervalDays = recurrenceInterval(gaps);
    return intervalDays ? [{ key: groupKey, transactions: sorted, intervalDays }] : [];
  });
}

function calculateAvailableBalance(accounts: readonly FinancialAccount[]): number | null {
  if (accounts.length === 0) return null;
  const cashAccounts = accounts.filter(
    (account) => account.type === 'Bank' || account.type === 'Wallet/UPI' || account.type === 'Debit Card'
  );
  if (cashAccounts.length === 0) return null;
  return cashAccounts.reduce((total, account) => {
    const balance = Number(account.balance);
    return total + (Number.isFinite(balance) ? balance : 0);
  }, 0);
}

export function calculateCashflowForecast(
  transactions: readonly Transaction[],
  accounts: readonly FinancialAccount[],
  categories: readonly Category[],
  asOfDate: string
): CashflowForecast | null {
  const asOfOrdinal = dateToOrdinal(asOfDate);
  if (asOfOrdinal === null) return null;
  const throughDate = ordinalToDate(asOfOrdinal + FORECAST_DAYS - 1);
  const lookbackStart = asOfOrdinal - LOOKBACK_DAYS + 1;
  const recurringGroups = detectRecurringGroups(transactions, asOfOrdinal);
  const recurringKeys = new Set(recurringGroups.map((group) => group.key));
  const recurringPayments: ForecastRecurringPayment[] = [];
  let recurringIncome = 0;
  let recurringExpenses = 0;

  for (const group of recurringGroups) {
    const latest = group.transactions[group.transactions.length - 1];
    const latestOrdinal = dateToOrdinal(latest.date);
    if (latestOrdinal === null) continue;

    const recent = group.transactions.slice(-3);
    const amount = recent.reduce((sum, transaction) => sum + transaction.amount, 0) / recent.length;
    let nextOrdinal = latestOrdinal + group.intervalDays;
    while (nextOrdinal <= asOfOrdinal) nextOrdinal += group.intervalDays;
    const firstForecastOrdinal = nextOrdinal;

    let occurrences = 0;
    while (nextOrdinal < asOfOrdinal + FORECAST_DAYS) {
      occurrences += 1;
      nextOrdinal += group.intervalDays;
    }
    if (occurrences === 0) continue;

    if (latest.type === 'debit') recurringExpenses += amount * occurrences;
    else recurringIncome += amount * occurrences;

    recurringPayments.push({
      key: group.key,
      title: latest.title,
      type: latest.type,
      amount,
      nextDate: ordinalToDate(firstForecastOrdinal),
      occurrences,
    });
  }

  const baseline = transactions.reduce(
    (totals, transaction) => {
      const ordinal = dateToOrdinal(transaction.date);
      const key = `${transaction.type}:${transactionKey(transaction)}`;
      if (
        ordinal === null ||
        ordinal < lookbackStart ||
        ordinal > asOfOrdinal ||
        recurringKeys.has(key) ||
        !Number.isFinite(transaction.amount) ||
        transaction.amount < 0 ||
        !isCashMovement(transaction)
      ) {
        return totals;
      }
      totals.count += 1;
      if (transaction.type === 'credit') totals.income += transaction.amount;
      else totals.expenses += transaction.amount;
      return totals;
    },
    { count: 0, income: 0, expenses: 0 }
  );

  const availableBalance = calculateAvailableBalance(accounts);
  const averageNonRecurringNet = (baseline.income - baseline.expenses) * (FORECAST_DAYS / LOOKBACK_DAYS);
  const projectedBalance = availableBalance === null
    ? null
    : availableBalance +
      averageNonRecurringNet +
      recurringIncome -
      recurringExpenses;

  const recentStart = asOfOrdinal - 29;
  const previousStart = asOfOrdinal - 59;
  // Spending trend compares *operating* spend only (refunds net off); SIPs,
  // EMIs and transfers are not "spending more".
  const spendingByWindow = transactions.reduce(
    (totals, transaction) => {
      const refund = isRefund(transaction);
      if ((!isOperatingExpense(transaction) && !refund) || !Number.isFinite(transaction.amount) || transaction.amount < 0) return totals;
      const ordinal = dateToOrdinal(transaction.date);
      if (ordinal === null || ordinal > asOfOrdinal) return totals;
      const signed = refund ? -transaction.amount : transaction.amount;
      if (ordinal >= recentStart) totals.recent += signed;
      else if (ordinal >= previousStart) totals.previous += signed;
      return totals;
    },
    { recent: 0, previous: 0 }
  );
  const recentExpenseChangePercent =
    spendingByWindow.previous > 0
      ? ((spendingByWindow.recent - spendingByWindow.previous) / spendingByWindow.previous) * 100
      : null;

  const asOf = new Date(asOfOrdinal * 86_400_000);
  const monthStartOrdinal = Math.floor(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1) / 86_400_000);
  const daysInMonth = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsedDays = asOf.getUTCDate();
  const currentMonth = ordinalToDate(monthStartOrdinal).slice(0, 7);
  const monthExpenses = transactions.reduce<Record<string, number>>((totals, transaction) => {
    if (
      isOperatingExpense(transaction) &&
      transaction.date.startsWith(currentMonth) &&
      (dateToOrdinal(transaction.date) ?? Number.POSITIVE_INFINITY) <= asOfOrdinal &&
      Number.isFinite(transaction.amount) &&
      transaction.amount >= 0
    ) {
      totals[transaction.category] = (totals[transaction.category] || 0) + transaction.amount;
    }
    return totals;
  }, {});
  const overspendingCategories: BudgetForecast[] = [];
  for (const category of categories) {
    const limit = category.budgetLimit;
    const spent = monthExpenses[category.name] || 0;
    if (category.type !== 'expense' || !Number.isFinite(limit) || !limit || limit <= 0 || spent <= 0) continue;
    const projected = spent * (daysInMonth / elapsedDays);
    if (spent >= limit) {
      overspendingCategories.push({ category: category.name, spent, projected, limit, status: 'over' });
    } else if (projected >= limit) {
      overspendingCategories.push({ category: category.name, spent, projected, limit, status: 'at_risk' });
    }
  }
  overspendingCategories.sort((a, b) => b.projected / b.limit - a.projected / a.limit);

  return {
    asOfDate,
    throughDate,
    availableBalance,
    projectedBalance,
    recurringPayments: recurringPayments.sort((a, b) => a.nextDate.localeCompare(b.nextDate)),
    recurringIncome,
    recurringExpenses,
    recentExpenseChangePercent,
    overspendingCategories,
    historyCount: baseline.count,
  };
}
