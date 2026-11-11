import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Lightbulb, MessageCircleQuestion, Pin, Plus, Send, Sparkles, Wand2, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/http';
import { useRepository, type VisualizeRepository, type AIPageProposal, type ChangeExplanation, type DashboardFilter, type DashboardPage, type DashboardSpec, type DashboardTheme, type DashboardVisual } from '@/lib/data';
import { VISUAL_BY_TYPE } from './editor/catalog';
import { PinDialog } from './PinDialog';
import { Tile } from './runtime';
import { themeStyle } from './theme';

/** Where an answer came from, and what it cost (AI answers are metered; the rules are free). */
export function SourceNote({ source, credits }: { source: 'ai' | 'rules'; credits: string }) {
  return (
    <p className="text-[11px] text-muted-foreground" data-testid="ai-source">
      {source === 'ai' ? `Made by the AI model · ${Number(credits) ? `${credits} credits` : 'no credits'}` : 'Made by the built-in rules (the AI model was not used · no credits)'}
    </p>
  );
}

function refText(visual: DashboardVisual): string {
  const wells = visual.data.wells;
  const names = [...(wells.values ?? []), ...(wells.category ?? []), ...(wells.rows ?? [])].map((ref) => (ref.field === '*' ? 'rows' : ref.field.replace(/_/g, ' ')));
  return [...new Set(names)].slice(0, 3).join(' · ');
}

