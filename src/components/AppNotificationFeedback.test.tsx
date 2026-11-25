import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf('  const persistPaymentTransaction =');
const end = source.indexOf('\n  const historyTransaction =', start);
assert.ok(start >= 0 && end > start);
const handlers = transformSync(`${source.slice(start, end)}\n({ handleConfirmAddNotification, handleIgnoreNotification });`, { loader: 'tsx' }).code;

function harness(failingKey?: string) {
  const notification = { id: 'payment', type: 'debit', category: 'Food' };
  const messages: { message: string; type: string }[] = [];
  const state = {
    transactions: [], accounts: [], categories: [], pendingNotifications: [notification],
    authUser: { id: 'owner' }, financialEpoch: 1,
    safeSetItem: (key: string) => key !== failingKey,
    safeGetItem: () => 'owner',
    readFinancialEpoch: () => 1,
    persistFinancialState: () => failingKey !== 'tmf_financial_state',
    showToast: (message: string, type: string) => messages.push({ message, type }),
    hasUnmatchedPaymentAccount: () => false,
    applyNotificationCategoryOverride: (value: typeof notification) => value,
    createPaymentTransaction: () => ({ transaction: { id: 'tx_payment', category: 'Food' }, accounts: [], categories: state.categories }),
    recordExtractedHistory: () => {}, queueNotificationResolution: () => {},
    resolveInterceptedPayment: async () => {}, setCategories: () => {}, setAccounts: () => {},
    setTransactions: () => {}, setPendingNotifications: () => {}, setIsNotificationModalOpen: () => {},
  };
  const actions = runInNewContext(handlers, state) as {
    handleConfirmAddNotification: (value: typeof notification) => void;
    handleIgnoreNotification: (id: string) => void;
  };
  return { actions, messages, notification };
}

test('notification add confirms local persistence only and reports write failures', () => {
  const success = harness();
  success.actions.handleConfirmAddNotification(success.notification);
  assert.match(success.messages[0].message, /added on this device.*Cloud sync is separate/i);
  for (const key of ['tmf_financial_state']) {
    const failure = harness(key);
    failure.actions.handleConfirmAddNotification(failure.notification);
    assert.equal(failure.messages[0].type, 'error');
    assert.doesNotMatch(failure.messages[0].message, /added/i);
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
