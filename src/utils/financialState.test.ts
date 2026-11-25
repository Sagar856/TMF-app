import test from 'node:test';
import assert from 'node:assert/strict';
import { persistFinancialState, readFinancialState, type FinancialState } from './financialState';

test('one authoritative local financial snapshot survives projection failures and is owner scoped', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>([['tmf_cache_owner', 'owner']]);
  let failingKey = '';
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === failingKey) throw new Error('Synthetic storage failure');
        values.set(key, value);
      },
    },
  });
  try {
    const state: FinancialState = {
      owner: 'owner', pending: true,
      accounts: [{ id: 'bank', name: 'Bank', bankName: 'Bank', type: 'Bank', accountNumberLast4: '', balance: 80 }],
      transactions: [{ id: 'tx', title: 'Test', amount: 20, type: 'debit', category: 'Food',
        subcategory: 'General', date: '2026-01-01', time: '12:00', source: 'Manual' }],
    };
    failingKey = 'tmf_transactions';
    assert.equal(persistFinancialState(state), true);
    assert.deepEqual(readFinancialState(), state);
    failingKey = 'tmf_financial_state';
    assert.equal(persistFinancialState({ ...state, transactions: [] }), false);
    assert.deepEqual(readFinancialState(), state);
    failingKey = '';
    values.set('tmf_financial_epoch', '2');
    assert.equal(persistFinancialState({ ...state, epoch: 1 }), false);
    assert.deepEqual(readFinancialState(), state);
    const resetState = { ...state, epoch: 2, transactions: [], accounts: [], pending: false };
    assert.equal(persistFinancialState(resetState), true);
    assert.deepEqual(readFinancialState(), resetState);
    values.set('tmf_cache_owner', 'different-owner');
    assert.equal(readFinancialState(), null);
    assert.equal(persistFinancialState(resetState), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
