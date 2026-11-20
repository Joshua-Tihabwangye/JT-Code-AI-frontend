import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetScrollHintPeeks, useScrollHint } from './useScrollHint';

function Row({ peekKey }: { peekKey?: string }) {
  const ref = useScrollHint<HTMLDivElement>(peekKey);
  return <div ref={ref} data-testid="row" />;
}

/** jsdom has no layout: give the row a size and a scroll position. */
function size(el: HTMLElement, { scrollWidth, clientWidth }: { scrollWidth: number; clientWidth: number }) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
}
function scrollTo(el: HTMLElement, left: number) {
  Object.defineProperty(el, 'scrollLeft', { configurable: true, writable: true, value: left });
  fireEvent.scroll(el);
}

function renderRow(dimensions: { scrollWidth: number; clientWidth: number }, peekKey?: string) {
  // Sizes must exist when the ref attaches, so patch the prototype for the first measurement.
  const sw = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(dimensions.scrollWidth);
  const cw = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(dimensions.clientWidth);
  const view = render(<Row peekKey={peekKey} />);
  sw.mockRestore();
  cw.mockRestore();
  const row = view.container.querySelector<HTMLElement>('[data-testid="row"]')!;
  size(row, dimensions);
  return Object.assign(row, { unmount: view.unmount });
}

describe('useScrollHint', () => {
  beforeEach(() => resetScrollHintPeeks());
  afterEach(() => vi.useRealTimers());

  it('marks only the side that hides content', () => {
    const row = renderRow({ scrollWidth: 600, clientWidth: 300 });
    expect(row).toHaveAttribute('data-more-right');
    expect(row).not.toHaveAttribute('data-more-left');

    scrollTo(row, 150);
    expect(row).toHaveAttribute('data-more-left');
    expect(row).toHaveAttribute('data-more-right');

    scrollTo(row, 300);
    expect(row).toHaveAttribute('data-more-left');
    expect(row).not.toHaveAttribute('data-more-right');
  });

  it('shows no hint when everything fits', () => {
    const row = renderRow({ scrollWidth: 300, clientWidth: 300 });
    expect(row).not.toHaveAttribute('data-more-left');
    expect(row).not.toHaveAttribute('data-more-right');
  });

  it('mirrors the sides right to left', () => {
    const row = renderRow({ scrollWidth: 600, clientWidth: 300 });
    row.style.direction = 'rtl';
    scrollTo(row, 0);
    expect(row).toHaveAttribute('data-more-left');
    expect(row).not.toHaveAttribute('data-more-right');
    scrollTo(row, -300);
    expect(row).not.toHaveAttribute('data-more-left');
    expect(row).toHaveAttribute('data-more-right');
  });

  it('peeks once per key, and not with reduced motion', () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    // jsdom has no element scrolling: record where the hook asks to scroll.
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: (options?: ScrollToOptions | number) => {
        calls.push(typeof options === 'object' ? (options.left ?? 0) : 0);
      },
    });

    const first = renderRow({ scrollWidth: 600, clientWidth: 300 }, 'nav');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(calls).toEqual([32, 0]);
    first.unmount();

    const second = renderRow({ scrollWidth: 600, clientWidth: 300 }, 'nav');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(calls).toEqual([32, 0]);
    second.unmount();

    vi.spyOn(window, 'matchMedia').mockImplementationOnce((query: string) => ({ matches: query.includes('reduce'), media: query }) as MediaQueryList);
    renderRow({ scrollWidth: 600, clientWidth: 300 }, 'ribbon');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(calls).toEqual([32, 0]);
  });
});
