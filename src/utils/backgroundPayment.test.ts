import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { createPaymentTransaction, adjustPaymentAccountBalance, applyNotificationCategoryOverride, applyNotificationEditOnce, hasUnmatchedPaymentAccount } from './paymentTransaction';
import { parseNotification } from '../services/notification/ParserManager';
import { isEligiblePaymentNotification } from '../services/notification/transactionEligibility';
import { toLocalISODate } from './dates';
import type { Category, FinancialAccount, ParsedNotification, Transaction } from '../types/finance';
import { isFinancialAccount, isTransaction } from './backup';
import { reconcileSavedPayments } from './savedPaymentReconciliation';
import { createCashAccount, isCashWithdrawal } from './cashAccount';
import type { InterceptedPayment } from '../services/notificationListener';
import { parseTransactionSyncRevisions } from './transactionSync';
import { categorizeNotification } from '../services/notificationCategorization';
import { notificationCategoryConfirmation } from './notificationCategoryFeedback';

const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
before(() => Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, value: { getItem: () => null },
}));
after(() => {
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

const source = readFileSync(new URL('../services/backgroundPayment.ts', import.meta.url), 'utf8');
const backgroundSql = readFileSync(new URL('../../supabase_background_payments.sql', import.meta.url), 'utf8');
const start = source.indexOf('async function savePayment(');
const end = source.indexOf('\nif (window.PaymentBackground)', start);
assert.ok(start >= 0 && end > start);
const save = transformSync(source.slice(start, end) + '\nsavePayment(bridge);', { loader: 'ts' }).code;
const bank: FinancialAccount = {
  id: 'bank', name: 'HDFC', bankName: 'HDFC', type: 'Bank', accountNumberLast4: '4411', balance: 5000, isDefault: true,
};

test('background payment RPC uses the guarded transaction-write path and keeps duplicate inserts idempotent', () => {
  const start = backgroundSql.indexOf('CREATE OR REPLACE FUNCTION public.add_notification_payment');
  const end = backgroundSql.indexOf('REVOKE ALL ON FUNCTION public.add_notification_payment', start);
  assert.ok(start >= 0 && end > start);
  const functionSql = backgroundSql.slice(start, end);
  assert.match(functionSql, /set_config\('tmf\.transaction_write', 'allowed', true\)/);
  assert.match(functionSql, /ON CONFLICT \(user_id, id\) DO NOTHING/);
});
const payment = {
  id: 'payment-1', owner: 'user-1', packageName: 'com.google.android.apps.messaging',
  title: 'HDFC Bank', text: 'Rs 1,500 debited from a/c XX4411 to Big Bazaar ref 12345678',
  postedAt: new Date(2026, 10, 1, 14, 35).getTime(), action: 'saving',
  description: 'Weekly groceries', location: { lat: 18.5, lng: 73.8, name: 'Pune' },
};

function harness() {
  const transactions: Transaction[] = [];
  const accounts = [{ ...bank }];
  const completed: { transaction?: Transaction; duplicate?: boolean; account?: FinancialAccount; confirmation?: string }[] = [];
  let calls = 0;
  const state = {
    bridge: {
      input: () => JSON.stringify(payment),
      locationName: () => 'Pune',
      complete: (result: string) => { completed.push(JSON.parse(result)); return true; },
    },
    navigator: { locks: { request: async (_name: string, work: () => Promise<void>) => work() } },
    localStorage: {
      getItem: (key: string) => key === 'tmf_cache_owner' ? 'user-1' : key === 'tmf_accounts' ? JSON.stringify([bank]) : null,
    },
    getSupabaseClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1', email_confirmed_at: 'confirmed' } }, error: null }) },
      rpc: async (_name: string, args: { payment: Transaction; expected_user: string }) => {
        calls++;
        assert.equal(args.expected_user, 'user-1');
        if (!transactions.some(value => value.id === args.payment.id)) {
          transactions.push(args.payment);
          accounts[0].balance -= args.payment.amount;
        }
        return { data: { saved: true, balance: accounts[0].balance }, error: null };
      },
    }),
    isConfirmedEmailUser: (user: { email_confirmed_at?: string }) => Boolean(user?.email_confirmed_at),
    fetchTransactionsFromSupabase: async () => [...transactions],
    fetchAccountsFromSupabase: async () => [...accounts],
    fetchCategoriesFromSupabase: async () => [{
      id: 'groceries', name: 'Groceries', type: 'expense', iconName: 'Tag', subcategories: ['General'],
    }],
    parseNotification, isEligiblePaymentNotification, createPaymentTransaction, categorizeNotification, hasUnmatchedPaymentAccount, toLocalISODate, isFinancialAccount,
    notificationCategoryConfirmation, safeGetJson: () => ({}),
    createCashAccount, isCashWithdrawal,
  };
  return { state, completed, accounts, transactions, calls: () => calls, run: () => runInNewContext(save, state) as Promise<void> };
}

