import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AcceptInvitePage from '@/pages/AcceptInvitePage';
import { setActiveWorkspaceId } from '@/lib/workspace';

const acceptInvite = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key) }),
}));
vi.mock('@/auth/AuthLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/lib/api/http', () => ({ apiErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'error') }));
vi.mock('@/lib/workspace', () => ({ setActiveWorkspaceId: vi.fn() }));
vi.mock('@/lib/data', () => ({
  useRepository: (name: string) =>
    name === 'team' ? { acceptInvite } : { getAccount: () => Promise.resolve({ email: 'grace@example.com' }) },
}));

function renderAt(url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/invite/:inviteId" element={<AcceptInvitePage />} />
          <Route path="/app/chat" element={<p>chat page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  acceptInvite.mockReset();
  // The workspace mock is shared by every test; a join in one test must not leak into the next.
  vi.mocked(setActiveWorkspaceId).mockClear();
});

describe('AcceptInvitePage', () => {
  it('explains an incomplete link instead of offering to join', () => {
    renderAt('/invite/abc');
    expect(screen.getByText('team.accept.invalidLink')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'team.accept.join' })).not.toBeInTheDocument();
  });

  it('joins on click, switches to the joined workspace and opens it', async () => {
    acceptInvite.mockResolvedValue({
      member: { userId: 'u1', email: 'grace@example.com', name: 'Grace', role: 'editor', isOwner: false },
      workspace: { id: 'org-1', name: 'Analytical Engines' },
    });
    renderAt('/invite/abc?token=secret');
    expect(await screen.findByText(/grace@example\.com/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'team.accept.join' }));
    await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith('abc', 'secret'));
    expect(await screen.findByText(/team\.accept\.joined/)).toHaveTextContent('Analytical Engines');
    expect(setActiveWorkspaceId).toHaveBeenCalledWith('org-1');

    fireEvent.click(screen.getByRole('button', { name: 'team.accept.open' }));
    expect(await screen.findByText('chat page')).toBeInTheDocument();
  });

  it('shows the server error and stays on the page', async () => {
    acceptInvite.mockRejectedValue(new Error('This invite was issued to a different email address.'));
    renderAt('/invite/abc?token=secret');
    fireEvent.click(await screen.findByRole('button', { name: 'team.accept.join' }));
    expect(await screen.findByText('This invite was issued to a different email address.')).toBeInTheDocument();
    expect(setActiveWorkspaceId).not.toHaveBeenCalled();
  });
});
