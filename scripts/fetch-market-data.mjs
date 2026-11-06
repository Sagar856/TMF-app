// Builds the daily market-data.json consumed by the app (see .github/workflows/market-data.yml).
// Run with: node --import tsx scripts/fetch-market-data.mjs <out.json> [previous.json]
import { readFile, writeFile } from 'node:fs/promises';
import { POPULAR_STOCKS_CATALOG } from '../src/services/stocksDatabase.ts';
import {
  MARKET_DATA_SCHEMA_VERSION,
  mergeMarketSnapshots,
  parseIbjaRates,
  parseYahooSpark,
  quoteFromYahooResult,
  toYahooSymbol,
  validateMarketSnapshot,
} from '../src/utils/marketData.ts';

const [, , outPath = 'market-data.json', previousPath] = process.argv;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
};
const YAHOO_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const YAHOO_SOURCE = 'Yahoo Finance (daily close)';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, parse, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
      if (res.ok) return await parse(res);
      lastError = new Error(`HTTP ${res.status}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleep(1500 * attempt);
  }
  throw lastError;
}

async function fetchYahooQuotes(yahooSymbols) {
  const quotes = {};
  for (let i = 0; i < yahooSymbols.length; i += 20) {
    const batch = yahooSymbols.slice(i, i + 20);
    const query = `symbols=${batch.map(encodeURIComponent).join(',')}&range=5d&interval=1d`;
    for (const host of YAHOO_HOSTS) {
      try {
        Object.assign(quotes, parseYahooSpark(await fetchWithRetry(`${host}/v7/finance/spark?${query}`, (r) => r.json()), YAHOO_SOURCE));
        break;
      } catch (error) {
        console.warn(`Spark batch failed on ${host}: ${error.message}`);
      }
    }
    await sleep(400);
  }

  // Per-symbol chart fallback for anything the batch endpoint skipped.
  for (const symbol of yahooSymbols.filter((s) => !quotes[s])) {
    for (const host of YAHOO_HOSTS) {
      try {
        const json = await fetchWithRetry(`${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`, (r) => r.json(), 2);
        const quote = quoteFromYahooResult(json?.chart?.result?.[0], YAHOO_SOURCE);
        if (quote) quotes[symbol] = quote;
        break;
      } catch (error) {
        console.warn(`Chart fallback failed for ${symbol} on ${host}: ${error.message}`);
      }
    }
    await sleep(250);
  }
  return quotes;
}

async function fetchMetals() {
  const istDate = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  try {
    const html = await fetchWithRetry('https://ibjarates.com/', (r) => r.text());
    return parseIbjaRates(html, istDate);
  } catch (error) {
    console.warn(`IBJA rates unavailable: ${error.message}`);
    return {};
  }
}

async function readPrevious() {
  if (!previousPath) return null;
  try {
    return validateMarketSnapshot(JSON.parse(await readFile(previousPath, 'utf8')));
  } catch {
    return null;
  }
}

const symbolMap = new Map(POPULAR_STOCKS_CATALOG.map((s) => [toYahooSymbol(s.symbol, s.exchange), s.symbol]));
const [yahooQuotes, metals, previous] = await Promise.all([
  fetchYahooQuotes([...symbolMap.keys(), 'INR=X']),
  fetchMetals(),
  readPrevious(),
]);

const stocks = {};
for (const [yahooSymbol, appSymbol] of symbolMap) {
  if (yahooQuotes[yahooSymbol]) stocks[appSymbol] = yahooQuotes[yahooSymbol];
}
const fx = {};
if (yahooQuotes['INR=X']) {
  const { price, asOf } = yahooQuotes['INR=X'];
  fx.USDINR = { rate: price, asOf, source: YAHOO_SOURCE };
}

const fresh = { schemaVersion: MARKET_DATA_SCHEMA_VERSION, generatedAt: new Date().toISOString(), stocks, metals, fx };
const freshCount = Object.keys(stocks).length + Object.keys(metals).length;
const missing = [...symbolMap.values()].filter((s) => !stocks[s]);

console.log(`Fetched ${Object.keys(stocks).length}/${symbolMap.size} stocks, metals: ${Object.keys(metals).join(', ') || 'none'}, fx: ${Object.keys(fx).join(', ') || 'none'}`);
if (missing.length) console.log(`::warning::No fresh quote for ${missing.join(', ')}; last known values are kept.`);

if (freshCount === 0) {
  if (!previous) {
    console.error('::error::No market data could be fetched and no previous snapshot exists.');
    process.exit(1);
  }
  console.log('::warning::All sources failed; keeping the previous snapshot unchanged.');
  await writeFile(outPath, `${JSON.stringify(previous, null, 2)}\n`);
} else {
  const merged = validateMarketSnapshot(mergeMarketSnapshots(previous, fresh));
  if (!merged) throw new Error('Generated snapshot failed validation');
  await writeFile(outPath, `${JSON.stringify(merged, null, 2)}\n`);
}