test('background Add validates the inline category and refuses an unknown account', async () => {
  const valid = harness();
  valid.state.bridge.input = () => JSON.stringify({ ...payment, categoryOverride: 'groceries' });
  await valid.run();
  assert.equal(valid.transactions[0].category, 'Groceries');
  const invalid = harness();
  invalid.state.bridge.input = () => JSON.stringify({ ...payment, categoryOverride: 'Not a category' });
  await assert.rejects(invalid.run(), /Category was not found/);
  assert.equal(invalid.calls(), 0);
  const unmatched = harness();
  unmatched.state.bridge.input = () => JSON.stringify({ ...payment, text: payment.text.replace('XX4411', 'XX9876') });
  await assert.rejects(unmatched.run(), /Account not found or ambiguous/);
  assert.equal(unmatched.calls(), 0);
  assert.equal(unmatched.accounts[0].balance, 5000);
});

test('notification category input resolves close category and subcategory names by transaction type', () => {
  const categories: Category[] = [
    { id: 'shopping', name: 'Shopping & Tech', type: 'expense', iconName: 'ShoppingBag', subcategories: ['Electronics', 'Clothing'] },
    { id: 'transport', name: 'Transport & Fuel', type: 'expense', iconName: 'Car', subcategories: ['Fuel', 'Cab Services'] },
    { id: 'salary', name: 'Salary', type: 'income', iconName: 'Briefcase', subcategories: ['Primary Job'] },
  ];
  const parsed: ParsedNotification = {
    id: 'native_category', amount: 100, type: 'debit', date: '2026-11-01', time: '12:00',
    payeeOrPayer: 'Merchant', rawText: 'Paid Rs 100', category: 'Food & Dining', subcategory: 'General',
    status: 'pending', appSource: 'Other UPI', confidenceScore: 1, requiresManualVerification: false,
  };
  const shopping = applyNotificationCategoryOverride({ ...parsed, categoryOverride: 'shopping' }, categories);
  assert.equal(shopping.category, 'Shopping & Tech');
  const typo = applyNotificationCategoryOverride({ ...parsed, categoryOverride: 'shoppng' }, categories);
  assert.equal(typo.category, 'Shopping & Tech');
  const fuel = applyNotificationCategoryOverride({ ...parsed, categoryOverride: 'fuel' }, categories);
  assert.equal(fuel.category, 'Transport & Fuel');
  assert.equal(fuel.subcategory, 'Fuel');
  assert.throws(
    () => applyNotificationCategoryOverride({ ...parsed, type: 'credit', categoryOverride: 'fuel' }, categories),
    /not found or matched ambiguously/,
  );
  assert.throws(
    () => applyNotificationCategoryOverride({ ...parsed, categoryOverride: 'education' }, categories),
    /not found or matched ambiguously/,
  );
  assert.throws(
    () => applyNotificationCategoryOverride(
      { ...parsed, categoryOverride: 'fuel' },
      [...categories, { id: 'fuel-costs', name: 'Fuel Costs', type: 'expense', iconName: 'Tag', subcategories: ['Vehicle'] }],
    ),
    /not found or matched ambiguously/,
  );
});

