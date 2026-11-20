import { useCallback, useSyncExternalStore } from 'react';

/** Screen-size breakpoints shared by layout code (CSS uses the same numbers in its media queries). */
export const MEDIA = {
  /** Phones: the sidebar becomes a drawer behind the top bar. */
  phone: '(max-width: 768px)',
  /** Tablets and small laptops: the sidebar shows icons only unless the user expands it. */
  tablet: '(min-width: 769px) and (max-width: 1100px)',
  /** Below this the dashboard editor's pane opens over the canvas instead of beside it. */
  narrow: '(max-width: 1099px)',
} as const;

/** Whether a CSS media query matches now; re-renders when it starts or stops matching. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener?.('change', onChange);
      return () => list.removeEventListener?.('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}
