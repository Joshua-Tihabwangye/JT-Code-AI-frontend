import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentsTab } from './AgentsTab';
import { AutomationsTab } from './AutomationsTab';

const agents = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  setActive: vi.fn(),
  remove: vi.fn(),
  run: vi.fn(),
  getRun: vi.fn(),
  steps: vi.fn(),
  cancel: vi.fn(),
  runs: vi.fn(),
}));
const automations = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), setActive: vi.fn(), remove: vi.fn(), runNow: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key) }),
}));
vi.mock('@/lib/api/http', () => ({ apiErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'error') }));
vi.mock('@/lib/data', async () => {
  const types = await import('@/lib/data/types');
  return {
    AGENT_GRAPHS: types.AGENT_GRAPHS,
    AUTOMATION_ACTIONS: types.AUTOMATION_ACTIONS,
    useRepository: (name: string) => (name === 'agents' ? agents : automations),
  };
});
vi.mock('@/i18n/format', () => ({ formatDateTime: (value: string) => value }));

function renderWith(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

const run = {
  id: 'r1',
  agentId: null,
  status: 'completed',
  graph: 'direct_answer',
  inputText: 'Summarise Q3',
  finalOutput: 'Revenue grew 8%.',
  errorMessage: '',
  modelCalls: 1,
  toolCalls: 0,
  costUsd: '0.001',
  createdAt: '2026-11-25T10:00:00Z',
  completedAt: '2026-11-25T10:00:02Z',
};

beforeEach(() => {
  Object.values(agents).forEach((fn) => fn.mockReset());
  Object.values(automations).forEach((fn) => fn.mockReset());
});

describe('Agents tab', () => {
  it('runs a task with the default assistant and shows the result and steps', async () => {
    agents.list.mockResolvedValue([]);
    agents.runs.mockResolvedValue([]);
    agents.run.mockResolvedValue({ ...run, status: 'queued', finalOutput: '' });
    agents.getRun.mockResolvedValue(run);
    agents.steps.mockResolvedValue([{ sequence: 1, node: 'answer', kind: 'model', outcome: 'ok', summary: 'Answered', createdAt: '' }]);
    renderWith(<AgentsTab />);
    fireEvent.change(await screen.findByLabelText('agents.input'), { target: { value: ' Summarise Q3 ' } });
    fireEvent.click(screen.getByTestId('agent-run-start'));
    await waitFor(() => expect(agents.run).toHaveBeenCalledWith(null, 'Summarise Q3'));
    expect(await screen.findByTestId('agent-run-output')).toHaveTextContent('Revenue grew 8%.');
    expect(screen.getByTestId('agent-run-status')).toHaveTextContent('agents.status.completed');
  });

  it('creates an agent with a slug derived from its name', async () => {
    agents.list.mockResolvedValue([]);
    agents.runs.mockResolvedValue([]);
    agents.create.mockResolvedValue({ id: 'a1' });
    renderWith(<AgentsTab />);
    fireEvent.click(await screen.findByTestId('agent-new'));
    fireEvent.change(screen.getByLabelText('agents.name'), { target: { value: 'Weekly Report' } });
    fireEvent.change(screen.getByLabelText('agents.graph'), { target: { value: 'research' } });
    fireEvent.click(screen.getByTestId('agent-create'));
    await waitFor(() =>
      expect(agents.create).toHaveBeenCalledWith({ name: 'Weekly Report', slug: 'weekly-report', description: '', graph: 'research', systemPrompt: '' }),
    );
  });

  it('tells viewers that agents are for editors and admins', async () => {
    agents.list.mockRejectedValue(Object.assign(new Error('forbidden'), { response: { status: 403 } }));
    agents.runs.mockResolvedValue([]);
    renderWith(<AgentsTab />);
    expect(await screen.findByText('agents.editorsOnly')).toBeInTheDocument();
  });
});

describe('Automations tab', () => {
  it('creates a weekday e-mail to members', async () => {
    automations.list.mockResolvedValue([]);
    automations.create.mockResolvedValue({});
    renderWith(<AutomationsTab />);
    fireEvent.click(await screen.findByTestId('automation-new'));
    fireEvent.change(screen.getByLabelText('automations.name'), { target: { value: 'Morning digest' } });
    fireEvent.change(screen.getByLabelText('automations.schedule'), { target: { value: 'weekdays' } });
    fireEvent.change(screen.getByLabelText('automations.to'), { target: { value: 'ana@example.com; ben@example.com' } });
    fireEvent.change(screen.getByLabelText('automations.subject'), { target: { value: 'Digest' } });
    fireEvent.change(screen.getByLabelText('automations.text'), { target: { value: 'Good morning' } });
    fireEvent.click(screen.getByTestId('automation-create'));
    await waitFor(() =>
      expect(automations.create).toHaveBeenCalledWith({
        name: 'Morning digest',
        schedule: '0 8 * * 1-5',
        input: { action: 'email', to: ['ana@example.com', 'ben@example.com'], subject: 'Digest', text: 'Good morning' },
      }),
    );
  });

  it('explains when the server has no workflow engine', async () => {
    automations.list.mockResolvedValue([]);
    automations.create.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 403 } }));
    renderWith(<AutomationsTab />);
    fireEvent.click(await screen.findByTestId('automation-new'));
    fireEvent.change(screen.getByLabelText('automations.name'), { target: { value: 'Ping' } });
    fireEvent.change(screen.getByLabelText('automations.action'), { target: { value: 'webhook' } });
    fireEvent.change(screen.getByLabelText('automations.url'), { target: { value: 'https://example.com/hook' } });
    fireEvent.click(screen.getByTestId('automation-create'));
    expect(await screen.findByText('automations.unavailable')).toBeInTheDocument();
  });
});
