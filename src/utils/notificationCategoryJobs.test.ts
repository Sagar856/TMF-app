import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import type { Category, Transaction } from '../types/finance';
import type { useAssistantCategorization } from '../hooks/useAssistantCategorization';
import { enqueueCategoryJob, finishCategoryJob, readCategoryJobs, writeCategoryJob } from './notificationCategoryJobs';
import { AssistantRuntime } from '../services/assistantRuntime';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const transaction: Transaction = {
  id: 'tx_native_synthetic', title: 'Synthetic purchase', amount: 125, type: 'debit',
  category: 'Food', subcategory: 'General', categoryOrigin: 'eligible', syncRevision: 1,
  date: '2026-11-27', time: '12:00', source: 'UPI', accountId: 'bank',
};
const categories: Category[] = [
  { id: 'food', name: 'Food', type: 'expense', iconName: 'Tag', subcategories: ['General'] },
  { id: 'travel', name: 'Travel', type: 'expense', iconName: 'Tag', subcategories: ['General'] },
];
const lockQueues = new Map<string, Promise<unknown>>();
beforeEach(() => {
  lockQueues.clear();
  const storage: Record<string, string> = { tmf_cache_owner: 'owner' };
  Object.defineProperties(storage, {
    getItem: { value: (key: string) => storage[key] ?? null },
    setItem: { value: (key: string, value: string) => { storage[key] = value; } },
    clear: { value: () => { for (const key of Object.keys(storage)) delete storage[key]; } },
  });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
});
after(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

function harness(enabled = true) {
  const source = readFileSync(new URL('../hooks/useAssistantCategorization.ts', import.meta.url), 'utf8');
  const require = createRequire(import.meta.url);
  const module = { exports: {} as { useAssistantCategorization: typeof useAssistantCategorization } };
  const states: unknown[] = [];
  const refs: { current: unknown }[] = [];
  const deps: unknown[][] = [];
  const cleanups: (() => void)[] = [];
  const effects: (() => unknown)[] = [];
  const notices: string[] = [];
  const prompts: string[] = [];
  const updates: Transaction[] = [];
  const notifications: boolean[] = [];
  let index = 0;
  let conflict = false;
  let generate = async (_prompt: string) => '{"categoryId":"c1","subcategory":"General","uncertain":false}';
  const locks = lockQueues;
  const navigator = { onLine: true, locks: {
    request: (name: string, action: () => Promise<unknown>) => {
      const work = (locks.get(name) || Promise.resolve()).then(action);
      locks.set(name, work.catch(() => {}));
      return work;
    },
  } };
  const runtime = new AssistantRuntime();
  runtime.generate = async prompt => {
    assert.equal(typeof prompt, 'string');
    const text = String(prompt);
    prompts.push(text);
    return generate(text);
  };
  const options = {
    runtime,
    enabled, installed: enabled, supported: true, canProcess: true, owner: 'owner',
    transactions: [transaction], categories, cloudReady: true, cloudHydrated: true,
    setTransactions: (next: Transaction[] | ((previous: Transaction[]) => Transaction[])) => {
      options.transactions = typeof next === 'function' ? next(options.transactions) : next;
    },
    notify: (message: string) => { notices.push(message); },
  };
  runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
    module, exports: module.exports, navigator, window,
    require: (name: string) => name === 'react' ? {
      useState: (initial: unknown) => {
        const i = index++;
        if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
        return [states[i], (next: unknown) => { states[i] = typeof next === 'function' ? next(states[i]) : next; }];
      },
      useRef: (current: unknown) => refs[index++] ||= { current },
      useCallback: (value: unknown) => { index++; return value; },
      useEffect: (effect: () => unknown, next: unknown[]) => {
        const i = index++;
        if (!deps[i] || next.some((value, n) => !Object.is(value, deps[i][n]))) effects.push(() => {
          cleanups[i]?.();
          const cleanup = effect();
          if (typeof cleanup === 'function') cleanups[i] = cleanup as () => void;
        });
        deps[i] = next;
      },
    } : name === '../services/supabaseClient' ? {
      isCloudBackendConfigured: () => true,
      syncTransactionsToSupabase: async ([candidate]: Transaction[], owner: string) => {
        assert.equal(owner, 'owner');
        if (conflict) return { success: false, conflict: true, error: 'Concurrent edit' };
        updates.push(candidate);
        return { success: true, transactionRevisions: { [candidate.id]: 2 } };
      },
    } : name === '../services/notificationListener' ? {
      syncCategoryReviewNotification: async (_owner: string, _id: string, remove: boolean) => { notifications.push(remove); return true; },
    } : require(name),
  });
  const render = () => {
    index = 0;
    const result = module.exports.useAssistantCategorization(options);
    effects.splice(0).forEach(effect => effect());
    return result;
  };
  const settle = async () => {
    for (let i = 0; i < 6; i++) { render(); await new Promise(resolve => setImmediate(resolve)); }
    return render();
  };
  return { options, navigator, render, settle, prompts, notices, updates, notifications,
    setGenerate: (next: typeof generate) => { generate = next; },
    setConflict: () => { conflict = true; },
    close: () => cleanups.forEach(cleanup => cleanup?.()),
  };
}