test('cold background Add saves the actual transaction and balance with description/location, and retries do not add twice', async () => {
  const h = harness();
  h.state.bridge.input = () => JSON.stringify({ ...payment, categoryOverride: 'groceries' });
  await h.run();
  await h.run();
  assert.equal(h.transactions.length, 1);
  assert.equal(h.accounts[0].balance, 3500);
  assert.equal(h.calls(), 1);
  assert.match(h.completed[0].confirmation!, /1,500.00 transaction moved under Groceries/);
  assert.equal(h.completed[1].confirmation, undefined);
  const saved = h.completed[0].transaction!;
  assert.equal(saved.id, 'tx_native_payment-1');
  assert.equal(saved.title, 'Weekly groceries');
  assert.equal(saved.category, 'Groceries');
  assert.equal(saved.payeeOrPayer, 'Big Bazaar');
  assert.equal(saved.accountId, bank.id);
  assert.equal(saved.refNumber, '12345678');
  assert.equal(saved.rawText, `${payment.title} ${payment.text}`);
  assert.deepEqual(saved.location, payment.location);
  assert.equal(saved.date, toLocalISODate(new Date(payment.postedAt)));
  assert.equal(saved.time, '14:35');
  assert.equal(h.completed[0].account?.balance, 3500);
});

test('concurrent background Add retries have a stable transaction ID', async () => {
  const h = harness();
  await Promise.all([h.run(), h.run()]);
  assert.equal(h.transactions.length, 1);
  assert.equal(h.accounts[0].balance, 3500);
});

test('background cloud/auth failures never report a successful save', async () => {
  const offline = harness();
  offline.state.fetchAccountsFromSupabase = async () => null;
  await assert.rejects(offline.run(), /Cloud unavailable/);
  assert.equal(offline.completed.length, 0);
  assert.equal(offline.calls(), 0);
  const wrongAccount = harness();
  wrongAccount.state.getSupabaseClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'another-user', email_confirmed_at: 'confirmed' } }, error: null }) },
    rpc: async () => { throw new Error('Must not call RPC for another owner'); },
  });
  await assert.rejects(wrongAccount.run(), /account that received/);
  assert.equal(wrongAccount.completed.length, 0);
});

test('a native receipt failure after cloud commit retries without charging the account twice', async () => {
  const h = harness();
  h.state.bridge.complete = () => false;
  await assert.rejects(h.run(), /persist background payment receipt/);
  assert.equal(h.transactions.length, 1);
  assert.equal(h.accounts[0].balance, 3500);
  h.state.bridge.complete = result => { h.completed.push(JSON.parse(result)); return true; };
  await h.run();
  assert.equal(h.accounts[0].balance, 3500);
  assert.equal(h.calls(), 1);
  assert.equal(h.completed[0].transaction?.id, 'tx_native_payment-1');
});

test('background saving resolves captured coordinates without acquiring a new location', async () => {
  const h = harness();
  h.state.bridge.input = () => JSON.stringify({ ...payment, location: { lat: 18.5, lng: 73.8 } });
  await h.run();
  assert.deepEqual(h.completed[0].transaction?.location, { lat: 18.5, lng: 73.8, name: 'Pune' });
});

