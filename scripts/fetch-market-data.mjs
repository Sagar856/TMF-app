// Builds the daily market files consumed by the app (see .github/workflows/market-data.yml):
//   market-data.json  gold/silver (IBJA), USD/INR (ECB via Frankfurter) and NSE closes for older app versions
//   stocks.json       every listed NSE, BSE and US stock/ETF with its latest daily close (stock search + pricing)
//
//   node --import tsx scripts/fetch-market-data.mjs --out-dir out [--previous-dir previous]
//
// Sources: NSE bhavcopy + securities lists, BSE bhavcopy, Nasdaq screener (NASDAQ/NYSE/NYSE American/ETFs),
// nasdaqtrader symbol directory (names only, fallback), Frankfurter and IBJA. Any source that fails keeps its
// last published data, so a bad run never empties the app's stock list.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  MARKET_DATA_SCHEMA_VERSION,
  SOURCE_ECB_FX,
  SOURCE_NASDAQ_DAILY,
  mergeMarketSnapshots,
  parseIbjaRates,
  parseNseBhavcopy,
  validateMarketSnapshot,
} from '../src/utils/marketData.ts';
import {
  DIRECTORY_MARKETS,
  SOURCE_NASDAQ_SYMBOLS,
  STOCK_DIRECTORY_SCHEMA_VERSION,
  buildBseBlock,
  buildNseBlock,
  isUsMarketPossiblyOpen,
  lastUsSessionDate,
  parseBseBhavcopy,
  parseNasdaqScreener,
  parseNasdaqTraderList,
  parseNseSecurityList,
  parseStockDirectory,
  pickDirectoryBlock,
  priceRow,
  usCloseIso,
} from '../src/utils/stockDirectory.ts';

