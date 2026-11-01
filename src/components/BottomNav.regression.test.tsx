import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BottomNav } from './BottomNav';

test('glass dock preserves all destinations, active state and notification badges', () => {
  const markup = renderToStaticMarkup(
    <BottomNav activeTab="loans" setActiveTab={() => {}}
      pendingEmiCount={12} pendingNotificationsCount={3} />
  );
  assert.match(markup, /glass-nav-track/);
  assert.match(markup, /glass-nav-active/);
  for (const tab of ['dashboard', 'transactions', 'accounts', 'investments', 'loans', 'settings']) {
    assert.match(markup, new RegExp(`id="nav-btn-${tab}"`));
  }
  assert.match(markup, /id="nav-btn-loans"[^>]*aria-current="page"/);
  assert.match(markup, /Loans, 12 pending EMI confirmations/);
  assert.match(markup, /Settings, 3 pending notifications/);
  assert.match(markup, />9\+<\/span>/);
  assert.doesNotMatch(markup, /activeBottomTabIndicator/);
});
