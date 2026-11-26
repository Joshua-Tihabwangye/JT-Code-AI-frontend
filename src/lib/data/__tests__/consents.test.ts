import { describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('@/lib/api/http', async (original) => ({ ...(await original<object>()), http }));

describe('API repository: consents', () => {
  it('maps the server records', async () => {
    http.get.mockResolvedValue({
      data: [{ id: 'c1', consent_type: 'privacy', status: 'granted', version: 'v1', granted_at: 'g', withdrawn_at: null, created_at: 'c' }],
    });
    const { createApiRepositories } = await import('../api/repositories');
    expect(await createApiRepositories().consents.list()).toEqual([
      { id: 'c1', type: 'privacy', status: 'granted', version: 'v1', grantedAt: 'g', withdrawnAt: null, createdAt: 'c' },
    ]);
    expect(http.get).toHaveBeenCalledWith('/consents/', { params: undefined });
    // The first, cold import of the API repositories module is slow.
  }, 30_000);
});
