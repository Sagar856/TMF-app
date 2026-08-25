import { Category, Transaction } from '../types/finance';
import { notifyBudgetThresholdReached } from './localNotifications';

export interface BudgetAlertPayload {
  id: string;
  categoryName: string;
  categoryId: string;
  spent: number;
  budgetLimit: number;
  percent: number;
  remaining: number;
  overAmount: number;
  level: '80' | '100';
  monthStr: string;
  monthLabel: string;
  timestamp: number;
}

const STORAGE_KEY = 'tmf_triggered_budget_alerts';

/**
 * Retrieves records of already triggered alerts for billing cycles.
 * Key format in map: `level:categoryId:monthStr`
 */
function getTriggeredAlerts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveTriggeredAlerts(records: Record<string, number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    console.warn('Failed to save triggered budget alerts:', err);
  }
}

export function formatMonthString(ym: string): string {
  if (!ym || ym.length < 7) return ym;
  const [year, month] = ym.split('-');
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const idx = parseInt(month, 10) - 1;
  return `${monthNames[idx] || month} ${year}`;
}

/**
 * Scans transactions for the given month against defined expense categories' budget limits.
 * Returns any new budget alert that should trigger a push notification.
 */
export function checkBudgetThresholds(
  transactions: Transaction[],
  categories: Category[],
  currencySymbol: string,
  targetMonth?: string
): BudgetAlertPayload[] {
  const currentMonth = targetMonth || (
    transactions.length > 0 && transactions[0].date
      ? transactions[0].date.substring(0, 7)
      : new Date().toISOString().substring(0, 7)
  );

  const monthTxs = transactions.filter(
    (t) => t.type === 'debit' && t.date && t.date.startsWith(currentMonth)
  );

  const expenseCategoriesWithBudgets = categories.filter(
    (c) => c.type === 'expense' && c.budgetLimit && c.budgetLimit > 0
  );

  const triggeredAlerts = getTriggeredAlerts();
  const newAlerts: BudgetAlertPayload[] = [];
  let updatedRecord = false;

  for (const cat of expenseCategoriesWithBudgets) {
    const limit = cat.budgetLimit!;
    const catTxs = monthTxs.filter((t) => t.category === cat.name);
    const spent = catTxs.reduce((sum, t) => sum + t.amount, 0);
    const percent = (spent / limit) * 100;

    // Check 100% threshold
    if (percent >= 100) {
      const key100 = `100:${cat.id}:${currentMonth}`;
      if (!triggeredAlerts[key100]) {
        triggeredAlerts[key100] = Date.now();
        updatedRecord = true;
        
        const payload: BudgetAlertPayload = {
          id: `${key100}-${Date.now()}`,
          categoryName: cat.name,
          categoryId: cat.id,
          spent,
          budgetLimit: limit,
          percent,
          remaining: 0,
          overAmount: spent - limit,
          level: '100',
          monthStr: currentMonth,
          monthLabel: formatMonthString(currentMonth),
          timestamp: Date.now(),
        };

        newAlerts.push(payload);
        notifyBudgetThresholdReached(cat.name, spent, limit, percent, currencySymbol, '100', payload.monthLabel);
      }
    } 
    // Check 80% threshold (if not already 100%)
    else if (percent >= 80) {
      const key80 = `80:${cat.id}:${currentMonth}`;
      if (!triggeredAlerts[key80]) {
        triggeredAlerts[key80] = Date.now();
        updatedRecord = true;

        const payload: BudgetAlertPayload = {
          id: `${key80}-${Date.now()}`,
          categoryName: cat.name,
          categoryId: cat.id,
          spent,
          budgetLimit: limit,
          percent,
          remaining: Math.max(0, limit - spent),
          overAmount: 0,
          level: '80',
          monthStr: currentMonth,
          monthLabel: formatMonthString(currentMonth),
          timestamp: Date.now(),
        };

        newAlerts.push(payload);
        notifyBudgetThresholdReached(cat.name, spent, limit, percent, currencySymbol, '80', payload.monthLabel);
      }
    }
  }

  if (updatedRecord) {
    saveTriggeredAlerts(triggeredAlerts);
  }

  return newAlerts;
}

/**
 * Manually creates a simulated push notification for testing.
 */
export function createSimulatedBudgetAlert(
  category: Category,
  level: '80' | '100',
  currencySymbol: string
): BudgetAlertPayload {
  const limit = category.budgetLimit || 15000;
  const percent = level === '100' ? 104.5 : 84.0;
  const spent = Math.round((limit * percent) / 100);
  const nowMonth = new Date().toISOString().substring(0, 7);

  const payload: BudgetAlertPayload = {
    id: `sim-${level}-${category.id}-${Date.now()}`,
    categoryName: category.name,
    categoryId: category.id,
    spent,
    budgetLimit: limit,
    percent,
    remaining: Math.max(0, limit - spent),
    overAmount: Math.max(0, spent - limit),
    level,
    monthStr: nowMonth,
    monthLabel: formatMonthString(nowMonth),
    timestamp: Date.now(),
  };

  notifyBudgetThresholdReached(category.name, spent, limit, percent, currencySymbol, level, payload.monthLabel);
  return payload;
}

/**
 * Resets the alert trigger memory for a specific category or all categories
 */
export function resetTriggeredBudgetAlerts(): void {
  localStorage.removeItem(STORAGE_KEY);
}
