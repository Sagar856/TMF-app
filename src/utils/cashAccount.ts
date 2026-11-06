import type { AccountType, FinancialAccount, Transaction } from '../types/finance';
import { newId } from './ids';

/** Auto-created cash accounts use this prefix; the background-save SQL creates them on first use. */
export const CASH_ACCOUNT_PREFIX = 'acc_cash';
export const CASH_WITHDRAWAL_SUBCATEGORY = 'Cash Withdrawal';
/** Transfer-target value meaning "create a Cash in Hand account for this transfer". */
export const NEW_CASH_ACCOUNT_OPTION = '__new_cash_account__';

const LIQUID_TYPES: ReadonlySet<AccountType> = new Set(['Bank', 'Wallet/UPI', 'Debit Card', 'Cash']);
// "ATM card used at <merchant>" is a card purchase, so a bare "ATM" is not enough.
const CASH_WITHDRAWAL_TEXT = /\b(cash\s*(withdrawal|withdrawn|wdl|w\/d)|atm\s*(withdrawal|wdl|w\/d|cash)|(withdrawn|withdrawal)\s+(at|from)\s+(an?\s+)?atm|at\s+(an?\s+)?atm\b|nfs\s*cash)/i;

export function isLiquidAccount(account: Pick<FinancialAccount, 'type'>): boolean {
  return LIQUID_TYPES.has(account.type);
}

export function findCashAccount(accounts: FinancialAccount[]): FinancialAccount | undefined {
  return accounts.find((account) => account.type === 'Cash');
}

export function createCashAccount(id: string = newId(CASH_ACCOUNT_PREFIX)): FinancialAccount {
  return {
    id,
    name: 'Cash in Hand',
    bankName: 'Cash',
    type: 'Cash',
    accountNumberLast4: '',
    balance: 0,
  };
}

/** Returns the user's cash account, creating a zero-balance "Cash in Hand" account when none exists. */
export function ensureCashAccount(accounts: FinancialAccount[]): { accounts: FinancialAccount[]; cashAccount: FinancialAccount } {
  const existing = findCashAccount(accounts);
  if (existing) return { accounts, cashAccount: existing };
  const cashAccount = createCashAccount();
  return { accounts: [...accounts, cashAccount], cashAccount };
}

export function isCashWithdrawalText(text: string | undefined): boolean {
  return Boolean(text && CASH_WITHDRAWAL_TEXT.test(text));
}

/** Single-ledger-leg withdrawal: money leaves `accountId` and lands in the cash account `toAccountId`. */
export function isCashWithdrawal(tx: Pick<Transaction, 'kind' | 'subcategory' | 'toAccountId' | 'type'>): boolean {
  return tx.kind === 'transfer' && tx.type === 'debit' && Boolean(tx.toAccountId)
    && (tx.subcategory || '').trim().toLowerCase() === CASH_WITHDRAWAL_SUBCATEGORY.toLowerCase();
}

/**
 * Credits (direction 1) or reverts (direction -1) the cash leg of a withdrawal.
 * The source-account leg is handled by the regular ledger balance logic.
 */
export function applyCashWithdrawalLeg(accounts: FinancialAccount[], tx: Transaction, direction: 1 | -1): FinancialAccount[] {
  if (!isCashWithdrawal(tx) || !tx.toAccountId) return accounts;
  let next = accounts;
  if (direction === 1 && tx.toAccountId.startsWith(`${CASH_ACCOUNT_PREFIX}_`) && !next.some((account) => account.id === tx.toAccountId)) {
    next = [...next, createCashAccount(tx.toAccountId)];
  }
  return next.map((account) => account.id === tx.toAccountId
    ? { ...account, balance: Math.round((account.balance + direction * tx.amount) * 100) / 100 }
    : account);
}
