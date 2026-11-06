// Stock directory: every listed NSE, BSE and US stock/ETF with its latest daily close.
// Built by scripts/fetch-market-data.mjs (published as stocks.json on the market-data branch)
// and read by the app for stock search and pricing. Pure functions only.
import {
  SOURCE_BSE_BHAVCOPY,
  SOURCE_NASDAQ_DAILY,
  SOURCE_NSE_BHAVCOPY,
  stockQuoteKey,
  type StockQuoteEntry,
} from './marketData';

export const STOCK_DIRECTORY_SCHEMA_VERSION = 1;
export const SOURCE_NSE_LIST = 'NSE securities list';
export const SOURCE_NASDAQ_SYMBOLS = 'Nasdaq symbol directory';

/** Order also ranks equally good search matches. */
export const DIRECTORY_MARKETS = ['NSE', 'BSE', 'NASDAQ', 'NYSE', 'AMEX', 'US_ETF'] as const;
export type DirectoryMarket = (typeof DIRECTORY_MARKETS)[number];
export type StockExchange = 'NSE' | 'BSE' | 'US';

export const MARKET_LABELS: Record<DirectoryMarket, string> = {
  NSE: 'NSE',
  BSE: 'BSE',
  NASDAQ: 'NASDAQ',
  NYSE: 'NYSE',
  AMEX: 'NYSE American',
  US_ETF: 'US ETF',
};

/** [symbol, name, close, previous close, ISIN]; prices are null when only the listing is known. */
export type DirectoryRow = [string, string, number | null, number | null, string?];

export interface DirectoryMarketBlock {
  currency: 'INR' | 'USD';
  /** Close time of the prices in this block; null for a names-only block. */
  asOf: string | null;
  source: string;
  rows: DirectoryRow[];
}

export interface StockDirectoryFile {
  schemaVersion: number;
  generatedAt: string;
  markets: Partial<Record<DirectoryMarket, DirectoryMarketBlock>>;
}

export interface StockItem {
  symbol: string;
  name: string;
  market: DirectoryMarket;
  exchange: StockExchange;
  currency: 'INR' | 'USD';
  price: number | null;
  previousClose: number | null;
  asOf: string | null;
  isin?: string;
}

interface SearchEntry {
  symbol: string;
  name: string;
}

export interface StockDirectory {
  generatedAt: string;
  items: StockItem[];
  /** Daily closes keyed by `stockQuoteKey`. */
  quotes: Record<string, StockQuoteEntry>;
  /** Uppercase search text, parallel to `items`. */
  search: SearchEntry[];
}

const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9&.\-_]{0,29}$/;
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const round2 = (value: number) => Math.round(value * 100) / 100;
const toPrice = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[$,\s]/g, ''));
  return isPositiveNumber(n) ? round2(n) : null;
};

export function exchangeForMarket(market: DirectoryMarket): StockExchange {
  return market === 'NSE' || market === 'BSE' ? market : 'US';
}

// ---------------------------------------------------------------------------
// Source parsers (used by the daily workflow)
// ---------------------------------------------------------------------------

/** Splits a CSV line (quote-aware). Extra cells from unquoted commas are folded into `overflowIndex`. */
export function splitCsvLine(line: string, expectedCells = 0, overflowIndex = -1): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  if (expectedCells > 0 && overflowIndex >= 0 && cells.length > expectedCells) {
    const extra = cells.length - expectedCells;
    cells.splice(overflowIndex, extra + 1, cells.slice(overflowIndex, overflowIndex + extra + 1).join(','));
  }
  return cells.map((cell) => cell.trim());
}

/** Parses a CSV with a header row; unquoted commas inside the name column are tolerated. */
function readCsv(csv: string, nameColumns: string[]) {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return null;
  const header = splitCsvLine(lines[0]).map((cell) => cell.toUpperCase().replace(/\s+/g, ' '));
  const col = (...names: string[]) => names.map((name) => header.indexOf(name)).find((index) => index >= 0) ?? -1;
  const nameIndex = col(...nameColumns);
  const rows = lines.slice(1).map((line) => splitCsvLine(line, header.length, nameIndex));
  return { col, nameIndex, rows };
}

export interface ListedSecurity {
  name: string;
  isin?: string;
}

