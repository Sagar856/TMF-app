import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import type { useAssistantCategorization } from '../hooks/useAssistantCategorization';
import type { Category, Transaction } from '../types/finance';
import { AssistantRuntime } from '../services/assistantRuntime';

test('clear titles bypass inference; invalid model results become reviewable without automatic retry', async () => {
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL('../hooks/useAssistantCategorization.ts', import.meta.url), 'utf8');
  const module = { exports: {} as { useAssistantCategorization: typeof useAssistantCategorization } };
  const states: unknown[] = [];
  const refs: { current: unknown }[] = [];
  const deps: unknown[][] = [];
  let index = 0;
  const effects: (() => unknown)[] = [];
  runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
    module, exports: module.exports,
    require: (name: string) => name === 'react' ? {
      useState: (initial: unknown) => {
        const i = index++;
        if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
        return [states[i], (next: unknown) => { states[i] = typeof next === 'function' ? next(states[i]) : next; }];
      },
      useRef: (current: unknown) => {
        const i = index++;
        return refs[i] ||= { current };
      },
      useCallback: (value: unknown) => { index++; return value; },
      useEffect: (effect: () => unknown, next: unknown[]) => {
        const i = index++;
        if (!deps[i] || next.some((value, n) => !Object.is(value, deps[i][n]))) effects.push(effect);
        deps[i] = next;
      },
    } : name === '../services/supabaseClient' ? { isCloudBackendConfigured: () => false }
      : name === '../utils/storage' ? { safeGetJson: () => [] }
      : name === '../utils/notificationCategoryJobs' ? { readCategoryJobs: () => [], CATEGORY_JOBS_CHANGED: 'jobs' }
      : name === '../services/notificationListener' ? { syncCategoryReviewNotification: async () => true }
      : require(name),
    navigator: { onLine: true }, window: { addEventListener() {}, removeEventListener() {} },
  });
  const category: Category = { id: 'food', name: 'Food & Dining', type: 'expense', iconName: 'Tag', subcategories: ['Groceries'] };
  const groceries: Transaction = { id: 'one', title: 'Groceries', type: 'debit', category: 'Food & Dining', subcategory: 'Groceries',
    amount: 100, date: '2026-11-27', time: '12:00', source: 'UPI', categoryOrigin: 'rule' };
  let calls = 0;
  const runtime = new AssistantRuntime();
  runtime.generate = async () => { calls++; return 'Invalid model response'; };
  const messages: string[] = [];
  const options = {
    runtime,
    enabled: true, installed: true, supported: true, canProcess: true, owner: 'user-1',
    transactions: [groceries, { ...groceries, id: 'two', title: 'Ambiguous memo', categoryOrigin: 'eligible' as const }],
    categories: [category], cloudReady: false, cloudHydrated: false,
    setTransactions: () => {}, notify: (message: string) => messages.push(message),
  };
  const render = () => {
    index = 0;
    const result = module.exports.useAssistantCategorization(options);
    effects.splice(0).forEach(effect => effect());
    return result;
  };
  render();
  await new Promise(resolve => setImmediate(resolve));
  const result = render();
  assert.equal(calls, 1);
  assert.equal(result.reviews.length, 1);
  assert.equal(result.reviews[0].transactionId, 'two');
  assert.equal(result.reviews[0].manualOnly, true);
  assert.equal(messages.length, 1);
  render();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);

  let finish: (value: string) => void = () => {};
  runtime.generate = () => new Promise(resolve => { finish = resolve; });
  options.transactions = [{ ...groceries, id: 'late', title: 'Unclear memo', categoryOrigin: 'eligible' }];
  render();
  options.canProcess = false;
  options.owner = 'user-2';
  options.transactions = [];
  render();
  finish('Invalid model response');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(render().reviews.length, 0);
  assert.equal(messages.length, 1);
});
