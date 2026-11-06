import type { InvestmentRecord, InvestmentType } from '../types/finance';

export const MARKET_DATA_SCHEMA_VERSION = 1;

export const SOURCE_YAHOO_DAILY = 'Yahoo Finance (daily close)';
export const SOURCE_NSE_BHAVCOPY = 'NSE bhavcopy (official close)';
export const SOURCE_BSE_BHAVCOPY = 'BSE bhavcopy (official close)';
export const SOURCE_NASDAQ_DAILY = 'Nasdaq (daily close)';
export const SOURCE_ECB_FX = 'ECB reference rate';
export const SOURCE_IBJA = 'IBJA benchmark rate';
export const SOURCE_YAHOO_INTRADAY = 'Yahoo Finance (intraday)';
export const SOURCE_GOOGLE_INTRADAY = 'Google Finance (intraday)';

const INTRADAY_SOURCES: ReadonlySet<string> = new Set([SOURCE_YAHOO_INTRADAY, SOURCE_GOOGLE_INTRADAY]);

/** Price sources that come from a market feed rather than the user's own entry. */
export const MARKET_FEED_SOURCES: ReadonlySet<string> = new Set([
  'NSE/BSE (Live)', 'AMFI', SOURCE_YAHOO_DAILY, SOURCE_NSE_BHAVCOPY, SOURCE_BSE_BHAVCOPY, SOURCE_NASDAQ_DAILY,
  SOURCE_IBJA, ...INTRADAY_SOURCES,
]);

export function isIntradaySource(source: string | undefined): boolean {
  return Boolean(source && INTRADAY_SOURCES.has(source));
}

export type MetalKind = 'gold' | 'silver';

export interface StockQuoteEntry {
  price: number;
  previousClose: number;
  currency: string;
  asOf: string;
  source: string;
}

export interface MetalRateEntry {
  /** Rupees per gram keyed by purity in parts per thousand ("999", "916", ...). */
  ratesPerGram: Record<string, number>;
  asOf: string;
  source: string;
}

export interface FxRateEntry {
  rate: number;
  asOf: string;
  source: string;
}

export interface MarketSnapshot {
  schemaVersion: number;
  generatedAt: string;
  stocks: Record<string, StockQuoteEntry>;
  metals: Partial<Record<MetalKind, MetalRateEntry>>;
  fx: Record<string, FxRateEntry>;
}

export interface MutualFundNavEntry {
  nav: number;
  /** ISO date (YYYY-MM-DD) of the NAV. */
  date: string;
  schemeName?: string;
}

export const PHYSICAL_METAL_TYPES: Record<MetalKind, InvestmentType> = {
  gold: 'Physical Gold',
  silver: 'Physical Silver',
};

export const METAL_PURITY_OPTIONS: Record<MetalKind, Array<{ value: number; label: string }>> = {
  gold: [
    { value: 999, label: '24K (999)' },
    { value: 995, label: '24K (995)' },
    { value: 916, label: '22K (916)' },
    { value: 750, label: '18K (750)' },
    { value: 585, label: '14K (585)' },
  ],
  silver: [
    { value: 999, label: 'Fine silver (999)' },
    { value: 925, label: 'Sterling (925)' },
  ],
};

export function metalKindForType(type: InvestmentType | string | undefined): MetalKind | null {
  if (type === 'Physical Gold') return 'gold';
  if (type === 'Physical Silver') return 'silver';
  return null;
}

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const round2 = (value: number) => Math.round(value * 100) / 100;

export function normalizeStockSymbol(symbol: string | undefined): string {
  return (symbol || '').trim().toUpperCase().replace(/\.(NS|BO)$/, '');
}

/**
 * Key of a stock in `MarketSnapshot.stocks`. NSE keeps the bare symbol (the published file's
 * original format); BSE and US listings are prefixed so e.g. INFY (NSE) and INFY (US ADR) never collide.
 * Must match `quoteResponseKey` in supabase/functions/market-quotes/quotes.ts.
 */
