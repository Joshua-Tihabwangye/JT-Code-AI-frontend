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

describe('Mock repository: support', () => {
  it('opens a case, keeps the conversation, and refuses replies once closed', async () => {
    const { support } = createMockRepositories();
    const opened = await support.open({ subject: 'Export', description: 'It spins.', category: 'bug', priority: 'high' });
    expect(opened.status).toBe('open');
    await support.reply(opened.id, 'Any news?');
    expect((await support.messages(opened.id)).map((m) => m.body)).toEqual(['Any news?']);
    expect((await support.close(opened.id)).status).toBe('closed');
    await expect(support.reply(opened.id, 'again')).rejects.toThrow();
  });
});

describe('API repository: support', () => {
  it('maps cases and messages', async () => {
    const { createApiRepositories } = await import('../api/repositories');
    const { support } = createApiRepositories();
    http.post.mockResolvedValueOnce({
      data: {
        id: 'c1',
        subject: 'Export',
        description: 'd',
        category: 'bug',
        priority: 'high',
        status: 'open',
        user_email: 'ada@example.com',
        message_count: 0,
        created_at: '2026-11-01T00:00:00Z',
        updated_at: '2026-11-01T00:00:00Z',
      },
    });
    const opened = await support.open({ subject: 'Export', description: 'd', category: 'bug', priority: 'high' });
    expect(http.post).toHaveBeenCalledWith('/support-cases/', { subject: 'Export', description: 'd', category: 'bug', priority: 'high' });
    expect(opened).toMatchObject({ id: 'c1', userEmail: 'ada@example.com', messageCount: 0 });

    http.get.mockResolvedValueOnce({
      data: [{ id: 'm1', author_role: 'support', author_name: 'JT-Code support', body: 'Fixed.', created_at: '2026-11-02T00:00:00Z' }],
    });
    expect(await support.messages('c1')).toEqual([
      { id: 'm1', author: 'support', authorName: 'JT-Code support', body: 'Fixed.', createdAt: '2026-11-02T00:00:00Z' },
    ]);
    expect(http.get).toHaveBeenCalledWith('/support-cases/c1/messages/');
  });
});
