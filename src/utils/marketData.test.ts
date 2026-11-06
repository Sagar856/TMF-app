import test from 'node:test';
import assert from 'node:assert/strict';
import type { InvestmentRecord } from '../types/finance';
import {
  MARKET_DATA_SCHEMA_VERSION,
  MarketSnapshot,
  mergeMarketSnapshots,
  metalRatePerGram,
  normalizeNavDate,
  normalizeStockSymbol,
  parseIbjaRates,
  parseYahooSpark,
  quotePriceInInr,
  revalueInvestments,
  validateMarketSnapshot,
} from './marketData';

const AS_OF = '2025-06-02T10:00:00.000Z';

const snapshot = (overrides: Partial<MarketSnapshot> = {}): MarketSnapshot => ({
  schemaVersion: MARKET_DATA_SCHEMA_VERSION,
  generatedAt: AS_OF,
  stocks: {
    TCS: { price: 3500, previousClose: 3450, currency: 'INR', asOf: AS_OF, source: 'Daily Close' },
    AAPL: { price: 200, previousClose: 198, currency: 'USD', asOf: AS_OF, source: 'Daily Close' },
  },
  metals: {
    gold: { ratesPerGram: { '999': 9990, '916': 9150 }, asOf: AS_OF, source: 'IBJA benchmark rate' },
    silver: { ratesPerGram: { '999': 100 }, asOf: AS_OF, source: 'IBJA benchmark rate' },
  },
  fx: { USDINR: { rate: 85, asOf: AS_OF, source: 'Daily Close' } },
  ...overrides,
});

const holding = (overrides: Partial<InvestmentRecord>): InvestmentRecord => ({
  id: 'inv_1',
  name: 'Holding',
  type: 'Stocks',
  amountInvested: 1000,
  currentValue: 1000,
  returnsPercent: 0,
  startDate: '2025-01-01',
  ...overrides,
} as InvestmentRecord);

test('parseIbjaRates converts per-10g gold and per-kg silver, preferring the PM fix', () => {
  const html = `
    <span id="lblGold999_AM">95,000</span><span id="lblGold999_PM">96,000</span>
    <span id="lblGold916_AM">88,000</span>
    <span id="lblSilver999_PM">1,05,000</span>`;
  const rates = parseIbjaRates(html, AS_OF);
  assert.equal(rates.gold?.ratesPerGram['999'], 9600);
  assert.equal(rates.gold?.ratesPerGram['916'], 8800);
  assert.equal(rates.silver?.ratesPerGram['999'], 105);
});

test('parseIbjaRates ignores implausible values', () => {
  const rates = parseIbjaRates('<span id="lblGold999_PM">12</span><span id="lblSilver999_PM">5</span>', AS_OF);
  assert.deepEqual(rates, {});
});

test('parseYahooSpark reads latest and previous close per symbol', () => {
  const quotes = parseYahooSpark({
    spark: {
      result: [
        {
          symbol: 'TCS.NS',
          response: [{ meta: { currency: 'INR', regularMarketPrice: 3500.456, regularMarketTime: 1748858400 }, indicators: { quote: [{ close: [3400, null, 3450, 3500.456] }] } }],
        },
        { symbol: 'BROKEN', response: [{}] },
      ],
    },
  }, 'Daily Close');
  assert.deepEqual(Object.keys(quotes), ['TCS.NS']);
  assert.equal(quotes['TCS.NS'].price, 3500.46);
  assert.equal(quotes['TCS.NS'].previousClose, 3450);
  assert.equal(quotes['TCS.NS'].currency, 'INR');
});

