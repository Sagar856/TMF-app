import { useSyncExternalStore } from 'react';
import { getStockDirectoryState, subscribeStockDirectory, type StockDirectoryState } from '../services/stockDirectoryService';

const SERVER_STATE: StockDirectoryState = { status: 'idle', directory: null };

export function useStockDirectory(): StockDirectoryState {
  return useSyncExternalStore(subscribeStockDirectory, getStockDirectoryState, () => SERVER_STATE);
}
