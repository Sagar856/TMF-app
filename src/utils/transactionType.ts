import { TransactionType } from '../types/finance';

const CREDIT_ALIASES = new Set(['credit', 'cr', 'income', 'in', 'inflow', 'deposit', 'received', 'receipt', '+']);
const DEBIT_ALIASES = new Set(['debit', 'dr', 'expense', 'out', 'outflow', 'withdrawal', 'spend', 'spent', 'paid', 'payment', '-']);

/** Maps the many ways spreadsheets label direction onto credit/debit. `transfer` is a kind, not a direction, and stays unmapped. */
export function normalizeTransactionType(type: string): TransactionType | null {
  const normalized = type.trim().toLowerCase();
  if (CREDIT_ALIASES.has(normalized)) return 'credit';
  if (DEBIT_ALIASES.has(normalized)) return 'debit';
  return null;
}