export function stockQuoteKey(symbol: string | undefined, exchange?: string): string {
  const clean = normalizeStockSymbol(symbol);
  const ex = (exchange || '').toUpperCase();
  if (ex === 'BSE') return `BSE:${clean}`;
  if (ex === 'US' || ex === 'NASDAQ' || ex === 'NYSE' || ex === 'AMEX' || ex === 'US_ETF') return `US:${clean}`;
  return clean;
}

/** Maps a catalog symbol + exchange to its Yahoo Finance ticker. */
export function toYahooSymbol(symbol: string, exchange: string): string {
  if (exchange === 'NSE') return `${symbol}.NS`;
  if (exchange === 'BSE') return `${symbol}.BO`;
  return symbol;
}

/** Extracts the latest close from a Yahoo chart/spark result ({ meta, indicators }). */
export function quoteFromYahooResult(result: unknown, source: string): StockQuoteEntry | null {
  const r = result as { meta?: Record<string, unknown>; indicators?: { quote?: Array<{ close?: unknown[] }> } } | null;
  const meta = r?.meta;
  if (!meta) return null;
  const closes = (r?.indicators?.quote?.[0]?.close || []).filter(isPositiveNumber);
  const price = isPositiveNumber(meta.regularMarketPrice) ? meta.regularMarketPrice : closes[closes.length - 1];
  if (!isPositiveNumber(price)) return null;
  const previousClose = closes.length >= 2
    ? closes[closes.length - 2]
    : isPositiveNumber(meta.chartPreviousClose) ? meta.chartPreviousClose : price;
  const marketTime = typeof meta.regularMarketTime === 'number' ? meta.regularMarketTime : 0;
  return {
    price: round2(price),
    previousClose: round2(previousClose),
    currency: typeof meta.currency === 'string' && meta.currency ? meta.currency.toUpperCase() : 'INR',
    asOf: marketTime > 0 ? new Date(marketTime * 1000).toISOString() : new Date().toISOString(),
    source,
  };
}

/** Parses a Yahoo v7 spark response into quotes keyed by the Yahoo ticker. */
export function parseYahooSpark(json: unknown, source: string): Record<string, StockQuoteEntry> {
  const results = (json as { spark?: { result?: unknown[] } })?.spark?.result;
  const quotes: Record<string, StockQuoteEntry> = {};
  if (!Array.isArray(results)) return quotes;
  for (const item of results) {
    const entry = item as { symbol?: unknown; response?: unknown[] };
    if (typeof entry?.symbol !== 'string' || !Array.isArray(entry.response)) continue;
    const quote = quoteFromYahooResult(entry.response[0], source);
    if (quote) quotes[entry.symbol] = quote;
  }
  return quotes;
}

function readIbjaNumber(html: string, id: string): number | null {
  const match = new RegExp(`id=["']${id}["'][^>]*>\\s*([\\d,]+(?:\\.\\d+)?)\\s*<`, 'i').exec(html);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  return isPositiveNumber(value) ? value : null;
}

/**
 * Parses IBJA's published benchmark rates. Gold is quoted per 10 g and silver per kg;
 * the PM fix is preferred and the AM fix is used before the PM rate is published.
 */
export function parseIbjaRates(html: string, asOf: string): Partial<Record<MetalKind, MetalRateEntry>> {
  const read = (label: string) => readIbjaNumber(html, `lbl${label}_PM`) ?? readIbjaNumber(html, `lbl${label}_AM`);
  const metals: Partial<Record<MetalKind, MetalRateEntry>> = {};

  const goldRates: Record<string, number> = {};
  for (const purity of ['999', '995', '916', '750', '585']) {
    const per10g = read(`Gold${purity}`);
    if (per10g) goldRates[purity] = round2(per10g / 10);
  }
  // Sanity bounds protect against layout changes that would pick up an unrelated number.
  if (goldRates['999'] && goldRates['999'] > 1000 && goldRates['999'] < 200000) {
    metals.gold = { ratesPerGram: goldRates, asOf, source: SOURCE_IBJA };
  }

  const silverPerKg = read('Silver999');
  if (silverPerKg) {
    const perGram = round2(silverPerKg / 1000);
    if (perGram > 10 && perGram < 5000) {
      metals.silver = { ratesPerGram: { '999': perGram }, asOf, source: SOURCE_IBJA };
    }
  }
  return metals;
}