test('post-save job uses the explicit reply, preserves payment fields and completes once', async () => {
  enqueueCategoryJob('owner', transaction, 'commuting costs');
  const h = harness();
  await h.settle();
  assert.equal(h.prompts.length, 1);
  assert.match(h.prompts[0], /Description: commuting costs/);
  assert.doesNotMatch(h.prompts[0], /owner|bank|Synthetic purchase/);
  assert.equal(h.updates.length, 1);
  assert.deepEqual({ ...h.options.transactions[0] }, { ...transaction, category: 'Travel', categoryOrigin: 'assistant', syncRevision: 2 });
  assert.equal(readCategoryJobs('owner')[0].status, 'done');
  assert.ok(h.notifications.includes(true));
  h.close();
  const restarted = harness();
  restarted.options.transactions = h.options.transactions;
  await restarted.settle();
  assert.equal(restarted.prompts.length, 0);
  assert.equal(restarted.updates.length, 0);
  restarted.close();
});

test('disabled MINA keeps a durable manual Save review without invoking a model', async () => {
  enqueueCategoryJob('owner', transaction, 'commuting costs');
  const h = harness(false);
  const result = await h.settle();
  assert.equal(h.prompts.length, 0);
  assert.equal(result.reviews.length, 1);
  assert.equal(result.reviews[0].manualOnly, true);
  await result.approveReview({ ...result.reviews[0], manualOnly: false, categoryId: 'travel', category: 'Travel', subcategory: 'General' });
  await h.settle();
  assert.equal(h.updates.length, 1);
  assert.equal(readCategoryJobs('owner')[0].status, 'done');
  h.close();
});

test('uncertain and invalid results persist through restart without rerunning inference', async () => {
  for (const output of ['invalid', '{"categoryId":"c1","subcategory":"General","uncertain":true}']) {
    localStorage.clear();
    localStorage.setItem('tmf_cache_owner', 'owner');
    enqueueCategoryJob('owner', transaction, 'commuting costs');
    const h = harness();
    h.setGenerate(async () => output);
    assert.equal((await h.settle()).reviews.length, 1);
    assert.equal(h.updates.length, 0);
    assert.equal(readCategoryJobs('owner')[0].status, 'review');
    h.close();
    const restarted = harness();
    assert.equal((await restarted.settle()).reviews.length, 1);
    assert.equal(restarted.prompts.length, 0);
    restarted.close();
  }
});

