import { useCallback, useEffect, useRef, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
import { activityHistory, activityValuesEqual, changeActivity, registerBackActivity, subscribeActivity } from '../utils/activityHistory';

// Only view state belongs here: never financial records, settings or form inputs.
export function useActivityState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const fallback = useRef<{ value: T } | null>(null);
  if (!fallback.current) {
    fallback.current = { value: typeof initial === 'function' ? (initial as () => T)() : initial };
  }
  const snapshot = useSyncExternalStore(subscribeActivity, () => activityHistory.current, () => activityHistory.current);
  const value = key in snapshot.values ? snapshot.values[key] as T : fallback.current.value;
  const current = useRef(value);
  current.current = value;
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(next => {
    const value = typeof next === 'function' ? (next as (previous: T) => T)(current.current) : next;
    if (activityValuesEqual(current.current, value)) return;
    current.current = value;
    changeActivity(key, value);
  }, [key]);
  return [value, setValue];
}

export function useBackActivity(active: boolean, onBack: () => void): void {
  const close = useRef(onBack);
  close.current = onBack;
  useEffect(() => active ? registerBackActivity(() => close.current()) : undefined, [active]);
}
