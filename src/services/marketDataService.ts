/**
 * Market Data Service
 * Provides real-time and last-known valuation data for Indian & Global Stocks,
 * ETFs, and Mutual Funds with clear timestamps and reliable fallback mechanisms.
 */

import { findStockBySymbol } from './stocksDatabase';
import { getSupabaseClient } from './supabaseClient';
import {
  getStockQuote,
  isIntradaySource,
  normalizeNavDate,
  normalizeStockSymbol,
  overlayQuotes,
  validateMarketSnapshot,
  type FxRateEntry,
  type MarketSnapshot,
  type MutualFundNavEntry,
  type StockQuoteEntry,
} from '../utils/marketData';
import { safeGetItem, safeSetItem } from '../utils/storage';

export interface MarketQuote {
  symbol: string;
  name: string;
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  lastUpdated: string;
  source: 'AMFI' | 'NSE/BSE (Live)' | 'NSE/BSE' | 'Global Exchange' | 'Last Known Quote' | 'Daily Close' | 'Intraday';
  status: 'live' | 'delayed' | 'offline_cached';
  currency?: string;
}

const DEFAULT_MARKET_DATA_URL = 'https://raw.githubusercontent.com/Sagar856/TMF-app/market-data/market-data.json';
const SNAPSHOT_CACHE_KEY = 'tmf_market_snapshot_v1';
const MF_NAV_CACHE_KEY = 'tmf_mf_navs_v1';
/** The feed is published once per trading day; re-check a few times a day at most. */
const SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const MF_NAV_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const INTRADAY_CACHE_KEY = 'tmf_intraday_quotes_v1';
const INTRADAY_BACKOFF_KEY = 'tmf_intraday_backoff_until';
const INTRADAY_FUNCTION = 'market-quotes';
/** Each symbol is asked for at most this often; the function also caches upstream calls for everyone. */
const INTRADAY_MIN_INTERVAL_MS = 10 * 60 * 1000;
const INTRADAY_TIMEOUT_MS = 25_000;
/** Matches the function's per-request cap. */
const INTRADAY_BATCH_SIZE = 40;

export interface IntradayQuoteRequest {
  symbol: string;
  exchange?: string;
}

interface IntradayCache {
  quotes: Record<string, StockQuoteEntry>;
  fx: Record<string, FxRateEntry>;
  /** When each symbol was last requested (successfully or not), for throttling. */
  requestedAt: Record<string, number>;
}

interface CachedSnapshot {
  fetchedAt: number;
  snapshot: MarketSnapshot;
}

interface CachedNav extends MutualFundNavEntry {
  fetchedAt: number;
}

const snapshotListeners = new Set<() => void>();
let dailySnapshot: MarketSnapshot | null | undefined;
let inflightSnapshot: Promise<MarketSnapshot | null> | null = null;
let intradayCache: IntradayCache | undefined;
let inflightIntraday: Promise<void> | null = null;
/** Memoized daily + intraday view so useSyncExternalStore sees a stable reference. */
let effectiveSnapshot: { daily: MarketSnapshot | null; intraday: IntradayCache; value: MarketSnapshot | null } | null = null;

const notifySnapshotListeners = () => snapshotListeners.forEach((listener) => listener());

function marketDataUrl(): string | null {
  const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env || {};
  const configured = (metaEnv.VITE_MARKET_DATA_URL ?? DEFAULT_MARKET_DATA_URL).trim();
  return configured && configured !== 'off' ? configured : null;
}

function readCachedSnapshot(): CachedSnapshot | null {
  try {
    const raw = safeGetItem(SNAPSHOT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fetchedAt?: unknown; snapshot?: unknown };
    const snapshot = validateMarketSnapshot(parsed.snapshot);
    if (!snapshot || typeof parsed.fetchedAt !== 'number') return null;
    return { fetchedAt: parsed.fetchedAt, snapshot };
  } catch {
    return null;
  }
}