/** A page's layout in miniature: one box per visual (type and fields), as it will be placed. */
export function PagePreview({ page, height = 220 }: { page: DashboardPage; height?: number }) {
  const rows = Math.max(30, ...page.visuals.map((visual) => visual.layout.y + visual.layout.h));
  return (
    <div className="dash-page-preview" style={{ height }} data-testid="page-preview" aria-label={`Preview of ${page.name}: ${page.visuals.length} visuals`}>
      {page.visuals.map((visual) => {
        const spec = VISUAL_BY_TYPE[visual.type];
        const Icon = spec?.icon ?? Sparkles;
        return (
          <div
            key={visual.id}
            className={`dash-preview-box ${visual.type}`}
            style={{ left: `calc(${(visual.layout.x / 24) * 100}% + 2px)`, top: `calc(${(visual.layout.y / rows) * 100}% + 2px)`, width: `calc(${(visual.layout.w / 24) * 100}% - 4px)`, height: `calc(${(visual.layout.h / rows) * 100}% - 4px)` }}
            title={`${spec?.label ?? visual.type}: ${refText(visual)}`}
          >
            <Icon size={12} aria-hidden />
            <span>{refText(visual) || spec?.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** “Create a page from a prompt”: the proposal is previewed, then applied or discarded. */
export function AIPageComposer({ datasetId, dashboardId, applyLabel, onApply, onCancel }: { datasetId: string; dashboardId?: string; applyLabel: string; onApply: (proposal: AIPageProposal) => void | Promise<void>; onCancel?: () => void }) {
  const visualize = useRepository('visualize');
  const [prompt, setPrompt] = useState('');
  const propose = useMutation({ mutationFn: () => visualize.aiPage({ datasetId, prompt: prompt.trim(), dashboardId }) });
  const [applying, setApplying] = useState(false);
  const proposal = propose.data;
  return (
    <div className="space-y-2" data-testid="ai-page">
      <label className="block text-xs font-medium" htmlFor="ai-page-prompt">
        Describe the page
      </label>
      <textarea
        id="ai-page-prompt"
        className="viz-field min-h-[64px] w-full"
        placeholder="e.g. Sales performance by region and product, with the monthly trend and top 10 customers"
        value={prompt}
        maxLength={1000}
        onChange={(event) => setPrompt(event.target.value)}
        data-testid="ai-page-prompt"
      />
      <div className="flex items-center gap-2">
        <button type="button" className="viz-chip primary" disabled={!prompt.trim() || !datasetId || propose.isPending} onClick={() => propose.mutate()} data-testid="ai-page-preview">
          <Sparkles size={12} aria-hidden /> {propose.isPending ? 'Designing…' : proposal ? 'Try again' : 'Preview page'}
        </button>
        <span className="text-[11px] text-muted-foreground">Uses one AI message (credits). Nothing changes until you apply it.</span>
      </div>
      {propose.error && <p className="text-xs text-destructive">{apiErrorMessage(propose.error)}</p>}
      {proposal && (
        <div className="space-y-2 rounded-xl border border-border p-2" data-testid="ai-page-proposal">
          <p className="text-sm">
            <b>{proposal.page.name}</b> — adds a page with {proposal.page.visuals.length} visuals
            {proposal.calculations.length ? ` and ${proposal.calculations.length} calculation${proposal.calculations.length === 1 ? '' : 's'}` : ''}.
          </p>
          <PagePreview page={proposal.page} />
          <SourceNote source={proposal.source} credits={proposal.usage.credits} />
          <div className="flex justify-end gap-2">
            <button type="button" className="viz-chip" onClick={() => (propose.reset(), onCancel?.())} data-testid="ai-discard">
              <X size={12} aria-hidden /> Discard
            </button>
            <button
              type="button"
              className="viz-chip primary"
              disabled={applying}
              onClick={() => {
                setApplying(true);
                void Promise.resolve(onApply(proposal)).finally(() => setApplying(false));
              }}
              data-testid="ai-apply"
            >
              <Check size={12} aria-hidden /> {applying ? 'Applying…' : applyLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Suggested visuals for the page (free, rule-based): click to add one. */
export function SuggestPanel({ datasetId, visuals, onAdd }: { datasetId: string; visuals: DashboardVisual[]; onAdd: (visual: DashboardVisual) => void }) {
  const visualize = useRepository('visualize');
  const suggestions = useQuery({ queryKey: ['visualize', 'ai-suggest', datasetId, visuals.length], queryFn: () => visualize.aiSuggest({ datasetId, visuals }), enabled: !!datasetId, staleTime: 60_000 });
  return (
    <div className="space-y-2" data-testid="ai-suggest">
      <p className="text-[11px] text-muted-foreground">Visuals that suit this dataset (free — no AI credits).</p>
      {suggestions.isLoading && <p className="text-xs text-muted-foreground">Looking at the data…</p>}
      {suggestions.error && <p className="text-xs text-destructive">{apiErrorMessage(suggestions.error)}</p>}
      <ul className="space-y-1">
        {suggestions.data?.map((item) => (
          <li key={item.name}>
            <button type="button" className="dash-suggestion" onClick={() => onAdd(item.visual)} data-testid="ai-suggestion">
              <Lightbulb size={13} aria-hidden />
              <span>
                <b>{item.name}</b>
                <small>{item.reason}</small>
              </span>
              <Plus size={13} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function themeName(theme: DashboardSpec['theme']): string {
  return typeof theme === 'string' ? theme : theme.name;
}

/** “Auto-format”: a request such as “executive dark, compact and aligned”, previewed as a list of
 *  changes before it is applied. */
export function AutoFormatDialog({ spec, onApply, onClose }: { spec: DashboardSpec; onApply: (spec: DashboardSpec) => void; onClose: () => void }) {
  const visualize = useRepository('visualize');
  const [prompt, setPrompt] = useState('Executive, compact and aligned');
  const format = useMutation({ mutationFn: () => visualize.aiFormat({ prompt: prompt.trim(), spec }) });
  const result = format.data;
  const changes: [string, string, string][] = result
    ? [
        ...(result.changes.theme ? [['Theme', themeName(spec.theme), result.changes.theme] as [string, string, string]] : []),
        ...(result.changes.mode ? [['Mode', spec.mode, result.changes.mode] as [string, string, string]] : []),
        ...(result.changes.density ? [['Density', spec.density ?? 'comfortable', result.changes.density] as [string, string, string]] : []),
        ...(result.changes.tidy ? [['Layout', 'as is', 'snapped to the grid, short titles'] as [string, string, string]] : []),
      ]
    : [];
  return (
    <div className="dash-dialog-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dash-dialog narrow" role="dialog" aria-label="Auto-format" data-testid="auto-format">
        <header className="flex items-center gap-2">
          <Wand2 size={16} aria-hidden />
          <h2 className="flex-1 text-sm font-semibold">Auto-format</h2>
          <button type="button" className="viz-icon-button" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </header>
        <div className="dash-dialog-body">
          <label className="block text-xs font-medium" htmlFor="auto-format-prompt">
            How should it look?
          </label>
          <input id="auto-format-prompt" className="viz-field" value={prompt} maxLength={500} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && prompt.trim() && format.mutate()} data-testid="auto-format-prompt" />
          <p className="text-[11px] text-muted-foreground">Words like executive, midnight, dark, compact or aligned are free; anything else asks the AI model.</p>
          <button type="button" className="viz-chip primary self-start" disabled={!prompt.trim() || format.isPending} onClick={() => format.mutate()} data-testid="auto-format-preview">
            <Sparkles size={12} aria-hidden /> {format.isPending ? 'Working…' : 'Preview'}
          </button>
          {format.error && <p className="text-xs text-destructive">{apiErrorMessage(format.error)}</p>}
          {result && (
            <div className="space-y-2" data-testid="auto-format-changes">
              {changes.length ? (
                <table className="dash-diff">
                  <tbody>
                    {changes.map(([label, before, after]) => (
                      <tr key={label}>
                        <th>{label}</th>
                        <td className="before">{before}</td>
                        <td>→</td>
                        <td className="after">{after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-muted-foreground">Nothing to change for that request.</p>
              )}
              <SourceNote source={result.source} credits={result.usage.credits} />
              <div className="flex justify-end gap-2">
                <button type="button" className="viz-chip" onClick={onClose} data-testid="ai-discard">
                  Discard
                </button>
                <button type="button" className="viz-chip primary" disabled={!changes.length} onClick={() => (onApply(result.spec), onClose())} data-testid="ai-apply">
                  <Check size={12} aria-hidden /> Apply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The Q&A box: a question answered with one visual and a sentence computed from its data. */
export function AskBox({ datasetId, filters, theme, themeId, mode, dashboardId, onClose }: { datasetId: string; filters: DashboardFilter[]; theme: DashboardTheme | undefined; themeId: DashboardSpec['theme']; mode: 'light' | 'dark'; dashboardId?: string; onClose: () => void }) {
  const visualize = useRepository('visualize');
  const [question, setQuestion] = useState('');
  const [pinning, setPinning] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const ask = useMutation({ mutationFn: () => visualize.aiAsk({ datasetId, question: question.trim(), filters, theme: themeId, mode, dashboardId }) });
  const answer = ask.data;
  return (
    <div className="dash-ask" role="dialog" aria-label="Ask a question" data-testid="ask-box">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (question.trim()) ask.mutate();
        }}
      >
        <MessageCircleQuestion size={16} aria-hidden />
        <input ref={input} className="viz-field flex-1" placeholder="Ask about this data, e.g. top products by revenue in West" value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} aria-label="Question" data-testid="ask-input" />
        <button type="submit" className="viz-chip primary" disabled={!question.trim() || ask.isPending} data-testid="ask-submit">
          <Send size={12} aria-hidden /> {ask.isPending ? 'Thinking…' : 'Ask'}
        </button>
        <button type="button" className="viz-icon-button" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </form>
      {ask.error && <p className="text-xs text-destructive">{apiErrorMessage(ask.error)}</p>}
      {answer && (
        <div className="space-y-2" data-testid="ask-answer">
          <p className="text-sm font-medium" data-testid="ask-answer-text">
            {answer.answer}
          </p>
          <div className={`dash-canvas ${mode} dash-ask-visual`} style={themeStyle(theme, mode, 'compact')}>
            <div className="dash-grid h-full">
              <Tile visual={answer.visual} output={answer.output} theme={theme} kpiIndex={0} style={{ left: 0, top: 0, width: '100%', height: '100%' }} onSelect={() => undefined} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SourceNote source={answer.source} credits={answer.usage.credits} />
            <button type="button" className="viz-chip ml-auto" onClick={() => setPinning(true)} data-testid="ask-pin">
              <Pin size={12} aria-hidden /> Pin to dashboard
            </button>
          </div>
        </div>
      )}
      {pinning && answer && (
        <PinDialog
          visual={{ ...answer.visual, data: { ...answer.visual.data, filters: [...(answer.visual.data.filters ?? []), ...answer.filters] }, layout: { w: 8, h: 10 } }}
          title={question.trim().slice(0, 60)}
          onClose={() => setPinning(false)}
        />
      )}
    </div>
  );
}

export type ExplainRequest = Parameters<VisualizeRepository['explainChange']>[0];

/** “Explain this change”: the members that moved a measure most in a period. */
export function ExplainCard({ request, x, y, onClose }: { request: ExplainRequest; x: number; y: number; onClose: () => void }) {
  const visualize = useRepository('visualize');
  const explain = useQuery({ queryKey: ['visualize', 'explain', request], queryFn: () => visualize.explainChange(request), retry: false });
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => !box.current?.contains(event.target as Node) && onClose();
    const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 340);
  const top = Math.min(y, window.innerHeight - 220);
  const body: ChangeExplanation | undefined = explain.data;
  return (
    <div ref={box} className="dash-popover dash-explain" style={{ left, top }} role="dialog" aria-label="Explain this change" data-testid="explain-card">
      <p className="dash-menu-title">Explain this change</p>
      {explain.isLoading && <p className="text-xs text-muted-foreground">Comparing with the period before…</p>}
      {explain.error && <p className="text-xs text-destructive">{apiErrorMessage(explain.error)}</p>}
      {body && (
        <>
          <p className="text-sm font-medium" data-testid="explain-headline">
            {body.headline}
          </p>
          {body.lines.length ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
              {body.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No single member stands out.</p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">
            {body.period[0]?.slice(0, 10)} – {body.period[1]?.slice(0, 10)} vs {body.previousPeriod[0]?.slice(0, 10)} – {body.previousPeriod[1]?.slice(0, 10)} · computed from the data, no AI
          </p>
        </>
      )}
    </div>
  );
}
