import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CustomisationsView } from './CustomisationsView';
import { currentMonthLocal } from '../utils/dates';

test('budget settings keep editing and filters with a concise monthly summary', (context) => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null },
  });
  context.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const markup = renderToStaticMarkup(
    <CustomisationsView
      categories={[{ id: 'food', name: 'Food', type: 'expense', iconName: 'Coffee', subcategories: ['Meals'], budgetLimit: 100 }]}
      transactions={[{
        id: 'meal', title: 'Lunch', amount: 25, type: 'debit', category: 'Food',
        subcategory: 'Meals', date: `${currentMonthLocal()}-01`, time: '12:00', source: 'Manual',
      }]}
      currencySymbol="$"
      onAddCategory={() => {}}
      onUpdateCategory={() => {}}
      onDeleteCategory={() => {}}
    />
  );
  assert.match(markup, /Monthly budget/);
  assert.match(markup, /aria-label="Budget month"/);
  assert.match(markup, /aria-label="Search expense category\.\.\."/);
  assert.match(markup, /aria-label="Filter budgets" aria-expanded="false" aria-controls="budgets-filters"/);
  assert.match(markup, /id="budgets-filters" hidden=""/);
  assert.match(markup, /aria-label="budgets search and actions"[\s\S]*aria-label="Search expense category\.\.\."[\s\S]*aria-label="Budget month"[\s\S]*id="btn-add-category-budget-tab"/);
  assert.match(markup, /id="budgets-filters" hidden="" class="absolute right-0 top-full z-50/);
  assert.doesNotMatch(markup, /Totals include categories with a budget\./);
  assert.match(markup, /Edit budget/);
  assert.match(markup, /Near limit/);
  assert.match(markup, /No budget/);
  assert.match(markup, /\$100/);
  assert.match(markup, /\$25/);
  assert.match(markup, /\$75/);
  assert.doesNotMatch(markup, /Budget Cockpit|Combined Budget Gauge|safe quota|\+1k|Total Budget Tracked/);
});
