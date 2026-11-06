import test from 'node:test';
import assert from 'node:assert/strict';
import { getStockQuote, revalueInvestments, stockQuoteKey, type MarketSnapshot } from './marketData';
import {
  STOCK_DIRECTORY_SCHEMA_VERSION,
  buildNseBlock,
  cleanUsName,
  findDirectoryStock,
  findDirectoryStockByIsin,
  isUsMarketPossiblyOpen,
  lastUsSessionDate,
  parseBseBhavcopy,
  parseNasdaqScreener,
  parseNasdaqTraderList,
  parseNseSecurityList,
  parseStockDirectory,
  pickDirectoryBlock,
  searchStockDirectory,
  splitCsvLine,
  usCloseIso,
  type DirectoryMarketBlock,
  type StockDirectoryFile,
} from './stockDirectory';
import type { InvestmentRecord } from '../types/finance';

const ASOF_IN = '2026-11-06T10:00:00.000Z';
const ASOF_US = '2026-11-05T21:00:00.000Z';

const sampleFile = (): StockDirectoryFile => ({
  schemaVersion: STOCK_DIRECTORY_SCHEMA_VERSION,
  generatedAt: '2026-11-06T14:00:00.000Z',
  markets: {
    NSE: {
      currency: 'INR', asOf: ASOF_IN, source: 'NSE bhavcopy (official close)',
      rows: [
        ['RELIANCE', 'Reliance Industries Limited', 1320, 1300, 'INE002A01018'],
        ['INFY', 'Infosys Limited', 1181.4, 1170, 'INE009A01021'],
        ['NATIONALUM', 'National Aluminium Company Limited', 250, 245],
        ['SUSPENDED', 'Suspended Company Limited', null, null],
        ['bad symbol!', 'Ignored', 1, 1],
      ],
    },
    BSE: {
      currency: 'INR', asOf: ASOF_IN, source: 'BSE bhavcopy (official close)',
      rows: [['RELIANCE', 'RELIANCE INDUSTRIES LTD.', 1318.1, 1299, 'INE002A01018']],
    },
    NYSE: {
      currency: 'USD', asOf: ASOF_US, source: 'Nasdaq (daily close)',
      rows: [['INFY', 'Infosys Limited American Depositary Shares', 12.85, 12.24], ['BRK.B', 'Berkshire Hathaway Inc.', 572.32, 570]],
    },
    NASDAQ: {
      currency: 'USD', asOf: ASOF_US, source: 'Nasdaq (daily close)',
      rows: [['AAPL', 'Apple Inc.', 345.15, 349.51], ['APLE', 'Apple Hospitality REIT', 18.2, 18]],
    },
  },
});

test('splitCsvLine handles quotes and folds unquoted commas into the name column', () => {
  assert.deepEqual(splitCsvLine('A,"B, C",D'), ['A', 'B, C', 'D']);
  assert.deepEqual(splitCsvLine('X,Foo, Inc,EQ,INE1', 4, 1), ['X', 'Foo, Inc', 'EQ', 'INE1']);
});

test('parseNseSecurityList reads equity and ETF lists', () => {
  const equities = parseNseSecurityList(
    'SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE\n'
    + 'RELIANCE,Reliance Industries Limited,EQ,29-NOV-1995,10,1,INE002A01018,10\n'
    + 'ABC,Alpha, Beta & Co Limited,EQ,01-JAN-2020,10,1,INE123A01011,10\n'
  );
  assert.deepEqual(equities.get('RELIANCE'), { name: 'Reliance Industries Limited', isin: 'INE002A01018' });
  assert.equal(equities.get('ABC')?.name, 'Alpha, Beta & Co Limited');
  assert.equal(equities.get('ABC')?.isin, 'INE123A01011');

  const etfs = parseNseSecurityList(
    'Symbol,Underlying Asset,SecurityName,DateofListing,MarketLot,ISINNumber,FaceValue\n'
    + 'NIFTYBEES,Nifty 50,NIPNIFTY,08-JAN-2002,1,INF204KB14I2,1\n'
  );
  assert.deepEqual(etfs.get('NIFTYBEES'), { name: 'Nifty 50', isin: 'INF204KB14I2' });
});

test('parseBseBhavcopy reads names, ISINs and closes', () => {
  const header = 'TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric';
  const parsed = parseBseBhavcopy(
    `${header}\n2026-11-06,2026-11-06,CM,BSE,STK,500325,INE002A01018,RELIANCE,A,,,,,RELIANCE INDUSTRIES LTD.,1300,1325,1295,1318.1,1318,1299\n`
    + '2026-11-06,2026-11-06,CM,BSE,STK,1,INE000000000,ZERO,A,,,,,ZERO LTD,0,0,0,0,0,0\n'
  );
  assert.ok(parsed);
  assert.equal(parsed.date, '2026-11-06');
  assert.deepEqual(parsed.rows, [
    { symbol: 'RELIANCE', name: 'RELIANCE INDUSTRIES LTD.', isin: 'INE002A01018', price: 1318.1, previousClose: 1299 },
  ]);
});

