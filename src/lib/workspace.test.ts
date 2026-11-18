import { afterEach, describe, expect, it, vi } from 'vitest';
import { getActiveWorkspaceId, isStaleWorkspaceError, onWorkspaceChange, setActiveWorkspaceId } from '@/lib/workspace';

const ID = '7b0c1c9e-5f2a-4d8e-9b6a-2f1e0d3c4b5a';

afterEach(() => setActiveWorkspaceId(null));

describe('active workspace', () => {
  it('remembers a selected workspace and notifies listeners', () => {
    const listener = vi.fn();
    const stop = onWorkspaceChange(listener);
    setActiveWorkspaceId(ID);
    expect(getActiveWorkspaceId()).toBe(ID);
    expect(localStorage.getItem('jtcode:active-workspace')).toBe(ID);
    expect(listener).toHaveBeenCalledWith(ID);
    stop();
    setActiveWorkspaceId(null);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('jtcode:active-workspace')).toBeNull();
  });

  it('ignores anything that is not a workspace id (never sent as a header)', () => {
    setActiveWorkspaceId('local-workspace');
    expect(getActiveWorkspaceId()).toBeNull();
    setActiveWorkspaceId('x\r\nInjected: 1');
    expect(getActiveWorkspaceId()).toBeNull();
  });

  it('recognizes the server answers for a workspace the user lost', () => {
    expect(isStaleWorkspaceError(403, { detail: 'You do not have access to this organization.' })).toBe(true);
    expect(isStaleWorkspaceError(403, { code: 'permission_denied', message: 'The selected organization does not exist.' })).toBe(true);
    expect(isStaleWorkspaceError(403, { detail: 'Organization admin access is required.' })).toBe(false);
    expect(isStaleWorkspaceError(404, { detail: 'You do not have access to this organization.' })).toBe(false);
    expect(isStaleWorkspaceError(403, undefined)).toBe(false);
  });
});
