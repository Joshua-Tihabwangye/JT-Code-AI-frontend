import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Play, Plus, Square, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AGENT_GRAPHS, useRepository, type AgentGraph, type AgentRun } from '@/lib/data';
import { apiErrorMessage } from '@/lib/api/http';
import { formatDateTime } from '@/i18n/format';
import { slugify } from '@/features/agents/agents';
import { Alert, Badge, Button, Input, Select, Spinner, Textarea, useConfirm } from '@/shared/components';

const FINISHED = new Set(['completed', 'failed', 'cancelled']);

/** One run: status, output, the step trace, refreshed until it finishes; Cancel while it runs. */
function RunPanel({ runId }: { runId: string }) {
  const { t } = useTranslation();
  const agents = useRepository('agents');
  const queryClient = useQueryClient();
  const run = useQuery({
    queryKey: ['agent-run', runId],
    queryFn: () => agents.getRun(runId),
    refetchInterval: (query) => (query.state.data && FINISHED.has(query.state.data.status) ? false : 2000),
  });
  const steps = useQuery({
    queryKey: ['agent-run-steps', runId],
    queryFn: () => agents.steps(runId),
    refetchInterval: () => (run.data && FINISHED.has(run.data.status) ? false : 2000),
  });
  const cancel = useMutation({
    mutationFn: () => agents.cancel(runId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-run', runId] }),
  });
  if (run.isPending) return <Spinner size="sm" />;
  if (run.isError) return <Alert variant="destructive">{apiErrorMessage(run.error)}</Alert>;
  const current = run.data;
  const running = !FINISHED.has(current.status);
  return (
    <div className="space-y-3 rounded-lg border border-border p-4" data-testid="agent-run">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={current.status === 'completed' ? 'secondary' : 'outline'} data-testid="agent-run-status">
          {t(`agents.status.${current.status}`)}
        </Badge>
        {running && <Spinner size="sm" />}
        <span className="text-sm text-muted-foreground">{t('agents.usage', { models: current.modelCalls, tools: current.toolCalls })}</span>
        {running && (
          <Button type="button" variant="outline" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            <Square size={14} aria-hidden="true" />
            {t('agents.cancel')}
          </Button>
        )}
      </div>
      {current.finalOutput && (
        <div className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm" data-testid="agent-run-output">
          {current.finalOutput}
        </div>
      )}
      {current.errorMessage && <Alert variant="destructive">{current.errorMessage}</Alert>}
      {steps.data && steps.data.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">{t('agents.steps', { count: steps.data.length })}</summary>
          <ol className="mt-2 space-y-1 text-sm">
            {steps.data.map((step) => (
              <li key={step.sequence} className="flex flex-wrap gap-2">
                <code className="text-xs">{step.node}</code>
                <span className="text-muted-foreground">{step.summary || step.kind}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

/** Agents → Agents: define agents, run one (or the default assistant), follow the run, see recent runs. */
export function AgentsTab() {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const agents = useRepository('agents');
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [graph, setGraph] = useState<AgentGraph>('direct_answer');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState('');
  const [input, setInput] = useState('');
  const [runId, setRunId] = useState<string | null>(null);

  const list = useQuery({ queryKey: ['agents'], queryFn: () => agents.list(), retry: false });
  const runs = useQuery({ queryKey: ['agent-runs'], queryFn: () => agents.runs(), retry: false });
  const fail = (err: unknown) => setError(apiErrorMessage(err));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['agents'] });

  const create = useMutation({
    mutationFn: () =>
      agents.create({ name: name.trim(), slug: slugify(name), description: description.trim(), graph, systemPrompt: systemPrompt.trim() }),
    onSuccess: async (agent) => {
      setName('');
      setDescription('');
      setSystemPrompt('');
      setShowForm(false);
      setSelected(agent.id);
      setError('');
      await refresh();
    },
    onError: fail,
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => agents.setActive(id, isActive),
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => agents.remove(id),
    onSuccess: refresh,
    onError: fail,
  });
  const start = useMutation({
    mutationFn: () => agents.run(selected || null, input.trim()),
    onSuccess: async (run: AgentRun) => {
      setRunId(run.id);
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['agent-runs'] });
    },
    onError: fail,
  });

  function submitAgent(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) create.mutate();
  }

  function submitRun(event: FormEvent) {
    event.preventDefault();
    if (input.trim()) start.mutate();
  }

  const forbidden = list.isError && (list.error as { response?: { status?: number } }).response?.status === 403;
  if (forbidden) return <Alert>{t('agents.editorsOnly')}</Alert>;
  const active = (list.data ?? []).filter((agent) => agent.isActive);

  return (
    <div className="space-y-10" data-testid="agents-tab">
      {error && (
        <Alert variant="destructive" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('agents.runTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('agents.runDesc')}</p>
        </div>
        <form className="space-y-3" onSubmit={submitRun}>
          <div className="max-w-md">
            <label htmlFor="agent-select" className="mb-1.5 block text-sm font-medium text-foreground">
              {t('agents.agent')}
            </label>
            <Select
              id="agent-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              options={[{ value: '', label: t('agents.defaultAssistant') }, ...active.map((agent) => ({ value: agent.id, label: agent.name }))]}
            />
          </div>
          <Textarea label={t('agents.input')} rows={3} maxLength={20000} value={input} onChange={(e) => setInput(e.target.value)} />
          <Button type="submit" disabled={start.isPending || !input.trim()} data-testid="agent-run-start">
            {start.isPending ? <Spinner size="sm" /> : <Play size={16} aria-hidden="true" />}
            {t('agents.run')}
          </Button>
        </form>
        {runId && <RunPanel runId={runId} />}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t('agents.listTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('agents.listDesc')}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => setShowForm(!showForm)} aria-expanded={showForm} data-testid="agent-new">
            <Plus size={16} aria-hidden="true" />
            {t('agents.new')}
          </Button>
        </div>
        {showForm && (
          <form className="space-y-3 rounded-lg border border-border p-4" onSubmit={submitAgent} data-testid="agent-form">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label={t('agents.name')} required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
              <div>
                <label htmlFor="agent-graph" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t('agents.graph')}
                </label>
                <Select
                  id="agent-graph"
                  value={graph}
                  onChange={(e) => setGraph(e.target.value as AgentGraph)}
                  options={AGENT_GRAPHS.map((value) => ({ value, label: t(`agents.graphs.${value}`) }))}
                />
              </div>
            </div>
            <Input label={t('agents.description')} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
            <Textarea label={t('agents.instructions')} rows={4} maxLength={10000} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
            <Button type="submit" disabled={create.isPending || !name.trim()} data-testid="agent-create">
              {create.isPending ? <Spinner size="sm" /> : <Bot size={16} aria-hidden="true" />}
              {t('agents.create')}
            </Button>
          </form>
        )}
        {list.isPending ? (
          <Spinner size="sm" />
        ) : list.isError ? (
          <Alert variant="destructive">{apiErrorMessage(list.error)}</Alert>
        ) : list.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('agents.none')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border" data-testid="agents">
            {list.data.map((agent) => (
              <li key={agent.id} className="flex flex-wrap items-center gap-3 p-3">
                <Bot size={16} className="text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                    <span className="truncate">{agent.name}</span>
                    <Badge variant="outline">{t(`agents.graphs.${agent.graph}`)}</Badge>
                    {!agent.isActive && <Badge variant="outline">{t('agents.inactive')}</Badge>}
                  </div>
                  {agent.description && <div className="truncate text-sm text-muted-foreground">{agent.description}</div>}
                </div>
                <Button type="button" variant="outline" size="sm" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: agent.id, isActive: !agent.isActive })}>
                  {agent.isActive ? t('agents.deactivate') : t('agents.activate')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t('agents.deleteFor', { name: agent.name })}
                  disabled={remove.isPending}
                  onClick={() =>
                    void confirm({
                      title: t('agents.deleteTitle'),
                      description: t('agents.deleteConfirm', { name: agent.name }),
                      confirmLabel: t('agents.delete'),
                      destructive: true,
                    }).then((ok) => ok && remove.mutate(agent.id))
                  }
                >
                  <Trash2 size={14} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">{t('agents.recentTitle')}</h2>
        {runs.data && runs.data.length === 0 && <p className="text-sm text-muted-foreground">{t('agents.noRuns')}</p>}
        {runs.data && runs.data.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border" data-testid="agent-runs">
            {runs.data.slice(0, 20).map((run) => (
              <li key={run.id}>
                <button type="button" className="flex w-full flex-wrap items-center gap-2 p-3 text-left text-sm hover:bg-muted" onClick={() => setRunId(run.id)}>
                  <Badge variant={run.status === 'completed' ? 'secondary' : 'outline'}>{t(`agents.status.${run.status}`)}</Badge>
                  <span className="min-w-0 flex-1 truncate">{run.inputText}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(run.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {dialog}
    </div>
  );
}
