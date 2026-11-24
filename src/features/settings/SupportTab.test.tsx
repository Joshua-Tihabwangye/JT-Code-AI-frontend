import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupportCase } from '@/lib/data';
import { SupportTab } from './SupportTab';

const repo = vi.hoisted(() => ({ list: vi.fn(), open: vi.fn(), messages: vi.fn(), reply: vi.fn(), close: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key) }),
}));
vi.mock('@/lib/api/http', () => ({ apiErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'error') }));
vi.mock('@/lib/data', async () => {
  const types = await import('@/lib/data/types');
  return { SUPPORT_CATEGORIES: types.SUPPORT_CATEGORIES, SUPPORT_PRIORITIES: types.SUPPORT_PRIORITIES, useRepository: () => repo };
});
vi.mock('@/i18n/format', () => ({ formatDate: (value: string) => value }));

const item: SupportCase = {
  id: 'c1',
  subject: 'Export fails',
  description: 'It spins.',
  category: 'bug',
  priority: 'high',
  status: 'waiting_user',
  userEmail: 'ada@example.com',
  messageCount: 1,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-02T00:00:00Z',
};

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SupportTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(repo).forEach((fn) => fn.mockReset());
});

describe('Settings → Support', () => {
  it('opens a case with its topic and urgency, then shows its thread', async () => {
    repo.list.mockResolvedValueOnce([]).mockResolvedValue([item]);
    repo.open.mockResolvedValue(item);
    repo.messages.mockResolvedValue([]);
    renderTab();
    fireEvent.change(await screen.findByLabelText('support.subject'), { target: { value: ' Export fails ' } });
    fireEvent.change(screen.getByLabelText('support.category'), { target: { value: 'bug' } });
    fireEvent.change(screen.getByLabelText('support.priority'), { target: { value: 'high' } });
    fireEvent.change(screen.getByLabelText('support.description'), { target: { value: 'It spins.' } });
    fireEvent.click(screen.getByTestId('support-open-case'));
    await waitFor(() =>
      expect(repo.open).toHaveBeenCalledWith({ subject: 'Export fails', description: 'It spins.', category: 'bug', priority: 'high' }),
    );
    expect(await screen.findByTestId('support-thread')).toHaveTextContent('It spins.');
  });

  it('shows support replies as JT-Code support and sends a reply', async () => {
    repo.list.mockResolvedValue([item]);
    repo.messages.mockResolvedValue([
      { id: 'm1', author: 'support', authorName: 'JT-Code support', body: 'Try again now.', createdAt: '2026-11-02T00:00:00Z' },
    ]);
    repo.reply.mockResolvedValue({});
    renderTab();
    fireEvent.click(await screen.findByText('Export fails'));
    expect(await screen.findByTestId('support-message-support')).toHaveTextContent('support.fromSupport');
    fireEvent.change(screen.getByLabelText('support.reply'), { target: { value: 'Works, thanks.' } });
    fireEvent.click(screen.getByTestId('support-send-reply'));
    await waitFor(() => expect(repo.reply).toHaveBeenCalledWith('c1', 'Works, thanks.'));
  });

  it('closes after confirming, and a closed case takes no reply', async () => {
    repo.list.mockResolvedValueOnce([item]).mockResolvedValue([{ ...item, status: 'closed' }]);
    repo.messages.mockResolvedValue([]);
    repo.close.mockResolvedValue({ ...item, status: 'closed' });
    renderTab();
    fireEvent.click(await screen.findByText('Export fails'));
    fireEvent.click(await screen.findByRole('button', { name: 'support.close' }));
    expect(repo.close).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'support.close' }));
    await waitFor(() => expect(repo.close).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText('support.closedHelp')).toBeInTheDocument();
    expect(screen.queryByTestId('support-send-reply')).not.toBeInTheDocument();
  });
});
