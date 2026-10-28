import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBudgetUsage } from './budgetUsage';
import type { Category, Transaction } from '../types/finance';

const cats: Category[] = [
  { id: 'food', name: 'Food & Dining', type: 'expense', iconName: 'Utensils', subcategories: ['Lunch'], budgetLimit: 1000 },
  { id: 'inv', name: 'Investment', type: 'investment', iconName: 'TrendingUp', subcategories: ['SIP'], budgetLimit: 5000 },
  { id: 'nolimit', name: 'Misc', type: 'expense', iconName: 'Tag', subcategories: [] },
];

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  title: 't',
  amount: 100,
  type: 'debit',
  category: 'Food & Dining',
  subcategory: 'Lunch',
  date: '2026-10-05',
  time: '10:00',
  source: 'Manual',
  ...over,
});

test('budget usage matches category case-insensitively, nets refunds and ignores other months/kinds', () => {
  const usage = computeBudgetUsage(
    [
      tx({ amount: 500 }),
      tx({ amount: 400, category: 'food & dining' }),
      tx({ amount: 100, type: 'credit', title: 'Refund from cafe' }),
      tx({ amount: 999, date: '2026-09-30' }),
      tx({ amount: 999, category: 'Investment', subcategory: 'SIP' }),
    ],
    cats,
    '2026-10'
  );
  assert.equal(usage.length, 1);
  assert.equal(usage[0].category.id, 'food');
  assert.equal(usage[0].spent, 800);
  assert.equal(usage[0].percent, 80);
  assert.equal(usage[0].status, 'warning');
  assert.equal(usage[0].remaining, 200);
});

test('critical status and over-budget amount at >= 100%', () => {
  const usage = computeBudgetUsage([tx({ amount: 1250 })], cats, '2026-10');
  assert.equal(usage[0].status, 'critical');
  assert.equal(usage[0].overBudget, 250);
});
