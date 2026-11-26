import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolsTab } from './ToolsTab';

const tools = vi.hoisted(() => ({
  catalog: vi.fn(),
  approvals: vi.fn(),
  decide: vi.fn(),
  mcpServers: vi.fn(),
  addMcpServer: vi.fn(),
  discover: vi.fn(),
  setAllowedTools: vi.fn(),
  removeMcpServer: vi.fn(),
  credentials: vi.fn(),
  addCredential: vi.fn(),
  removeCredential: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key) }),
}));
vi.mock('@/lib/api/http', () => ({ apiErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'error') }));
vi.mock('@/lib/data', () => ({ useRepository: () => tools }));
vi.mock('@/i18n/format', () => ({ formatDateTime: (value: string) => value }));

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToolsTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(tools).forEach((fn) => fn.mockReset());
  tools.catalog.mockResolvedValue([
    { name: 'knowledge.search', description: 'Search', requiresApproval: false, minRole: 'viewer', available: true },
    { name: 'slack.post', description: 'Post', requiresApproval: true, minRole: 'editor', available: false },
  ]);
  tools.mcpServers.mockResolvedValue([]);
  tools.credentials.mockResolvedValue([]);
});

describe('Agents → Tools', () => {
  it('approves a pending tool call with a note', async () => {
    tools.approvals.mockResolvedValue([
      { id: 'p1', toolName: 'slack.post', summary: 'Post the summary', arguments: { channel: 'C1' }, status: 'pending', agentRunId: 'r1', decisionNote: '', expiresAt: null, createdAt: '' },
    ]);
    tools.decide.mockResolvedValue({});
    renderTab();
    expect(await screen.findByText('Post the summary')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('tools.note'), { target: { value: 'ok to post' } });
    fireEvent.click(screen.getByTestId('approve-p1'));
    await waitFor(() => expect(tools.decide).toHaveBeenCalledWith('p1', true, 'ok to post'));
    expect(tools.approvals).toHaveBeenCalledWith('pending');
  });

  it('marks tools that ask for approval or need a higher role', async () => {
    tools.approvals.mockResolvedValue([]);
    renderTab();
    const catalog = await screen.findByTestId('tool-catalog');
    expect(catalog).toHaveTextContent('tools.needsApproval');
    expect(catalog).toHaveTextContent('tools.roleNeeded {"role":"editor"}');
  });

  it('shows the admin-only note instead of connections for other members', async () => {
    tools.approvals.mockResolvedValue([]);
    tools.mcpServers.mockRejectedValue(Object.assign(new Error('forbidden'), { response: { status: 403 } }));
    tools.credentials.mockRejectedValue(Object.assign(new Error('forbidden'), { response: { status: 403 } }));
    renderTab();
    expect(await screen.findByText('tools.adminOnly')).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-add')).not.toBeInTheDocument();
  });

  it('saves a credential with its secret once and clears the field', async () => {
    tools.approvals.mockResolvedValue([]);
    tools.addCredential.mockResolvedValue({});
    renderTab();
    fireEvent.change(await screen.findByLabelText('tools.credentialName'), { target: { value: 'Docs MCP' } });
    fireEvent.change(screen.getByLabelText('tools.secret'), { target: { value: 's3cret' } });
    fireEvent.click(screen.getByTestId('credential-add'));
    await waitFor(() => expect(tools.addCredential).toHaveBeenCalledWith({ provider: 'mcp', name: 'docs-mcp', secret: 's3cret' }));
    await waitFor(() => expect(screen.getByLabelText('tools.secret')).toHaveValue(''));
  });
});
