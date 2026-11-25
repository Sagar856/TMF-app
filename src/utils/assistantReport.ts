import type { Category, FinancialAccount, InvestmentRecord, LoanRecord, SavingsGoal, Transaction } from '../types/finance';
import { computeBudgetUsage, type BudgetUsage } from './budgetUsage';
import { isValidDate, savingsGoalProgress } from './savingsGoals';
import { isOperatingExpense, isRefund, sumOperatingExpense, sumOperatingIncome } from './transactionKind';

export interface AssistantReportInput {
  month: string;
  asOfDate: string;
  transactions: Transaction[];
  categories: Category[];
  accounts: FinancialAccount[];
  investments: InvestmentRecord[];
  loans: LoanRecord[];
  savingsGoals: SavingsGoal[];
}

export interface AssistantReport {
  month: string;
  asOfDate: string;
  transactionCount: number;
  operatingIncome: number;
  operatingExpense: number;
  categorySpending: { category: string; amount: number }[];
  budgets: BudgetUsage[];
  accounts: { name: string; type: FinancialAccount['type']; balance: number }[];
  investments: { name: string; type: InvestmentRecord['type']; currentValue: number; status: InvestmentRecord['status'] }[];
  loans: { title: string; type: LoanRecord['type']; remainingAmount: number; status: LoanRecord['status'] }[];
  savingsGoals: { title: string; savedAmount: number; targetAmount: number; progress: number }[];
  limitations: string[];
}

/**
 * Transaction and budget figures cover the chosen calendar month. Account,
 * investment, loan and goal figures are current snapshots, not historical
 * balances at the end of that month.
 */
export function createAssistantReport(input: AssistantReportInput): AssistantReport {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month) || !isValidDate(`${input.month}-01`)) {
    throw new Error('Choose a valid report month.');
  }
  if (!isValidDate(input.asOfDate)) throw new Error('Choose a valid snapshot date.');
  if (input.transactions.some(item => !Number.isFinite(item.amount))
    || input.categories.some(item => item.budgetLimit !== undefined && !Number.isFinite(item.budgetLimit))
    || input.accounts.some(item => !Number.isFinite(item.balance))
    || input.investments.some(item => !Number.isFinite(item.currentValue))
    || input.loans.some(item => !Number.isFinite(item.remainingAmount))
    || input.savingsGoals.some(item => !Number.isFinite(item.savedAmount)
      || !Number.isFinite(item.targetAmount) || item.targetAmount <= 0)) {
    throw new Error('A financial record has an invalid amount; correct it before generating a report.');
  }

  const invalidDates = input.transactions.filter(transaction => !isValidDate(transaction.date)).length;
  const transactions = input.transactions.filter(transaction =>
    isValidDate(transaction.date) && transaction.date.startsWith(`${input.month}-`));
  const categoryTransactions = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    if (!isOperatingExpense(transaction) && !isRefund(transaction)) continue;
    const name = transaction.category.trim();
    const key = name.toLowerCase();
    const existing = categoryTransactions.get(key);
    if (existing) existing.push(transaction);
    else categoryTransactions.set(key, [transaction]);
  }
  const categorySpending = [...categoryTransactions.values()].map(items => ({
    category: items[0].category.trim(),
    amount: sumOperatingExpense(items),
  })).sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));

  const limitations = [
    'Figures reflect records currently available on this device and may be incomplete.',
    `Accounts, investments, loans and savings goals are current snapshots as of ${input.asOfDate}, not historical month-end values.`,
  ];
  if (invalidDates) limitations.push(`${invalidDates} transaction(s) have invalid dates and were excluded.`);
  if (!transactions.length) limitations.push('No transactions are recorded for the selected month.');
  if (!input.categories.length) limitations.push('No categories are recorded.');
  if (!input.categories.some(category => category.type === 'expense' && (category.budgetLimit || 0) > 0)) {
    limitations.push('No monthly expense budgets are recorded.');
  }
  if (!input.accounts.length) limitations.push('No accounts are recorded.');
  if (!input.investments.length) limitations.push('No investments are recorded.');
  if (!input.loans.length) limitations.push('No loans or lends are recorded.');
  if (!input.savingsGoals.length) limitations.push('No savings goals are recorded.');

  return {
    month: input.month,
    asOfDate: input.asOfDate,
    transactionCount: transactions.length,
    operatingIncome: sumOperatingIncome(transactions),
    operatingExpense: sumOperatingExpense(transactions),
    categorySpending,
    budgets: computeBudgetUsage(transactions, input.categories, input.month),
    accounts: input.accounts.map(({ name, type, balance }) => ({ name, type, balance })),
    investments: input.investments.map(({ name, type, currentValue, status }) => ({ name, type, currentValue, status })),
    loans: input.loans.map(({ title, type, remainingAmount, status }) => ({ title, type, remainingAmount, status })),
    savingsGoals: input.savingsGoals.map(goal => ({
      title: goal.title,
      savedAmount: goal.savedAmount,
      targetAmount: goal.targetAmount,
      progress: savingsGoalProgress(goal),
    })),
    limitations,
  };
}