test('shared mapping retains account matching, category fallback, card signs and cash behavior', () => {
  const card: FinancialAccount = { ...bank, id: 'card', type: 'Credit Card', isDefault: false };
  const parsed: ParsedNotification = {
    id: 'native_card', amount: 100.15, type: 'debit', date: '2026-11-01', time: '12:00',
    payeeOrPayer: 'Merchant', rawText: 'Paid Rs 100.15', category: 'Missing', subcategory: 'Missing',
    status: 'pending', accountLast4: '4411', appSource: 'Other UPI', confidenceScore: 1, requiresManualVerification: false,
  };
  const result = createPaymentTransaction(parsed, [card], []);
  assert.equal(result.transaction.accountId, 'card');
  assert.equal(result.accounts[0].balance, 5100.15);
  assert.equal(result.categories[0].name, 'Uncategorized');
  assert.equal(result.transaction.category, 'Uncategorized');
  assert.equal(adjustPaymentAccountBalance([card], 'Cash', -100)[0].balance, 5000);
  assert.equal(adjustPaymentAccountBalance([card], 'Unknown', -100)[0].balance, 5000);
  assert.equal(adjustPaymentAccountBalance([bank], 'Unknown', -100)[0].balance, 4900);
});

test('ATM withdrawals move money from the bank into a cash account instead of counting as spending', () => {
  const parsed: ParsedNotification = {
    id: 'native_atm', amount: 2000, type: 'debit', date: '2026-11-01', time: '12:00',
    payeeOrPayer: 'ATM', rawText: 'Rs 2000 withdrawn at ATM from a/c XX4411', category: 'Missing', subcategory: 'Missing',
    status: 'pending', accountLast4: '4411', appSource: 'Other UPI', confidenceScore: 1, requiresManualVerification: false,
  };
  const result = createPaymentTransaction(parsed, [{ ...bank }], []);
  assert.equal(result.transaction.kind, 'transfer');
  assert.equal(result.transaction.accountId, 'bank');
  assert.ok(result.transaction.toAccountId);
  const cash = result.accounts.find(account => account.id === result.transaction.toAccountId);
  assert.equal(cash?.type, 'Cash');
  assert.equal(cash?.balance, 2000);
  assert.equal(result.accounts.find(account => account.id === 'bank')?.balance, 3000);
});

test('saved receipts reconcile multiple payments once, preserve intervening local edits and use the newest server balance', async () => {
  const h = harness();
  await h.run();
  const first = h.completed[0].transaction!;
  const second = { ...first, id: 'tx_native_payment-2', amount: 500 };
  const receipts: InterceptedPayment[] = [
    { ...payment, action: 'saved', transaction: first, account: { ...bank, balance: 8500 }, localBalance: 5000, savedRevision: 1 },
    { ...payment, id: 'payment-2', action: 'saved', transaction: second, account: { ...bank, balance: 8000 }, localBalance: 5000, savedRevision: 2 },
  ];
  const result = reconcileSavedPayments(receipts.reverse(), [], [{ ...bank, balance: 5100 }]);
  assert.equal(result.transactions.length, 2);
  assert.equal(result.accounts[0].balance, 8100);
  const replay = reconcileSavedPayments(receipts, result.transactions, result.accounts);
  assert.equal(replay.transactions.length, 2);
  assert.equal(replay.accounts[0].balance, 8100);
});

test('receipts already loaded from cloud do not apply account deltas again', async () => {
  const h = harness();
  await h.run();
  const first = h.completed[0].transaction!;
  const receipts: InterceptedPayment[] = [
    { ...payment, action: 'saved', transaction: first, account: { ...bank, balance: 3500 }, localBalance: 5000, savedRevision: 1 },
  ];
  const projected = reconcileSavedPayments(receipts, [first], [{ ...bank, balance: 3500 }]);
  assert.equal(projected.accounts[0].balance, 3500);
  assert.equal(projected.transactions.length, 1);
});