test('parseNasdaqScreener reads stock and ETF responses', () => {
  const stocks = parseNasdaqScreener({
    data: {
      rows: [
        { symbol: 'AAPL', name: 'Apple Inc. Common Stock', lastsale: '$345.15', netchange: '-4.36' },
        { symbol: 'BRK/B', name: 'Berkshire Hathaway Inc.', lastsale: '$572.32', netchange: '2.32' },
        { symbol: 'ABR^D', name: 'Arbor preferred', lastsale: '$20', netchange: '0' },
        { symbol: 'NOPE', name: 'No price', lastsale: 'NA', netchange: 'UNCH' },
      ],
    },
  });
  assert.deepEqual(stocks.rows.map((r) => [r.symbol, r.name, r.price, r.previousClose]), [
    ['AAPL', 'Apple Inc.', 345.15, 349.51],
    ['BRK.B', 'Berkshire Hathaway Inc.', 572.32, 570],
  ]);
  const etfs = parseNasdaqScreener({
    data: { dataAsOf: '11/5/2026 3:57:00 PM', data: { rows: [{ symbol: 'SPY', companyName: 'SPDR S&P 500', lastSalePrice: '$600.10', netChange: '1.10' }] } },
  });
  assert.equal(etfs.asOfDate, '2026-11-05');
  assert.equal(etfs.rows[0].previousClose, 599);
});

