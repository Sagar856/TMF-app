import type { FinancialAccount, Transaction } from '../types/finance';
import { isFinancialAccount, isTransaction } from './backup';
import { safeGetItem, safeGetJson, safeSetItem } from './storage';

export interface FinancialState {
  owner: string;
  accounts: FinancialAccount[];
  transactions: Transaction[];
  pending: boolean;
  epoch?: number;
}

export function readFinancialEpoch(): number | undefined {
  const epoch = safeGetJson<number | null>('tmf_financial_epoch', null,
    (value): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0);
  return epoch ?? undefined;
}

export function readFinancialState(): FinancialState | null {
  const state = safeGetJson<FinancialState | null>('tmf_financial_state', null, (value): value is FinancialState => {
    if (typeof value !== 'object' || value === null) return false;
    const state = value as Partial<FinancialState>;
    return typeof state.owner === 'string' && typeof state.pending === 'boolean'
      && Array.isArray(state.accounts) && state.accounts.every(isFinancialAccount)
      && Array.isArray(state.transactions) && state.transactions.every(isTransaction);
  });
  return state?.owner === (safeGetItem('tmf_cache_owner') || '') ? state : null;
}

export function persistFinancialState(state: FinancialState): boolean {
  if (state.owner !== (safeGetItem('tmf_cache_owner') || '') || state.epoch !== readFinancialEpoch()) {
    console.warn('Financial snapshot owner or reset generation changed. Reload before saving.');
    return false;
  }
  // This single key is authoritative; the two legacy keys are projections for native integrations.
  if (!safeSetItem('tmf_financial_state', JSON.stringify(state))) return false;
  safeSetItem('tmf_accounts', JSON.stringify(state.accounts));
  safeSetItem('tmf_transactions', JSON.stringify(state.transactions));
  return true;
}
