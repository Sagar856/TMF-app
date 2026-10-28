import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Transaction } from '../types/finance';
import { parseTransactionsCsv, stringifyTransactionsCsv } from './transactionCsv';

const transaction: Transaction = {
  id: 'tx-1',
  title: 'Coffee, with "friends"',
  amount: 12.5,
  type: 'debit',
  category: 'Food',
  subcategory: 'Cafe',
  date: '2026-10-12',
  time: '09:30',
  source: 'UPI',
  payeeOrPayer: 'Cafe "North"',
  location: { lat: 19.076, lng: 72.8777, name: 'Mumbai, India' },
  refNumber: 'ref,123',
  kind: 'expense',
  accountId: 'acc_hdfc',
  paymentMethod: 'acc_hdfc',
  note: 'Team catch-up [Tags: #work]',
};

test('CSV export round-trips quoted values, optional fields, location, kind, account and note', () => {
  const csv = stringifyTransactionsCsv([transaction]);
  const result = parseTransactionsCsv(csv, () => 'generated-id');

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.transactions, [transaction]);
});

test('CSV import assigns IDs, infers kind, and defaults optional transaction fields', () => {
  const csv = [
    'Title,Type,Amount,Category,Date',
    '"Salary, monthly",Credit,1200,Income,2026-10-12',
  ].join('\n');

  const result = parseTransactionsCsv(csv, () => 'generated-id');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.transactions, [{
    id: 'generated-id',
    title: 'Salary, monthly',
    amount: 1200,
    type: 'credit',
    category: 'Income',
    subcategory: '',
    date: '2026-10-12',
    time: '00:00',
    source: 'Manual',
    payeeOrPayer: undefined,
    location: undefined,
    refNumber: undefined,
    kind: 'income',
  }]);
});

test('CSV import accepts spreadsheet type aliases, formatted amounts and signed amounts', () => {
  const csv = [
    'Title,Type,Amount,Category,Date',
    'Rent,Expense,"₹12,500.00",Housing,2026-10-01',
    'Bonus,income,"1.250,50",Income,2026-10-02',
    'Petrol,,-800,Transport,2026-10-03',
    'Refund,,(300),Shopping,2026-10-04',
  ].join('\n');
  const result = parseTransactionsCsv(csv, () => 'id');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.transactions.map((t) => [t.type, t.amount, t.kind]), [
    ['debit', 12500, 'expense'],
    ['credit', 1250.5, 'income'],
    ['debit', 800, 'expense'],
    ['debit', 300, 'expense'],
  ]);
});

test('CSV import flags duplicate IDs and duplicate un-identified rows within the file', () => {
  const csv = [
    'ID,Title,Type,Amount,Category,Date,Time',
    'tx-1,Lunch,debit,200,Food,2026-10-12,12:00',
    'tx-1,Lunch again,debit,250,Food,2026-10-12,13:00',
    ',Coffee,debit,80,Food,2026-10-12,09:00',
    ',Coffee,debit,80,Food,2026-10-12,09:00',
  ].join('\n');
  const result = parseTransactionsCsv(csv, () => 'gen');
  assert.equal(result.transactions.length, 2);
  assert.deepEqual(result.errors, [
    'Row 3: duplicate ID "tx-1" in this file.',
    'Row 5: duplicate of an earlier row (same title, amount, date and time).',
  ]);
});

test('CSV import reports invalid rows while retaining valid rows', () => {
  const csv = [
    'ID,Title,Type,Amount,Category,Date',
    'tx-1,Valid,debit,2,Food,2026-10-12',
    'tx-2,Invalid,transfer,3,Food,2026-10-12',
    'tx-3,Invalid date,credit,3,Income,2026-02-30',
  ].join('\n');

  const result = parseTransactionsCsv(csv, () => 'generated-id');
  assert.equal(result.transactions.length, 1);
  assert.deepEqual(result.errors, [
    'Row 3: type must be credit or debit.',
    'Row 4: date must be a valid YYYY-MM-DD date.',
  ]);
});

test('CSV import rejects missing required columns and malformed quoting', () => {
  assert.match(parseTransactionsCsv('Title,Amount\nLunch,5').errors[0], /Missing required columns/);
  assert.throws(() => parseTransactionsCsv('Title,Type,Amount,Category,Date\n"Lunch,debit,5,Food,2026-10-12'), /unclosed quoted field/);
});

test('CSV import rejects unsupported payment sources instead of silently coercing them', () => {
  const result = parseTransactionsCsv([
    'Title,Type,Amount,Category,Date,Source',
    'Lunch,debit,5,Food,2026-10-12,Unsupported',
  ].join('\n'));

  assert.equal(result.transactions.length, 0);
  assert.deepEqual(result.errors, ['Row 2: source must be UPI, SMS, Manual, or Bank Sync.']);
});