function readIntradayCache(): IntradayCache {
  if (intradayCache) return intradayCache;
  intradayCache = { quotes: {}, fx: {}, requestedAt: {} };
  try {
    const parsed = JSON.parse(safeGetItem(INTRADAY_CACHE_KEY) || '{}') as Partial<IntradayCache>;
    // Re-validate through the snapshot validator so malformed cache entries are dropped.
    const valid = validateMarketSnapshot({
      schemaVersion: 1, generatedAt: new Date(0).toISOString(), stocks: parsed.quotes, metals: {}, fx: parsed.fx,
    });
    if (valid) intradayCache = { quotes: valid.stocks, fx: valid.fx, requestedAt: { ...(parsed.requestedAt || {}) } };
  } catch {
    // Corrupt cache: start empty.
  }
  return intradayCache;
}

function getDailySnapshot(): MarketSnapshot | null {
  if (dailySnapshot === undefined) dailySnapshot = readCachedSnapshot()?.snapshot ?? null;
  return dailySnapshot;
}

/** Latest known market data: the daily snapshot with any newer intraday quotes laid over it. */
export function getCachedMarketSnapshot(): MarketSnapshot | null {
  const daily = getDailySnapshot();
  const intraday = readIntradayCache();
  if (!effectiveSnapshot || effectiveSnapshot.daily !== daily || effectiveSnapshot.intraday !== intraday) {
    effectiveSnapshot = { daily, intraday, value: overlayQuotes(daily, intraday.quotes, intraday.fx) };
  }
  return effectiveSnapshot.value;
}

export function subscribeMarketSnapshot(listener: () => void): () => void {
  snapshotListeners.add(listener);
  return () => snapshotListeners.delete(listener);
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Loads the daily market snapshot published by the "Update market data" workflow.
 * Falls back to the last cached copy when offline; never fabricates prices.
 */
export async function loadMarketSnapshot(options: { force?: boolean } = {}): Promise<MarketSnapshot | null> {
  const cached = readCachedSnapshot();
  if (!options.force && cached && Date.now() - cached.fetchedAt < SNAPSHOT_MAX_AGE_MS) {
    return getDailySnapshot();
  }
  const url = marketDataUrl();
  if (!url) return cached?.snapshot ?? null;
  if (inflightSnapshot) return inflightSnapshot;

  inflightSnapshot = (async () => {
    try {
      const res = await fetchWithTimeout(url, 8000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const snapshot = validateMarketSnapshot(await res.json());
      if (!snapshot) throw new Error('Invalid market snapshot');
      safeSetItem(SNAPSHOT_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), snapshot }));
      dailySnapshot = snapshot;
      notifySnapshotListeners();
      return snapshot;
    } catch {
      return cached?.snapshot ?? null;
    } finally {
      inflightSnapshot = null;
    }
  })();
  return inflightSnapshot;
}

const intradayKey = (request: IntradayQuoteRequest) => {
  const exchange = (request.exchange || 'NSE').toUpperCase();
  return `${normalizeStockSymbol(request.symbol)}|${exchange === 'OTHER' ? 'NSE' : exchange}`;
};

function intradayBackoffMs(error: unknown): number {
  const status = (error as { context?: { status?: unknown } })?.context?.status;
  if (status === 404) return 12 * 60 * 60 * 1000; // Function not deployed in this project.
  if (status === 401 || status === 403) return 10 * 60 * 1000;
  return 30 * 60 * 1000;
}