/**
 * NSE securities lists: EQUITY_L.csv ("SYMBOL, NAME OF COMPANY, ..., ISIN NUMBER") and
 * eq_etfseclist.csv ("Symbol, Underlying Asset, ..., ISINNumber").
 */
export function parseNseSecurityList(csv: string): Map<string, ListedSecurity> {
  const out = new Map<string, ListedSecurity>();
  const parsed = readCsv(csv, ['NAME OF COMPANY', 'UNDERLYING ASSET']);
  if (!parsed) return out;
  const iSymbol = parsed.col('SYMBOL');
  const iIsin = parsed.col('ISIN NUMBER', 'ISINNUMBER', 'ISIN');
  if (iSymbol < 0 || parsed.nameIndex < 0) return out;
  for (const cells of parsed.rows) {
    const symbol = (cells[iSymbol] || '').toUpperCase();
    const name = cells[parsed.nameIndex] || '';
    if (!SYMBOL_PATTERN.test(symbol) || !name) continue;
    const isin = (cells[iIsin] || '').toUpperCase();
    out.set(symbol, { name, ...(ISIN_PATTERN.test(isin) ? { isin } : {}) });
  }
  return out;
}

export interface PricedSecurity {
  symbol: string;
  name: string;
  isin?: string;
  price: number;
  previousClose: number;
}

/** BSE UDiFF bhavcopy (BhavCopy_BSE_CM_0_0_0_YYYYMMDD_F_0000.CSV): names, ISINs and closes. */
export function parseBseBhavcopy(csv: string): { date: string; rows: PricedSecurity[] } | null {
  const parsed = readCsv(csv, ['FININSTRMNM']);
  if (!parsed) return null;
  const [iDate, iIsin, iSymbol, iClose, iPrev] = ['TRADDT', 'ISIN', 'TCKRSYMB', 'CLSPRIC', 'PRVSCLSGPRIC'].map((n) => parsed.col(n));
  if ([iDate, iIsin, iSymbol, iClose, iPrev, parsed.nameIndex].some((index) => index < 0)) return null;
  const rows: PricedSecurity[] = [];
  const seen = new Set<string>();
  let date = '';
  for (const cells of parsed.rows) {
    const symbol = (cells[iSymbol] || '').toUpperCase();
    const price = toPrice(cells[iClose]);
    if (!SYMBOL_PATTERN.test(symbol) || !price || seen.has(symbol)) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(cells[iDate] || '')) date = cells[iDate];
    seen.add(symbol);
    const isin = (cells[iIsin] || '').toUpperCase();
    rows.push({
      symbol,
      name: cells[parsed.nameIndex] || symbol,
      ...(ISIN_PATTERN.test(isin) ? { isin } : {}),
      price,
      previousClose: toPrice(cells[iPrev]) ?? price,
    });
  }
  return date && rows.length ? { date, rows } : null;
}

const US_NAME_SUFFIX = /\s*[-,]?\s*(Class [A-Z]\s+)?(Common Stock|Common Shares|Ordinary Shares?|Class [A-Z] Ordinary Shares?)\s*$/i;

/** US display names without the "Common Stock" style suffix. */
export function cleanUsName(name: string): string {
  const cleaned = name.replace(US_NAME_SUFFIX, '').trim();
  return cleaned || name.trim();
}

/** Converts Nasdaq's symbol notation (BRK/B) to the dotted form used by the app (BRK.B). */
function usSymbol(raw: unknown): string | null {
  const symbol = String(raw ?? '').trim().toUpperCase().replace(/\//g, '.');
  // Preferred shares (ABR^D) and when-issued/test tickers are skipped.
  return SYMBOL_PATTERN.test(symbol) && !/[\^$]/.test(symbol) ? symbol : null;
}

/**
 * api.nasdaq.com screener responses: stocks (`data.rows` with symbol/name/lastsale/netchange)
 * and ETFs (`data.data.rows` with symbol/companyName/lastSalePrice/netChange, `data.dataAsOf`).
 */
export function parseNasdaqScreener(json: unknown): { asOfDate: string | null; rows: PricedSecurity[] } {
  const data = (json as { data?: Record<string, unknown> })?.data;
  const nested = data?.data as { rows?: unknown } | undefined;
  const list = (Array.isArray(data?.rows) ? data?.rows : nested?.rows) as Array<Record<string, unknown>> | undefined;
  const rows: PricedSecurity[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(list) ? list : []) {
    const symbol = usSymbol(item?.symbol);
    const price = toPrice(item?.lastsale ?? item?.lastSalePrice);
    const name = String(item?.name ?? item?.companyName ?? '').trim();
    if (!symbol || !price || !name || seen.has(symbol)) continue;
    seen.add(symbol);
    const change = Number(String(item?.netchange ?? item?.netChange ?? '').replace(/[,$\s]/g, ''));
    const previous = Number.isFinite(change) ? round2(price - change) : price;
    rows.push({ symbol, name: cleanUsName(name), price, previousClose: previous > 0 ? previous : price });
  }
  const asOf = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(data?.dataAsOf ?? ''));
  const asOfDate = asOf ? `${asOf[3]}-${asOf[1].padStart(2, '0')}-${asOf[2].padStart(2, '0')}` : null;
  return { asOfDate, rows };
}

