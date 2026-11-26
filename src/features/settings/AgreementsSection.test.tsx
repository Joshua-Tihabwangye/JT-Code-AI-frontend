import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgreementsSection } from './AgreementsSection';

const repo = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key) }),
}));
vi.mock('@/lib/api/http', () => ({ apiErrorMessage: () => 'error' }));
vi.mock('@/lib/data', () => ({ useRepository: () => repo }));
vi.mock('@/i18n/format', () => ({ formatDateTime: (value: string) => value }));

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgreementsSection />
    </QueryClientProvider>,
  );
}

describe('Settings → Profile → Your agreements', () => {
  it('lists what was accepted, the version and when, read-only', async () => {
    repo.list.mockResolvedValue([
      { id: 'c1', type: 'terms', status: 'granted', version: '2026-11', grantedAt: '2026-11-13T07:00:00Z', withdrawnAt: null, createdAt: '2026-11-13T07:00:00Z' },
      { id: 'c2', type: 'marketing', status: 'withdrawn', version: '1', grantedAt: '2026-11-13T07:00:00Z', withdrawnAt: '2026-11-20T10:00:00Z', createdAt: '2026-11-13T07:00:00Z' },
    ]);
    renderSection();
    expect(await screen.findByText(/^agreements\.types\.terms/)).toBeInTheDocument();
    expect(screen.getByText(/agreements.version \{"version":"2026-11"\}/)).toHaveTextContent('2026-11-13T07:00:00Z');
    expect(screen.getByText(/agreements.withdrawnOn/)).toHaveTextContent('2026-11-20T10:00:00Z');
    expect(screen.getByTestId('agreements').querySelector('button, input')).toBeNull();
  });
});
