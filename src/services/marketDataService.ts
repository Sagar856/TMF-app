/**
 * Market Data Service
 * Provides real-time and last-known valuation data for Indian & Global Stocks,
 * ETFs, and Mutual Funds with clear timestamps and reliable fallback mechanisms.
 */

import { findStockBySymbol } from './stocksDatabase';

export interface MarketQuote {
  symbol: string;
  name: string;
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  lastUpdated: string;
  source: 'AMFI' | 'NSE/BSE (Live)' | 'NSE/BSE' | 'Global Exchange' | 'Last Known Quote';
  status: 'live' | 'delayed' | 'offline_cached';
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

  // 2. Check catalog match (exact basePrice, no wobble, status offline_cached)
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

  // 3. For any unknown symbol, return null (never fabricate 100)
  return null;
}
