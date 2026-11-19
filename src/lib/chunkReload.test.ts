import { describe, expect, it, vi } from 'vitest';
import { installChunkReload, RELOAD_KEY, RELOAD_WINDOW_MS, shouldReload } from './chunkReload';

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
}

describe('reload after a new deployment', () => {
  it('reloads once when a page chunk fails, then shows the error instead of looping', () => {
    const storage = memoryStorage();
    let listener: ((event: Event) => void) | undefined;
    const reload = vi.fn();
    let now = 1_000_000;
    installChunkReload({ addEventListener: (_type, fn) => (listener = fn), reload, storage, now: () => now });

    const first = new Event('vite:preloadError', { cancelable: true });
    listener!(first);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(first.defaultPrevented).toBe(true);
    expect(storage.getItem(RELOAD_KEY)).toBe(String(now));

    // The new page fails again right away (the files are really missing): no second reload.
    now += 2_000;
    const second = new Event('vite:preloadError', { cancelable: true });
    listener!(second);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);

    // A later deployment is recovered from again.
    now += RELOAD_WINDOW_MS;
    listener!(new Event('vite:preloadError', { cancelable: true }));
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('still reloads when storage is unavailable', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(shouldReload(blocked, 5)).toBe(true);
    expect(shouldReload(null, 5)).toBe(true);
  });
});
