import test from 'node:test';
import assert from 'node:assert/strict';
import type { AssistantReportInput } from './assistantReport';
import { createAssistantReport } from './assistantReport';
import { stringifyAssistantReportCsv } from './assistantReportCsv';
import { assistantReportInsights, assistantReportPrompt, resolveAssistantReportExplanation } from './assistantReportExplanation';
import { createAssistantReportPdf } from './assistantReportPdf';
import type { Transaction } from '../types/finance';

const transaction = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx',
  title: 'Payment',
  amount: 100,
  type: 'debit',
  category: 'Food',
  subcategory: 'General',
  date: '2026-10-10',
  time: '12:00',
  source: 'Manual',
  ...overrides,
});

const empty: AssistantReportInput = {
  month: '2026-10',
  asOfDate: '2026-11-24',
  transactions: [],
  categories: [],
  accounts: [],
  investments: [],
  loans: [],
  savingsGoals: [],
};

test('report uses operating cashflow and monthly budget calculations rather than all cash movements', () => {
  const report = createAssistantReport({
    ...empty,
    categories: [{ id: 'food', name: 'Food', type: 'expense', iconName: 'Tag', subcategories: ['General'], budgetLimit: 200 }],
    transactions: [
      transaction({ amount: 150 }),
      transaction({ id: 'refund', amount: 25, type: 'credit', title: 'Refund' }),
      transaction({ id: 'salary', amount: 500, type: 'credit', category: 'Salary' }),
      transaction({ id: 'transfer', amount: 999, kind: 'transfer' }),
      transaction({ id: 'other-month', amount: 999, date: '2026-09-30' }),
      transaction({ id: 'invalid-date', amount: 999, date: '2026-10-99' }),
    ],
  });
  assert.equal(report.transactionCount, 4);
  assert.equal(report.operatingIncome, 500);
  assert.equal(report.operatingExpense, 125);
  assert.deepEqual(report.categorySpending, [{ category: 'Food', amount: 125 }]);
  assert.equal(report.budgets[0].spent, 125);
  assert.ok(report.limitations.some(item => item.includes('invalid dates')));
});

test('report labels current snapshots and acknowledges absent and possibly incomplete data', () => {
  const report = createAssistantReport({
    ...empty,
    accounts: [{ id: 'a', name: 'Bank', bankName: 'Bank', type: 'Bank', accountNumberLast4: '1234', balance: 42 }],
    savingsGoals: [{ id: 'g', title: 'Goal', targetAmount: 100, savedAmount: 25, createdAt: '2026-01-01' }],
  });
  assert.deepEqual(report.accounts, [{ name: 'Bank', type: 'Bank', balance: 42 }]);
  assert.equal(report.savingsGoals[0].progress, 25);
  assert.ok(report.limitations.some(item => item.includes('2026-11-24') && item.includes('not historical')));
  assert.ok(report.limitations.some(item => item.includes('may be incomplete')));
  assert.ok(report.limitations.some(item => item.includes('No transactions')));
  assert.ok(report.limitations.some(item => item.includes('No investments')));
});

test('report rejects invalid months and snapshot dates', () => {
  assert.throws(() => createAssistantReport({ ...empty, month: '2026-13' }), /valid report month/);
  assert.throws(() => createAssistantReport({ ...empty, asOfDate: '2026-02-30' }), /valid snapshot date/);
  assert.throws(() => createAssistantReport({ ...empty, transactions: [transaction({ amount: NaN })] }), /invalid amount/);
  assert.throws(() => createAssistantReport({ ...empty, savingsGoals: [
    { id: 'g', title: 'Goal', targetAmount: 0, savedAmount: 0, createdAt: '2026-01-01' },
  ] }), /invalid amount/);
});

test('CSV export includes the period, limitations and snapshots and neutralizes spreadsheet formulas', () => {
  const report = createAssistantReport({
    ...empty,
    accounts: [{ id: 'a', name: '=2+2', bankName: 'Bank', type: 'Bank', accountNumberLast4: '1234', balance: 42 }],
  });
  const csv = stringifyAssistantReportCsv(report, 'INR', 'Summary, not verified');
  assert.match(csv, /Account balance,'=2\+2 \(Bank\),42,As of 2026-11-24/);
  assert.match(csv, /Cashflow,Operating income,0,2026-10/);
  assert.match(csv, /Limitations/);
  assert.match(csv, /"Summary, not verified"/);
});

test('AI report explanations can only select findings verified by the report', () => {
  const report = createAssistantReport({
    ...empty,
    categories: [{ id: 'food', name: 'Food', type: 'expense', iconName: 'Tag', subcategories: ['General'], budgetLimit: 50 }],
    transactions: [transaction({ amount: 100 })],
  });
  const insights = assistantReportInsights(report);
  assert.deepEqual(insights.map(item => item.id), ['spending-higher', 'category-breakdown', 'budget-exceeded', 'data-limits']);
  assert.match(assistantReportPrompt(insights), /spending-higher/);
  const explanation = resolveAssistantReportExplanation('["budget-exceeded","spending-higher"]', insights);
  assert.match(explanation, /budget was exceeded/);
  assert.match(explanation, /spending exceeded operating income/);
  const fenced = resolveAssistantReportExplanation('```json\n[{"id":"budget-exceeded","text":"Invented total: 999"}]\n```', insights);
  assert.match(fenced, /budget was exceeded/);
  assert.doesNotMatch(fenced, /999/);
  for (const output of ['not json', '[]', '["income-higher"]', '["spending-higher","spending-higher"]',
    '["spending-higher","category-breakdown","budget-exceeded","data-limits"]', '["The total is 999"]',
    '[{"id":"budget-exceeded","extra":true}]', 'The answer is ["budget-exceeded"]']) {
    assert.throws(() => resolveAssistantReportExplanation(output, insights), /invalid|unverified/);
  }
});

test('report insight options reflect empty data and non-exceeded budgets', () => {
  const emptyInsights = assistantReportInsights(createAssistantReport(empty));
  assert.deepEqual(emptyInsights.map(item => item.id), ['no-transactions', 'data-limits']);
  const report = createAssistantReport({
    ...empty,
    categories: [{ id: 'food', name: 'Food', type: 'expense', iconName: 'Tag', subcategories: ['General'], budgetLimit: 200 }],
    transactions: [transaction({ amount: 25 }), transaction({ id: 'pay', amount: 100, type: 'credit', category: 'Salary' })],
  });
  assert.deepEqual(assistantReportInsights(report).map(item => item.id),
    ['income-higher', 'category-breakdown', 'budget-within', 'data-limits']);
});

test('PDF export reports an unsupported canvas instead of returning a file', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  try {
    Object.defineProperty(globalThis, 'document', {
      configurable: true, value: { createElement: () => ({ getContext: () => null }) },
    });
    await assert.rejects(createAssistantReportPdf(createAssistantReport(empty), 'INR', ''), /cannot render/);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
