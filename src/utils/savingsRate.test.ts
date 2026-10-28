import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateSavingsRate } from './savingsRate';

test('calculates positive, zero, and negative savings rates without clamping', () => {
  assert.equal(calculateSavingsRate(1000, 750), 25);
  assert.equal(calculateSavingsRate(1000, 1000), 0);
  assert.equal(calculateSavingsRate(1000, 1500), -50);
});

test('returns no rate when income is zero or an input is invalid', () => {
  assert.equal(calculateSavingsRate(0, 250), null);
  assert.equal(calculateSavingsRate(-1, 0), null);
  assert.equal(calculateSavingsRate(100, Number.NaN), null);
});
