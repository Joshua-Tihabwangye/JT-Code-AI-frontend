import { beforeEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('@/lib/api/http', async (original) => ({ ...(await original<object>()), http }));

beforeEach(() => Object.values(http).forEach((fn) => fn.mockReset()));

describe('API repository: audit log', () => {
  it('sends only the filters that are set, maps rows and reports more pages', async () => {
    const { createApiRepositories } = await import('../api/repositories');
    const { audit } = createApiRepositories();
    http.get.mockResolvedValueOnce({
      data: {
        count: 51,
        next: 'https://api/audit-events/?page=2',
        previous: null,
        results: [
          {
            id: 'e1',
            created_at: '2026-11-20T15:00:00Z',
            actor_email: null,
            category: 'security',
            action: 'webhook.rejected',
            severity: 'warning',
            outcome: 'failure',
            description: 'Rejected',
            ip_address: '203.0.113.7',
          },
        ],
      },
    });
    const page = await audit.list({ category: 'security', startDate: '', endDate: '2026-11-20' }, 1);
    expect(http.get).toHaveBeenCalledWith('/audit-events/', { params: { category: 'security', end_date: '2026-11-20', page: 1 } });
    expect(page).toEqual({
      hasMore: true,
      events: [
        {
          id: 'e1',
          createdAt: '2026-11-20T15:00:00Z',
          actorEmail: '',
          category: 'security',
          action: 'webhook.rejected',
          severity: 'warning',
          outcome: 'failure',
          description: 'Rejected',
          ipAddress: '203.0.113.7',
        },
      ],
    });

    http.get.mockResolvedValueOnce({ data: new Blob(['x']) });
    await audit.exportCsv({ category: 'security' });
    expect(http.get).toHaveBeenLastCalledWith('/audit-events/export/', { params: { category: 'security' }, responseType: 'blob' });
  });
});
