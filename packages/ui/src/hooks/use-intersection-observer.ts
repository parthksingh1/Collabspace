'use client';

import { useState, useEffect, useRef, type RefObject } from 'react';

export interface UseIntersectionObserverOptions {
  /** Element that is used as the viewport for checking visibility. Default: browser viewport. */
  root?: Element | null;
  /** Margin around the root. Can have values similar to CSS margin. Default: '0px'. */
  rootMargin?: string;
  /** A number or array of numbers indicating at what percentage of the target's visibility the observer's callback should be executed. Default: 0. */
  threshold?: number | number[];
  /** If true, stop observing after the first intersection. */
  triggerOnce?: boolean;
  /** If false, do not observe. Default: true. */
  enabled?: boolean;
}

export interface UseIntersectionObserverResult {
  ref: RefObject<HTMLElement | null>;
  isIntersecting: boolean;
  entry: IntersectionObserverEntry | null;
}

/**
 * Observe when an element enters or leaves the viewport.
 *
 * @example
 * const { ref, isIntersecting } = useIntersectionObserver({ threshold: 0.5 });
 * return <div ref={ref}>{isIntersecting ? 'Visible' : 'Hidden'}</div>;
 */
export function useIntersectionObserver(
  options: UseIntersectionObserverOptions = {},
): UseIntersectionObserverResult {
  const {
    root = null,
    rootMargin = '0px',
    threshold = 0,
    triggerOnce = false,
    enabled = true,
  } = options;

  const ref = useRef<HTMLElement | null>(null);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const frozenRef = useRef(false);

  useEffect(() => {
    if (!enabled || !ref.current || frozenRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const latest = entries[entries.length - 1];
        if (!latest) return;

        setEntry(latest);
        setIsIntersecting(latest.isIntersecting);

        if (triggerOnce && latest.isIntersecting) {
          frozenRef.current = true;
          observer.disconnect();
        }
      },
      { root, rootMargin, threshold },
    );

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [root, rootMargin, threshold, triggerOnce, enabled]);

  return { ref, isIntersecting, entry };
}
