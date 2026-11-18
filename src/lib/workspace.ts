/**
 * The workspace (organization) the user is working in. Django picks the user's first workspace unless
 * a request carries `X-Organization-ID`, so the chosen id is remembered in this browser and sent with
 * every API request (`src/lib/api/http.ts`). The server still checks membership on every call; this is
 * a preference, never an authorization decision.
 */
const STORAGE_KEY = 'jtcode:active-workspace';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Listener = (workspaceId: string | null) => void;
const listeners = new Set<Listener>();

function read(): string | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && UUID.test(value) ? value : null;
  } catch {
    return null; // storage blocked (private mode, sandboxed frame): fall back to the server default
  }
}

let current: string | null = typeof window === 'undefined' ? null : read();

export function getActiveWorkspaceId(): string | null {
  return current;
}

/** Switch workspace (`null` = the server's default). Callers refetch their data afterwards. */
export function setActiveWorkspaceId(workspaceId: string | null): void {
  const next = workspaceId && UUID.test(workspaceId) ? workspaceId : null;
  if (next === current) return;
  current = next;
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, next);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not persisted; the choice still holds for this page load.
  }
  for (const listener of listeners) listener(next);
}

export function onWorkspaceChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The server's answers when the selected workspace is gone or the user was removed from it. */
const STALE_WORKSPACE = /selected organization does not exist|do not have access to this organization/i;

export function isStaleWorkspaceError(status: number | undefined, body: unknown): boolean {
  if (status !== 403 || !body || typeof body !== 'object') return false;
  const { detail, message } = body as { detail?: unknown; message?: unknown };
  return [detail, message].some((text) => typeof text === 'string' && STALE_WORKSPACE.test(text));
}
