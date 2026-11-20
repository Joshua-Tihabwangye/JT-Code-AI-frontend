import { useCallback, useRef } from 'react';

/** Rows that already peeked in this visit (by key), so the hint slides once, not on every page. */
const peeked = new Set<string>();

/** Peek distance in px and how long it stays out before sliding back. */
const PEEK_PX = 32;
const PEEK_HOLD_MS = 450;

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Marks a sideways scroller so the user can see it scrolls: `data-more-left` / `data-more-right` are set
 * while content is hidden on that side (CSS fades that edge). Updates on scroll, resize and content
 * changes, and works right-to-left. With a `peekKey`, the first time the row overflows in this visit it
 * slides a little and back (not with reduced motion).
 *
 * Returns a ref callback: `<nav ref={useScrollHint('viz-nav')}>`.
 */
export function useScrollHint<T extends HTMLElement = HTMLElement>(peekKey?: string) {
  const cleanup = useRef<(() => void) | null>(null);

  return useCallback(
    (el: T | null) => {
      cleanup.current?.();
      cleanup.current = null;
      if (!el) return;

      const timers: number[] = [];
      const update = () => {
        const max = el.scrollWidth - el.clientWidth;
        const rtl = getComputedStyle(el).direction === 'rtl';
        // Right-to-left scrollers start at 0 and go negative.
        const fromStart = Math.abs(el.scrollLeft);
        const hiddenBefore = max > 1 && fromStart > 1;
        const hiddenAfter = max > 1 && fromStart < max - 1;
        el.toggleAttribute('data-more-left', rtl ? hiddenAfter : hiddenBefore);
        el.toggleAttribute('data-more-right', rtl ? hiddenBefore : hiddenAfter);

        if (peekKey && hiddenAfter && fromStart <= 1 && !peeked.has(peekKey)) {
          peeked.add(peekKey);
          if (reducedMotion() || typeof el.scrollTo !== 'function') return;
          const direction = rtl ? -1 : 1;
          timers.push(
            window.setTimeout(() => {
              el.scrollTo({ left: direction * Math.min(PEEK_PX, max), behavior: 'smooth' });
              timers.push(window.setTimeout(() => el.scrollTo({ left: 0, behavior: 'smooth' }), PEEK_HOLD_MS));
            }, 300),
          );
        }
      };

      update();
      el.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
      resize?.observe(el);
      const mutation = typeof MutationObserver === 'undefined' ? null : new MutationObserver(update);
      mutation?.observe(el, { childList: true, subtree: true, characterData: true });

      cleanup.current = () => {
        el.removeEventListener('scroll', update);
        window.removeEventListener('resize', update);
        resize?.disconnect();
        mutation?.disconnect();
        timers.forEach((timer) => window.clearTimeout(timer));
      };
    },
    [peekKey],
  );
}

/** Test hook: forget which rows have peeked. */
export function resetScrollHintPeeks() {
  peeked.clear();
}