const BHAVCOPY_MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};
/** Equity series that trade normally (EQ) or in trade-for-trade (BE); excludes bonds, warrants etc. */
const BHAVCOPY_SERIES = new Set(['EQ', 'BE']);

/**
 * Parses NSE's "sec_bhavdata_full" CSV (official end-of-day prices for every listed security).
 * The close is stamped at 15:30 IST of the trading date.
 */
export function parseNseBhavcopy(csv: string): { date: string; quotes: Record<string, StockQuoteEntry> } | null {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return null;
  const header = lines[0].split(',').map((cell) => cell.trim().toUpperCase());
  const col = (name: string) => header.indexOf(name);
  const [iSymbol, iSeries, iDate, iPrev, iClose] = ['SYMBOL', 'SERIES', 'DATE1', 'PREV_CLOSE', 'CLOSE_PRICE'].map(col);
  if ([iSymbol, iSeries, iDate, iPrev, iClose].some((index) => index < 0)) return null;

  const quotes: Record<string, StockQuoteEntry> = {};
  let date = '';
  for (const line of lines.slice(1)) {
    const cells = line.split(',').map((cell) => cell.trim());
    if (!BHAVCOPY_SERIES.has(cells[iSeries]?.toUpperCase())) continue;
    const match = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(cells[iDate] || '');
    const month = match ? BHAVCOPY_MONTHS[match[2].toUpperCase()] : undefined;
    const close = Number(cells[iClose]);
    const previous = Number(cells[iPrev]);
    const symbol = normalizeStockSymbol(cells[iSymbol]);
    if (!match || !month || !symbol || !isPositiveNumber(close)) continue;
    date = `${match[3]}-${month}-${match[1]}`;
    // EQ is listed before BE for the rare symbols present in both; keep the first.
    if (quotes[symbol]) continue;
    quotes[symbol] = {
      price: round2(close),
      previousClose: round2(isPositiveNumber(previous) ? previous : close),
      currency: 'INR',
      asOf: `${date}T10:00:00.000Z`,
      source: SOURCE_NSE_BHAVCOPY,
    };
  }
  return date ? { date, quotes } : null;
}

/** Returns whichever quote is more recent; `primary` wins ties. */
export function pickNewerQuote<T extends { asOf: string }>(primary: T | undefined, secondary: T | undefined): T | undefined {
  if (!primary) return secondary;
  if (!secondary) return primary;
  return new Date(secondary.asOf).getTime() > new Date(primary.asOf).getTime() ? secondary : primary;
}

/**
 * Overlays on-demand (intraday) quotes onto the daily snapshot. Only quotes newer than the
 * daily close replace it, so a stale intraday cache never hides a fresher published close.
 */
export function overlayQuotes(
  snapshot: MarketSnapshot | null,
  quotes: Record<string, StockQuoteEntry>,
  fx: Record<string, FxRateEntry> = {}
): MarketSnapshot | null {
  const symbols = Object.keys(quotes);
  const fxKeys = Object.keys(fx);
  if (!symbols.length && !fxKeys.length) return snapshot;
  const base: MarketSnapshot = snapshot || {
    schemaVersion: MARKET_DATA_SCHEMA_VERSION,
    generatedAt: new Date(0).toISOString(),
    stocks: {},
    metals: {},
    fx: {},
  };
  let changed = false;
  const stocks = { ...base.stocks };
  for (const symbol of symbols) {
    const key = normalizeStockSymbol(symbol);
    const chosen = pickNewerQuote(stocks[key], quotes[symbol]);
    if (chosen !== stocks[key]) {
      stocks[key] = chosen!;
      changed = true;
    }
  }
  const nextFx = { ...base.fx };
  for (const key of fxKeys) {
    const chosen = pickNewerQuote(nextFx[key], fx[key]);
    if (chosen !== nextFx[key]) {
      nextFx[key] = chosen!;
      changed = true;
    }
  }
  return changed ? { ...base, stocks, fx: nextFx } : snapshot;
}

