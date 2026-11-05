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

test('desktop finance metrics share horizontal glass styling without changing mobile decks', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const desktop = css.slice(css.lastIndexOf('@media (min-width: 1024px)'));
  assert.match(desktop, /\.finance-kpi-stack\s*\{[^}]*display: grid;[^}]*grid-auto-flow: column;[^}]*grid-auto-columns: minmax\(0, 1fr\)/);
  assert.match(desktop, /:is\(\.finance-kpi-stack, \.dashboard-glass \.dashboard-kpi-stack\) > div \{[^}]*margin-block: 0 !important;[^}]*scale: 1 !important;[^}]*background: var\(--dashboard-panel-background\) !important;/);
  assert.match(desktop, /:is\(\.finance-kpi-stack, \.dashboard-kpi-stack\) > div > \* \{[^}]*visibility: visible;/);
  assert.match(desktop, /:is\(\.finance-kpi-stack, \.dashboard-glass \.dashboard-kpi-stack\) > div:first-child \{[^}]*background: var\(--glass-feature-background\)/);
  assert.match(desktop, /\.finance-budget-summary > div,[^}]*\.finance-budget-row,[^}]*background: var\(--dashboard-inset-background\)/);
  for (const page of ['Transactions', 'Accounts', 'Investments', 'Loans']) {
    const source = readFileSync(new URL(`./${page}View.tsx`, import.meta.url), 'utf8');
    assert.match(source, /finance-kpi-stack/);
    assert.match(source, /kpi-stack space-y-\[-50px\]/, `${page} must retain its mobile deck`);
    assert.match(source, /className="[^"]*lg:hidden"[\s]*title=\{isKpiStacked/, `${page} only stacks metrics on mobile`);
  }
});

test('expanded finance metrics use palette-aware glass in both themes without altering collapsed decks', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const expanded = /\.app-viewport main \.finance-kpi-stack:not\(\.kpi-stack\) > div,\s*\.dark \.app-viewport main \.finance-kpi-stack > div \{([^}]+)\}/.exec(css);
  assert.ok(expanded, 'Expanded glass must not depend on dark mode');
  for (const property of [
    'background: var(--dashboard-panel-background) !important',
    'border: 1px solid var(--dashboard-glass-edge) !important',
    'box-shadow: var(--dashboard-panel-shadow) !important',
    'backdrop-filter: blur(18px) saturate(125%) !important',
  ]) assert.ok(expanded[1].includes(property));
  assert.doesNotMatch(expanded[1], /visibility:|margin:|transform:|display:/, 'Deck layout and behavior must stay unchanged');
  assert.match(css, /\.finance-kpi-stack:not\(\.kpi-stack\) > div:first-child,[^{]+\{[^}]*background: var\(--glass-feature-background\) !important/);
});
