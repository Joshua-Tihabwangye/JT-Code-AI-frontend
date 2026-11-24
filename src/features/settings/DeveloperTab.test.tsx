import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiKey } from '@/lib/data';
import { DeveloperTab } from './DeveloperTab';

const repo = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), revoke: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key) }),
}));
vi.mock('@/lib/api/http', () => ({ apiErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'error') }));
vi.mock('@/lib/data', () => ({ useRepository: () => repo }));
vi.mock('@/i18n/format', () => ({ formatDate: (value: string) => value }));
// Tested on its own (WebhooksSection.test.tsx); here only the API keys part matters.
vi.mock('@/features/settings/WebhooksSection', () => ({ WebhooksSection: () => null }));

const active: ApiKey = {
  id: 'k1',
  name: 'Reporting server',
  prefix: 'jtk_live',
  status: 'active',
  scopes: ['read'],
  rateLimit: 1000,
  lastUsedAt: null,
  expiresAt: null,
  createdAt: '2026-11-01T00:00:00Z',
  ownerEmail: 'ada@example.com',
};

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DeveloperTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(repo).forEach((fn) => fn.mockReset());
});

describe('Settings → Developer', () => {
  it('creates a write key that expires, and shows the secret once with a usage example', async () => {
    repo.list.mockResolvedValueOnce([]).mockResolvedValue([active]);
    repo.create.mockResolvedValue({ ...active, scopes: ['read', 'write'], key: 'jtk_live_secret' });
    renderTab();
    expect(await screen.findByText('developer.none')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('developer.name'), { target: { value: '  CI  ' } });
    fireEvent.click(screen.getByTestId('api-key-write'));
    fireEvent.click(screen.getByTestId('create-api-key'));

    await waitFor(() => expect(repo.create).toHaveBeenCalledTimes(1));
    const input = repo.create.mock.calls[0]![0] as { name: string; scopes: string[]; expiresAt: string };
    expect(input.name).toBe('CI');
    expect(input.scopes).toEqual(['read', 'write']);
    // The default expiry is 90 days.
    const days = (Date.parse(input.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThan(90.1);

    const panel = await screen.findByTestId('api-key-created');
    expect(within(panel).getByTestId('api-key-secret')).toHaveValue('jtk_live_secret');
    expect(panel.textContent).toContain('curl -H "X-API-Key: jtk_live_secret"');
    expect(await screen.findByTestId('api-keys')).toHaveTextContent('Reporting server');
  });

  it('a key without the write box is read-only', async () => {
    repo.list.mockResolvedValue([]);
    repo.create.mockResolvedValue({ ...active, key: 'k' });
    renderTab();
    fireEvent.change(await screen.findByLabelText('developer.name'), { target: { value: 'Read only' } });
    fireEvent.click(screen.getByTestId('create-api-key'));
    await waitFor(() => expect(repo.create).toHaveBeenCalled());
    expect((repo.create.mock.calls[0]![0] as { scopes: string[] }).scopes).toEqual(['read']);
  });

  it('revokes a key only after confirming', async () => {
    repo.list.mockResolvedValue([active]);
    repo.revoke.mockResolvedValue({ ...active, status: 'revoked' });
    renderTab();

    fireEvent.click(await screen.findByLabelText('developer.revokeFor {"name":"Reporting server"}'));
    expect(repo.revoke).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'developer.revoke' }));

    await waitFor(() => expect(repo.revoke).toHaveBeenCalledWith('k1'));
    expect(await screen.findByText('developer.revoked')).toBeInTheDocument();
  });
});