test('edits during inference and cloud revision conflicts cannot overwrite saved transactions', async () => {
  enqueueCategoryJob('owner', transaction, 'commuting costs');
  const h = harness();
  let finish!: (value: string) => void;
  h.setGenerate(() => new Promise(resolve => { finish = resolve; }));
  await h.settle();
  h.options.transactions = [{ ...transaction, title: 'User edited title', categoryOrigin: 'user-edited' }];
  h.render();
  finish('{"categoryId":"c1","subcategory":"General","uncertain":false}');
  await h.settle();
  assert.equal(h.updates.length, 0);
  assert.equal(h.options.transactions[0].title, 'User edited title');
  h.close();
  writeCategoryJob({ owner: 'owner', before: transaction, text: 'commuting costs', status: 'pending' });
  const conflict = harness();
  conflict.setConflict();
  const result = await conflict.settle();
  assert.equal(result.reviews[0].cloudConflict, true);
  assert.equal(conflict.options.transactions[0].category, 'Food');
  assert.equal(conflict.updates.length, 0);
  conflict.close();
});

test('queue is owner-scoped, deduplicated and strips unsafe model input', () => {
  enqueueCategoryJob('owner', transaction, 'password: synthetic-secret');
  assert.equal(readCategoryJobs('owner')[0].text, '');
  enqueueCategoryJob('owner', transaction, 'replacement');
  assert.equal(readCategoryJobs('owner')[0].text, '');
  assert.equal(readCategoryJobs('other-owner').length, 0);
  localStorage.setItem('tmf_cache_owner', 'other-owner');
  assert.throws(() => finishCategoryJob(readCategoryJobs('owner')[0]), /Account changed/);
  assert.equal(readCategoryJobs('owner')[0].status, 'review');
});

test('cloud success followed by process death is recovered without another category write', async () => {
  enqueueCategoryJob('owner', transaction, 'commuting costs');
  const job = readCategoryJobs('owner')[0];
  writeCategoryJob({ ...job, status: 'review', review: {
    transactionId: transaction.id, before: transaction, categoryId: 'travel', category: 'Travel', subcategory: 'General', reason: 'Interrupted',
  } });
  const h = harness();
  h.options.transactions = [{ ...transaction, category: 'Travel', categoryOrigin: 'assistant', syncRevision: 2 }];
  await h.settle();
  assert.equal(h.updates.length, 0);
  assert.equal(h.prompts.length, 0);
  assert.equal(readCategoryJobs('owner')[0].status, 'done');
  h.close();
});

test('two windows serialize the same durable request rather than processing it twice', async () => {
  enqueueCategoryJob('owner', transaction, 'commuting costs');
  const first = harness();
  const second = harness();
  await Promise.all([first.settle(), second.settle()]);
  assert.equal(first.prompts.length + second.prompts.length, 1);
  assert.equal(first.updates.length + second.updates.length, 1);
  first.close();
  second.close();
});

test('offline and locked jobs survive without inference or writes, then resume after unlock', async () => {
  enqueueCategoryJob('owner', transaction, 'commuting costs');
  const h = harness();
  h.options.canProcess = false;
  h.navigator.onLine = false;
  assert.equal((await h.settle()).reviews.length, 0);
  assert.equal(h.prompts.length, 0);
  assert.equal(readCategoryJobs('owner')[0].status, 'pending');
  h.navigator.onLine = true;
  window.dispatchEvent(new Event('online'));
  h.options.canProcess = true;
  await h.settle();
  assert.equal(h.updates.length, 1);
  h.close();
});

test('a deleted synced transaction cancels its follow-up without recreating a payment', async () => {
  enqueueCategoryJob('owner', transaction, 'commuting costs');
  const h = harness();
  h.options.transactions = [];
  await h.settle();
  assert.equal(h.updates.length, 0);
  assert.equal(h.prompts.length, 0);
  assert.equal(readCategoryJobs('owner')[0].status, 'done');
  assert.ok(h.notifications.includes(true));
  h.close();
});
