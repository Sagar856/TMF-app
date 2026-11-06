import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SYMBOLS_PER_REQUEST,
  SOURCE_GOOGLE_INTRADAY,
  SOURCE_YAHOO_INTRADAY,
  USD_INR_TICKER,
  googleTickers,
  isBlockedStatus,
  parseGoogleFinance,
  parseQuoteRequests,
  parseYahooChart,
  yahooTicker,
} from '../../supabase/functions/market-quotes/quotes';
import { SOURCE_GOOGLE_INTRADAY as APP_GOOGLE, SOURCE_YAHOO_INTRADAY as APP_YAHOO, isIntradaySource } from './marketData';

test('function source labels match the app so intraday quotes are recognised', () => {
  assert.equal(SOURCE_YAHOO_INTRADAY, APP_YAHOO);
  assert.equal(SOURCE_GOOGLE_INTRADAY, APP_GOOGLE);
  assert.ok(isIntradaySource(SOURCE_YAHOO_INTRADAY));
});

test('parseQuoteRequests normalizes suffixes and exchanges, drops invalid input and dedupes', () => {
  const requests = parseQuoteRequests({
    symbols: [
      'reliance',
      'TCS.NS',
      { symbol: 'TCS', exchange: 'NSE' },
      { symbol: 'SBIN.BO' },
      { symbol: 'AAPL', exchange: 'NASDAQ' },
      { symbol: 'BRK.B', exchange: 'NYSE' },
      { symbol: 'M&M', exchange: 'OTHER' },
      { symbol: 'BAD SYMBOL' },
      { symbol: 'X', exchange: 'LSE' },
      42,
      null,
    ],
  });
  assert.deepEqual(requests.map((r) => r.ticker), ['RELIANCE.NS', 'TCS.NS', 'SBIN.BO', 'AAPL', 'BRK-B', 'M&M.NS']);
  assert.deepEqual(requests[2], { key: 'SBIN', exchange: 'BSE', ticker: 'SBIN.BO' });
  assert.equal(requests[4].key, 'BRK.B');
  assert.deepEqual(parseQuoteRequests(null), []);
  assert.deepEqual(parseQuoteRequests({ symbols: 'TCS' }), []);
});

test('parseQuoteRequests caps the number of symbols per call', () => {
  const symbols = Array.from({ length: MAX_SYMBOLS_PER_REQUEST + 10 }, (_, i) => `SYM${i}`);
  assert.equal(parseQuoteRequests({ symbols }).length, MAX_SYMBOLS_PER_REQUEST);
});

test('ticker helpers map exchanges for Yahoo and Google', () => {
  assert.equal(yahooTicker('TCS', 'NSE'), 'TCS.NS');
  assert.equal(yahooTicker('TCS', 'BSE'), 'TCS.BO');
  assert.equal(yahooTicker('BRK.B', 'US'), 'BRK-B');
  assert.deepEqual(googleTickers({ key: 'TCS', exchange: 'NSE', ticker: 'TCS.NS' }), ['TCS:NSE']);
  assert.deepEqual(googleTickers({ key: 'TCS', exchange: 'BSE', ticker: 'TCS.BO' }), ['TCS:BOM']);
  assert.deepEqual(googleTickers({ key: 'AAPL', exchange: 'US', ticker: 'AAPL' }), ['AAPL:NASDAQ', 'AAPL:NYSE']);
  assert.deepEqual(googleTickers({ key: 'USDINR', exchange: 'US', ticker: USD_INR_TICKER }), ['USD-INR']);
});

test('parseYahooChart reads the live price, previous close and market time', () => {
  const quote = parseYahooChart({
    chart: {
      result: [{
        meta: { currency: 'INR', regularMarketPrice: 3512.456, chartPreviousClose: 3480, regularMarketTime: 1748850000 },
        indicators: { quote: [{ close: [3512.4] }] },
      }],
    },
  });
  assert.deepEqual(quote, {
    price: 3512.46,
    previousClose: 3480,
    currency: 'INR',
    asOf: new Date(1748850000 * 1000).toISOString(),
    source: SOURCE_YAHOO_INTRADAY,
  });
  assert.equal(parseYahooChart({ chart: { result: [{ meta: { regularMarketPrice: 10 } }] } }), null);
  assert.equal(parseYahooChart({ chart: { error: { code: 'Not Found' } } }), null);
});

test('parseGoogleFinance reads the embedded data attributes', () => {
  const html = `
    <div data-last-price="3,512.40" data-currency-code="INR" data-last-normal-market-timestamp="1748850000"></div>
    <div class="gyFHrc"><div class="mfs7Fc">Previous close</div><div class="P6K39c">₹3,480.00</div></div>`;
  const quote = parseGoogleFinance(html);
  assert.equal(quote?.price, 3512.4);
  assert.equal(quote?.previousClose, 3480);
  assert.equal(quote?.currency, 'INR');
  assert.equal(quote?.asOf, new Date(1748850000 * 1000).toISOString());
  assert.equal(quote?.source, SOURCE_GOOGLE_INTRADAY);
  assert.equal(parseGoogleFinance('<html>We could not find that</html>'), null);
});

test('isBlockedStatus flags throttling responses only', () => {
  assert.ok(isBlockedStatus(429));
  assert.ok(isBlockedStatus(403));
  assert.ok(!isBlockedStatus(404));
  assert.ok(!isBlockedStatus(500));
});
