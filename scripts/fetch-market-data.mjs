// Builds the daily market-data.json consumed by the app (see .github/workflows/market-data.yml).
//
//   node --import tsx scripts/fetch-market-data.mjs --print-yahoo-symbols
//   node --import tsx scripts/fetch-market-data.mjs --out out/market-data.json \
//        [--previous out/previous.json] [--yahoo-quotes out/yahoo.json]
//
// Sources, in order of preference:
//   1. NSE bhavcopy: official closes for every NSE equity (so custom tickers work too).
//   2. yfinance output (--yahoo-quotes): BSE/US closes and USD/INR, fetched with browser impersonation.
//   3. Direct Yahoo chart API, only for symbols still missing; abandoned on the first 429/403.
//   4. IBJA for gold and silver.
// Anything that cannot be fetched keeps its last published value.
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { POPULAR_STOCKS_CATALOG } from '../src/services/stocksDatabase.ts';
import {
  MARKET_DATA_SCHEMA_VERSION,
  SOURCE_YAHOO_DAILY,
  mergeMarketSnapshots,
  parseIbjaRates,
  parseNseBhavcopy,
  pickNewerQuote,
  quoteFromYahooResult,
  toYahooSymbol,
  validateMarketSnapshot,
} from '../src/utils/marketData.ts';

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: 'market-data.json' },
    previous: { type: 'string' },
    'yahoo-quotes': { type: 'string' },
    'print-yahoo-symbols': { type: 'boolean', default: false },
  },
});

const USD_INR = 'INR=X';
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/json,text/csv;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-IN,en;q=0.9',
};
const BLOCKED_STATUSES = new Set([401, 403, 429, 999]);

const symbolMap = new Map(POPULAR_STOCKS_CATALOG.map((s) => [toYahooSymbol(s.symbol, s.exchange), s.symbol]));
const usCatalogSymbols = new Set(POPULAR_STOCKS_CATALOG.filter((s) => s.exchange === 'US').map((s) => s.symbol));

if (args['print-yahoo-symbols']) {
  console.log([...symbolMap.keys(), USD_INR].join('\n'));
  process.exit(0);
}

async function get(url, { headers = {}, timeoutMs = 20_000 } = {}) {
  return fetch(url, { headers: { ...BROWSER_HEADERS, ...headers }, signal: AbortSignal.timeout(timeoutMs) });
}

const pad = (n) => String(n).padStart(2, '0');

/** Walks back from today (IST) to the latest published NSE bhavcopy. */
async function fetchNseBhavcopy() {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  for (let back = 0; back < 7; back += 1) {
    const day = new Date(istNow.getTime() - back * 86_400_000);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    const stamp = `${pad(day.getUTCDate())}${pad(day.getUTCMonth() + 1)}${day.getUTCFullYear()}`;
    const url = `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${stamp}.csv`;
    try {
      const res = await get(url, { headers: { Referer: 'https://www.nseindia.com/' } });
      if (res.status === 404) {
        await res.body?.cancel();
        continue; // Holiday or not published yet: try the previous trading day.
      }
      if (!res.ok) {
        await res.body?.cancel();
        console.warn(`NSE bhavcopy: HTTP ${res.status}; skipping this source.`);
        return {};
      }
      const parsed = parseNseBhavcopy(await res.text());
      if (parsed) {
        console.log(`NSE bhavcopy ${parsed.date}: ${Object.keys(parsed.quotes).length} equities`);
        return parsed.quotes;
      }
    } catch (error) {
      console.warn(`NSE bhavcopy unavailable: ${error.message}`);
      return {};
    }
  }
  console.warn('NSE bhavcopy: no file found for the last week.');
  return {};
}

async function readYfinanceQuotes() {
  if (!args['yahoo-quotes']) return {};
  try {
    const raw = JSON.parse(await readFile(args['yahoo-quotes'], 'utf8'));
    const quotes = {};
    for (const [ticker, q] of Object.entries(raw || {})) {
      if (q && q.price > 0 && q.previousClose > 0 && typeof q.asOf === 'string') {
        quotes[ticker] = { price: q.price, previousClose: q.previousClose, currency: q.currency, asOf: q.asOf, source: SOURCE_YAHOO_DAILY };
      }
    }
    console.log(`yfinance: ${Object.keys(quotes).length} closes`);
    return quotes;
  } catch (error) {
    console.warn(`yfinance output unavailable: ${error.message}`);
    return {};
  }
}

