// Pure helpers for the market-quotes Edge Function. No Deno/Node APIs here so the
// parsing logic is unit-tested from the app's test suite (src/utils/marketQuotesFunction.test.ts).

export const MAX_SYMBOLS_PER_REQUEST = 40;
export const SOURCE_YAHOO_INTRADAY = 'Yahoo Finance (intraday)';
export const SOURCE_GOOGLE_INTRADAY = 'Google Finance (intraday)';
export const USD_INR_TICKER = 'INR=X';

export type QuoteExchange = 'NSE' | 'BSE' | 'US';

export interface QuoteRequest {
  /** Symbol as the app stores it (no exchange suffix). */
  key: string;
  exchange: QuoteExchange;
  /** Yahoo Finance ticker; also the cache key. */
  ticker: string;
}

export interface IntradayQuote {
  price: number;
  previousClose: number;
  currency: string;
  asOf: string;
  source: string;
}

const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9&.\-]{0,19}$/;

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const round2 = (value: number) => Math.round(value * 100) / 100;

function toExchange(raw: unknown): QuoteExchange | null {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (value === 'BSE' || value === 'BOM') return 'BSE';
  if (value === 'US' || value === 'NASDAQ' || value === 'NYSE' || value === 'AMEX' || value === 'US_ETF') return 'US';
  if (!value || value === 'NSE' || value === 'OTHER') return 'NSE';
  return null;
}

export function yahooTicker(key: string, exchange: QuoteExchange): string {
  if (exchange === 'NSE') return `${key}.NS`;
  if (exchange === 'BSE') return `${key}.BO`;
  // Yahoo writes share classes with a dash (BRK-B).
  return key.replace(/\./g, '-');
}

/** Key of a quote in the response; must match `stockQuoteKey` in src/utils/marketData.ts. */
export function quoteResponseKey(request: Pick<QuoteRequest, 'key' | 'exchange'>): string {
  if (request.exchange === 'BSE') return `BSE:${request.key}`;
  if (request.exchange === 'US') return `US:${request.key}`;
  return request.key;
}

/** Validates the request body: `{ symbols: Array<string | { symbol, exchange }> }`. */
export function parseQuoteRequests(body: unknown): QuoteRequest[] {
  const list = (body as { symbols?: unknown })?.symbols;
  if (!Array.isArray(list)) return [];
  const requests = new Map<string, QuoteRequest>();
  for (const item of list) {
    const rawSymbol = typeof item === 'string' ? item : (item as { symbol?: unknown })?.symbol;
    if (typeof rawSymbol !== 'string') continue;
    let symbol = rawSymbol.trim().toUpperCase();
    let exchange = toExchange(typeof item === 'string' ? undefined : (item as { exchange?: unknown }).exchange);
    if (symbol.endsWith('.NS')) { symbol = symbol.slice(0, -3); exchange = 'NSE'; }
    else if (symbol.endsWith('.BO')) { symbol = symbol.slice(0, -3); exchange = 'BSE'; }
    if (!exchange || !SYMBOL_PATTERN.test(symbol)) continue;
    const ticker = yahooTicker(symbol, exchange);
    if (!requests.has(ticker)) requests.set(ticker, { key: symbol, exchange, ticker });
    if (requests.size >= MAX_SYMBOLS_PER_REQUEST) break;
  }
  return [...requests.values()];
}

/** Google Finance page identifiers to try, in order. */
export function googleTickers(request: Pick<QuoteRequest, 'key' | 'exchange' | 'ticker'>): string[] {
  if (request.ticker === USD_INR_TICKER) return ['USD-INR'];
  if (request.exchange === 'NSE') return [`${request.key}:NSE`];
  if (request.exchange === 'BSE') return [`${request.key}:BOM`];
  return [`${request.key}:NASDAQ`, `${request.key}:NYSE`];
}

/** Reads a Yahoo v8 chart response (`chart.result[0]`). */
export function parseYahooChart(json: unknown): IntradayQuote | null {
  const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as
    | { meta?: Record<string, unknown>; indicators?: { quote?: Array<{ close?: unknown[] }> } }
    | undefined;
  const meta = result?.meta;
  if (!meta) return null;
  const closes = (result?.indicators?.quote?.[0]?.close || []).filter(isPositiveNumber);
  const price = isPositiveNumber(meta.regularMarketPrice) ? meta.regularMarketPrice : closes[closes.length - 1];
  if (!isPositiveNumber(price)) return null;
  const previousClose = [meta.previousClose, meta.chartPreviousClose].find(isPositiveNumber) ?? price;
  const marketTime = isPositiveNumber(meta.regularMarketTime) ? meta.regularMarketTime : 0;
  if (!marketTime) return null;
  return {
    price: round2(price),
    previousClose: round2(previousClose),
    currency: typeof meta.currency === 'string' && meta.currency ? meta.currency.toUpperCase() : 'INR',
    asOf: new Date(marketTime * 1000).toISOString(),
    source: SOURCE_YAHOO_INTRADAY,
  };
}

const parseLooseNumber = (text: string | undefined): number | null => {
  if (!text) return null;
  const value = Number(text.replace(/[^\d.]/g, ''));
  return isPositiveNumber(value) ? value : null;
};

/** Reads the data attributes Google Finance embeds on its quote page; returns null if the layout changed. */
export function parseGoogleFinance(html: string, now: Date = new Date()): IntradayQuote | null {
  const price = parseLooseNumber(/data-last-price="([\d.,]+)"/.exec(html)?.[1]);
  const currency = /data-currency-code="([A-Z]{3})"/.exec(html)?.[1];
  if (!price || !currency) return null;
  const timestamp = Number(/data-last-normal-market-timestamp="(\d+)"/.exec(html)?.[1]);
  const previous = parseLooseNumber(/Previous close<\/div>[\s\S]{0,400}?<div[^>]*>([^<]*\d[^<]*)<\/div>/i.exec(html)?.[1]);
  return {
    price: round2(price),
    previousClose: round2(previous ?? price),
    currency,
    asOf: (isPositiveNumber(timestamp) ? new Date(timestamp * 1000) : now).toISOString(),
    source: SOURCE_GOOGLE_INTRADAY,
  };
}

/** Upstream statuses that mean "this server is being throttled/blocked" rather than "bad symbol". */
export function isBlockedStatus(status: number): boolean {
  return status === 429 || status === 403 || status === 999;
}
