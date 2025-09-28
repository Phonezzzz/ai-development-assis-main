import { useCallback, useEffect, useRef, useState } from 'react';

// Lightweight local replacement for @github/spark/hooks useKV
// Stores values in localStorage. Suitable for private/local projects to avoid remote KV rate limits.

const KV_EVENT = 'kv-change';

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return 'null';
  }
}

export function useKV<T>(key: string, initialValue: T): [T, (next: T | ((prev: T) => T)) => void] {
  const initialRef = useRef(initialValue);

  const read = useCallback((): T => {
    if (typeof window === 'undefined') return initialRef.current;
    const raw = window.localStorage.getItem(key);
    return safeParse<T>(raw, initialRef.current);
  }, [key]);

  const [value, setValue] = useState<T>(() => read());

  const setAndStore = useCallback((next: T | ((prev: T) => T)) => {
    setValue(prev => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(key, stableStringify(resolved));
          window.dispatchEvent(new CustomEvent(KV_EVENT, { detail: { key, value: resolved } }));
        } catch {
          // ignore quota errors in local usage
        }
      }
      return resolved;
    });
  }, [key]);

  // Sync across tabs if needed
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea === window.localStorage && e.key === key) {
        setValue(read());
      }
    };
    const onKvChange = (e: Event) => {
      try {
        const detail = (e as CustomEvent)?.detail;
        if (detail?.key === key) {
          setValue(read());
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(KV_EVENT, onKvChange as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(KV_EVENT, onKvChange as EventListener);
    };
  }, [key, read]);

  return [value, setAndStore];
}