const isIsoDateString = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(new Date(value).getTime());

function sanitizeRecord<T>(raw: unknown, check: (value: unknown) => value is T): Record<string, T> {
  const out: Record<string, T> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (check(value)) out[key] = value;
  }
  return out;
}

const isStockEntry = (value: unknown): value is StockQuoteEntry => {
  const v = value as StockQuoteEntry;
  return Boolean(v) && isPositiveNumber(v.price) && isPositiveNumber(v.previousClose)
    && typeof v.currency === 'string' && isIsoDateString(v.asOf) && typeof v.source === 'string';
};

const isMetalEntry = (value: unknown): value is MetalRateEntry => {
  const v = value as MetalRateEntry;
  return Boolean(v) && isIsoDateString(v.asOf) && typeof v.source === 'string'
    && Boolean(v.ratesPerGram) && typeof v.ratesPerGram === 'object'
    && Object.values(v.ratesPerGram).length > 0 && Object.values(v.ratesPerGram).every(isPositiveNumber);
};

const isFxEntry = (value: unknown): value is FxRateEntry => {
  const v = value as FxRateEntry;
  return Boolean(v) && isPositiveNumber(v.rate) && isIsoDateString(v.asOf) && typeof v.source === 'string';
};

/** Validates untrusted JSON, dropping malformed entries. Returns null when the payload is unusable. */
export function validateMarketSnapshot(raw: unknown): MarketSnapshot | null {
  const value = raw as Partial<MarketSnapshot> | null;
  if (!value || typeof value !== 'object' || value.schemaVersion !== MARKET_DATA_SCHEMA_VERSION) return null;
  if (!isIsoDateString(value.generatedAt)) return null;
  const metals = sanitizeRecord(value.metals, isMetalEntry) as Partial<Record<MetalKind, MetalRateEntry>>;
  return {
    schemaVersion: MARKET_DATA_SCHEMA_VERSION,
    generatedAt: value.generatedAt,
    stocks: sanitizeRecord(value.stocks, isStockEntry),
    metals: { ...(metals.gold ? { gold: metals.gold } : {}), ...(metals.silver ? { silver: metals.silver } : {}) },
    fx: sanitizeRecord(value.fx, isFxEntry),
  };
}

function mergeNewer<T extends { asOf: string }>(previous: Record<string, T>, next: Record<string, T>): Record<string, T> {
  const merged = { ...previous };
  for (const [key, entry] of Object.entries(next)) merged[key] = pickNewerQuote(entry, previous[key])!;
  return merged;
}

/** Keeps last-known values for anything the latest run failed to fetch; never replaces a newer quote with an older one. */
export function mergeMarketSnapshots(previous: MarketSnapshot | null, next: MarketSnapshot): MarketSnapshot {
  if (!previous) return next;
  return {
    schemaVersion: MARKET_DATA_SCHEMA_VERSION,
    generatedAt: next.generatedAt,
    stocks: mergeNewer(previous.stocks, next.stocks),
    metals: {
      ...(next.metals.gold || previous.metals.gold ? { gold: next.metals.gold || previous.metals.gold } : {}),
      ...(next.metals.silver || previous.metals.silver ? { silver: next.metals.silver || previous.metals.silver } : {}),
    },
    fx: mergeNewer(previous.fx, next.fx),
  };
}

/** Rupees per gram for a purity; derives from the finest published rate when that purity is not quoted. */
export function metalRatePerGram(entry: MetalRateEntry | undefined, purity: number): number | null {
  if (!entry || !isPositiveNumber(purity) || purity > 1000) return null;
  const exact = entry.ratesPerGram[String(purity)];
  if (isPositiveNumber(exact)) return exact;
  const fine = entry.ratesPerGram['999'];
  return isPositiveNumber(fine) ? round2((fine * purity) / 999) : null;
}

