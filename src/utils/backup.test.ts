import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBackupJson } from './backup';

const settings = {
  userName: 'Test',
  userEmail: 'test@example.com',
  currencySymbol: '$',
  currencyCode: 'USD',
  passcodeEnabled: false,
  locationTracking: false,
  autoExtractSms: false,
  notificationsEnabled: false,
};

const backup = {
  formatVersion: 1,
  settings,
  categories: [{
    id: 'food',
    name: 'Food',
    type: 'expense',
    iconName: 'Coffee',
    subcategories: ['Cafe'],
  }],
  accounts: [{
    id: 'account',
    name: 'Checking',
    bankName: 'Bank',
    type: 'Bank',
    accountNumberLast4: '1234',
    balance: 100,
  }],
  transactions: [{
    id: 'tx',
    title: 'Coffee',
    amount: 5,
    type: 'debit',
    category: 'Food',
    subcategory: 'Cafe',
    date: '2026-10-12',
    time: '10:00',
    source: 'Manual',
  }],
  investments: [],
  loans: [],
  savingsGoals: [{
    id: 'goal-1',
    title: 'Emergency fund',
    targetAmount: 1000,
    savedAmount: 100,
    targetDate: '2027-10-28',
    createdAt: '2026-10-28T10:00:00.000Z',
  }],
};

test('parses a complete backup including financial accounts', () => {
  assert.deepEqual(parseBackupJson(JSON.stringify(backup)), backup);
});

test('accepts legacy backups without accounts for backwards compatibility', () => {
  const { accounts: _accounts, ...legacyBackup } = backup;
  assert.equal(parseBackupJson(JSON.stringify(legacyBackup)).accounts, undefined);
});

test('accepts legacy backups without savings goals and validates included goals', () => {
  const { savingsGoals: _savingsGoals, ...legacyBackup } = backup;
  assert.equal(parseBackupJson(JSON.stringify(legacyBackup)).savingsGoals, undefined);
  assert.deepEqual(parseBackupJson(JSON.stringify(backup)).savingsGoals, backup.savingsGoals);
  assert.throws(
    () => parseBackupJson(JSON.stringify({ ...backup, savingsGoals: [{ id: 'bad' }] })),
    /savingsGoals/
  );
});

test('rejects malformed or incomplete backups without returning partial data', () => {
  assert.throws(() => parseBackupJson('{broken'), /not valid JSON/);
  assert.throws(() => parseBackupJson(JSON.stringify({ settings, ...backup, transactions: [{ id: 'bad' }] })), /transactions/);
  assert.throws(() => parseBackupJson(JSON.stringify({ ...backup, formatVersion: 2 })), /Unsupported backup format/);
});
