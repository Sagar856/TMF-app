import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BottomNav } from './BottomNav';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

Object.defineProperty(globalThis, '__APP_VERSION__', {
  configurable: true,
  value: 'test',
});

test('mobile navigation announces its current page and pending counts', () => {
  const markup = renderToStaticMarkup(
    <BottomNav
      activeTab="settings"
      setActiveTab={() => {}}
      pendingNotificationsCount={3}
      pendingEmiCount={2}
    />
  );

  assert.match(markup, /aria-label="Mobile Navigation"/);
  assert.match(markup, /aria-label="Settings, 3 pending notifications"/);
  assert.match(markup, /id="nav-btn-settings"[^>]*aria-current="page"/);
  assert.match(markup, /aria-label="Loans, 2 pending EMI confirmations"/);
});

test('desktop navigation exposes the primary landmark and selected page', () => {
  const markup = renderToStaticMarkup(
    <Sidebar
      activeTab="transactions"
      setActiveTab={() => {}}
      pendingNotificationsCount={0}
      currencySymbol="$"
    />
  );

  assert.match(markup, /aria-label="Primary navigation"/);
  assert.match(markup, />MINARTH<\/h1>/);
  assert.match(markup, /src="\.\/icons\/minarth.svg"[^>]*alt=""/);
  assert.match(markup, /id="sidebar-btn-transactions"[^>]*aria-current="page"/);
  assert.match(markup, /id="sidebar-btn-dashboard"/);
  assert.doesNotMatch(markup, /Test Auto-Interceptor|sidebar-btn-customisations|Backend Sync/);
});

test('header icon controls have explicit accessible names', () => {
  const markup = renderToStaticMarkup(
    <Header
      userName="Test User"
      pendingNotificationsCount={2}
      pendingEmiCount={1}
      onOpenNotifications={() => {}}
      onOpenEmiConfirmations={() => {}}
      onOpenProfile={() => {}}
      currencySymbol="$"
      theme="dark"
      onToggleTheme={() => {}}
    />
  );

  assert.match(markup, /aria-label="Switch to light mode"/);
  assert.match(markup, /MINARTH/);
  assert.match(markup, /src="\.\/icons\/minarth.svg"[^>]*alt=""/);
  assert.doesNotMatch(markup, /Simulate SMS/);
  assert.match(markup, /aria-label="1 pending loan EMI payment awaiting confirmation"/);
  assert.match(markup, /aria-label="Pending payment confirmations, 2 notifications"/);
  assert.match(markup, /aria-label="Open profile for Test User"/);
});