async function invokeMarketQuotes(symbols: IntradayQuoteRequest[]): Promise<{ quotes: Record<string, StockQuoteEntry>; fx: Record<string, FxRateEntry> }> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured');
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Intraday quotes timed out')), INTRADAY_TIMEOUT_MS);
  });
  try {
    const { data, error } = await Promise.race([
      client.functions.invoke(INTRADAY_FUNCTION, {
        body: { symbols: symbols.map((s) => ({ symbol: normalizeStockSymbol(s.symbol), exchange: s.exchange || 'NSE' })) },
      }),
      timeout,
    ]);
    if (error) throw error;
    const valid = validateMarketSnapshot({
      schemaVersion: 1, generatedAt: new Date().toISOString(), stocks: data?.quotes, metals: {}, fx: data?.fx,
    });
    // Only intraday sources are accepted from the function so it can never masquerade as the daily feed.
    const quotes = Object.fromEntries(Object.entries(valid?.stocks || {}).filter(([, q]) => isIntradaySource(q.source)));
    return { quotes, fx: valid?.fx || {} };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Refreshes intraday quotes through the `market-quotes` Supabase Edge Function. Best effort and
 * silent: when signed out, offline, throttled or the function is missing, the daily snapshot is used.
 * Each symbol is requested at most every 10 minutes; `force` skips that throttle (not the backoff).
 */
export async function refreshIntradayQuotes(requests: IntradayQuoteRequest[], options: { force?: boolean } = {}): Promise<void> {
  if (inflightIntraday) await inflightIntraday.catch(() => undefined);
  if (Number(safeGetItem(INTRADAY_BACKOFF_KEY) || 0) > Date.now()) return;

  const cache = readIntradayCache();
  const now = Date.now();
  const due = new Map<string, IntradayQuoteRequest>();
  for (const request of requests) {
    const key = intradayKey(request);
    if (!normalizeStockSymbol(request.symbol) || due.has(key)) continue;
    if (options.force || !(now - (cache.requestedAt[key] || 0) < INTRADAY_MIN_INTERVAL_MS)) due.set(key, request);
  }
  if (!due.size) return;

  const client = getSupabaseClient();
  if (!client) return;
  const { data: sessionData } = await client.auth.getSession().catch(() => ({ data: { session: null } }));
  if (!sessionData?.session) return;

  inflightIntraday = (async () => {
    const entries = [...due];
    const quotes: Record<string, StockQuoteEntry> = {};
    const fx: Record<string, FxRateEntry> = {};
    try {
      for (let i = 0; i < entries.length; i += INTRADAY_BATCH_SIZE) {
        const result = await invokeMarketQuotes(entries.slice(i, i + INTRADAY_BATCH_SIZE).map(([, request]) => request));
        Object.assign(quotes, result.quotes);
        Object.assign(fx, result.fx);
      }
    } catch (error) {
      safeSetItem(INTRADAY_BACKOFF_KEY, String(Date.now() + intradayBackoffMs(error)));
    }
    const requestedAt = { ...cache.requestedAt };
    entries.forEach(([key]) => { requestedAt[key] = now; });
    // Drop throttle bookkeeping older than a day so the cache does not grow without bound.
    Object.keys(requestedAt).forEach((key) => { if (now - requestedAt[key] > 86_400_000) delete requestedAt[key]; });
    intradayCache = {
      quotes: { ...cache.quotes, ...quotes },
      fx: { ...cache.fx, ...fx },
      requestedAt,
    };
    safeSetItem(INTRADAY_CACHE_KEY, JSON.stringify(intradayCache));
    if (Object.keys(quotes).length || Object.keys(fx).length) notifySnapshotListeners();
  })();
  try {
    await inflightIntraday;
  } finally {
    inflightIntraday = null;
  }
}

function readNavCache(): Record<string, CachedNav> {
  try {
    const parsed = JSON.parse(safeGetItem(MF_NAV_CACHE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Returns the latest AMFI NAV for each scheme code, fetching from mfapi.in at most twice a day
 * per scheme and falling back to the last cached NAV when the network is unavailable.
 */
export async function refreshMutualFundNavs(schemeCodes: string[]): Promise<Record<string, MutualFundNavEntry>> {
  const cache = readNavCache();
  const now = Date.now();
  const codes = Array.from(new Set(schemeCodes.map((c) => c.trim()).filter((c) => /^\d{5,6}$/.test(c))));
  const stale = codes.filter((code) => !cache[code] || now - cache[code].fetchedAt > MF_NAV_MAX_AGE_MS);

  let updated = false;
  for (let i = 0; i < stale.length; i += 4) {
    const batch = stale.slice(i, i + 4);
    const quotes = await Promise.all(batch.map((code) => fetchMutualFundNav(code)));
    quotes.forEach((quote, idx) => {
      const date = quote ? normalizeNavDate(quote.lastUpdated) : null;
      if (quote && date) {
        cache[batch[idx]] = { nav: quote.currentPrice, date, schemeName: quote.name, fetchedAt: now };
        updated = true;
      }
    });
  }
  if (updated) safeSetItem(MF_NAV_CACHE_KEY, JSON.stringify(cache));

  const result: Record<string, MutualFundNavEntry> = {};
  codes.forEach((code) => {
    if (cache[code]) result[code] = { nav: cache[code].nav, date: cache[code].date, schemeName: cache[code].schemeName };
  });
  return result;
}

export interface MutualFundSearchResult {
  schemeCode: number;
  schemeName: string;
}

/** Searches every AMFI scheme by name via mfapi.in. */
export async function searchMutualFunds(query: string, signal?: AbortSignal): Promise<MutualFundSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .filter((item) => item && (typeof item.schemeCode === 'number' || typeof item.schemeCode === 'string') && typeof item.schemeName === 'string')
    .map((item) => ({ schemeCode: Number(item.schemeCode), schemeName: item.schemeName as string }))
    .filter((item) => Number.isFinite(item.schemeCode));
}

/**
 * Fetches real quote for a Mutual fund by AMFI scheme code (5-6 digits).
 * Returns null when mfapi.in fails or when scheme code is invalid.
 */
export async function fetchMutualFundNav(schemeCodeOrQuery: string): Promise<MarketQuote | null> {
  const clean = schemeCodeOrQuery.trim();
  if (!clean || !/^\d{5,6}$/.test(clean)) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://api.mfapi.in/mf/${clean}`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      if (json?.data && json.data.length > 0) {
        const latest = json.data[0];
        const prev = json.data[1] || latest;
        const currentNav = parseFloat(latest.nav);
        const prevNav = parseFloat(prev.nav);
        const diff = currentNav - prevNav;
        const diffPct = prevNav > 0 ? (diff / prevNav) * 100 : 0;
        return {
          symbol: clean,
          name: json.meta?.scheme_name || clean,
          currentPrice: currentNav,
          previousClose: prevNav,
          change: Math.round(diff * 100) / 100,
          changePercent: Math.round(diffPct * 100) / 100,
          lastUpdated: latest.date || new Date().toISOString(),
          source: 'AMFI',
          status: 'live',
        };
      }
    }
  } catch {
    // Network or parse failure
  }

  return null;
}

/**
 * Price for a ticker: an intraday quote from the market-quotes Edge Function when available,
 * otherwise the daily close, otherwise the bundled catalog price.
 * Returns null if the symbol is unknown everywhere (never fabricates a price).
 */
export async function fetchStockPrice(symbol: string, exchange: string = 'NSE'): Promise<MarketQuote | null> {
  const normSymbol = normalizeStockSymbol(symbol);
  if (!normSymbol) return null;

  // 1. Intraday refresh (silently skipped when signed out, offline or throttled)
  await refreshIntradayQuotes([{ symbol: normSymbol, exchange }]).catch(() => undefined);

  // 2. Latest of the intraday quote and the daily close
  const dailyQuote = getStockQuote(getCachedMarketSnapshot(), normSymbol);
  if (dailyQuote) {
    const diff = Math.round((dailyQuote.price - dailyQuote.previousClose) * 100) / 100;
    return {
      symbol: normSymbol,
      name: findStockBySymbol(normSymbol)?.name || normSymbol,
      currentPrice: dailyQuote.price,
      previousClose: dailyQuote.previousClose,
      change: diff,
      changePercent: dailyQuote.previousClose > 0 ? Math.round((diff / dailyQuote.previousClose) * 10000) / 100 : 0,
      lastUpdated: dailyQuote.asOf,
      source: isIntradaySource(dailyQuote.source) ? 'Intraday' : 'Daily Close',
      status: isIntradaySource(dailyQuote.source) ? 'live' : 'delayed',
      currency: dailyQuote.currency,
    };
  }

  // 3. Check catalog match (exact basePrice, no wobble, status offline_cached)
  const knownStock = findStockBySymbol(normSymbol);

  if (knownStock) {
    const prevClose = knownStock.previousClose || knownStock.basePrice;
    const diff = Math.round((knownStock.basePrice - prevClose) * 100) / 100;
    const diffPct = prevClose > 0 ? Math.round((diff / prevClose) * 10000) / 100 : 0;

    return {
      symbol: knownStock.symbol,
      name: knownStock.name,
      currentPrice: knownStock.basePrice,
      previousClose: prevClose,
      change: diff,
      changePercent: diffPct,
      lastUpdated: knownStock.asOfDate,
      source: 'Last Known Quote',
      status: 'offline_cached',
    };
  }

  // 4. For any unknown symbol, return null (never fabricate 100)
  return null;
}
