import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { notificationCategoryConfirmation } from '../utils/notificationCategoryFeedback';

const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf('  const persistPaymentTransaction =');
const end = source.indexOf('\n  const historyTransaction =', start);
assert.ok(start >= 0 && end > start);
const handlers = transformSync(`${source.slice(start, end)}\n({ handleConfirmAddNotification, handleIgnoreNotification });`, { loader: 'tsx' }).code;

function harness(failingKey?: string) {
  const notification = { id: 'payment', type: 'debit', category: 'Food' };
  const messages: { message: string; type: string }[] = [];
  const refs: { current: unknown }[] = [];
  let writes = 0;
  const state = {
    transactions: [], accounts: [], categories: [], pendingNotifications: [notification],
    authUser: { id: 'owner' }, financialEpoch: 1,
    safeSetItem: (key: string) => key !== failingKey,
    safeGetItem: () => 'owner',
    readFinancialEpoch: () => 1,
    persistFinancialState: () => { writes++; return failingKey !== 'tmf_financial_state'; },
    showToast: (message: string, type: string) => messages.push({ message, type }),
    hasUnmatchedPaymentAccount: () => false,
    applyNotificationCategoryOverride: (value: typeof notification) => value,
    categorizeNotification: async (value: typeof notification) => value,
    notificationCategoryReviewText: () => undefined,
    enqueueCategoryJob: () => {},
    notificationCategoryConfirmation, settings: { currencySymbol: 'INR ' },
    cloudGenerationRef: { current: 1 }, isUnlocked: true,
    useRef: (current: unknown) => { const ref = { current }; refs.push(ref); return ref; },
    createPaymentTransaction: (value = notification) => ({ transaction: { id: `tx_${value.id}`, amount: 125, category: 'Food' }, accounts: [], categories: state.categories }),
    recordExtractedHistory: () => {}, queueNotificationResolution: () => {},
    resolveInterceptedPayment: async () => {}, setCategories: () => {}, setAccounts: () => {},
    setTransactions: () => {}, setPendingNotifications: () => {}, setIsNotificationModalOpen: () => {},
  };
  const actions = runInNewContext(handlers, state) as {
    handleConfirmAddNotification: (value: typeof notification) => Promise<void>;
    handleIgnoreNotification: (id: string) => void;
  };
  return { actions, messages, notification, state, refs, writes: () => writes };
}

test('notification add confirms local persistence and the amount/category, and reports write failures', async () => {
  const success = harness();
  await success.actions.handleConfirmAddNotification(success.notification);
  assert.match(success.messages[0].message, /added on this device.*Cloud sync is separate/i);
  assert.match(success.messages[0].message, /INR 125.00 transaction moved under Food/);
  for (const key of ['tmf_financial_state']) {
    const failure = harness(key);
    await failure.actions.handleConfirmAddNotification(failure.notification);
    assert.equal(failure.messages[0].type, 'error');
    assert.doesNotMatch(failure.messages[0].message, /added/i);
  }
});

test('notification categorisation suppresses duplicate Add and discards results after an edit or account change', async () => {
  for (const change of ['none', 'edit', 'account']) {
    const h = harness();
    let finish!: (value: typeof h.notification) => void;
    let calls = 0;
    h.state.categorizeNotification = () => {
      calls++;
      return new Promise(resolve => { finish = resolve; });
    };
    const saving = h.actions.handleConfirmAddNotification(h.notification);
    await h.actions.handleConfirmAddNotification(h.notification);
    assert.equal(calls, 1);
    assert.equal(h.writes(), 0);
    if (change === 'edit') {
      const current = h.refs[0].current as { transactions: unknown[] };
      h.refs[0].current = { ...current, transactions: [{ id: 'new-edit' }] };
    }
    if (change === 'account') h.state.cloudGenerationRef.current++;
    finish(h.notification);
    await saving;
    assert.equal(h.writes(), change === 'none' ? 1 : 0);
    if (change === 'edit') assert.match(h.messages[0].message, /changed during categorisation/);
    if (change === 'account') assert.equal(h.messages.length, 0);
  }
});

test('notification ignore confirms only after local queue persistence', () => {
  const success = harness();
  success.actions.handleIgnoreNotification('payment');
  assert.match(success.messages[0].message, /ignored on this device/i);
  const failure = harness('tmf_pending_notifications');
  failure.actions.handleIgnoreNotification('payment');
  assert.equal(failure.messages[0].type, 'error');
  assert.doesNotMatch(failure.messages[0].message, /ignored on this device/i);
});

test('notification Adds before a rerender preserve prior saves and recognise already-saved payments', async () => {
  const h = harness();
  await h.actions.handleConfirmAddNotification(h.notification);
  await h.actions.handleConfirmAddNotification({ ...h.notification, id: 'second' });
  const current = h.refs[0].current as { transactions: { id: string }[] };
  assert.deepEqual(Array.from(current.transactions, transaction => transaction.id), ['tx_second', 'tx_payment']);
  assert.equal(h.writes(), 2);
  await h.actions.handleConfirmAddNotification(h.notification);
  assert.equal(h.writes(), 2);
  assert.match(h.messages.at(-1)?.message || '', /already added/);
});

test('unmatched input is handed off durably before payment persistence and does not block a successful Add', async () => {
  const h = harness();
  const order: string[] = [];
  h.state.notificationCategoryReviewText = () => 'commuting costs';
  h.state.enqueueCategoryJob = () => { order.push('queue'); };
  h.state.persistFinancialState = () => { order.push('save'); return true; };
  await h.actions.handleConfirmAddNotification(h.notification);
  assert.deepEqual(order, ['queue', 'save']);
  assert.match(h.messages[0].message, /Category review queued/);
  const failure = harness();
  failure.state.notificationCategoryReviewText = () => 'unmatched input';
  failure.state.enqueueCategoryJob = () => { throw new Error('Could not retain category review'); };
  await failure.actions.handleConfirmAddNotification(failure.notification);
  assert.equal(failure.writes(), 0);
  assert.equal(failure.messages[0].type, 'error');
});
