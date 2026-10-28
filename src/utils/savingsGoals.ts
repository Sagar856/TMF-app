import { SavingsGoal } from '../types/finance';

export function isSavingsGoal(value: unknown): value is SavingsGoal {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const goal = value as Record<string, unknown>;
  return typeof goal.id === 'string'
    && typeof goal.title === 'string'
    && goal.title.trim().length > 0
    && typeof goal.targetAmount === 'number'
    && Number.isFinite(goal.targetAmount)
    && goal.targetAmount > 0
    && typeof goal.savedAmount === 'number'
    && Number.isFinite(goal.savedAmount)
    && goal.savedAmount >= 0
    && (goal.targetDate === undefined || isValidDate(goal.targetDate))
    && typeof goal.createdAt === 'string'
    && Number.isFinite(Date.parse(goal.createdAt));
}

export function isSavingsGoalArray(value: unknown): value is SavingsGoal[] {
  return Array.isArray(value) && value.every(isSavingsGoal);
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function savingsGoalProgress(goal: Pick<SavingsGoal, 'savedAmount' | 'targetAmount'>): number {
  return Math.min(100, Math.max(0, (goal.savedAmount / goal.targetAmount) * 100));
}
