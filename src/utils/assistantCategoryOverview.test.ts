import assert from 'node:assert/strict';
import test from 'node:test';
import { answerAssistantCategoryOverview } from './assistantCategoryOverview';
import type { Category, Transaction } from '../types/finance';

const categories: Category[] = [
  { id: 'shop', name: 'Shopping & Tech', type: 'expense', iconName: 'Tag', subcategories: ['General'], budgetLimit: 20000 },
  { id: 'wash', name: 'Washing', type: 'expense', iconName: 'Tag', subcategories: ['General'] },
  { id: 'salary', name: 'Salary', type: 'income', iconName: 'Tag', subcategories: ['General'] },
];
const payment: Transaction = { id: 'one', type: 'debit', kind: 'expense', title: 'Synthetic', category: 'Shopping & Tech',
  subcategory: 'General', date: '2026-11-20', time: '12:00', amount: 250, source: 'UPI' };

test('requested current categories and budgets use verified monthly usage and retain full derived figures', () => {
  const reply = answerAssistantCategoryOverview('list down all available categories and budgets for current month', categories,
    [payment, { ...payment, id: 'refund', type: 'credit', kind: 'refund', amount: 50 },
      { ...payment, id: 'old', date: '2026-10-20', amount: 999 }], '2026-11-27', 'INR');
  assert.match(reply || '', /2026-11, as of 2026-11-27/);
  assert.match(reply || '', /Shopping & Tech \(expense\): budget INR 20,000.00; used INR 200.00; remaining INR 19,800.00/);
  assert.match(reply || '', /Washing \(expense\): no monthly expense budget/);
  assert.match(reply || '', /Salary \(income\): no monthly expense budget/);
  assert.match(reply || '', /missing or unsynced/);
  assert.doesNotMatch(reply || '', /999|number ending/);
});

test('overview handles missing and invalid data without answering unrelated or historical requests', () => {
  assert.match(answerAssistantCategoryOverview('show categories', [], [], '2026-11-27', 'USD') || '', /No categories/);
  assert.throws(() => answerAssistantCategoryOverview('show budgets', categories, [{ ...payment, amount: NaN }], '2026-11-27', 'INR'), /invalid/);
  for (const question of ['create category Washing', 'What is a budget?', 'show budgets for October', 'show categories and delete them',
    'show budgets for Food', 'list categories and explain taxes']) {
    assert.equal(answerAssistantCategoryOverview(question, categories, [], '2026-11-27', 'INR'), undefined);
  }
});
