import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TransactionsView } from './TransactionsView';
import { Transaction, UserSettings } from '../types/finance';

const settings: UserSettings = {
  userName: 'Test',
  userEmail: 'test@example.com',
  currencySymbol: '$',
  currencyCode: 'USD',
  passcodeEnabled: false,
  locationTracking: false,
  autoExtractSms: false,
  notificationsEnabled: false,
};

const transactions: Transaction[] = [
  {
    id: 'income',
    title: 'Paycheck',
    amount: 1200,
    type: 'credit',
    category: 'Income',
    subcategory: '',
    date: '2026-10-12',
    time: '10:00',
    source: 'Manual',
  },
  {
    id: 'expense',
    title: 'Groceries',
    amount: 325,
    type: 'debit',
    category: 'Food',
    subcategory: '',
    date: '2026-10-13',
    time: '11:00',
    source: 'Manual',
  },
];

test('transaction summary renders totals and counts consistently with transaction rows', () => {
  const markup = renderToStaticMarkup(
    <TransactionsView
      transactions={transactions}
      categories={[]}
      onAddTransaction={() => {}}
      onEditTransaction={() => {}}
      onDeleteTransaction={() => {}}
      onImportTransactions={() => ({ added: 0, duplicates: 0 })}
      currencySymbol="$"
      settings={settings}
      onUpdateSettings={() => {}}
    />
  );

  assert.match(markup, /\+?\$1,200/);
  assert.match(markup, /-\$325/);
  assert.match(markup, /1 Deposits/);
  assert.match(markup, /1 Debits/);
  assert.match(markup, /Paycheck/);
  assert.match(markup, /Groceries/);
  assert.match(markup, /EDIT/);
  assert.match(markup, /Attach or view receipt for Groceries/);
  assert.match(markup, /aria-label="Transaction records table"/);
  assert.match(markup, /aria-pressed="true"[^>]*>[\s\S]*?<span>TABLE<\/span>/);
  assert.match(markup, /Scroll horizontally to view all table columns/);
  assert.doesNotMatch(markup, /class="bg-\[#111111\] border border-\[#222\] rounded-xl p-3 space-y-2"/);
});
