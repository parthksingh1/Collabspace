'use client';

import { useState, useEffect } from 'react';

/**
 * Debounce a value. Returns the debounced value that only updates
 * after the specified delay has passed without changes.
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}

/**
 * Returns a debounced callback. The callback will only execute
 * after the delay has passed since the last invocation.
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  const callbackRef = { current: callback };
  callbackRef.current = callback;

  const timerRef = { current: null as ReturnType<typeof setTimeout> | null };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (...args: Parameters<T>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delayMs);
  };
}
