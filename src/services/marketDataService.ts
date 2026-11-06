/**
 * Market Data Service
 * Provides real-time and last-known valuation data for Indian & Global Stocks,
 * ETFs, and Mutual Funds with clear timestamps and reliable fallback mechanisms.
 */

import { findStockBySymbol } from './stocksDatabase';
import {
  getStockQuote,
  normalizeNavDate,
  validateMarketSnapshot,
  type MarketSnapshot,
  type MutualFundNavEntry,
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
  source: 'AMFI' | 'NSE/BSE (Live)' | 'NSE/BSE' | 'Global Exchange' | 'Last Known Quote' | 'Daily Close';
  status: 'live' | 'delayed' | 'offline_cached';
  currency?: string;
}

const DEFAULT_MARKET_DATA_URL = 'https://raw.githubusercontent.com/Sagar856/TMF-app/market-data/market-data.json';
const SNAPSHOT_CACHE_KEY = 'tmf_market_snapshot_v1';
const MF_NAV_CACHE_KEY = 'tmf_mf_navs_v1';
/** The feed is published once per trading day; re-check a few times a day at most. */
const SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const MF_NAV_MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface CachedSnapshot {
  fetchedAt: number;
  snapshot: MarketSnapshot;
}

interface CachedNav extends MutualFundNavEntry {
  fetchedAt: number;
}

const snapshotListeners = new Set<() => void>();
let currentSnapshot: MarketSnapshot | null | undefined;
let inflightSnapshot: Promise<MarketSnapshot | null> | null = null;

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

/** Last downloaded daily market snapshot (synchronous, may be stale or null). */
export function getCachedMarketSnapshot(): MarketSnapshot | null {
  if (currentSnapshot === undefined) currentSnapshot = readCachedSnapshot()?.snapshot ?? null;
  return currentSnapshot;
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
    return getCachedMarketSnapshot();
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
      currentSnapshot = snapshot;
      snapshotListeners.forEach((listener) => listener());
      return snapshot;
    } catch {
      return cached?.snapshot ?? null;
    } finally {
      inflightSnapshot = null;
    }
  })();
  return inflightSnapshot;
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
 * Fetches real stock market price for a given ticker symbol,
 * using live proxy endpoint first, and falling back to the verified catalog.
 * Returns null if the symbol is not live and not in the catalog.
 */
export async function fetchStockPrice(symbol: string): Promise<MarketQuote | null> {
  const normSymbol = symbol.trim().toUpperCase().replace('.NS', '').replace('.BO', '');
  if (!normSymbol) return null;

  const metaEnv = (import.meta as any).env || {};
  const endpoint = (metaEnv.VITE_STOCK_QUOTE_API ?? '/api/stock-quote').trim();

  // 1. Try Live Stock Quote API endpoint unless explicitly turned 'off'
  if (endpoint !== 'off') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const separator = endpoint.includes('?') ? '&' : '?';
      const quoteUrl = `${endpoint}${separator}symbol=${encodeURIComponent(normSymbol)}`;

      const res = await fetch(quoteUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.currentPrice === 'number' && data.currentPrice > 0) {
          const catalogMatch = findStockBySymbol(normSymbol);
          return {
            symbol: data.symbol || normSymbol,
            name: catalogMatch?.name || normSymbol,
            currentPrice: data.currentPrice,
            previousClose: data.previousClose || data.currentPrice,
            change: data.change || 0,
            changePercent: data.changePercent || 0,
            lastUpdated: data.lastUpdated || new Date().toISOString(),
            source: 'NSE/BSE (Live)',
            status: 'live',
          };
        }
      }
    } catch {
      // Live endpoint failed or timed out — fall back to verified catalog
    }
  }

  // 2. Daily close published by the market-data workflow
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
      source: 'Daily Close',
      status: 'delayed',
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
