import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CarouselSectionState } from '../hooks/useScrollCarouselGroup';
import { BudgetThresholdMonitor } from './BudgetThresholdMonitor';
import { RecurringTransactionsCard } from './RecurringTransactionsCard';
import { SevenDaySpendingTrendChart } from './SevenDaySpendingTrendChart';
import { CashflowTrendLineChart } from './CashflowTrendLineChart';
import { DashboardView } from './DashboardView';
import { readFileSync } from 'node:fs';

test('dashboard glass panels reflect expansion independently of scroll focus', () => {
  for (const isExpanded of [false, true]) {
    const carouselState: CarouselSectionState = {
      progress: isExpanded ? 1 : 0,
      contentHeight: 500,
      isExpanded,
      isFocused: false,
      chevronRotation: isExpanded ? 180 : 0,
      buttonLabel: isExpanded ? 'COLLAPSE' : 'EXPAND',
      bodyStyle: { height: isExpanded ? 500 : 0, overflow: 'hidden' },
    };
    const panels = [
      <BudgetThresholdMonitor transactions={[]} categories={[]} currencySymbol="$" carouselState={carouselState} />,
      <RecurringTransactionsCard transactions={[]} categories={[]} currencySymbol="$" carouselState={carouselState} />,
      <SevenDaySpendingTrendChart transactions={[]} currencySymbol="$" carouselState={carouselState} />,
    ];
    for (const panel of panels) {
      const markup = renderToStaticMarkup(panel);
      assert.match(markup, new RegExp(`data-glass-expanded="${isExpanded}"`));
      assert.match(markup, new RegExp(`>${carouselState.buttonLabel}</span>`));
    }
  }
});

test('cash-flow chart keeps both series and timeframe controls with theme-aware colors', () => {
  const markup = renderToStaticMarkup(
    <CashflowTrendLineChart transactions={[]} currencySymbol="$" />
  );
  assert.match(markup, /aria-pressed="false"[^>]*>WEEK<\/button>/);
  assert.match(markup, /aria-pressed="true"[^>]*>MONTH<\/button>/);
  assert.match(markup, /Debit \(Expenses\)/);
  assert.match(markup, /Credit \(Income\)/);
  assert.match(markup, /stroke="var\(--glass-chart-accent\)"/);
  assert.match(markup, /stroke="var\(--glass-chart-credit\)"/);
  assert.match(markup, /stop-color="var\(--glass-chart-accent\)"/);
});

test('responsive dashboard retains every panel and the original mobile order', () => {
  const markup = renderToStaticMarkup(
    <DashboardView
      transactions={[]} categories={[]} investments={[]} loans={[]} accounts={[]}
      savingsGoals={[]} onSavingsGoalsChange={() => {}} pendingNotifications={[]}
      onOpenNotifications={() => {}} onOpenAddTransaction={() => {}}
      currencySymbol="$"
    />
  );
  const panels = ['cashflow', 'budget', 'forecast', 'goals', 'recurring', 'trend', 'categories', 'rankings'];
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  for (const [index, panel] of panels.entries()) {
    assert.equal(markup.split(`dashboard-panel-${panel}`).length - 1, 1);
    assert.ok(css.includes(`.dashboard-panel-${panel} { order: ${index + 1}; }`),
      `${panel} must retain its mobile visual order`);
  }
  assert.equal(markup.split('class="dashboard-column"').length - 1, 2);
  for (const title of [
    'Cash Flow Trend Trajectory', '30-day cash-flow forecast', 'Savings goals',
    'Monitor Budget', 'Recurring', '7-Day',
  ]) {
    assert.ok(markup.toLowerCase().includes(title.toLowerCase()), `${title} must remain available`);
  }
});