/**
 * nasdaqtrader.com symbol directories (pipe-delimited): nasdaqlisted.txt and otherlisted.txt.
 * Names only; used when the priced screener is unavailable.
 */
export function parseNasdaqTraderList(text: string): Array<{ symbol: string; name: string; market: DirectoryMarket }> {
  const lines = text.split(/\r?\n/).filter((line) => line.includes('|'));
  if (lines.length < 2) return [];
  const header = lines[0].split('|').map((cell) => cell.trim().toUpperCase());
  const iSymbol = header.findIndex((h) => h === 'SYMBOL' || h === 'ACT SYMBOL');
  const iName = header.indexOf('SECURITY NAME');
  const iExchange = header.indexOf('EXCHANGE');
  const iEtf = header.indexOf('ETF');
  const iTest = header.indexOf('TEST ISSUE');
  if (iSymbol < 0 || iName < 0) return [];
  const out: Array<{ symbol: string; name: string; market: DirectoryMarket }> = [];
  for (const line of lines.slice(1)) {
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells[0]?.startsWith('File Creation Time') || cells[iTest] === 'Y') continue;
    const symbol = usSymbol(cells[iSymbol]);
    if (!symbol || !cells[iName]) continue;
    const exchange = iExchange >= 0 ? cells[iExchange] : 'Q';
    const market: DirectoryMarket = cells[iEtf] === 'Y'
      ? 'US_ETF'
      : exchange === 'Q' ? 'NASDAQ' : exchange === 'A' ? 'AMEX' : 'NYSE';
    out.push({ symbol, name: cleanUsName(cells[iName]), market });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Building and merging the published file (used by the daily workflow)
// ---------------------------------------------------------------------------

export function priceRow(security: PricedSecurity): DirectoryRow {
  return security.isin
    ? [security.symbol, security.name, security.price, security.previousClose, security.isin]
    : [security.symbol, security.name, security.price, security.previousClose];
}

/**
 * NSE block: bhavcopy closes named from the securities lists. When the bhavcopy is unavailable,
 * a names-only block is built from the lists so search still works.
 */
export function buildNseBlock(
  bhavcopy: { date: string; quotes: Record<string, StockQuoteEntry> } | null,
  listed: Map<string, ListedSecurity>,
  bseNamesByIsin: Map<string, string> = new Map()
): DirectoryMarketBlock | null {
  const nameFor = (symbol: string) => {
    const info = listed.get(symbol);
    const isin = info?.isin;
    // ETF list "names" are often just the index (e.g. "Nifty 50"); BSE's name for the same ISIN is clearer.
    return { name: (isin && bseNamesByIsin.get(isin)) || info?.name || symbol, isin };
  };
  if (bhavcopy && Object.keys(bhavcopy.quotes).length) {
    const rows = Object.entries(bhavcopy.quotes).map(([symbol, quote]) => {
      const { name, isin } = nameFor(symbol);
      return priceRow({ symbol, name, isin, price: quote.price, previousClose: quote.previousClose });
    });
    // Listed but not traded that day (suspended, illiquid or other series): searchable without a price.
    for (const symbol of listed.keys()) {
      if (bhavcopy.quotes[symbol]) continue;
      const { name, isin } = nameFor(symbol);
      rows.push(isin ? [symbol, name, null, null, isin] : [symbol, name, null, null]);
    }
    return { currency: 'INR', asOf: `${bhavcopy.date}T10:00:00.000Z`, source: SOURCE_NSE_BHAVCOPY, rows };
  }
  if (!listed.size) return null;
  const rows: DirectoryRow[] = [...listed.keys()].map((symbol) => {
    const { name, isin } = nameFor(symbol);
    return isin ? [symbol, name, null, null, isin] : [symbol, name, null, null];
  });
  return { currency: 'INR', asOf: null, source: SOURCE_NSE_LIST, rows };
}

export function buildBseBlock(bhavcopy: { date: string; rows: PricedSecurity[] } | null): DirectoryMarketBlock | null {
  if (!bhavcopy?.rows.length) return null;
  return { currency: 'INR', asOf: `${bhavcopy.date}T10:00:00.000Z`, source: SOURCE_BSE_BHAVCOPY, rows: bhavcopy.rows.map(priceRow) };
}

/** 16:00 New York of a US trading date, as UTC (20:00 in summer time, 21:00 in winter). */
export function usCloseIso(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  // US daylight saving: second Sunday of March to first Sunday of November.
  const nthSunday = (m: number, n: number) => {
    const first = new Date(Date.UTC(year, m - 1, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (n - 1) * 7;
  };
  const dstStart = Date.UTC(year, 2, nthSunday(3, 2));
  const dstEnd = Date.UTC(year, 10, nthSunday(11, 1));
  const ts = Date.UTC(year, month - 1, day);
  const hour = ts >= dstStart && ts < dstEnd ? 20 : 21;
  return new Date(Date.UTC(year, month - 1, day, hour)).toISOString();
}

/** The most recent US weekday session that has closed at `now` (holidays are not modelled). */
export function lastUsSessionDate(now: Date): string {
  // 22:00 UTC is after the close in both summer and winter time.
  let day = new Date(now.getTime() - 22 * 60 * 60 * 1000);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day = new Date(day.getTime() - 86_400_000);
  return day.toISOString().slice(0, 10);
}

/** True while the US regular session (13:30–21:00 UTC at most) may be trading. */
export function isUsMarketPossiblyOpen(now: Date): boolean {
  const day = now.getUTCDay();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return day >= 1 && day <= 5 && minutes >= 13 * 60 && minutes < 21 * 60 + 30;
}

/**
 * Keeps the previous block unless the fresh one looks complete. A fresh block that is much
 * smaller than the previous one usually means a truncated download or a changed layout.
 */
export function pickDirectoryBlock(
  previous: DirectoryMarketBlock | undefined,
  fresh: DirectoryMarketBlock | null
): DirectoryMarketBlock | undefined {
  if (!fresh || !fresh.rows.length) return previous;
  if (!previous) return fresh;
  const previousHasPrices = previous.asOf !== null;
  if (fresh.asOf === null && previousHasPrices) return previous;
  if (fresh.rows.length < previous.rows.length * 0.6) return previous;
  if (fresh.asOf && previous.asOf && Date.parse(fresh.asOf) < Date.parse(previous.asOf)) return previous;
  return fresh;
}

// ---------------------------------------------------------------------------
// Reading the published file (app)
// ---------------------------------------------------------------------------

const normalizeSearchText = (value: string) => value.toUpperCase().replace(/[^A-Z0-9&]+/g, ' ').trim();
const compactSymbol = (value: string) => value.toUpperCase().replace(/[^A-Z0-9&]/g, '');

/** Validates the published directory and indexes it for search and pricing. */
export function parseStockDirectory(raw: unknown): StockDirectory | null {
  const file = raw as Partial<StockDirectoryFile> | null;
  if (!file || typeof file !== 'object' || file.schemaVersion !== STOCK_DIRECTORY_SCHEMA_VERSION) return null;
  if (typeof file.generatedAt !== 'string' || Number.isNaN(Date.parse(file.generatedAt))) return null;
  if (!file.markets || typeof file.markets !== 'object') return null;

  const items: StockItem[] = [];
  const search: SearchEntry[] = [];
  const quotes: Record<string, StockQuoteEntry> = {};
  const seen = new Set<string>();
  for (const market of DIRECTORY_MARKETS) {
    const block = file.markets[market];
    if (!block || !Array.isArray(block.rows) || (block.currency !== 'INR' && block.currency !== 'USD')) continue;
    const asOf = typeof block.asOf === 'string' && !Number.isNaN(Date.parse(block.asOf)) ? block.asOf : null;
    const source = typeof block.source === 'string' ? block.source : '';
    const exchange = exchangeForMarket(market);
    for (const row of block.rows) {
      if (!Array.isArray(row)) continue;
      const symbol = typeof row[0] === 'string' ? row[0].toUpperCase() : '';
      const name = typeof row[1] === 'string' ? row[1].trim() : '';
      if (!SYMBOL_PATTERN.test(symbol) || !name) continue;
      const key = stockQuoteKey(symbol, exchange);
      if (seen.has(key)) continue;
      seen.add(key);
      const price = asOf && isPositiveNumber(row[2]) ? row[2] : null;
      const previousClose = price && isPositiveNumber(row[3]) ? row[3] : price;
      const isin = typeof row[4] === 'string' && ISIN_PATTERN.test(row[4]) ? row[4] : undefined;
      items.push({ symbol, name, market, exchange, currency: block.currency, price, previousClose, asOf: price ? asOf : null, ...(isin ? { isin } : {}) });
      search.push({ symbol: compactSymbol(symbol), name: ` ${normalizeSearchText(name)}` });
      if (price && asOf) {
        quotes[key] = { price, previousClose: previousClose ?? price, currency: block.currency, asOf, source };
      }
    }
  }
  return items.length ? { generatedAt: file.generatedAt, items, quotes, search } : null;
}

const MARKET_RANK: Record<DirectoryMarket, number> = { NSE: 0, BSE: 1, NASDAQ: 2, NYSE: 3, AMEX: 4, US_ETF: 5 };

/**
 * Ranked search over symbols, names and ISINs. Exact symbol first, then symbol prefix, name prefix,
 * every word matching a word start, and finally plain substring matches.
 */
export function searchStockDirectory(directory: StockDirectory | null, query: string, limit = 50): StockItem[] {
  if (!directory) return [];
  const raw = query.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
  const text = normalizeSearchText(raw);
  const compact = compactSymbol(raw);
  if (!text && !compact) return [];
  const tokens = text.split(' ').filter(Boolean);
  const isIsin = ISIN_PATTERN.test(compact);

  const matches: Array<{ index: number; score: number }> = [];
  directory.search.forEach((entry, index) => {
    let score: number;
    if (isIsin && directory.items[index].isin === compact) score = 0;
    else if (entry.symbol === compact) score = 1;
    else if (entry.symbol.startsWith(compact)) score = 2;
    else if (entry.name.startsWith(` ${text}`)) score = 3;
    else if (tokens.every((token) => entry.name.includes(` ${token}`))) score = 4;
    else if (entry.symbol.includes(compact) || tokens.every((token) => entry.name.includes(token))) score = 5;
    else return;
    matches.push({ index, score });
  });

  const { items } = directory;
  matches.sort((a, b) =>
    a.score - b.score
    || Number(items[b.index].price !== null) - Number(items[a.index].price !== null)
    || MARKET_RANK[items[a.index].market] - MARKET_RANK[items[b.index].market]
    || items[a.index].symbol.length - items[b.index].symbol.length
    || items[a.index].symbol.localeCompare(items[b.index].symbol)
  );
  return matches.slice(0, limit).map((match) => items[match.index]);
}

/** Exact listing for a symbol; prefers the given exchange, then NSE, BSE and US. */
export function findDirectoryStock(directory: StockDirectory | null, symbol: string | undefined, exchange?: string): StockItem | undefined {
  if (!directory || !symbol) return undefined;
  const clean = symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
  const suffixExchange = /\.BO$/i.test(symbol.trim()) ? 'BSE' : /\.NS$/i.test(symbol.trim()) ? 'NSE' : undefined;
  const wanted = (suffixExchange || exchange || '').toUpperCase();
  const candidates = directory.items.filter((item) => item.symbol === clean);
  return candidates.find((item) => item.exchange === wanted) ?? candidates[0];
}

export function findDirectoryStockByIsin(directory: StockDirectory | null, isin: string | undefined): StockItem | undefined {
  const clean = (isin || '').trim().toUpperCase();
  if (!directory || !ISIN_PATTERN.test(clean)) return undefined;
  return directory.items.find((item) => item.isin === clean && item.exchange === 'NSE')
    ?? directory.items.find((item) => item.isin === clean);
}
