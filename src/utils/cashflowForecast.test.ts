import assert from 'node:assert/strict';
import test from 'node:test';
import { Category, FinancialAccount, Transaction } from '../types/finance';
import { calculateCashflowForecast } from './cashflowForecast';

const accounts: FinancialAccount[] = [
  {
    id: 'bank',
    name: 'Bank',
    bankName: 'Example',
    type: 'Bank',
    accountNumberLast4: '1234',
    balance: 100_000,
  },
  {
    id: 'card',
    name: 'Credit card',
    bankName: 'Example',
    type: 'Credit Card',
    accountNumberLast4: '5678',
    balance: 10_000,
    creditLimit: 50_000,
  },
];

const transaction = (
  id: string,
  date: string,
  type: Transaction['type'],
  amount: number,
  title: string,
  category = 'General'
): Transaction => ({
  id,
  date,
  time: '12:00',
  type,
  amount,
  title,
  payeeOrPayer: title,
  category,
  subcategory: '',
  source: 'Manual',
});

test('projects available cash from non-recurring history and estimated recurring payments', () => {
  const history = [
    transaction('rent-1', '2026-09-01', 'debit', 20_000, 'Rent'),
    transaction('rent-2', '2026-10-01', 'debit', 20_000, 'Rent'),
    transaction('food-1', '2026-10-10', 'debit', 9_000, 'Groceries'),
    transaction('salary-1', '2026-09-28', 'credit', 80_000, 'Salary'),
    transaction('salary-2', '2026-10-28', 'credit', 80_000, 'Salary'),
  ];

  const forecast = calculateCashflowForecast(history, accounts, [], '2026-10-29');

  assert.ok(forecast);
  assert.equal(forecast.availableBalance, 100_000);
  assert.equal(forecast.recurringExpenses, 20_000);
  assert.equal(forecast.recurringIncome, 80_000);
  assert.equal(forecast.projectedBalance, 157_000);
  assert.equal(forecast.recurringPayments.length, 2);
  assert.equal(forecast.throughDate, '2026-11-27');
});

test('does not count credit-card balances as available cash', () => {
  const forecast = calculateCashflowForecast([], [accounts[1]], [], '2026-10-28');
  assert.ok(forecast);
  assert.equal(forecast.availableBalance, null);
  assert.equal(forecast.projectedBalance, null);
});

test('flags actual and run-rate budget overspending', () => {
  const categories: Category[] = [
    { id: 'food', name: 'Food', type: 'expense', iconName: 'Utensils', subcategories: [], budgetLimit: 10_000 },
    { id: 'travel', name: 'Travel', type: 'expense', iconName: 'Car', subcategories: [], budgetLimit: 10_000 },
  ];
  const history = [
    transaction('food-1', '2026-10-02', 'debit', 10_500, 'Market', 'Food'),
    transaction('travel-1', '2026-10-28', 'debit', 9_100, 'Taxi', 'Travel'),
  ];

  const forecast = calculateCashflowForecast(history, accounts, categories, '2026-10-28');

  assert.deepEqual(forecast?.overspendingCategories.map((item) => [item.category, item.status]), [
    ['Food', 'over'],
    ['Travel', 'at_risk'],
  ]);
});

test('reports material increases in recent spending', () => {
  const history = [
    transaction('previous', '2026-09-10', 'debit', 10_000, 'Previous purchase'),
    transaction('recent', '2026-10-10', 'debit', 13_000, 'Recent purchase'),
  ];

  const forecast = calculateCashflowForecast(history, accounts, [], '2026-10-28');

  assert.equal(forecast?.recentExpenseChangePercent, 30);
});

test('rejects invalid as-of dates and ignores malformed transaction dates', () => {
  assert.equal(calculateCashflowForecast([], accounts, [], '2026-02-30'), null);
  const forecast = calculateCashflowForecast(
    [transaction('bad-date', 'not-a-date', 'debit', 500, 'Unknown')],
    accounts,
    [],
    '2026-10-28'
  );
  assert.ok(forecast);
  assert.equal(forecast.historyCount, 0);
});
