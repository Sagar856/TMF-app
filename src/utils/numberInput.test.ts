import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNumberInput, parsePositiveAmount, parseOptionalNonNegative } from './numberInput';

test('parseNumberInput distinguishes blank, zero and garbage', () => {
  assert.deepEqual(parseNumberInput(''), { ok: false, error: 'Value is required.' });
  assert.deepEqual(parseNumberInput('', { allowEmpty: true }), { ok: true, value: null });
  assert.deepEqual(parseNumberInput('0'), { ok: true, value: 0 });
  assert.deepEqual(parseNumberInput('12abc', { label: 'Rate' }), { ok: false, error: 'Rate must be a number.' });
  assert.deepEqual(parseNumberInput('1,250.50'), { ok: true, value: 1250.5 });
  assert.deepEqual(parseNumberInput('-5', { min: 0, label: 'Fee' }), { ok: false, error: 'Fee must be at least 0.' });
  assert.deepEqual(parseNumberInput('2.5', { integer: true, label: 'Months' }), { ok: false, error: 'Months must be a whole number.' });
  assert.deepEqual(parseNumberInput('150', { max: 100, label: 'Rate' }), { ok: false, error: 'Rate must be at most 100.' });
});

test('convenience parsers', () => {
  assert.deepEqual(parsePositiveAmount('0'), { ok: false, error: 'Amount must be greater than zero.' });
  assert.deepEqual(parsePositiveAmount('499.99'), { ok: true, value: 499.99 });
  assert.deepEqual(parseOptionalNonNegative(''), { ok: true, value: null });
  assert.deepEqual(parseOptionalNonNegative('-1', 'Penalty'), { ok: false, error: 'Penalty must be at least 0.' });
});
