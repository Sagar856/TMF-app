/**
 * Stock directory service: loads the full NSE/BSE/US listing (stocks.json, published daily by the
 * "Update market data" workflow), caches it in IndexedDB for offline use and keeps it in memory.
 */
import { parseStockDirectory, type StockDirectory } from '../utils/stockDirectory';

const DEFAULT_STOCK_DIRECTORY_URL = 'https://raw.githubusercontent.com/Sagar856/TMF-app/market-data/stocks.json';
const DATABASE = 'tmf-market-cache';
const STORE = 'files';
const RECORD_KEY = 'stock-directory';
/** Published once or twice per trading day. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30_000;

export type StockDirectoryStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface StockDirectoryState {
  status: StockDirectoryStatus;
  directory: StockDirectory | null;
}

interface CachedRecord {
  key: string;
  fetchedAt: number;
  file: unknown;
}

const listeners = new Set<() => void>();
let state: StockDirectoryState = { status: 'idle', directory: null };
let fetchedAt = 0;
let restored: Promise<void> | null = null;
let inflight: Promise<StockDirectory | null> | null = null;

function setState(next: Partial<StockDirectoryState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function directoryUrl(): string | null {
  const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env || {};
  const configured = (metaEnv.VITE_STOCK_DIRECTORY_URL ?? DEFAULT_STOCK_DIRECTORY_URL).trim();
  return configured && configured !== 'off' ? configured : null;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the market cache'));
    request.onblocked = () => reject(new Error('The market cache is blocked by another tab'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = operation(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error || request.error);
      transaction.onabort = () => reject(transaction.error || new Error('Market cache transaction aborted'));
    });
  } finally {
    database.close();
  }
}

/** Loads the IndexedDB copy once per app session so search works offline straight away. */
function restoreFromCache(): Promise<void> {
  if (!restored) {
    restored = withStore<CachedRecord | undefined>('readonly', (store) => store.get(RECORD_KEY))
      .then((record) => {
        const directory = record ? parseStockDirectory(record.file) : null;
        if (directory && !state.directory) {
          fetchedAt = record!.fetchedAt;
          setState({ status: 'ready', directory });
        }
      })
      .catch(() => undefined);
  }
  return restored;
}

async function fetchDirectory(url: string): Promise<{ file: unknown; directory: StockDirectory } | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const file = await res.json();
    const directory = parseStockDirectory(file);
    return directory ? { file, directory } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Returns the stock directory, refreshing it from the network when the cached copy is older than
 * a few hours. Falls back to the cached copy when offline; resolves to null when nothing is available.
 */
export async function loadStockDirectory(options: { force?: boolean } = {}): Promise<StockDirectory | null> {
  await restoreFromCache();
  if (!options.force && state.directory && Date.now() - fetchedAt < MAX_AGE_MS) return state.directory;
  const url = directoryUrl();
  if (!url) {
    if (!state.directory) setState({ status: 'unavailable' });
    return state.directory;
  }
  if (inflight) return inflight;

  if (!state.directory) setState({ status: 'loading' });
  inflight = (async () => {
    try {
      const result = await fetchDirectory(url);
      if (!result) {
        if (!state.directory) setState({ status: 'unavailable' });
        if (options.force) throw new Error('Stock directory could not be refreshed; keeping cached prices.');
        return state.directory;
      }
      // Never replace a newer copy with an older one (e.g. a stale CDN response).
      const current = state.directory;
      if (current && Date.parse(result.directory.generatedAt) < Date.parse(current.generatedAt)) {
        fetchedAt = Date.now();
        return current;
      }
      fetchedAt = Date.now();
      setState({ status: 'ready', directory: result.directory });
      await withStore('readwrite', (store) => store.put({ key: RECORD_KEY, fetchedAt, file: result.file } satisfies CachedRecord))
        .catch(() => undefined);
      return result.directory;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function getStockDirectoryState(): StockDirectoryState {
  return state;
}

export function getStockDirectory(): StockDirectory | null {
  return state.directory;
}

export function subscribeStockDirectory(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