test('validateMarketSnapshot rejects bad payloads and drops malformed entries', () => {
  assert.equal(validateMarketSnapshot(null), null);
  assert.equal(validateMarketSnapshot({ ...snapshot(), schemaVersion: 99 }), null);
  const cleaned = validateMarketSnapshot({
    ...snapshot(),
    stocks: { ...snapshot().stocks, BAD: { price: -1 } },
    metals: { gold: { ratesPerGram: {}, asOf: AS_OF, source: 'x' } },
  });
  assert.ok(cleaned);
  assert.ok(cleaned.stocks.TCS);
  assert.equal(cleaned.stocks.BAD, undefined);
  assert.equal(cleaned.metals.gold, undefined);
});

test('mergeMarketSnapshots keeps last-known values for anything not refetched', () => {
  const previous = snapshot();
  const merged = mergeMarketSnapshots(previous, {
    ...snapshot({ stocks: {}, metals: {}, fx: {} }),
    generatedAt: '2025-06-03T10:00:00.000Z',
  });
  assert.equal(merged.generatedAt, '2025-06-03T10:00:00.000Z');
  assert.equal(merged.stocks.TCS.price, 3500);
  assert.equal(merged.metals.gold?.ratesPerGram['999'], 9990);
  assert.equal(merged.fx.USDINR.rate, 85);
});

test('metalRatePerGram uses the exact purity or scales from 999', () => {
  const gold = snapshot().metals.gold;
  assert.equal(metalRatePerGram(gold, 916), 9150);
  assert.equal(metalRatePerGram(gold, 750), 7500);
  assert.equal(metalRatePerGram(undefined, 999), null);
  assert.equal(metalRatePerGram(gold, 0), null);
});

test('normalizers handle exchange suffixes and AMFI dates', () => {
  assert.equal(normalizeStockSymbol(' tcs.ns '), 'TCS');
  assert.equal(normalizeNavDate('31-05-2025'), '2025-05-31');
  assert.equal(normalizeNavDate('2025-05-31'), '2025-05-31');
  assert.equal(normalizeNavDate('garbage'), null);
});

test('quotePriceInInr converts USD quotes using the published rate', () => {
  const snap = snapshot();
  assert.equal(quotePriceInInr(snap.stocks.TCS, snap), 3500);
  assert.equal(quotePriceInInr(snap.stocks.AAPL, snap), 17000);
  assert.equal(quotePriceInInr(snap.stocks.AAPL, snapshot({ fx: {} })), null);
});

test('revalueInvestments reprices stocks, mutual funds and metals', () => {
  const { investments, changed } = revalueInvestments([
    holding({ id: 's', symbol: 'TCS.NS', shares: 2 }),
    holding({ id: 'us', symbol: 'AAPL', shares: 1 }),
    holding({ id: 'mf', type: 'Mutual Funds', schemeCode: '120503', units: 10 }),
    holding({ id: 'g', type: 'Physical Gold', metalWeightGrams: 10, metalPurity: 916 }),
  ], snapshot(), { '120503': { nav: 150, date: '2025-06-01' } });

  assert.equal(changed, true);
  const byId = Object.fromEntries(investments.map((inv) => [inv.id, inv]));
  assert.equal(byId.s.currentValue, 7000);
  assert.equal(byId.s.returnsPercent, 600);
  assert.equal(byId.us.currentValue, 17000);
  assert.equal(byId.mf.currentValue, 1500);
  assert.equal(byId.mf.navDate, '2025-06-01');
  assert.equal(byId.mf.priceSource, 'AMFI');
  assert.equal(byId.g.currentValue, 91500);
  assert.equal(byId.g.currentPrice, 9150);
});

test('revalueInvestments keeps newer or redeemed holdings and returns the same array when unchanged', () => {
  const input = [
    holding({ id: 's', symbol: 'TCS', shares: 2, priceTimestamp: '2025-06-05T00:00:00.000Z' }),
    holding({ id: 'r', symbol: 'TCS', shares: 2, status: 'redeemed' }),
    holding({ id: 'x', symbol: 'UNKNOWN', shares: 2 }),
  ];
  const result = revalueInvestments(input, snapshot());
  assert.equal(result.changed, false);
  assert.equal(result.investments, input);
});
