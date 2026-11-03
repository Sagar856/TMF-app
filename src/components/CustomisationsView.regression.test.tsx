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
  assert.match(markup, /aria-label="Categories and budgets sections"/);
  assert.match(markup, /aria-label="Search categories and budgets settings"/);
  for (const section of ['budgets', 'categories', 'accounts', 'rules']) {
    assert.match(markup, new RegExp(`data-section="${section}"`));
  }
  assert.doesNotMatch(markup, /settings-browser-tabs/);
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
  const sharedSearchMarkup = renderToStaticMarkup(
    <CustomisationsView
      categories={[]}
      currencySymbol="$"
      settingsSearch="wallet"
      onAddCategory={() => {}}
      onUpdateCategory={() => {}}
      onDeleteCategory={() => {}}
    />
  );
  assert.doesNotMatch(sharedSearchMarkup, /Search categories and budgets settings/);
  assert.match(sharedSearchMarkup, /data-section="accounts"/);
  assert.match(sharedSearchMarkup, /Manage accounts/);
  assert.doesNotMatch(sharedSearchMarkup, /data-section="budgets"|data-section="categories"|data-section="rules"/);
});

test('manage accounts appends its footer after account controls and hides it on the menu', (context) => {
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  context.after(() => {
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const props = {
    categories: [], currencySymbol: '$',
    onAddCategory: () => {}, onUpdateCategory: () => {}, onDeleteCategory: () => {},
    accountsFooter: <section id="broker-footer">Manual Broker Portfolios</section>,
  };
  const menu = renderToStaticMarkup(<CustomisationsView {...props} />);
  assert.doesNotMatch(menu, /id="broker-footer"/);
  const accounts = renderToStaticMarkup(<CustomisationsView {...props} openAccountsRequest={1} />);
  assert.match(accounts, /Manage accounts/);
  assert.ok(accounts.indexOf('id="broker-footer"') > accounts.indexOf('aria-label="accounts search and actions"'));
  assert.match(accounts, /id="broker-footer">Manual Broker Portfolios/);
  for (const section of ['budgets', 'categories', 'accounts', 'rules'] as const) {
    const opened = renderToStaticMarkup(<CustomisationsView {...props} openSectionRequest={{ section, requestId: 1 }} />);
    assert.match(opened, /id="settings-customisations-heading"/);
    assert.match(opened, /Back to categories and budgets menu/);
    if (section === 'accounts') assert.match(opened, /id="broker-footer"/);
    else assert.doesNotMatch(opened, /id="broker-footer"/);
  }
});
