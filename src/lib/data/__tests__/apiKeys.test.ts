import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRepositories } from '../mock/repositories';
import { configureMockRuntime } from '../mock/latency';
import { resetDemoData } from '../storage/migrations';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('@/lib/api/http', async (original) => ({ ...(await original<object>()), http }));

beforeEach(async () => {
  configureMockRuntime({ latencyMs: 0, failureRate: 0, failFor: [] });
  localStorage.clear();
  await resetDemoData();
  Object.values(http).forEach((fn) => fn.mockReset());
});

describe('Mock repository: API keys', () => {
  it('shows a new key once, lists it without the secret, and revokes it', async () => {
    const { apiKeys } = createMockRepositories();
    const created = await apiKeys.create({ name: ' CI ', scopes: ['write', 'read', 'read'], expiresAt: null });
    expect(created.key).toMatch(/^jtk_test_[0-9a-f]{64}$/);
    expect(created).toMatchObject({ name: 'CI', scopes: ['read', 'write'], status: 'active' });

    const listed = await apiKeys.list();
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(created.key);

    expect((await apiKeys.revoke(created.id)).status).toBe('revoked');
  });

  it('refuses a key without a name or a scope', async () => {
    const { apiKeys } = createMockRepositories();
    await expect(apiKeys.create({ name: ' ', scopes: ['read'], expiresAt: null })).rejects.toThrow();
    await expect(apiKeys.create({ name: 'x', scopes: [], expiresAt: null })).rejects.toThrow();
  });
});

describe('API repository: API keys', () => {
  const row = {
    id: 'k1',
    name: 'CI',
    prefix: 'jtk_live',
    status: 'active',
    scopes: ['read'],
    rate_limit: 1000,
    last_used_at: null,
    expires_at: '2027-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    user_email: 'ada@example.com',
  };

  it('maps the server fields and sends only what the server accepts', async () => {
    const { createApiRepositories } = await import('../api/repositories');
    const { apiKeys } = createApiRepositories();
    http.get.mockResolvedValue({ data: { count: 1, next: null, previous: null, results: [row] } });
    http.post.mockResolvedValueOnce({ data: { ...row, key: 'jtk_live_secret' } });

    expect(await apiKeys.list()).toEqual([
      {
        id: 'k1',
        name: 'CI',
        prefix: 'jtk_live',
        status: 'active',
        scopes: ['read'],
        rateLimit: 1000,
        lastUsedAt: null,
        expiresAt: '2027-01-01T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
        ownerEmail: 'ada@example.com',
      },
    ]);
    const created = await apiKeys.create({ name: 'CI', scopes: ['read'], expiresAt: null });
    expect(created.key).toBe('jtk_live_secret');
    // No expiry: the field is left out (the server treats a missing expiry as "never").
    expect(http.post).toHaveBeenCalledWith('/api-keys/', { name: 'CI', scopes: ['read'] });

    http.post.mockResolvedValueOnce({ data: { ...row, status: 'revoked' } });
    expect((await apiKeys.revoke('k1')).status).toBe('revoked');
    expect(http.post).toHaveBeenLastCalledWith('/api-keys/k1/revoke/');
  });
});
