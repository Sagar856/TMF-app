import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { createPaymentTransaction, adjustPaymentAccountBalance } from './paymentTransaction';
import { parseNotification } from '../services/notification/ParserManager';
import { isEligiblePaymentNotification } from '../services/notification/transactionEligibility';
import { toLocalISODate } from './dates';
import type { FinancialAccount, ParsedNotification, Transaction } from '../types/finance';
import { isFinancialAccount, isTransaction } from './backup';
import { reconcileSavedPayments } from './savedPaymentReconciliation';
import type { InterceptedPayment } from '../services/notificationListener';

const source = readFileSync(new URL('../services/backgroundPayment.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function savePayment(');
const end = source.indexOf('\nif (window.PaymentBackground)', start);
assert.ok(start >= 0 && end > start);
const save = transformSync(source.slice(start, end) + '\nsavePayment(bridge);', { loader: 'ts' }).code;
const bank: FinancialAccount = {
  id: 'bank', name: 'HDFC', bankName: 'HDFC', type: 'Bank', accountNumberLast4: '4411', balance: 5000, isDefault: true,
};
const payment = {
  id: 'payment-1', owner: 'user-1', packageName: 'com.google.android.apps.messaging',
  title: 'HDFC Bank', text: 'Rs 1,500 debited from a/c XX4411 to Big Bazaar ref 12345678',
  postedAt: new Date(2026, 10, 1, 14, 35).getTime(), action: 'saving',
  description: 'Weekly groceries', location: { lat: 18.5, lng: 73.8, name: 'Pune' },
};

function harness() {
  const transactions: Transaction[] = [];
  const accounts = [{ ...bank }];
  const completed: { transaction?: Transaction; duplicate?: boolean; account?: FinancialAccount }[] = [];
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
    parseNotification, isEligiblePaymentNotification, createPaymentTransaction, toLocalISODate, isFinancialAccount,
  };
  return { state, completed, accounts, transactions, calls: () => calls, run: () => runInNewContext(save, state) as Promise<void> };
}

test('cold background Add saves the actual transaction and balance with description/location, and retries do not add twice', async () => {
  const h = harness();
  await h.run();
  await h.run();
  assert.equal(h.transactions.length, 1);
  assert.equal(h.accounts[0].balance, 3500);
  assert.equal(h.calls(), 1);
  const saved = h.completed[0].transaction!;
  assert.equal(saved.id, 'tx_native_payment-1');
  assert.equal(saved.title, 'Weekly groceries');
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
  await assert.rejects(wrongAccount.run(), /account that received/);
  assert.equal(wrongAccount.completed.length, 0);
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

const syncSource = readFileSync(new URL('../services/supabaseClient.ts', import.meta.url), 'utf8');
const syncStart = syncSource.indexOf('export async function syncAccountsToSupabase(');
const syncEnd = syncSource.indexOf('export async function deleteAccountFromSupabase(', syncStart);
assert.ok(syncStart >= 0 && syncEnd > syncStart);
const sync = transformSync(syncSource.slice(syncStart, syncEnd).replace('export ', '') + '\nsyncAccountsToSupabase(accounts);', { loader: 'ts' }).code;

function accountUploadHarness() {
  const storage = new Map([
    ['tmf_cache_owner', 'user-1'], ['tmf_accounts', JSON.stringify([bank])], ['tmf_transactions', '[]'],
  ]);
  const uploads: { balance: number }[][] = [];
  const receipts: InterceptedPayment[] = [];
  const state = {
    accounts: [bank], isFinancialAccount, isTransaction,
    getSupabaseClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
    Capacitor: { getPlatform: () => 'android' },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null },
    getSavedPayments: async () => receipts,
    navigator: { locks: { request: async (_name: string, work: () => Promise<unknown>) => work() } },
    upsertWithSchemaFallback: async (_client: unknown, _table: string, rows: { balance: number }[]) => {
      uploads.push(rows);
      return { success: true };
    },
    syncError: (_collection: string, error: Error) => ({ success: false, error: error.message }),
  };
  return { state, uploads, storage, receipts, run: () => runInNewContext(sync, state) };
}

test('foreground account upload waits for the background-save lock and reads the latest balances', async () => {
  const h = accountUploadHarness();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  h.state.navigator.locks.request = async (name, work) => {
    assert.equal(name, 'minarth-account-cloud-write');
    await held;
    return work();
  };
  const upload = h.run();
  h.storage.set('tmf_accounts', JSON.stringify([{ ...bank, balance: 3500 }]));
  release();
  await upload;
  assert.equal(h.uploads[0][0].balance, 3500);
});

test('an unimported background receipt prevents a stale foreground balance from being uploaded', async () => {
  const background = harness();
  await background.run();
  const h = accountUploadHarness();
  h.receipts.push({
    ...payment, action: 'saved', transaction: background.completed[0].transaction,
    account: { ...bank, balance: 3500 }, localBalance: 5000, savedRevision: 1,
  });
  const result = await h.run();
  assert.equal(result.success, false);
  assert.match(result.error, /background payment was saved/);
  assert.equal(h.uploads.length, 0);
});
