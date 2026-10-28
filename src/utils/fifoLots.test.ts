import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRedemption, consumeLotsFifo } from '../services/financialCalculations';

const lots = [
  { id: 'l1', date: '2024-01-10', shares: 10, purchasePrice: 100 },
  { id: 'l2', date: '2025-06-01', shares: 10, purchasePrice: 200, brokerageFees: 20 },
];

test('FIFO consumes the oldest lot first and splits a lot when needed', () => {
  const r = consumeLotsFifo(lots, 15, 300, '2026-10-01');
  assert.equal(r.consumed.length, 2);
  assert.equal(r.consumed[0].lotId, 'l1');
  assert.equal(r.consumed[0].shares, 10);
  assert.equal(r.consumed[0].costBasis, 1000);
  assert.equal(r.consumed[0].isLongTerm, true);
  assert.equal(r.consumed[1].lotId, 'l2');
  assert.equal(r.consumed[1].shares, 5);
  // per-unit cost of l2 includes brokerage: 200 + 20/10 = 202
  assert.equal(r.consumed[1].costBasis, 1010);
  assert.equal(r.consumed[1].isLongTerm, true); // 2025-06-01 → 2026-10-01 = 487 days
  assert.equal(r.costBasis, 2010);
  assert.equal(r.remaining.length, 1);
  assert.equal(r.remaining[0].shares, 5);
  assert.equal(r.remaining[0].brokerageFees, 10);
});

test('short-term classification uses the redemption date', () => {
  const r = consumeLotsFifo([{ id: 'x', date: '2026-08-01', shares: 1, purchasePrice: 50 }], 1, 60, '2026-10-01');
  assert.equal(r.consumed[0].isLongTerm, false);
  assert.equal(r.consumed[0].holdingDays, 61);
});

test('calculateRedemption uses FIFO cost basis when lots are given and proportional otherwise', () => {
  const fifo = calculateRedemption({
    totalUnitsOrShares: 20,
    totalCostBasis: 3020,
    unitsOrSharesToRedeem: 10,
    redemptionPrice: 300,
    lots,
    redemptionDate: '2026-10-01',
  });
  assert.equal(fifo.allocatedCostBasis, 1000); // oldest lot @100
  assert.equal(fifo.remainingCostBasis, 2020); // 10 @200 + 20 fees
  assert.equal(fifo.grossProceeds, 3000);
  assert.equal(fifo.realizedProfitLoss, 2000);
  assert.equal(fifo.longTermGain, 2000);
  assert.equal(fifo.shortTermGain, 0);
  assert.equal(fifo.remainingLots?.length, 1);

  const proportional = calculateRedemption({
    totalUnitsOrShares: 20,
    totalCostBasis: 3020,
    unitsOrSharesToRedeem: 10,
    redemptionPrice: 300,
  });
  assert.equal(proportional.allocatedCostBasis, 1510);
  assert.equal(proportional.consumedLots, undefined);
});
