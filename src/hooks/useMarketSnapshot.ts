import { useSyncExternalStore } from 'react';
import { getCachedMarketSnapshot, subscribeMarketSnapshot } from '../services/marketDataService';
import type { MarketSnapshot } from '../utils/marketData';

export function useMarketSnapshot(): MarketSnapshot | null {
  return useSyncExternalStore(subscribeMarketSnapshot, getCachedMarketSnapshot, () => null);
}