const { values: args } = parseArgs({
  options: {
    'out-dir': { type: 'string', default: '.' },
    'previous-dir': { type: 'string' },
  },
});

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/json,text/csv;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-IN,en;q=0.9',
};
const NSE_HEADERS = { Referer: 'https://www.nseindia.com/' };
const BSE_HEADERS = { Referer: 'https://www.bseindia.com/' };
const NASDAQ_HEADERS = { Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();

/** Fetches text; null on any failure. `notFound` reports 404s (missing daily file) separately. */
async function getText(url, headers = {}, timeoutMs = 30_000) {
  try {
    const res = await fetch(url, { headers: { ...BROWSER_HEADERS, ...headers }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      await res.body?.cancel();
      return { status: res.status, text: null };
    }
    return { status: res.status, text: await res.text() };
  } catch (error) {
    return { status: 0, text: null, error: error.message };
  }
}

/** Trading days to try, newest first, as IST calendar dates (weekends skipped). */
function recentIndianTradingDays(count = 7) {
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const days = [];
  for (let back = 0; back < count; back += 1) {
    const day = new Date(istNow.getTime() - back * 86_400_000);
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) days.push(day);
  }
  return days;
}

/** Tries each recent trading day until a file is published; stops early on a non-404 error. */
async function fetchDailyFile(label, urlFor, headers, parse) {
  for (const day of recentIndianTradingDays()) {
    const { status, text, error } = await getText(urlFor(day), headers);
    if (status === 404) continue; // Holiday or not published yet.
    if (!text) {
      console.warn(`${label}: ${error || `HTTP ${status}`}; using last published data.`);
      return null;
    }
    const parsed = parse(text);
    if (parsed) return parsed;
  }
  console.warn(`${label}: no file found for the last week.`);
  return null;
}

const fetchNseBhavcopy = () => fetchDailyFile(
  'NSE bhavcopy',
  (d) => `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${pad(d.getUTCDate())}${pad(d.getUTCMonth() + 1)}${d.getUTCFullYear()}.csv`,
  NSE_HEADERS,
  parseNseBhavcopy
);

const fetchBseBhavcopy = () => fetchDailyFile(
  'BSE bhavcopy',
  (d) => `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_F_0000.CSV`,
  BSE_HEADERS,
  parseBseBhavcopy
);

/** NSE equity and ETF lists: company names and ISINs (also lists stocks that did not trade today). */
async function fetchNseLists() {
  const [equities, etfs] = await Promise.all([
    getText('https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv', NSE_HEADERS),
    getText('https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv', NSE_HEADERS),
  ]);
  const listed = equities.text ? parseNseSecurityList(equities.text) : new Map();
  if (!equities.text) console.warn(`NSE equity list: ${equities.error || `HTTP ${equities.status}`}`);
  if (!etfs.text) console.warn(`NSE ETF list: ${etfs.error || `HTTP ${etfs.status}`}`);
  for (const [symbol, info] of etfs.text ? parseNseSecurityList(etfs.text) : []) {
    if (!listed.has(symbol)) listed.set(symbol, info);
  }
  return listed;
}

async function fetchNasdaqJson(url) {
  const { status, text, error } = await getText(url, NASDAQ_HEADERS, 60_000);
  if (!text) {
    console.warn(`Nasdaq screener ${url}: ${error || `HTTP ${status}`}`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    console.warn(`Nasdaq screener ${url}: invalid JSON`);
    return null;
  }
}

/** US stocks and ETFs with their last close. Returns blocks keyed by market (may be partial). */
async function fetchUsBlocks(previousMarkets) {
  const hasPrevious = ['NASDAQ', 'NYSE', 'AMEX', 'US_ETF'].some((m) => previousMarkets[m]);
  const marketOpen = isUsMarketPossiblyOpen(now);
  if (marketOpen && hasPrevious) {
    // Screener prices are live during the session; the next run after the close publishes them.
    console.log('US market is open: keeping the last published US closes.');
    return {};
  }
  const screens = [['NASDAQ', 'nasdaq'], ['NYSE', 'nyse'], ['AMEX', 'amex']];
  const [etfJson, ...stockJson] = await Promise.all([
    fetchNasdaqJson('https://api.nasdaq.com/api/screener/etf?tableonly=true&download=true'),
    ...screens.map(([, exchange]) => fetchNasdaqJson(`https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true&exchange=${exchange}`)),
  ]);
  const etf = etfJson ? parseNasdaqScreener(etfJson) : null;
  const sessionDate = etf?.asOfDate || lastUsSessionDate(now);
  const asOf = marketOpen ? now.toISOString() : usCloseIso(sessionDate);

  const blocks = {};
  const stockSymbols = new Set();
  screens.forEach(([market], index) => {
    const parsed = stockJson[index] ? parseNasdaqScreener(stockJson[index]) : null;
    if (!parsed?.rows.length) return;
    parsed.rows.forEach((row) => stockSymbols.add(row.symbol));
    blocks[market] = { currency: 'USD', asOf, source: SOURCE_NASDAQ_DAILY, rows: parsed.rows.map(priceRow) };
  });
  if (etf?.rows.length) {
    const rows = etf.rows.filter((row) => !stockSymbols.has(row.symbol)).map(priceRow);
    blocks.US_ETF = { currency: 'USD', asOf, source: SOURCE_NASDAQ_DAILY, rows };
  }
  if (Object.keys(blocks).length || hasPrevious) return blocks;

  // No prices and nothing published before: at least make every US listing searchable.
  console.warn('Nasdaq screener unavailable; publishing US names from the Nasdaq symbol directory.');
  const lists = await Promise.all([
    getText('https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt'),
    getText('https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt'),
  ]);
  for (const { text } of lists) {
    for (const entry of text ? parseNasdaqTraderList(text) : []) {
      blocks[entry.market] ??= { currency: 'USD', asOf: null, source: SOURCE_NASDAQ_SYMBOLS, rows: [] };
      blocks[entry.market].rows.push([entry.symbol, entry.name, null, null]);
    }
  }
  return blocks;
}

async function fetchUsdInr() {
  const { text, status, error } = await getText('https://api.frankfurter.app/latest?from=USD&to=INR', { Accept: 'application/json' });
  try {
    const json = text ? JSON.parse(text) : null;
    const rate = json?.rates?.INR;
    if (typeof rate === 'number' && rate > 0 && /^\d{4}-\d{2}-\d{2}$/.test(json.date)) {
      // ECB reference rates are set around 14:15 CET.
      return { USDINR: { rate, asOf: `${json.date}T13:15:00.000Z`, source: SOURCE_ECB_FX } };
    }
  } catch {
    // Fall through to the warning.
  }
  console.warn(`USD/INR: ${error || `HTTP ${status}`}; using last published rate.`);
  return {};
}

async function fetchMetals() {
  const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { text, status, error } = await getText('https://ibjarates.com/');
    if (text) return parseIbjaRates(text, istDate);
    console.warn(`IBJA rates: ${error || `HTTP ${status}`}`);
    if ([401, 403, 429].includes(status)) break;
  }
  return {};
}

async function readJson(name) {
  if (!args['previous-dir']) return null;
  try {
    return JSON.parse(await readFile(join(args['previous-dir'], name), 'utf8'));
  } catch {
    return null;
  }
}

const [previousSnapshotRaw, previousDirectoryRaw] = await Promise.all([readJson('market-data.json'), readJson('stocks.json')]);
const previousSnapshot = validateMarketSnapshot(previousSnapshotRaw);
const previousMarkets = previousDirectoryRaw?.schemaVersion === STOCK_DIRECTORY_SCHEMA_VERSION && previousDirectoryRaw.markets
  ? previousDirectoryRaw.markets
  : {};

const [nseBhavcopy, nseLists, bseBhavcopy, usBlocks, fx, metals] = await Promise.all([
  fetchNseBhavcopy(),
  fetchNseLists(),
  fetchBseBhavcopy(),
  fetchUsBlocks(previousMarkets),
  fetchUsdInr(),
  fetchMetals(),
]);

// ---- stocks.json -----------------------------------------------------------
const bseNamesByIsin = new Map();
const bseRows = bseBhavcopy?.rows.map((row) => [row.isin, row.name]) ?? (previousMarkets.BSE?.rows || []).map((row) => [row[4], row[1]]);
for (const [isin, name] of bseRows) if (isin && name) bseNamesByIsin.set(isin, name);

const freshBlocks = {
  NSE: buildNseBlock(nseBhavcopy, nseLists, bseNamesByIsin),
  BSE: buildBseBlock(bseBhavcopy),
  ...usBlocks,
};
const markets = {};
for (const market of DIRECTORY_MARKETS) {
  const block = pickDirectoryBlock(previousMarkets[market], freshBlocks[market] ?? null);
  if (block) markets[market] = block;
  const kept = block && block === previousMarkets[market] ? ' (kept from last run)' : '';
  console.log(`${market}: ${block ? `${block.rows.length} listings, ${block.asOf ? `closes as of ${block.asOf}` : 'names only'}` : 'none'}${kept}`);
}

const outDir = args['out-dir'];
await mkdir(outDir, { recursive: true });
let published = 0;

const directoryFile = { schemaVersion: STOCK_DIRECTORY_SCHEMA_VERSION, generatedAt: now.toISOString(), markets };
if (parseStockDirectory(directoryFile)) {
  await writeFile(join(outDir, 'stocks.json'), `${JSON.stringify(directoryFile)}\n`);
  console.log(`stocks.json: ${(await stat(join(outDir, 'stocks.json'))).size} bytes`);
  published += 1;
} else {
  console.log('::warning::No stock listings could be fetched and none were published before; stocks.json not written.');
}

// ---- market-data.json --------------------------------------------------------
const fresh = {
  schemaVersion: MARKET_DATA_SCHEMA_VERSION,
  generatedAt: now.toISOString(),
  stocks: nseBhavcopy?.quotes ?? {},
  metals,
  fx,
};
const freshCount = Object.keys(fresh.stocks).length + Object.keys(metals).length + Object.keys(fx).length;
console.log(`market-data.json: NSE closes ${Object.keys(fresh.stocks).length}; metals: ${Object.keys(metals).join(', ') || 'none'}; fx: ${Object.keys(fx).join(', ') || 'none'}`);
if (freshCount > 0 || previousSnapshot) {
  const merged = validateMarketSnapshot(freshCount > 0 ? mergeMarketSnapshots(previousSnapshot, fresh) : previousSnapshot);
  if (!merged) throw new Error('Generated snapshot failed validation');
  await writeFile(join(outDir, 'market-data.json'), `${JSON.stringify(merged)}\n`);
  published += 1;
} else {
  console.log('::warning::No market data could be fetched and no previous snapshot exists; market-data.json not written.');
}

// Not fatal when nothing was written: the app keeps its cached data and the next run tries again.
if (!published) console.log('::warning::Nothing to publish this run.');
