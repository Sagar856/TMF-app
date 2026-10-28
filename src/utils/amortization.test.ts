import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAmortizationSchedule, roundCurrency } from '../services/financialCalculations';

const sum = (values: number[]) => roundCurrency(values.reduce((a, b) => a + b, 0));

test('monthly reducing-balance schedule retires principal exactly and sums to total repayment', () => {
  const result = generateAmortizationSchedule({
    principal: 100000,
    annualInterestRate: 12,
    tenureMonths: 12,
    firstInstallmentDate: '2026-01-31',
  });
  assert.equal(result.periods, 12);
  assert.equal(result.repaymentFrequency, 'Monthly');
  assert.equal(result.schedule[result.schedule.length - 1].outstandingBalance, 0);
  assert.equal(sum(result.schedule.map((s) => s.principalComponent)), 100000);
  assert.equal(sum(result.schedule.map((s) => s.emiAmount)), result.totalRepaymentAmount);
  // Day clamping: Jan 31 -> Feb 28
  assert.equal(result.schedule[1].dueDate, '2026-02-28');
});

test('quarterly frequency produces 4 periods per year with quarterly interest', () => {
  const result = generateAmortizationSchedule({
    principal: 120000,
    annualInterestRate: 8,
    tenureMonths: 24,
    repaymentFrequency: 'Quarterly',
    firstInstallmentDate: '2026-03-01',
  });
  assert.equal(result.periods, 8);
  assert.equal(result.schedule[1].dueDate, '2026-06-01');
  // First period interest = principal * 8% / 4
  assert.equal(result.schedule[0].interestComponent, roundCurrency(120000 * 0.02));
  assert.equal(result.schedule[7].outstandingBalance, 0);
});

test('yearly frequency rounds partial years up and charges annual interest once per period', () => {
  const result = generateAmortizationSchedule({
    principal: 50000,
    annualInterestRate: 10,
    tenureMonths: 30,
    repaymentFrequency: 'Yearly',
    firstInstallmentDate: '2026-01-01',
  });
  assert.equal(result.periods, 3);
  assert.equal(result.schedule[0].interestComponent, 5000);
  assert.equal(result.schedule[2].dueDate, '2028-01-01');
});

test('processing fees are added to total cost but not amortised into installments', () => {
  const withoutFees = generateAmortizationSchedule({ principal: 60000, annualInterestRate: 0, tenureMonths: 6 });
  const withFees = generateAmortizationSchedule({ principal: 60000, annualInterestRate: 0, tenureMonths: 6, processingFees: 1500 });
  assert.equal(withFees.processingFees, 1500);
  assert.equal(withFees.monthlyEmi, withoutFees.monthlyEmi);
  assert.equal(withFees.totalRepaymentAmount, roundCurrency(withoutFees.totalRepaymentAmount + 1500));
});

test('EMI override below the interest due is ignored instead of producing negative principal', () => {
  const result = generateAmortizationSchedule({
    principal: 100000,
    annualInterestRate: 12,
    tenureMonths: 12,
    emiOverride: 500, // monthly interest alone is 1000
  });
  assert.equal(result.isOverridden, false);
  assert.ok(result.schedule.every((s) => s.principalComponent >= 0));
});

test('oversized EMI override retires the loan early without zero installments', () => {
  const result = generateAmortizationSchedule({
    principal: 10000,
    annualInterestRate: 12,
    tenureMonths: 12,
    emiOverride: 6000,
  });
  assert.equal(result.isOverridden, true);
  assert.ok(result.periods < 12);
  assert.equal(result.schedule[result.schedule.length - 1].outstandingBalance, 0);
  assert.ok(result.schedule.every((s) => s.emiAmount > 0));
});

test('invalid numeric inputs collapse to an empty schedule rather than NaN', () => {
  const result = generateAmortizationSchedule({ principal: Number.NaN, annualInterestRate: 10, tenureMonths: 12 });
  assert.equal(result.schedule.length, 0);
  assert.equal(result.totalRepaymentAmount, 0);
  const negativeRate = generateAmortizationSchedule({ principal: 1000, annualInterestRate: -5, tenureMonths: 2 });
  assert.equal(negativeRate.totalInterestPayable, 0);
});
