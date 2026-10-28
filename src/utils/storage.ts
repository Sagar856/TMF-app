export const STORAGE_WRITE_FAILED_EVENT = 'tmf-storage-write-failed';
export const STORAGE_READ_FAILED_EVENT = 'tmf-storage-read-failed';

let pendingStorageReadFailure = false;

export function consumePendingStorageReadFailure(): boolean {
  const pending = pendingStorageReadFailure;
  pendingStorageReadFailure = false;
  return pending;
}

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn(`Could not read local storage key "${key}":`, error);
    pendingStorageReadFailure = true;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(STORAGE_READ_FAILED_EVENT));
    }
    return null;
  }
}

export function safeGetJson<T>(
  key: string,
  fallback: T,
  validate: (value: unknown) => value is T = (_value): _value is T => true
): T {
  let raw: string | null;
  try {
    raw = safeGetItem(key);
  } catch (error) {
    console.warn(`Could not read local storage key "${key}":`, error);
    return fallback;
  }

  if (raw === null) return fallback;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!validate(parsed)) {
      throw new TypeError(`Unexpected data format in local storage key "${key}"`);
    }
    return parsed as T;
  } catch (error) {
    console.warn(`Could not parse local storage key "${key}":`, error);
    pendingStorageReadFailure = true;
    let recoveryCopySaved = false;
    try {
      localStorage.setItem(`tmf_recovery_${key}_${Date.now()}`, raw);
      recoveryCopySaved = true;
    } catch (backupError) {
      console.warn(`Could not preserve recovery copy for local storage key "${key}":`, backupError);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(STORAGE_READ_FAILED_EVENT, {
        detail: { key, recoveryCopySaved },
      }));
    }
    return fallback;
  }
}

export function safeGetStringArray(key: string): string[] {
  return safeGetJson<string[]>(
    key,
    [],
    (value): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Could not save local storage key "${key}":`, error);
    if (typeof window !== 'undefined') {
      // Service and component writes share App's persistence warning.
      window.dispatchEvent(new Event(STORAGE_WRITE_FAILED_EVENT));
    }
    return false;
  }
}

export function removeDeletedIds(key: string, deletedIds: readonly string[]): boolean {
  const removed = new Set(deletedIds);
  const current = safeGetStringArray(key);
  return safeSetItem(key, JSON.stringify(current.filter(id => !removed.has(id))));
}
