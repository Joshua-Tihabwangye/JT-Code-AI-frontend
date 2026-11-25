import { describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('@/lib/api/http', async (original) => ({ ...(await original<object>()), http }));

describe('API repository: agents', () => {
  it('starts runs on the right path with an Idempotency-Key', async () => {
    const { createApiRepositories } = await import('../api/repositories');
    const { agents } = createApiRepositories();
    http.post.mockResolvedValue({ data: { id: 'r1', status: 'queued', createdAt: 'c' } });
    await agents.run(null, 'Summarise');
    const [path, body, options] = http.post.mock.calls[0] as [string, unknown, { headers: Record<string, string> }];
    expect([path, body]).toEqual(['/agent-runs/', { input: 'Summarise' }]);
    expect(options.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    const run = await agents.run('a 1', 'Summarise');
    expect(http.post).toHaveBeenLastCalledWith('/agents/a%201/runs/', { input: 'Summarise' }, expect.anything());
    expect(run).toMatchObject({ id: 'r1', status: 'queued', finalOutput: '', modelCalls: 0, costUsd: '0' });
  }, 30_000);
});
