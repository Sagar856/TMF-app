import type { InvestmentRecord, InvestmentType } from '../types/finance';

export const MARKET_DATA_SCHEMA_VERSION = 1;

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
    metals.gold = { ratesPerGram: goldRates, asOf, source: 'IBJA benchmark rate' };
  }

  const silverPerKg = read('Silver999');
  if (silverPerKg) {
    const perGram = round2(silverPerKg / 1000);
    if (perGram > 10 && perGram < 5000) {
      metals.silver = { ratesPerGram: { '999': perGram }, asOf, source: 'IBJA benchmark rate' };
    }
  }
  return metals;
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

/** Keeps last-known values for anything the latest run failed to fetch. */
export function mergeMarketSnapshots(previous: MarketSnapshot | null, next: MarketSnapshot): MarketSnapshot {
  if (!previous) return next;
  return {
    schemaVersion: MARKET_DATA_SCHEMA_VERSION,
    generatedAt: next.generatedAt,
    stocks: { ...previous.stocks, ...next.stocks },
    metals: {
      ...(next.metals.gold || previous.metals.gold ? { gold: next.metals.gold || previous.metals.gold } : {}),
      ...(next.metals.silver || previous.metals.silver ? { silver: next.metals.silver || previous.metals.silver } : {}),
    },
    fx: { ...previous.fx, ...next.fx },
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

export function getStockQuote(snapshot: MarketSnapshot | null, symbol: string | undefined): StockQuoteEntry | null {
  if (!snapshot) return null;
  return snapshot.stocks[normalizeStockSymbol(symbol)] || null;
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
      const quote = getStockQuote(snapshot, inv.symbol);
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
