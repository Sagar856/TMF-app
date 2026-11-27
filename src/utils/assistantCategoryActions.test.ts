import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceCategoryAction, applyCategoryAction } from './assistantCategoryActions';
import type { Category } from '../types/finance';

const food: Category = { id: 'food', name: 'Food & Dining', type: 'expense', iconName: 'Coffee', subcategories: ['Restaurants'], budgetLimit: 1000 };
const categories = [food];

test('category creation interprets the requested name and type, and asks for missing fields', () => {
  const ready = advanceCategoryAction('Add a new category as "Washing" in expense', null, categories);
  assert.equal(ready?.status, 'ready');
  if (ready?.status !== 'ready') return;
  assert.deepEqual(ready.action, { kind: 'category', name: 'Washing', type: 'expense' });
  assert.match(ready.text, /General subcategory and no budget/);
  let step = advanceCategoryAction('Create a category', null, categories);
  assert.equal(step?.status, 'question');
  if (step?.status !== 'question') return;
  step = advanceCategoryAction('Washing', step.draft, categories);
  assert.equal(step?.status, 'question');
  if (step?.status !== 'question') return;
  step = advanceCategoryAction('expense', step.draft, categories);
  assert.equal(step?.status, 'ready');
  assert.equal(advanceCategoryAction('create category "Food & Dining" in expense', null, categories)?.status, 'error');
});

test('subcategory and budget actions ask for missing details and only change the requested field', () => {
  const sub = advanceCategoryAction('Add subcategory Laundry to Food & Dining', null, categories);
  assert.equal(sub?.status, 'ready');
  if (sub?.status !== 'ready') return;
  assert.deepEqual(applyCategoryAction(sub.action, categories)[0], { ...food, subcategories: ['Restaurants', 'Laundry'] });
  let budget = advanceCategoryAction('Set budget for Food & Dining', null, categories);
  assert.equal(budget?.status, 'question');
  if (budget?.status !== 'question') return;
  budget = advanceCategoryAction('5000', budget.draft, categories);
  assert.equal(budget?.status, 'ready');
  if (budget?.status !== 'ready') return;
  assert.deepEqual(applyCategoryAction(budget.action, categories)[0], { ...food, budgetLimit: 5000 });
  assert.throws(() => applyCategoryAction(budget.action, [{ ...food, budgetLimit: 2000 }]), /changed/);
  assert.equal(advanceCategoryAction('Set budget for Food & Dining to 0', null, categories)?.status, 'error');
});

test('cancel, duplicate and ambiguous targets do not produce executable actions', () => {
  const pending = advanceCategoryAction('Create a category', null, categories);
  assert.equal(pending?.status, 'question');
  if (pending?.status !== 'question') return;
  assert.match(advanceCategoryAction('cancel', pending.draft, categories)?.text || '', /Nothing was changed/);
  assert.equal(advanceCategoryAction('add subcategory Restaurants to Food & Dining', null, categories)?.status, 'error');
  assert.equal(advanceCategoryAction('add subcategory Snacks to Food & Dining', null,
    [...categories, { ...food, id: 'income', type: 'income' }])?.status, 'question');
  assert.equal(advanceCategoryAction('delete category Food & Dining', null, categories), null);
  assert.equal(advanceCategoryAction('create category Washing and delete category Food', null, categories)?.status, 'error');
});
