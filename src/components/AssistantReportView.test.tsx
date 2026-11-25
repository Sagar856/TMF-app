import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantReportView } from './AssistantReportView';
import { createAssistantReport } from '../utils/assistantReport';

test('report presentation labels the period, snapshots, limitations and verified figures', () => {
  const report = createAssistantReport({
    month: '2026-10', asOfDate: '2026-11-24',
    transactions: [{
      id: 'tx', title: 'Example', amount: 25, type: 'debit', category: 'Food',
      subcategory: 'General', date: '2026-10-10', time: '12:00', source: 'Manual',
    }],
    categories: [{ id: 'food', name: 'Food', type: 'expense', iconName: 'Tag', subcategories: ['General'], budgetLimit: 100 }],
    accounts: [{ id: 'a', name: '<Bank>', bankName: 'Bank', type: 'Bank', accountNumberLast4: '1234', balance: 42 }],
    investments: [], loans: [], savingsGoals: [],
  });
  const html = renderToStaticMarkup(<AssistantReportView report={report} currencyCode="USD"
    explanation="A verified finding." onExportCsv={() => {}} onExportPdf={() => {}} />);
  assert.match(html, /Financial report: 2026-10/);
  assert.match(html, /current snapshots as of 2026-11-24/);
  assert.match(html, /Net operating spending<\/dt><dd>USD 25\.00/);
  assert.match(html, /USD 25\.00 \/ USD 100\.00/);
  assert.match(html, /&lt;Bank&gt;/);
  assert.match(html, /A verified finding/);
  assert.match(html, /No investments are recorded/);
  assert.match(html, /Export CSV/);
  assert.match(html, /Export PDF/);
});