test('cleanUsName and parseNasdaqTraderList', () => {
  assert.equal(cleanUsName('Alphabet Inc. - Class A Common Stock'), 'Alphabet Inc.');
  assert.equal(cleanUsName('Arm Holdings plc American Depositary Shares'), 'Arm Holdings plc American Depositary Shares');
  const list = parseNasdaqTraderList(
    'ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol\n'
    + 'BRK.B|Berkshire Hathaway Inc. Common Stock|N|BRK.B|N|100|N|BRK.B\n'
    + 'SPY|SPDR S&P 500 ETF Trust|P|SPY|Y|100|N|SPY\n'
    + 'ZTEST|Test|N|ZTEST|N|100|Y|ZTEST\n'
    + 'File Creation Time: 1105202600:01|||||||\n'
  );
  assert.deepEqual(list, [
    { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.', market: 'NYSE' },
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', market: 'US_ETF' },
  ]);
});

test('buildNseBlock names ETFs from BSE and keeps unpriced listings searchable', () => {
  const listed = new Map([
    ['NIFTYBEES', { name: 'Nifty 50', isin: 'INF204KB14I2' }],
    ['IDLE', { name: 'Idle Company Limited' }],
  ]);
  const block = buildNseBlock(
    { date: '2026-11-06', quotes: { NIFTYBEES: { price: 284.22, previousClose: 283, currency: 'INR', asOf: ASOF_IN, source: 'x' } } },
    listed,
    new Map([['INF204KB14I2', 'NIPPON INDIA ETF NIFTY BEES']])
  );
  assert.ok(block);
  assert.equal(block.asOf, ASOF_IN);
  assert.deepEqual(block.rows, [
    ['NIFTYBEES', 'NIPPON INDIA ETF NIFTY BEES', 284.22, 283, 'INF204KB14I2'],
    ['IDLE', 'Idle Company Limited', null, null],
  ]);
  const namesOnly = buildNseBlock(null, listed);
  assert.equal(namesOnly?.asOf, null);
  assert.equal(namesOnly?.rows.length, 2);
  assert.equal(buildNseBlock(null, new Map()), null);
});

test('pickDirectoryBlock never replaces good data with a partial or older block', () => {
  const block = (rows: number, asOf: string | null): DirectoryMarketBlock => ({
    currency: 'INR', asOf, source: 's', rows: Array.from({ length: rows }, (_, i) => [`S${i}`, `N${i}`, asOf ? 1 : null, asOf ? 1 : null]),
  });
  const previous = block(100, ASOF_IN);
  assert.equal(pickDirectoryBlock(previous, null), previous);
  assert.equal(pickDirectoryBlock(previous, block(40, '2026-11-07T10:00:00.000Z')), previous);
  assert.equal(pickDirectoryBlock(previous, block(100, null)), previous);
  assert.equal(pickDirectoryBlock(previous, block(100, '2026-11-05T10:00:00.000Z')), previous);
  const fresh = block(98, '2026-11-07T10:00:00.000Z');
  assert.equal(pickDirectoryBlock(previous, fresh), fresh);
  const namesOnly = block(10, null);
  assert.equal(pickDirectoryBlock(undefined, namesOnly), namesOnly);
});

test('US session helpers', () => {
  assert.equal(usCloseIso('2026-07-01'), '2026-07-01T20:00:00.000Z');
  assert.equal(usCloseIso('2026-12-01'), '2026-12-01T21:00:00.000Z');
  assert.equal(lastUsSessionDate(new Date('2026-11-09T03:00:00Z')), '2026-11-06'); // Monday morning → Friday
  assert.equal(lastUsSessionDate(new Date('2026-11-06T23:00:00Z')), '2026-11-06');
  assert.equal(isUsMarketPossiblyOpen(new Date('2026-11-06T15:00:00Z')), true);
  assert.equal(isUsMarketPossiblyOpen(new Date('2026-11-06T02:30:00Z')), false);
  assert.equal(isUsMarketPossiblyOpen(new Date('2026-11-07T15:00:00Z')), false); // Saturday
});

test('parseStockDirectory validates rows and keys quotes per exchange', () => {
  assert.equal(parseStockDirectory(null), null);
  assert.equal(parseStockDirectory({ ...sampleFile(), schemaVersion: 99 }), null);
  const directory = parseStockDirectory(sampleFile());
  assert.ok(directory);
  assert.equal(directory.items.length, 9);
  assert.equal(directory.quotes.RELIANCE.price, 1320);
  assert.equal(directory.quotes['BSE:RELIANCE'].price, 1318.1);
  assert.equal(directory.quotes['US:INFY'].currency, 'USD');
  assert.equal(directory.quotes.INFY.currency, 'INR');
  assert.equal(directory.quotes.SUSPENDED, undefined);
  assert.equal(findDirectoryStock(directory, 'SUSPENDED')?.price, null);
});

test('searchStockDirectory ranks exact symbols, prefixes, names and ISINs', () => {
  const directory = parseStockDirectory(sampleFile());
  const symbols = (query: string) => searchStockDirectory(directory, query).map((s) => `${s.market}:${s.symbol}`);
  assert.deepEqual(symbols('infy'), ['NSE:INFY', 'NYSE:INFY']);
  assert.deepEqual(symbols('reliance.ns'), ['NSE:RELIANCE', 'BSE:RELIANCE']);
  assert.deepEqual(symbols('apple').slice(0, 2), ['NASDAQ:AAPL', 'NASDAQ:APLE']);
  assert.deepEqual(symbols('national alum'), ['NSE:NATIONALUM']);
  assert.deepEqual(symbols('brk.b'), ['NYSE:BRK.B']);
  assert.deepEqual(symbols('INE002A01018'), ['NSE:RELIANCE', 'BSE:RELIANCE']);
  assert.deepEqual(symbols('   '), []);
  assert.deepEqual(searchStockDirectory(null, 'x'), []);
  assert.equal(findDirectoryStockByIsin(directory, 'ine002a01018')?.market, 'NSE');
});

test('holdings are priced from the listing on their own exchange', () => {
  const directory = parseStockDirectory(sampleFile())!;
  const snapshot: MarketSnapshot = {
    schemaVersion: 1, generatedAt: ASOF_IN, stocks: directory.quotes, metals: {},
    fx: { USDINR: { rate: 90, asOf: ASOF_IN, source: 'ECB reference rate' } },
  };
  assert.equal(stockQuoteKey('BRK.B', 'NYSE'), 'US:BRK.B');
  assert.equal(getStockQuote(snapshot, 'INFY', 'US')?.price, 12.85);
  assert.equal(getStockQuote(snapshot, 'INFY.NS')?.price, 1181.4);
  const holding = (id: string, symbol: string, exchange: InvestmentRecord['exchange']): InvestmentRecord => ({
    id, name: symbol, type: 'Stocks', symbol, exchange, shares: 2, purchasePrice: 1, currentPrice: 1,
    amountInvested: 2, currentValue: 2, returnsPercent: 0, date: '2026-01-01', status: 'active',
    priceTimestamp: '2026-01-01T00:00:00.000Z',
  } as InvestmentRecord);
  const { investments } = revalueInvestments(
    [holding('a', 'INFY', 'NSE'), holding('b', 'RELIANCE', 'BSE'), holding('c', 'INFY', 'US')],
    snapshot
  );
  assert.deepEqual(investments.map((inv) => inv.currentPrice), [1181.4, 1318.1, 1156.5]);
});
