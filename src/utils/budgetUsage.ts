import type { Category, Transaction } from '../types/finance';
import { isOperatingExpense, isRefund } from './transactionKind';

export interface BudgetUsage {
  category: Category;
  budget: number;
  spent: number;
  percent: number;
  remaining: number;
  overBudget: number;
  txCount: number;
  status: 'safe' | 'warning' | 'critical';
}

export const BUDGET_WARNING_PERCENT = 80;
export const BUDGET_CRITICAL_PERCENT = 100;

/**
 * Single source of truth for "how much of this category's monthly budget is
 * used". Both the dashboard monitor and the push-alert service call this so
 * the percentage shown always matches the percentage notified.
 *
 * Only operating expenses count; refunds in the category net off the spend.
 * Category matching is case/whitespace-insensitive.
 */
export function computeBudgetUsage(transactions: readonly Transaction[], categories: readonly Category[], monthStr: string): BudgetUsage[] {
  const monthTxs = transactions.filter((tx) => tx.date && tx.date.startsWith(monthStr) && (isOperatingExpense(tx) || isRefund(tx)));
  const normalize = (name: string) => name.trim().toLowerCase();

  return categories
    .filter((cat) => cat.type === 'expense' && Number.isFinite(cat.budgetLimit) && (cat.budgetLimit || 0) > 0)
    .map((cat) => {
      const budget = cat.budgetLimit as number;
      const key = normalize(cat.name);
      const catTxs = monthTxs.filter((tx) => normalize(tx.category) === key);
      const spent = Math.max(
        0,
        Math.round(catTxs.reduce((sum, tx) => sum + (isRefund(tx) ? -tx.amount : tx.amount), 0) * 100) / 100
      );
      const percent = (spent / budget) * 100;
      return {
        category: cat,
        budget,
        spent,
        percent,
        remaining: Math.max(0, budget - spent),
        overBudget: Math.max(0, spent - budget),
        txCount: catTxs.length,
        status: percent >= BUDGET_CRITICAL_PERCENT ? 'critical' : percent >= BUDGET_WARNING_PERCENT ? 'warning' : 'safe',
      } satisfies BudgetUsage;
    })
    .sort((a, b) => b.percent - a.percent);
}
