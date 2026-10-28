import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_RECEIPT_BYTES, validateReceiptFile } from './receiptStorage';

const file = (type: string, size: number, name = 'receipt.png') => ({ type, size, name });

test('accepts supported, non-empty receipt images up to 10 MB', () => {
  assert.equal(validateReceiptFile(file('image/jpeg', 1024)), null);
  assert.equal(validateReceiptFile(file('image/png', MAX_RECEIPT_BYTES)), null);
  assert.equal(validateReceiptFile(file('image/webp', 2048)), null);
});

test('rejects unsupported, empty, oversized, and unnamed images', () => {
  assert.match(validateReceiptFile(file('application/pdf', 100)) || '', /JPEG, PNG, or WebP/);
  assert.match(validateReceiptFile(file('image/png', 0)) || '', /empty/);
  assert.match(validateReceiptFile(file('image/png', MAX_RECEIPT_BYTES + 1)) || '', /10 MB/);
  assert.match(validateReceiptFile(file('image/png', 100, '  ')) || '', /file name/);
});