/** Direct Yahoo calls for gaps only. One 429/403 means this runner is blocked: stop immediately. */
async function fetchYahooDirect(tickers) {
  const quotes = {};
  for (const ticker of tickers) {
    try {
      const res = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`, { timeoutMs: 10_000 });
      if (BLOCKED_STATUSES.has(res.status)) {
        await res.body?.cancel();
        console.warn(`Yahoo direct: HTTP ${res.status}; runner is throttled, skipping the remaining ${tickers.length - Object.keys(quotes).length} symbols.`);
        break;
      }
      if (!res.ok) {
        await res.body?.cancel();
        continue;
      }
      const quote = quoteFromYahooResult((await res.json())?.chart?.result?.[0], SOURCE_YAHOO_DAILY);
      if (quote) quotes[ticker] = quote;
    } catch (error) {
      console.warn(`Yahoo direct failed for ${ticker}: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (tickers.length) console.log(`Yahoo direct: ${Object.keys(quotes).length}/${tickers.length} closes`);
  return quotes;
}

async function fetchMetals() {
  const istDate = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await get('https://ibjarates.com/');
      if (res.ok) return parseIbjaRates(await res.text(), istDate);
      await res.body?.cancel();
      console.warn(`IBJA rates: HTTP ${res.status}`);
      if (BLOCKED_STATUSES.has(res.status)) break;
    } catch (error) {
      console.warn(`IBJA rates unavailable: ${error.message}`);
    }
  }
  return {};
}

async function readPrevious() {
  if (!args.previous) return null;
  try {
    return validateMarketSnapshot(JSON.parse(await readFile(args.previous, 'utf8')));
  } catch {
    return null;
  }
}

const [bhavcopy, yfinanceQuotes, metals, previous] = await Promise.all([
  fetchNseBhavcopy(),
  readYfinanceQuotes(),
  fetchMetals(),
  readPrevious(),
]);

const stocks = {};
// The full bhavcopy is published so custom NSE tickers also get a daily close.
for (const [symbol, quote] of Object.entries(bhavcopy)) {
  if (!usCatalogSymbols.has(symbol)) stocks[symbol] = quote;
}

const missingTickers = [...symbolMap.keys(), USD_INR].filter((ticker) => {
  if (yfinanceQuotes[ticker]) return false;
  const appSymbol = symbolMap.get(ticker);
  return ticker === USD_INR || !ticker.endsWith('.NS') || !stocks[appSymbol];
});
const yahooQuotes = { ...yfinanceQuotes, ...(await fetchYahooDirect(missingTickers)) };

for (const [ticker, appSymbol] of symbolMap) {
  // The official bhavcopy close wins over Yahoo's for the same trading day.
  const chosen = pickNewerQuote(stocks[appSymbol], yahooQuotes[ticker]);
  if (chosen) stocks[appSymbol] = chosen;
}
const fx = {};
if (yahooQuotes[USD_INR]) {
  const { price, asOf } = yahooQuotes[USD_INR];
  fx.USDINR = { rate: price, asOf, source: SOURCE_YAHOO_DAILY };
}

const fresh = { schemaVersion: MARKET_DATA_SCHEMA_VERSION, generatedAt: new Date().toISOString(), stocks, metals, fx };
const freshCount = Object.keys(stocks).length + Object.keys(metals).length + Object.keys(fx).length;
const missing = [...symbolMap.values()].filter((s) => !stocks[s]);

console.log(`Catalog: ${symbolMap.size - missing.length}/${symbolMap.size} stocks; total stocks: ${Object.keys(stocks).length}; metals: ${Object.keys(metals).join(', ') || 'none'}; fx: ${Object.keys(fx).join(', ') || 'none'}`);
if (missing.length) console.log(`::notice::No fresh close for ${missing.length} catalog symbol(s) (${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ', ...' : ''}); last known values are kept.`);

// Compact JSON: the full NSE list makes the file a few hundred KB.
if (freshCount === 0) {
  if (!previous) {
    // Not fatal: the app keeps its cached prices; the next scheduled run will try again.
    console.log('::warning::No market data could be fetched and no previous snapshot exists; nothing to publish.');
    process.exit(0);
  }
  console.log('::warning::All sources failed; keeping the previous snapshot unchanged.');
  await writeFile(args.out, `${JSON.stringify(previous)}\n`);
} else {
  const merged = validateMarketSnapshot(mergeMarketSnapshots(previous, fresh));
  if (!merged) throw new Error('Generated snapshot failed validation');
  await writeFile(args.out, `${JSON.stringify(merged)}\n`);
}
