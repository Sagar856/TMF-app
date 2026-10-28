export function calculateSavingsRate(income: number, expenses: number): number | null {
  if (!Number.isFinite(income) || !Number.isFinite(expenses) || income <= 0) return null;
  return Math.round(((income - expenses) / income) * 100);
}
