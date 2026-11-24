import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Webhook } from '@/lib/data';
import { WebhooksSection } from './WebhooksSection';

const repo = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  setStatus: vi.fn(),
  remove: vi.fn(),
  sendTest: vi.fn(),
  rotateSecret: vi.fn(),
  deliveries: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key) }),
}));
vi.mock('@/lib/api/http', () => ({ apiErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'error') }));
vi.mock('@/lib/data', async () => ({ WEBHOOK_EVENTS: (await import('@/lib/data/types')).WEBHOOK_EVENTS, useRepository: () => repo }));
vi.mock('@/i18n/format', () => ({ formatDate: (value: string) => value }));

const hook: Webhook = {
  id: 'w1',
  name: 'Ops',
  url: 'https://example.com/hook',
  status: 'active',
  events: [],
  isVerified: false,
  lastSuccessAt: null,
  lastFailureAt: null,
  failureCount: 0,
  createdAt: '2026-11-01T00:00:00Z',
};

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <WebhooksSection />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(repo).forEach((fn) => fn.mockReset());
});

describe('Settings → Developer → Webhooks', () => {
  it('adds an endpoint for chosen events and shows the signing secret once', async () => {
    repo.list.mockResolvedValueOnce([]).mockResolvedValue([hook]);
    repo.create.mockResolvedValue({ ...hook, secret: 'whsec_once' });
    renderSection();
    fireEvent.change(await screen.findByLabelText('webhooks.name'), { target: { value: 'Ops' } });
    fireEvent.change(screen.getByLabelText('webhooks.url'), { target: { value: 'https://example.com/hook' } });
    fireEvent.click(screen.getByTestId('webhook-all-events'));
    // Choosing specific events: nothing chosen yet, so the button waits.
    expect(screen.getByTestId('create-webhook')).toBeDisabled();
    fireEvent.click(within(screen.getByTestId('webhook-events')).getByText('webhooks.events.jobs_job_completed'));
    fireEvent.click(screen.getByTestId('create-webhook'));

    await waitFor(() =>
      expect(repo.create).toHaveBeenCalledWith({ name: 'Ops', url: 'https://example.com/hook', events: ['jobs.job.completed'] }),
    );
    expect(await screen.findByTestId('webhook-secret')).toHaveValue('whsec_once');
    expect(await screen.findByTestId('webhooks')).toHaveTextContent('Ops');
  });

  it('sends a test and shows its delivery', async () => {
    repo.list.mockResolvedValue([hook]);
    repo.sendTest.mockResolvedValue({});
    repo.deliveries.mockResolvedValue([
      {
        id: 'd1',
        eventType: 'webhook.test',
        status: 'delivered',
        attempt: 1,
        maxAttempts: 1,
        responseStatus: 200,
        errorMessage: '',
        createdAt: '2026-11-01T00:00:00Z',
        deliveredAt: null,
        nextRetryAt: null,
      },
    ]);
    renderSection();
    fireEvent.click(await screen.findByTestId('webhook-test-w1'));
    await waitFor(() => expect(repo.sendTest).toHaveBeenCalledWith('w1'));
    const deliveries = await screen.findByTestId('webhook-deliveries-w1');
    expect(deliveries).toHaveTextContent('webhook.test');
    expect(deliveries).toHaveTextContent('HTTP 200');
  });

  it('deletes only after confirming', async () => {
    repo.list.mockResolvedValue([hook]);
    repo.remove.mockResolvedValue(undefined);
    renderSection();
    fireEvent.click(await screen.findByLabelText('webhooks.deleteFor {"name":"Ops"}'));
    expect(repo.remove).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'webhooks.delete' }));
    await waitFor(() => expect(repo.remove).toHaveBeenCalledWith('w1'));
  });

  it('tells members who are not admins that webhooks are admin-only', async () => {
    repo.list.mockRejectedValue(Object.assign(new Error('forbidden'), { response: { status: 403 } }));
    renderSection();
    expect(await screen.findByText('webhooks.adminOnly')).toBeInTheDocument();
    expect(screen.queryByTestId('create-webhook')).not.toBeInTheDocument();
  });
});
