'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Detect clicks outside of a referenced element.
 * Calls the handler when a click occurs outside the element.
 *
 * @example
 * const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
 * return <div ref={ref}>...</div>;
 */
export function useClickOutside<T extends HTMLElement>(
  handler: (event: MouseEvent | TouchEvent) => void,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handlerRef.current(event);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  return ref;
}
