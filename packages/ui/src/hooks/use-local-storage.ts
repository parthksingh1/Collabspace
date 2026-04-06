'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Persist state in localStorage with SSR safety.
 * Falls back to the initial value when localStorage is unavailable.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  // Read from storage (SSR-safe)
  const readValue = useCallback((): T => {
    if (typeof window === 'undefined') return initialValue;

    try {
      const item = window.localStorage.getItem(key);
      return item !== null ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  }, [key, initialValue]);

  const [storedValue, setStoredValue] = useState<T>(readValue);

  // Sync with storage on mount (for SSR hydration)
  useEffect(() => {
    setStoredValue(readValue());
  }, [readValue]);

  // Set value in state and storage
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const newValue = value instanceof Function ? value(storedValue) : value;
        setStoredValue(newValue);

        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(newValue));
          // Dispatch a custom event so other components using the same key can sync
          window.dispatchEvent(
            new StorageEvent('storage', { key, newValue: JSON.stringify(newValue) }),
          );
        }
      } catch (error) {
        console.warn(`Failed to set localStorage key "${key}":`, error);
      }
    },
    [key, storedValue],
  );

  // Remove the key from storage
  const removeValue = useCallback(() => {
    try {
      setStoredValue(initialValue);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn(`Failed to remove localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  // Listen for changes from other tabs/windows
  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(JSON.parse(e.newValue) as T);
        } catch {
          // ignore parse errors
        }
      } else if (e.key === key && e.newValue === null) {
        setStoredValue(initialValue);
      }
    }

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}
