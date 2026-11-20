/**
 * Recover from a new deployment instead of crashing.
 *
 * Pages are separate downloads with hashed names (`/assets/DataPage-3f9a.js`). After a deploy, a tab that
 * still runs the previous build asks for the old names, which no longer exist: the import fails and the
 * page would show the fatal error screen. Vite reports every such failure as a `vite:preloadError` event;
 * reloading fetches the new `index.html` and therefore the new names.
 *
 * At most one reload per {@link RELOAD_WINDOW_MS}: if the files are genuinely missing (a broken deploy),
 * the error is shown instead of reloading forever.
 */
export const RELOAD_KEY = 'jt-chunk-reload-at';
export const RELOAD_WINDOW_MS = 30_000;

interface ReloadEnv {
  addEventListener: (type: 'vite:preloadError', listener: (event: Event) => void) => void;
  reload: () => void;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  now: () => number;
}

/** Whether a failed chunk load should reload the page now (records the attempt when it should). */
export function shouldReload(storage: ReloadEnv['storage'], now: number): boolean {
  let last = 0;
  try {
    last = Number(storage?.getItem(RELOAD_KEY) ?? 0) || 0;
  } catch {
    // Storage blocked (private mode): reload anyway; the browser cache cannot loop on a fresh index.html.
  }
  if (last > 0 && now - last < RELOAD_WINDOW_MS) return false;
  try {
    storage?.setItem(RELOAD_KEY, String(now));
  } catch {
    // Ignored, see above.
  }
  return true;
}

export function installChunkReload(env: ReloadEnv): void {
  env.addEventListener('vite:preloadError', (event) => {
    if (!shouldReload(env.storage, env.now())) return;
    // Handled: Vite would otherwise rethrow the failed import into the page.
    event.preventDefault();
    env.reload();
  });
}

/** Wire the handler to the real window (called once from main.tsx). */
export function installChunkReloadInBrowser(): void {
  if (typeof window === 'undefined') return;
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  installChunkReload({
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    reload: () => window.location.reload(),
    storage,
    now: () => Date.now(),
  });
}
