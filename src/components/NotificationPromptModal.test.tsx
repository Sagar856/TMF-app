import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotificationPromptModal } from './NotificationPromptModal';
import type { ParsedNotification } from '../types/finance';

test('payment review displays inline descriptions and honest missing-location labels', () => {
  const payment: ParsedNotification = {
    id: 'native_test', rawText: 'INR 500 debited', amount: 500, payeeOrPayer: 'Test merchant',
    description: 'Lunch & snacks <test>', type: 'debit', date: '2026-11-05', time: '12:00',
    category: 'Food', subcategory: 'Dining', appSource: 'Axis Bank', status: 'pending',
  };
  const render = (notification: ParsedNotification) => renderToStaticMarkup(
    <NotificationPromptModal notifications={[notification]} currencySymbol="INR"
      onConfirmAdd={() => {}} onConfirmEdit={() => {}} onIgnore={() => {}} onClose={() => {}} />,
  );
  const missing = render(payment);
  assert.match(missing, /Lunch &amp; snacks &lt;test&gt;/);
  assert.match(missing, /Test merchant/);
  assert.match(missing, /aria-label="Notification history"/);
  assert.match(missing, /Change category/);
  assert.match(missing, /Location not captured/);
  assert.doesNotMatch(missing, /undefined/);
  const unnamed = render({ ...payment, location: { lat: 19, lng: 72, name: '' } });
  assert.match(unnamed, /Location name unavailable/);
  assert.doesNotMatch(unnamed, /19\.0000/);
  assert.match(render({ ...payment, location: { lat: 19, lng: 72, name: 'Bandra West, Mumbai' } }),
    /Bandra West, Mumbai/);
});

test('notification history is accessible from the empty notifications screen', () => {
  const markup = renderToStaticMarkup(
    <NotificationPromptModal notifications={[]} currencySymbol="INR"
      onConfirmAdd={() => {}} onConfirmEdit={() => {}} onIgnore={() => {}} onClose={() => {}} />
  );
  assert.equal(markup.split('aria-label="Notification history"').length - 1, 1);
  assert.match(markup, /No Pending Notifications/);
});
