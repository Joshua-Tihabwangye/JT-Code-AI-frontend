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

describe('Mock repository: webhooks', () => {
  it('keeps endpoints in the browser, shows the secret once and never sends anything', async () => {
    const { webhooks } = createMockRepositories();
    const created = await webhooks.create({ name: 'Ops', url: 'https://example.com/hook', events: [] });
    expect(created.secret).toMatch(/^whsec_[0-9a-f]{64}$/);
    expect(JSON.stringify(await webhooks.list())).not.toContain(created.secret);
    expect((await webhooks.sendTest(created.id)).status).toBe('failed');
    expect(await webhooks.deliveries(created.id)).toHaveLength(1);
    expect((await webhooks.setStatus(created.id, 'paused')).status).toBe('paused');
    await webhooks.remove(created.id);
    expect(await webhooks.list()).toEqual([]);
  });

  it('refuses a plain http address', async () => {
    const { webhooks } = createMockRepositories();
    await expect(webhooks.create({ name: 'x', url: 'http://example.com', events: [] })).rejects.toThrow();
  });
});

describe('API repository: webhooks', () => {
  const row = {
    id: 'w1',
    name: 'Ops',
    url: 'https://example.com/hook',
    status: 'active',
    event_filter: 'custom',
    events: ['jobs.job.completed'],
    is_verified: true,
    last_success_at: null,
    last_failure_at: null,
    failure_count: 0,
    created_at: '2026-11-01T00:00:00Z',
  };

  it('sends all events as event_filter "all", maps fields, and reads deliveries', async () => {
    const { createApiRepositories } = await import('../api/repositories');
    const { webhooks } = createApiRepositories();
    http.post.mockResolvedValueOnce({ data: { ...row, event_filter: 'all', events: [], secret: 'whsec_x' } });
    const created = await webhooks.create({ name: 'Ops', url: 'https://example.com/hook', events: [] });
    expect(http.post).toHaveBeenCalledWith('/webhooks/', { name: 'Ops', url: 'https://example.com/hook', event_filter: 'all', events: [] });
    expect(created).toMatchObject({ secret: 'whsec_x', events: [], isVerified: true });

    http.get.mockResolvedValueOnce({ data: [row] });
    expect((await webhooks.list())[0]!.events).toEqual(['jobs.job.completed']);

    http.get.mockResolvedValueOnce({
      data: {
        results: [
          {
            id: 'd1',
            event_type: 'webhook.test',
            status: 'delivered',
            attempt: 1,
            max_attempts: 1,
            response_status: 200,
            error_message: '',
            created_at: '2026-11-01T00:00:00Z',
            delivered_at: '2026-11-01T00:00:01Z',
            next_retry_at: null,
          },
        ],
      },
    });
    expect(await webhooks.deliveries('w1')).toEqual([
      expect.objectContaining({ id: 'd1', eventType: 'webhook.test', status: 'delivered', responseStatus: 200 }),
    ]);
    expect(http.get).toHaveBeenLastCalledWith('/webhooks/w1/deliveries/', { params: undefined });

    http.post.mockResolvedValueOnce({ data: { ...row, secret: 'whsec_new' } });
    expect((await webhooks.rotateSecret('w1')).secret).toBe('whsec_new');
    expect(http.post).toHaveBeenLastCalledWith('/webhooks/w1/rotate-secret/');
  });
});
