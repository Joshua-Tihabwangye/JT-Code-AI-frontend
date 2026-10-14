import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, BrainCircuit, Send, Sparkles, Wand2, X } from 'lucide-react';
import { useRepository, type VizAssistantAnswer } from '@/lib/data';
import { Button } from '@/shared/components';
import { useVisualize } from './context';
import { DatasetPicker, ErrorNote } from './ui';

interface Turn {
  id: string;
  prompt: string;
  answer?: VizAssistantAnswer;
  error?: unknown;
}

const QUICK_PROMPTS = [
  'Which chart best shows my sales trend?',
  'Compare revenue across regions',
  'What drives the biggest differences in this data?',
  'Forecast the next 6 months',
  'Find unusual rows',
  'Explain the chart on screen',
];

function fieldSummary(fields: Record<string, string | string[]>): string {
  return Object.entries(fields)
    .map(([slot, value]) => `${slot}: ${Array.isArray(value) ? value.join(', ') : value}`)
    .join(' · ');
}

/** The JT-Code AI drawer (slides in from the right). It calls the model only when the user sends a prompt. */
export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const { datasetId, catalog, assistantContext, openStudio, openPredict } = useVisualize();
  const [prompt, setPrompt] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const end = useRef<HTMLDivElement>(null);

  const ask = useMutation({
    mutationFn: (input: { id: string; prompt: string }) =>
      visualize.ask({
        prompt: input.prompt,
        datasetId: datasetId || undefined,
        context: { ...assistantContext },
      }),
    onSuccess: (answer, input) => {
      setTurns((current) => current.map((turn) => (turn.id === input.id ? { ...turn, answer } : turn)));
      void queryClient.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: (error, input) => setTurns((current) => current.map((turn) => (turn.id === input.id ? { ...turn, error } : turn))),
  });

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || ask.isPending) return;
    const id = crypto.randomUUID();
    setTurns((current) => [...current, { id, prompt: trimmed }]);
    setPrompt('');
    ask.mutate({ id, prompt: trimmed });
  }

  const chartName = (id: string) => catalog?.charts.find((chart) => chart.id === id)?.name ?? id;
  const taskName = (id: string) => catalog?.predictionTasks.find((task) => task.id === id)?.name ?? id;

  return (
    <aside className="viz-panel" aria-label={t('visualize.assistant.title', 'JT-Code AI')} data-testid="assistant-panel">
      <header className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="flex items-center gap-3">
          <span className="viz-icon" style={{ background: 'linear-gradient(120deg,#6366f1,#db2777)', color: '#fff' }}>
            <Sparkles size={18} aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold">{t('visualize.assistant.title', 'JT-Code AI')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('visualize.assistant.cost', 'Uses credits only when you send a prompt. Charts, insights and suggestions are free.')}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label={t('common.close', 'Close')} className="rounded-md p-1 hover:bg-accent">
          <X size={18} />
        </button>
      </header>

      <div className="border-b border-border p-4">
        <DatasetPicker label={t('visualize.assistant.about', 'Ask about')} />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!turns.length && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('visualize.assistant.intro', 'Describe what you want to see. I pick the chart, fill in the columns and you review it before anything runs.')}
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((quick) => (
                <button key={quick} type="button" className="viz-chip" onClick={() => send(quick)}>
                  {quick}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn) => (
          <div key={turn.id} className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
              {turn.prompt}
            </p>
            {!turn.answer && !turn.error && <p className="text-sm text-muted-foreground">{t('visualize.assistant.thinking', 'Thinking…')}</p>}
            <ErrorNote error={turn.error} />
            {turn.answer && (
              <div className="viz-card viz-card-pad space-y-3" data-testid="assistant-answer" style={{ boxShadow: 'none' }}>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Bot size={14} aria-hidden />
                  <span className="viz-badge" style={{ '--c': turn.answer.source === 'ai' ? '#8b5cf6' : '#0ea5e9' } as React.CSSProperties}>
                    {turn.answer.source === 'ai' ? 'AI' : t('visualize.assistant.builtIn', 'Built-in')}
                  </span>
                  <span>
                    {Number(turn.answer.usage.credits) > 0
                      ? t('visualize.assistant.credits', '{{credits}} credits', { credits: Number(turn.answer.usage.credits).toFixed(2) })
                      : t('visualize.assistant.free', 'no credits used')}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{turn.answer.reply}</p>
                {turn.answer.notes.map((note) => (
                  <p key={note} className="text-xs text-muted-foreground">
                    {note}
                  </p>
                ))}
                {turn.answer.action?.kind === 'chart' && (() => {
                  const action = turn.answer.action;
                  return (
                    <div className="rounded-xl border border-border p-3">
                      <p className="text-sm font-medium">{chartName(action.chartType)}</p>
                      <p className="mb-2 text-xs text-muted-foreground">{fieldSummary(action.fields)}</p>
                      <Button
                        size="sm"
                        className="viz-primary gap-1.5"
                        onClick={() => openStudio({ chartType: action.chartType, fields: action.fields, options: action.options, title: action.title })}
                        data-testid="assistant-open-studio"
                      >
                        <Wand2 size={14} aria-hidden /> {t('visualize.assistant.openStudio', 'Open in Studio')}
                      </Button>
                    </div>
                  );
                })()}
                {turn.answer.action?.kind === 'predict' && (() => {
                  const action = turn.answer.action;
                  return (
                    <div className="rounded-xl border border-border p-3">
                      <p className="text-sm font-medium">{taskName(action.task)}</p>
                      <p className="mb-2 text-xs text-muted-foreground">{fieldSummary(action.fields)}</p>
                      <Button
                        size="sm"
                        className="viz-primary gap-1.5"
                        onClick={() => openPredict({ task: action.task, fields: action.fields, model: action.model, options: action.options })}
                      >
                        <BrainCircuit size={14} aria-hidden /> {t('visualize.assistant.setUp', 'Set up prediction')}
                      </Button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>

      <form
        className="border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          send(prompt);
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            className="viz-field min-h-[44px] flex-1 resize-none"
            rows={2}
            value={prompt}
            maxLength={2000}
            placeholder={t('visualize.assistant.placeholder', 'e.g. Show monthly revenue by region')}
            aria-label={t('visualize.assistant.prompt', 'Prompt')}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send(prompt);
              }
            }}
            data-testid="assistant-prompt"
          />
          <Button type="submit" className="viz-primary h-11 w-11 p-0" disabled={!prompt.trim() || ask.isPending} aria-label={t('visualize.assistant.send', 'Send')}>
            <Send size={16} aria-hidden />
          </Button>
        </div>
      </form>
    </aside>
  );
}
