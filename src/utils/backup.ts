import {
  Category,
  FinancialAccount,
  InvestmentRecord,
  LoanRecord,
  SavingsGoal,
  Transaction,
  UserSettings,
} from '../types/finance';
import { isSavingsGoal } from './savingsGoals';

export interface BackupRestoreData {
  formatVersion?: number;
  settings: UserSettings;
  categories: Category[];
  accounts?: FinancialAccount[];
  transactions: Transaction[];
  investments: InvestmentRecord[];
  loans: LoanRecord[];
  savingsGoals?: SavingsGoal[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isTransaction(value: unknown): value is Transaction {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.amount === 'number'
    && Number.isFinite(value.amount)
    && (value.type === 'credit' || value.type === 'debit')
    && typeof value.category === 'string'
    && typeof value.subcategory === 'string'
    && typeof value.date === 'string'
    && typeof value.time === 'string'
    && ['UPI', 'SMS', 'Manual', 'Bank Sync'].includes(String(value.source));
}

function isCategory(value: unknown): value is Category {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && ['income', 'expense', 'investment'].includes(String(value.type))
    && typeof value.iconName === 'string'
    && isStringArray(value.subcategories);
}

function isFinancialAccount(value: unknown): value is FinancialAccount {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.bankName === 'string'
    && ['Bank', 'Credit Card', 'Debit Card', 'Wallet/UPI'].includes(String(value.type))
    && typeof value.accountNumberLast4 === 'string'
    && typeof value.balance === 'number'
    && Number.isFinite(value.balance);
}

function isInvestment(value: unknown): value is InvestmentRecord {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.type === 'string'
    && typeof value.amountInvested === 'number'
    && Number.isFinite(value.amountInvested)
    && typeof value.currentValue === 'number'
    && Number.isFinite(value.currentValue)
    && typeof value.returnsPercent === 'number'
    && Number.isFinite(value.returnsPercent)
    && typeof value.date === 'string'
    && Array.isArray(value.monthlyContributions);
}

function isLoan(value: unknown): value is LoanRecord {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.personOrBank === 'string'
    && (value.type === 'loan' || value.type === 'lend')
    && typeof value.totalAmount === 'number'
    && Number.isFinite(value.totalAmount)
    && typeof value.remainingAmount === 'number'
    && Number.isFinite(value.remainingAmount)
    && typeof value.dueDate === 'string'
    && ['active', 'repaid', 'overdue'].includes(String(value.status))
    && Array.isArray(value.repayments);
}

function isUserSettings(value: unknown): value is UserSettings {
  if (!isRecord(value)) return false;
  return typeof value.userName === 'string'
    && typeof value.userEmail === 'string'
    && typeof value.currencySymbol === 'string'
    && typeof value.currencyCode === 'string'
    && typeof value.passcodeEnabled === 'boolean'
    && typeof value.locationTracking === 'boolean'
    && typeof value.autoExtractSms === 'boolean'
    && typeof value.notificationsEnabled === 'boolean';
}

function parseArray<T>(
  value: unknown,
  validate: (item: unknown) => item is T,
  label: string
): T[] {
  if (!Array.isArray(value) || !value.every(validate)) {
    throw new Error(`Backup is invalid: ${label} must be an array of valid records.`);
  }
  return value;
}

export function parseBackupJson(content: string): BackupRestoreData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  if (!isRecord(parsed)) throw new Error('Backup must contain a JSON object.');
  if (parsed.formatVersion !== undefined && parsed.formatVersion !== 1) {
    throw new Error(`Unsupported backup format version: ${String(parsed.formatVersion)}.`);
  }
  if (!isUserSettings(parsed.settings)) throw new Error('Backup is invalid: settings are missing or incomplete.');

  return {
    formatVersion: typeof parsed.formatVersion === 'number' ? parsed.formatVersion : undefined,
    settings: parsed.settings,
    categories: parseArray(parsed.categories, isCategory, 'categories'),
    accounts: parsed.accounts === undefined ? undefined : parseArray(parsed.accounts, isFinancialAccount, 'accounts'),
    transactions: parseArray(parsed.transactions, isTransaction, 'transactions'),
    investments: parseArray(parsed.investments, isInvestment, 'investments'),
    loans: parseArray(parsed.loans, isLoan, 'loans'),
    ...(parsed.savingsGoals === undefined
      ? {}
      : { savingsGoals: parseArray(parsed.savingsGoals, isSavingsGoal, 'savingsGoals') }),
  };
}