export function getStockQuote(snapshot: MarketSnapshot | null, symbol: string | undefined, exchange?: string): StockQuoteEntry | null {
  if (!snapshot || !normalizeStockSymbol(symbol)) return null;
  return snapshot.stocks[stockQuoteKey(symbol, exchange)] || null;
}

/** Holdings are valued in rupees; USD listings are converted at the published USD/INR rate. */
export function quotePriceInInr(quote: StockQuoteEntry, snapshot: MarketSnapshot | null): number | null {
  if (quote.currency === 'INR') return quote.price;
  const usdInr = snapshot?.fx.USDINR?.rate;
  if (quote.currency === 'USD' && isPositiveNumber(usdInr)) return round2(quote.price * usdInr);
  return null;
}

/** "DD-MM-YYYY" (mfapi.in) or ISO → "YYYY-MM-DD". */
export function normalizeNavDate(value: string | undefined): string | null {
  if (!value) return null;
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

const returnsPercent = (invested: number, value: number) =>
  invested > 0 ? parseFloat((((value - invested) / invested) * 100).toFixed(2)) : 0;

/**
 * Re-prices holdings from the daily snapshot and AMFI NAVs. Records are only replaced when
 * a newer price than the one already stored is available, so manual valuations stay intact
 * until fresher market data arrives.
 */
export function revalueInvestments(
  investments: InvestmentRecord[],
  snapshot: MarketSnapshot | null,
  mfNavs: Record<string, MutualFundNavEntry> = {}
): { investments: InvestmentRecord[]; changed: boolean } {
  let changed = false;
  const isNewer = (asOf: string, existing?: string) => {
    if (!existing) return true;
    const existingTs = new Date(existing).getTime();
    return Number.isNaN(existingTs) || new Date(asOf).getTime() > existingTs;
  };

  const next = investments.map((inv) => {
    if (inv.status === 'redeemed') return inv;
    const invested = Number(inv.amountInvested) || 0;

    if (inv.type === 'Stocks' && isPositiveNumber(inv.shares)) {
      const quote = getStockQuote(snapshot, inv.symbol, inv.exchange);
      const priceInInr = quote ? quotePriceInInr(quote, snapshot) : null;
      if (!quote || !priceInInr || !isNewer(quote.asOf, inv.priceTimestamp)) return inv;
      const currentValue = round2(inv.shares * priceInInr);
      changed = true;
      return {
        ...inv,
        currentPrice: priceInInr,
        currentValue,
        returnsPercent: returnsPercent(invested, currentValue),
        priceTimestamp: quote.asOf,
        priceSource: quote.source,
      };
    }

    if (inv.type === 'Mutual Funds' && inv.schemeCode && isPositiveNumber(inv.units)) {
      const nav = mfNavs[inv.schemeCode.trim()];
      if (!nav || !isPositiveNumber(nav.nav)) return inv;
      if (!isNewer(nav.date, inv.priceSource === 'AMFI' ? inv.navDate || inv.priceTimestamp : inv.priceTimestamp)) return inv;
      const currentValue = round2(inv.units * nav.nav);
      changed = true;
      return {
        ...inv,
        currentNav: nav.nav,
        navDate: nav.date,
        currentValue,
        returnsPercent: returnsPercent(invested, currentValue),
        priceTimestamp: nav.date,
        priceSource: 'AMFI',
      };
    }

    const metal = metalKindForType(inv.type);
    if (metal && isPositiveNumber(inv.metalWeightGrams) && isPositiveNumber(inv.metalPurity)) {
      const entry = snapshot?.metals[metal];
      const rate = metalRatePerGram(entry, inv.metalPurity);
      if (!entry || !rate || !isNewer(entry.asOf, inv.priceTimestamp)) return inv;
      const currentValue = round2(inv.metalWeightGrams * rate);
      changed = true;
      return {
        ...inv,
        currentPrice: rate,
        currentValue,
        returnsPercent: returnsPercent(invested, currentValue),
        priceTimestamp: entry.asOf,
        priceSource: entry.source,
      };
    }

    return inv;
  });

  return { investments: changed ? next : investments, changed };
}
