import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvestmentsView } from './InvestmentsView';
import type { InvestmentRecord, UserSettings } from '../types/finance';

const settings: UserSettings = {
  userName: 'Test', userEmail: 'test@example.com', currencySymbol: '$', currencyCode: 'USD',
  passcodeEnabled: false, locationTracking: false, autoExtractSms: false, notificationsEnabled: false,
};
const fund: InvestmentRecord = {
  id: 'fund', type: 'Mutual Funds', name: 'Test Growth Fund', amountInvested: 100,
  currentValue: 120, returnsPercent: 20, date: '2026-01-01', status: 'active',
  units: 10, currentNav: 12, dematAccount: 'Broker',
  monthlyContributions: [],
};

test('holdings start collapsed with the summary visible and the old action row removed', () => {
  const markup = renderToStaticMarkup(
    <InvestmentsView investments={[fund]} currencySymbol="$" settings={settings}
      onUpdateSettings={() => {}} onAddInvestment={() => {}} onRefreshMarketData={async () => {}} />
  );
  assert.match(markup, /aria-expanded="false" aria-controls="holding-details-fund"/);
  assert.match(markup, /Test Growth Fund/);
  assert.match(markup, /Broker/);
  assert.match(markup, /20% Returns/);
  assert.doesNotMatch(markup, /Cost Basis|Units Held|Current NAV|title="Edit"/);
  assert.doesNotMatch(markup, /Real-time tracking|Manage Demat Accounts &amp; Import/);
  assert.match(markup, /Last data updated:/);
  assert.match(markup, /aria-label="Market data information"/);
  assert.match(markup, /Potential next refresh:/);
  assert.doesNotMatch(markup, /select an AMFI scheme using Edit/);
});

test('market refresh shows its busy and failure state without claiming newer prices', () => {
  const markup = renderToStaticMarkup(
    <InvestmentsView investments={[]} currencySymbol="$" settings={settings}
      onUpdateSettings={() => {}} onAddInvestment={() => {}} marketRefreshing
      marketRefreshMessage="Some sources could not be refreshed." onRefreshMarketData={async () => {}} />
  );
  assert.match(markup, /disabled=""[^>]*>[\s\S]*?Refreshing\.\.\./);
  assert.match(markup, /role="alert"[^>]*>Some sources could not be refreshed. See info./);
  assert.match(markup, /Not available yet/);
});
