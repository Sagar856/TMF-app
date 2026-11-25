import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountsView } from './AccountsView';
import type { FinancialAccount } from '../types/finance';

test('liquid account balances and their total show negative values in red', () => {
  const account = (balance: number): FinancialAccount => ({
    id: 'bank', name: 'Test bank', bankName: 'Bank', type: 'Bank',
    accountNumberLast4: '1234', balance, isDefault: true,
  });
  for (const [balance, color] of [[-100, 'red'], [0, 'emerald'], [100, 'emerald']] as const) {
    const markup = renderToStaticMarkup(<AccountsView accounts={[account(balance)]}
      transactions={[]} currencySymbol="INR" onAddAccount={() => {}}
      onUpdateAccount={() => {}} onDeleteAccount={() => {}} />);
    assert.match(markup, new RegExp(`class="text-base sm:text-lg lg:text-xl font-bold tracking-tight text-${color}-400"`));
    assert.match(markup, new RegExp(`class="text-base font-bold font-mono text-${color}-400"`));
  }
});
