import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { NotificationHistoryList, NotificationPromptModal } from './NotificationPromptModal';
import type { ParsedNotification } from '../types/finance';

function addHarness(confirm: () => Promise<void>) {
  const source = readFileSync(new URL('./NotificationPromptModal.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const addPayment =');
  const end = source.indexOf('  const historyButton =', start);
  assert.ok(start >= 0 && end > start);
  const busy: boolean[] = [];
  const errors: string[] = [];
  const handler = transformSync(`${source.slice(start, end)}\naddPayment;`, { loader: 'tsx' }).code;
  const add = runInNewContext(handler, {
    addInFlight: { current: false },
    setAdding: (value: boolean) => busy.push(value),
    setAddError: (value: string) => errors.push(value),
    onConfirmAdd: confirm,
  }) as (notification: unknown) => Promise<void>;
  return { add, busy, errors };
}

test('notification Add remains busy until save completes and suppresses rapid repeated clicks', async () => {
  let finish!: () => void;
  let calls = 0;
  const h = addHarness(() => {
    calls++;
    return new Promise<void>(resolve => { finish = resolve; });
  });
  const saving = h.add({ id: 'synthetic-payment' });
  await h.add({ id: 'synthetic-payment' });
  assert.equal(calls, 1);
  assert.deepEqual(h.busy, [true]);
  finish();
  await saving;
  assert.deepEqual(h.busy, [true, false]);
  assert.deepEqual(h.errors, ['']);
});

test('notification Add surfaces unexpected failure without private error text and permits retry', async () => {
  let calls = 0;
  const h = addHarness(async () => {
    if (++calls === 1) throw new Error('Synthetic private payment detail');
  });
  await h.add({});
  assert.match(h.errors[1], /Could not add this payment/);
  assert.doesNotMatch(h.errors[1], /private payment/);
  assert.deepEqual(h.busy, [true, false]);
  await h.add({});
  assert.equal(calls, 2);
  assert.equal(h.errors.at(-1), '');
  assert.deepEqual(h.busy, [true, false, true, false]);
});

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

test('history displays at most 50 entries and pending transactions can be edited', () => {
  const history = Array.from({ length: 51 }, (_, index) => ({
    id: `entry-${index}`, title: `Entry ${index}`, message: 'Payment',
    kind: 'extracted' as const, timestamp: 1000, status: (index === 0 ? 'pending' : 'added') as 'pending' | 'added',
  }));
  const markup = renderToStaticMarkup(<NotificationHistoryList history={history}
    canEditHistory={entry => entry.id === 'entry-0'} onEditHistory={() => {}} />);
  assert.equal((markup.match(/<article/g) || []).length, 50);
  assert.match(markup, /Entry 0/);
  assert.doesNotMatch(markup, /Entry 50/);
  assert.equal((markup.match(/aria-label="Edit transaction:/g) || []).length, 1);
  assert.match(markup, /text-green-600 dark:text-green-400">added/);
});

test('added history entries open their transaction and never show an edit action', () => {
  const history = [{ id: 'added', title: 'Payment', message: '', kind: 'extracted' as const, timestamp: 1000, status: 'added' as const }];
  const markup = renderToStaticMarkup(<NotificationHistoryList history={history}
    canEditHistory={() => true} onEditHistory={() => {}}
    canOpenHistoryTransaction={() => true} onOpenHistoryTransaction={() => {}} />);
  assert.match(markup, /role="button" tabindex="0" aria-label="Open transaction: Payment"/);
  assert.doesNotMatch(markup, /aria-label="Edit transaction:/);
});

test('history distinguishes ignored entries in red and shows an accessible pencil', () => {
  const history = [{ id: 'ignored', title: 'Payment', message: '', kind: 'extracted' as const, timestamp: 1000, status: 'ignored' as const }];
  const markup = renderToStaticMarkup(<NotificationHistoryList history={history} canEditHistory={() => true} onEditHistory={() => {}} />);
  assert.match(markup, /text-red-600 dark:text-red-400">ignored/);
  assert.match(markup, /aria-label="Edit transaction: Payment"/);
  assert.match(markup, /lucide-pencil|lucide-edit-3/);
});

test('unmatched account displays its separate account review actions', () => {
  const payment: ParsedNotification = {
    id: 'native_payment', rawText: 'A/c XX1234 debited INR 50', amount: 50, payeeOrPayer: 'Merchant',
    type: 'debit', date: '2026-11-05', time: '12:00', category: 'Food',
    subcategory: 'General', appSource: 'Bank', status: 'pending', accountLast4: '1234',
  };
  const markup = renderToStaticMarkup(<NotificationPromptModal notifications={[payment]} currencySymbol="INR"
    onConfirmAdd={() => {}} onConfirmEdit={() => {}} onIgnore={() => {}} onClose={() => {}}
    hasUnmatchedAccount={() => true} showAccountSuggestion={() => true}
    onManageAccounts={() => {}} onAddDetectedAccount={() => {}} onIgnoreDetectedAccount={() => {}} />);
  assert.match(markup, /Account ending 1234/);
  assert.match(markup, />Add \/ edit account details</);
  assert.match(markup, />Ignore account suggestion</);
});
