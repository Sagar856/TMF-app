import { Transaction, PaymentSource, TransactionKind } from '../types/finance';
import { normalizeTransactionType } from './transactionType';
import { inferTransactionKind } from './transactionKind';
import { newId } from './ids';

const CSV_HEADERS = [
  'ID',
  'Title',
  'Type',
  'Amount',
  'Category',
  'Subcategory',
  'Date',
  'Time',
  'Source',
  'Payee',
  'Location',
  'Reference / UTR',
  'Location Latitude',
  'Location Longitude',
  'Kind',
  'Account ID',
  'Payment Method',
  'Note',
];

const TRANSACTION_KINDS: ReadonlySet<string> = new Set<TransactionKind>([
  'income',
  'expense',
  'refund',
  'transfer',
  'investment',
  'loan_disbursal',
  'loan_repayment',
]);

export interface TransactionCsvParseResult {
  transactions: Transaction[];
  errors: string[];
}

/**
 * Parses spreadsheet-style amounts: currency symbols, thousands separators and
 * either `.` or `,` as the decimal mark (`₹1,234.50`, `1.234,50`, `(500)`).
 * Returns NaN when the text is not a number.
 */
export function parseCsvAmount(raw: string): number {
  let text = raw.trim();
  if (!text) return Number.NaN;
  const negativeByParens = /^\(.*\)$/.test(text);
  text = text.replace(/[()]/g, '');
  const negative = negativeByParens || /^-/.test(text) || /-$/.test(text);
  text = text.replace(/[^0-9.,]/g, '');
  if (!text) return Number.NaN;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: the later one is the decimal separator.
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (lastComma !== -1) {
    const decimals = text.length - lastComma - 1;
    // A single trailing group of 1–2 digits reads as a decimal mark; otherwise commas are thousands separators.
    text = (text.match(/,/g) || []).length === 1 && decimals > 0 && decimals <= 2 ? text.replace(',', '.') : text.replace(/,/g, '');
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return Number.NaN;
  return negative ? -value : value;
}

function encodeCsvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (inQuotes) {
      if (character === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      inQuotes = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && content[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (inQuotes) throw new Error('CSV contains an unclosed quoted field.');
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parsePaymentSource(value: string): PaymentSource {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'upi') return 'UPI';
  if (normalized === 'sms') return 'SMS';
  if (normalized === 'bank sync') return 'Bank Sync';
  return 'Manual';
}

function isSupportedPaymentSource(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === ''
    || normalized === 'upi'
    || normalized === 'sms'
    || normalized === 'manual'
    || normalized === 'bank sync';
}

export function stringifyTransactionsCsv(transactions: readonly Transaction[]): string {
  const rows = transactions.map((transaction) => [
    transaction.id,
    transaction.title,
    transaction.type,
    transaction.amount,
    transaction.category,
    transaction.subcategory,
    transaction.date,
    transaction.time,
    transaction.source,
    transaction.payeeOrPayer || '',
    transaction.location?.name || '',
    transaction.refNumber || '',
    transaction.location?.lat ?? '',
    transaction.location?.lng ?? '',
    transaction.kind || '',
    transaction.accountId || '',
    transaction.paymentMethod || '',
    transaction.note || '',
  ]);
  return [CSV_HEADERS, ...rows].map((row) => row.map(encodeCsvCell).join(',')).join('\r\n');
}

export function parseTransactionsCsv(
  content: string,
  createId: () => string = () => newId('tx')
): TransactionCsvParseResult {
  const rows = parseCsvRows(content.replace(/^\uFEFF/, ''));
  if (rows.length === 0) return { transactions: [], errors: ['CSV file is empty.'] };

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const requiredHeaders = ['title', 'type', 'amount', 'category', 'date'];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    return {
      transactions: [],
      errors: [`Missing required columns: ${missingHeaders.join(', ')}.`],
    };
  }

  const column = (name: string) => headers.indexOf(name.toLowerCase());
  const value = (cells: string[], name: string) => cells[column(name)]?.trim() || '';
  const transactions: Transaction[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();

  rows.slice(1).forEach((cells, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const title = value(cells, 'Title');
    const rawType = value(cells, 'Type');
    const amountText = value(cells, 'Amount');
    const signedAmount = parseCsvAmount(amountText);
    // A blank type can be inferred from a signed amount (negative = money out).
    const type = normalizeTransactionType(rawType) ?? (!rawType && Number.isFinite(signedAmount) && signedAmount !== 0 ? (signedAmount < 0 ? 'debit' : 'credit') : null);
    const amount = Math.abs(signedAmount);
    const category = value(cells, 'Category');
    const date = value(cells, 'Date');
    const source = value(cells, 'Source');

    if (!title) {
      errors.push(`Row ${rowNumber}: title is required.`);
      return;
    }
    if (!type) {
      errors.push(`Row ${rowNumber}: type must be credit or debit.`);
      return;
    }
    if (!amountText || !Number.isFinite(amount)) {
      errors.push(`Row ${rowNumber}: amount must be a number.`);
      return;
    }
    if (!category) {
      errors.push(`Row ${rowNumber}: category is required.`);
      return;
    }
    if (!isValidDate(date)) {
      errors.push(`Row ${rowNumber}: date must be a valid YYYY-MM-DD date.`);
      return;
    }
    if (!isSupportedPaymentSource(source)) {
      errors.push(`Row ${rowNumber}: source must be UPI, SMS, Manual, or Bank Sync.`);
      return;
    }

    const latText = value(cells, 'Location Latitude');
    const lngText = value(cells, 'Location Longitude');
    const locationName = value(cells, 'Location');
    let location: Transaction['location'];
    if (latText || lngText) {
      const lat = Number(latText);
      const lng = Number(lngText);
      if (!latText || !lngText || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        errors.push(`Row ${rowNumber}: location coordinates are invalid.`);
        return;
      }
      location = { lat, lng, name: locationName };
    }

    const time = value(cells, 'Time');
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      errors.push(`Row ${rowNumber}: time must use HH:MM format.`);
      return;
    }

    const rawKind = value(cells, 'Kind').toLowerCase();
    if (rawKind && !TRANSACTION_KINDS.has(rawKind)) {
      errors.push(`Row ${rowNumber}: kind must be one of ${Array.from(TRANSACTION_KINDS).join(', ')}.`);
      return;
    }

    const suppliedId = value(cells, 'ID');
    const id = suppliedId || createId();
    if (suppliedId && seenIds.has(suppliedId)) {
      errors.push(`Row ${rowNumber}: duplicate ID "${id}" in this file.`);
      return;
    }
    const subcategory = value(cells, 'Subcategory');
    const fingerprint = [title.toLowerCase(), type, amount, date, time || '00:00', (value(cells, 'Reference / UTR') || '').toLowerCase()].join('|');
    if (!suppliedId && seenFingerprints.has(fingerprint)) {
      errors.push(`Row ${rowNumber}: duplicate of an earlier row (same title, amount, date and time).`);
      return;
    }
    if (suppliedId) seenIds.add(suppliedId);
    seenFingerprints.add(fingerprint);

    const note = value(cells, 'Note') || undefined;
    const draft = {
      id,
      title,
      amount,
      type,
      category,
      subcategory,
      date,
      time: time || '00:00',
      source: parsePaymentSource(value(cells, 'Source')),
      payeeOrPayer: value(cells, 'Payee') || undefined,
      location,
      refNumber: value(cells, 'Reference / UTR') || undefined,
    };
    transactions.push({
      ...draft,
      ...(rawKind ? { kind: rawKind as TransactionKind } : { kind: inferTransactionKind({ ...draft, note }) }),
      ...(value(cells, 'Account ID') ? { accountId: value(cells, 'Account ID') } : {}),
      ...(value(cells, 'Payment Method') ? { paymentMethod: value(cells, 'Payment Method') } : {}),
      ...(note ? { note } : {}),
    });
  });

  return { transactions, errors };
}
