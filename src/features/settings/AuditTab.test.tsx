import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditTab } from './AuditTab';

const repo = vi.hoisted(() => ({ list: vi.fn(), exportCsv: vi.fn() }));
const saveBlob = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key) }),
}));
vi.mock('@/lib/api/http', () => ({ apiErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'error') }));
vi.mock('@/lib/data', async () => ({ AUDIT_CATEGORIES: (await import('@/lib/data/types')).AUDIT_CATEGORIES, useRepository: () => repo }));
vi.mock('@/i18n/format', () => ({ formatDateTime: (value: string) => value }));
vi.mock('@/features/visualize/echarts', () => ({ saveBlob }));

const event = (id: string) => ({
  id,
  createdAt: '2026-11-20T15:00:00Z',
  actorEmail: 'ada@example.com',
  category: 'configuration',
  action: 'api-key-list.post',
  severity: 'info',
  outcome: 'success',
  description: `Created key ${id}`,
  ipAddress: '203.0.113.7',
});

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuditTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  repo.list.mockReset();
  repo.exportCsv.mockReset();
  saveBlob.mockReset();
});

describe('Settings → Audit log', () => {
  it('lists entries, loads more pages and refetches when a filter changes', async () => {
    repo.list.mockImplementation((_filter: unknown, page: number) =>
      Promise.resolve(page === 1 ? { events: [event('a')], hasMore: true } : { events: [event('b')], hasMore: false }),
    );
    renderTab();
    expect(await screen.findByText('Created key a')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('audit-more'));
    expect(await screen.findByText('Created key b')).toBeInTheDocument();
    expect(screen.queryByTestId('audit-more')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('audit.category'), { target: { value: 'security' } });
    await waitFor(() => expect(repo.list).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'security' }), 1));
  });

  it('downloads the filtered CSV and refuses a reversed date range', async () => {
    repo.list.mockResolvedValue({ events: [], hasMore: false });
    repo.exportCsv.mockResolvedValue(new Blob(['x']));
    renderTab();
    fireEvent.click(await screen.findByTestId('audit-export'));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^audit-log-.*\.csv$/)));

    fireEvent.change(screen.getByLabelText('audit.from'), { target: { value: '2026-11-21' } });
    fireEvent.change(screen.getByLabelText('audit.to'), { target: { value: '2026-11-20' } });
    expect(await screen.findByText('audit.badRange')).toBeInTheDocument();
    expect(screen.getByTestId('audit-export')).toBeDisabled();
  });

  it('tells members who are not admins that the log is admin-only', async () => {
    repo.list.mockRejectedValue(Object.assign(new Error('forbidden'), { response: { status: 403 } }));
    renderTab();
    expect(await screen.findByText('audit.adminOnly')).toBeInTheDocument();
  });
});
