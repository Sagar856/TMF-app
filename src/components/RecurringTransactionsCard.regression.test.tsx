import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecurringTransactionsCard } from './RecurringTransactionsCard';
import { currentMonthLocal } from '../utils/dates';

test('recurring ignores are month-specific and exclude skipped bills from the list and totals', () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let ignored: string[] = [];
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => {
        if (key === 'tmf_custom_recurring_bills') {
          return JSON.stringify([{
            id: 'test_bill',
            title: 'Test subscription',
            amount: 25,
            category: 'Bills & Utilities',
            payeeOrPayer: 'Provider',
            frequency: 'Monthly',
            expectedDayOfMonth: 5,
            type: 'debit',
          }]);
        }
        if (key === 'tmf_recurring_ignored_occurrences') return JSON.stringify(ignored);
        return null;
      },
    },
  });
  const render = () => renderToStaticMarkup(
    <RecurringTransactionsCard transactions={[]} categories={[]} currencySymbol="$" onQuickLogTransaction={() => {}} />
  );
  try {
    const currentMonth = currentMonthLocal();
    const initial = render();
    assert.match(initial, /Test subscription/);
    assert.match(initial, /Log Payment/);
    assert.match(initial, new RegExp(`aria-label="Ignore Test subscription for ${currentMonth}"`));
    assert.match(initial, /1 Monthly Bills/);
    assert.match(initial, /aria-label="Recurring bill controls"/);
    assert.match(initial, /aria-label="Recurring bill month"/);
    assert.match(initial, /aria-label="Calendar view" aria-pressed="true"/);
    assert.match(initial, /id="recurring-bill-calendar"/);
    assert.match(initial, /aria-label="Recurring items"/);
    assert.doesNotMatch(initial, /Active tracking based on transaction history/);
    assert.doesNotMatch(initial, /List View|Total Projected Outflow|Paid Outflows|Remaining Pending|Projected Inflows/);

    ignored = [`test_bill|${currentMonth}`];
    const skipped = render();
    assert.doesNotMatch(skipped, /Test subscription/);
    assert.match(skipped, /0 Monthly Bills/);
    assert.doesNotMatch(skipped, /Log Payment/);

    ignored = ['test_bill|2000-01'];
    const nextOccurrence = render();
    assert.match(nextOccurrence, /Test subscription/);
    assert.match(nextOccurrence, /1 Monthly Bills/);
    assert.match(nextOccurrence, /Log Payment/);
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
