import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFixedDeposit } from '../services/financialCalculations';

test('cumulative FD compounds quarterly to maturity', () => {
  const r = calculateFixedDeposit({
    principal: 100000,
    annualInterestRate: 8,
    depositDate: '2025-01-01',
    tenureMonths: 12,
    compoundingFrequency: 'quarterly',
    currentDate: '2025-07-02',
  });
  assert.equal(r.isValid, true);
  assert.equal(r.totalMaturityAmount, 108243.22);
  assert.equal(r.periodicPayout, 0);
  assert.ok(r.accruedInterestToDate > 3900 && r.accruedInterestToDate < 4100);
});

test('monthly payout FD pays simple interest out each month and matures at principal', () => {
  const r = calculateFixedDeposit({
    principal: 120000,
    annualInterestRate: 6,
    depositDate: '2025-01-01',
    tenureMonths: 12,
    payoutFrequency: 'monthly',
    currentDate: '2025-07-02',
  });
  assert.equal(r.isValid, true);
  assert.equal(r.periodicPayout, 600);
  assert.equal(r.totalMaturityAmount, 120000);
  assert.equal(r.totalInterestAtMaturity, 7200);
  assert.equal(r.payoutsToDate, 6);
  assert.equal(r.interestPaidOutToDate, 3600);
  // Accrued-but-unpaid interest is only the partial current period
  assert.ok(r.accruedInterestToDate >= 0 && r.accruedInterestToDate < 600);
});

test('invalid FD inputs are reported instead of producing NaN', () => {
  assert.equal(calculateFixedDeposit({ principal: 1000, annualInterestRate: 7, depositDate: 'not-a-date' }).isValid, false);
  assert.match(calculateFixedDeposit({ principal: 1000, annualInterestRate: 7, depositDate: '2025-01-01', maturityDate: '2024-01-01' }).validationError || '', /after the deposit date/);
  assert.match(calculateFixedDeposit({ principal: 1000, annualInterestRate: -1, depositDate: '2025-01-01' }).validationError || '', /between 0 and 100/);
  assert.match(calculateFixedDeposit({ principal: 1000, annualInterestRate: 7, depositDate: '2025-01-01', tenureMonths: 0 }).validationError || '', /Tenure/);
});