test('saving an open notification editor does not reapply a payment added in the background', () => {
  const tx: Transaction = {
    id: 'temporary', title: 'Payment', amount: 1500, type: 'debit', category: 'Food',
    subcategory: 'General', date: '2026-11-01', time: '14:35', source: 'UPI',
    accountId: bank.id, paymentMethod: bank.id,
  };
  const first = applyNotificationEditOnce('native_payment-1', tx, [], [{ ...bank }]);
  assert.equal(first.added, true);
  assert.equal(first.accounts[0].balance, 3500);
  const repeated = applyNotificationEditOnce('native_payment-1', { ...tx, amount: 2000 }, first.transactions, first.accounts);
  assert.equal(repeated.added, false);
  assert.equal(repeated.accounts[0].balance, 3500);
  assert.equal(repeated.transactions.length, 1);
  assert.equal(repeated.transaction.amount, 1500);
});

const syncSource = readFileSync(new URL('../services/supabaseClient.ts', import.meta.url), 'utf8');
const syncStart = syncSource.indexOf('export async function syncFinancialStateToSupabase(');
const syncEnd = syncSource.indexOf('export async function deleteAccountFromSupabase(', syncStart);
assert.ok(syncStart >= 0 && syncEnd > syncStart);
const helper = syncSource.slice(syncSource.indexOf('function transactionSyncRows('), syncSource.indexOf('// Metadata-only transaction writes'));
const sync = transformSync(helper + syncSource.slice(syncStart, syncEnd).replace('export ', '') + '\nsyncFinancialStateToSupabase([], accounts);', { loader: 'ts' }).code;

function accountUploadHarness() {
  const uploads: { p_accounts: { balance: number; sync_revision: number | null }[]; p_operation_id: string }[] = [];
  let conflict = false;
  const state = {
    accounts: [{ ...bank, syncRevision: 3 }], crypto, TextEncoder, parseTransactionSyncRevisions,
    readFinancialEpoch: () => 1,
    safeGetItem: () => 'user-1',
    getSupabaseClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
      rpc: async (name: string, payload: typeof uploads[number]) => {
        assert.equal(name, 'sync_financial_state');
        uploads.push(payload);
        return conflict ? { error: { code: '40001' } } : { data: { accounts: [{ id: bank.id, sync_revision: 4 }], transactions: [] } };
      },
    }),
    syncError: (_collection: string, error: Error) => ({ success: false, error: error.message }),
  };
  return { state, uploads, setConflict: () => { conflict = true; }, run: () => runInNewContext(sync, state) };
}

test('foreground financial uploads carry account revisions and stable retry IDs instead of blind balance upserts', async () => {
  const h = accountUploadHarness();
  assert.equal((await h.run()).success, true);
  await h.run();
  assert.equal(h.uploads[0].p_accounts[0].sync_revision, 3);
  assert.equal(h.uploads[0].p_operation_id, h.uploads[1].p_operation_id);
  h.state.accounts[0].balance -= 1;
  await h.run();
  assert.notEqual(h.uploads[0].p_operation_id, h.uploads[2].p_operation_id);
});

test('a background account revision change visibly rejects the stale foreground batch', async () => {
  const h = accountUploadHarness();
  h.setConflict();
  const result = await h.run();
  assert.equal(result.success, false);
  assert.equal(result.conflict, true);
  assert.match(result.error, /No part of this batch was saved/);
});

test('a session belonging to another cache owner cannot upload a financial snapshot', async () => {
  const h = accountUploadHarness();
  h.state.safeGetItem = () => 'previous-user';
  const result = await h.run();
  assert.equal(result.success, false);
  assert.match(result.error, /Account changed/);
  assert.equal(h.uploads.length, 0);
});

test('a delayed financial batch retains its original owner even after the active cache changes', async () => {
  const h = accountUploadHarness();
  const originalOwner = sync.replace('syncFinancialStateToSupabase([], accounts);',
    'syncFinancialStateToSupabase([], accounts, [], 1, "previous-user");');
  assert.notEqual(originalOwner, sync);
  const result = await runInNewContext(originalOwner, h.state);
  assert.equal(result.success, false);
  assert.equal(h.uploads.length, 0);
});
