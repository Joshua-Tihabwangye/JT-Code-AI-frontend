import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { formatDate } from '@/i18n/format';
import { Check, Lightbulb, MessageCircleQuestion, Pin, Plus, Send, Sparkles, Wand2, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/http';
import { useRepository, type VisualizeRepository, type AIPageProposal, type ChangeExplanation, type DashboardFilter, type DashboardPage, type DashboardSpec, type DashboardTheme, type DashboardVisual } from '@/lib/data';
import { VISUAL_BY_TYPE } from './editor/catalog';
import { PinDialog } from './PinDialog';
import { Tile } from './runtime';
import { themeStyle } from './theme';

/** Where an answer came from, and what it cost (AI answers are metered; the rules are free). */
export function SourceNote({ source, credits }: { source: 'ai' | 'rules'; credits: string }) {
  const { t } = useTranslation();
  const used = Number(credits);
  return (
    <p className="text-[11px] text-muted-foreground" data-testid="ai-source">
      {source === 'ai' ? (used ? t('visualize.dashboards.ai.sourceAiCredits', { count: used, credits }) : t('visualize.dashboards.ai.sourceAiFree')) : t('visualize.dashboards.ai.sourceRules')}
    </p>
  );
}

function refText(visual: DashboardVisual, rowsWord: string): string {
  const wells = visual.data.wells;
  const names = [...(wells.values ?? []), ...(wells.category ?? []), ...(wells.rows ?? [])].map((ref) => (ref.field === '*' ? rowsWord : ref.field.replace(/_/g, ' ')));
  return [...new Set(names)].slice(0, 3).join(' · ');
}

/** A page's layout in miniature: one box per visual (type and fields), as it will be placed. */
export function PagePreview({ page, height = 220 }: { page: DashboardPage; height?: number }) {
  const { t } = useTranslation();
  const rowsWord = t('visualize.dashboards.ai.rowsWord');
  const rows = Math.max(30, ...page.visuals.map((visual) => visual.layout.y + visual.layout.h));
  return (
    <div className="dash-page-preview" style={{ height }} data-testid="page-preview" aria-label={t('visualize.dashboards.ai.previewLabel', { name: page.name, count: page.visuals.length })}>
      {page.visuals.map((visual) => {
        const spec = VISUAL_BY_TYPE[visual.type];
        const Icon = spec?.icon ?? Sparkles;
        return (
          <div
            key={visual.id}
            className={`dash-preview-box ${visual.type}`}
            style={{ left: `calc(${(visual.layout.x / 24) * 100}% + 2px)`, top: `calc(${(visual.layout.y / rows) * 100}% + 2px)`, width: `calc(${(visual.layout.w / 24) * 100}% - 4px)`, height: `calc(${(visual.layout.h / rows) * 100}% - 4px)` }}
            title={`${spec?.label ?? visual.type}: ${refText(visual, rowsWord)}`}
          >
            <Icon size={12} aria-hidden />
            <span>{refText(visual, rowsWord) || spec?.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** “Create a page from a prompt”: the proposal is previewed, then applied or discarded. */
export function AIPageComposer({ datasetId, dashboardId, applyLabel, onApply, onCancel }: { datasetId: string; dashboardId?: string; applyLabel: string; onApply: (proposal: AIPageProposal) => void | Promise<void>; onCancel?: () => void }) {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const [prompt, setPrompt] = useState('');
  const propose = useMutation({ mutationFn: () => visualize.aiPage({ datasetId, prompt: prompt.trim(), dashboardId }) });
  const [applying, setApplying] = useState(false);
  const proposal = propose.data;
  return (
    <div className="space-y-2" data-testid="ai-page">
      <label className="block text-xs font-medium" htmlFor="ai-page-prompt">
        {t('visualize.dashboards.ai.describe')}
      </label>
      <textarea
        id="ai-page-prompt"
        className="viz-field min-h-[64px] w-full"
        placeholder={t('visualize.dashboards.ai.describePlaceholder')}
        value={prompt}
        maxLength={1000}
        onChange={(event) => setPrompt(event.target.value)}
        data-testid="ai-page-prompt"
      />
      <div className="flex items-center gap-2">
        <button type="button" className="viz-chip primary" disabled={!prompt.trim() || !datasetId || propose.isPending} onClick={() => propose.mutate()} data-testid="ai-page-preview">
          <Sparkles size={12} aria-hidden /> {propose.isPending ? t('visualize.dashboards.ai.designing') : proposal ? t('visualize.dashboards.ai.tryAgain') : t('visualize.dashboards.ai.previewPage')}
        </button>
        <span className="text-[11px] text-muted-foreground">{t('visualize.dashboards.ai.costNote')}</span>
      </div>
      {propose.error && <p className="text-xs text-destructive">{apiErrorMessage(propose.error)}</p>}
      {proposal && (
        <div className="space-y-2 rounded-xl border border-border p-2" data-testid="ai-page-proposal">
          <p className="text-sm">
            <Trans
              i18nKey={proposal.calculations.length ? 'visualize.dashboards.ai.proposalWithCalcs' : 'visualize.dashboards.ai.proposal'}
              values={{ name: proposal.page.name, count: proposal.page.visuals.length, calcs: proposal.calculations.length }}
              components={{ b: <b /> }}
            />
          </p>
          <PagePreview page={proposal.page} />
          <SourceNote source={proposal.source} credits={proposal.usage.credits} />
          <div className="flex justify-end gap-2">
            <button type="button" className="viz-chip" onClick={() => (propose.reset(), onCancel?.())} data-testid="ai-discard">
              <X size={12} aria-hidden /> {t('visualize.dashboards.ai.discard')}
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
              <Check size={12} aria-hidden /> {applying ? t('visualize.dashboards.ai.applying') : applyLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Suggested visuals for the page (free, rule-based): click to add one. */
export function SuggestPanel({ datasetId, visuals, onAdd }: { datasetId: string; visuals: DashboardVisual[]; onAdd: (visual: DashboardVisual) => void }) {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const suggestions = useQuery({ queryKey: ['visualize', 'ai-suggest', datasetId, visuals.length], queryFn: () => visualize.aiSuggest({ datasetId, visuals }), enabled: !!datasetId, staleTime: 60_000 });
  return (
    <div className="space-y-2" data-testid="ai-suggest">
      <p className="text-[11px] text-muted-foreground">{t('visualize.dashboards.ai.suggestNote')}</p>
      {suggestions.isLoading && <p className="text-xs text-muted-foreground">{t('visualize.dashboards.ai.looking')}</p>}
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

const FORMAT_KEYWORDS = ['executive', 'midnight', 'dark', 'light', 'compact', 'comfortable', 'aligned'] as const;

function themeName(theme: DashboardSpec['theme']): string {
  return typeof theme === 'string' ? theme : theme.name;
}

/** “Auto-format”: a request such as “executive dark, compact and aligned”, previewed as a list of
 *  changes before it is applied. */
export function AutoFormatDialog({ spec, onApply, onClose }: { spec: DashboardSpec; onApply: (spec: DashboardSpec) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  // The server understands these English keywords for free; the chips show them in the chosen language.
  const [keywords, setKeywords] = useState<string[]>(['executive', 'compact', 'aligned']);
  const [extra, setExtra] = useState('');
  const prompt = [...keywords, extra.trim()].filter(Boolean).join(', ');
  const format = useMutation({ mutationFn: () => visualize.aiFormat({ prompt, spec }) });
  const result = format.data;
  const word = (group: 'modes' | 'densities', value: string) => t(`visualize.dashboards.ai.format.${group}.${value}`, { defaultValue: value });
  const changes: [string, string, string][] = result
    ? [
        ...(result.changes.theme ? [[t('visualize.dashboards.ai.format.theme'), themeName(spec.theme), result.changes.theme] as [string, string, string]] : []),
        ...(result.changes.mode ? [[t('visualize.dashboards.ai.format.mode'), word('modes', spec.mode), word('modes', result.changes.mode)] as [string, string, string]] : []),
        ...(result.changes.density ? [[t('visualize.dashboards.ai.format.density'), word('densities', spec.density ?? 'comfortable'), word('densities', result.changes.density)] as [string, string, string]] : []),
        ...(result.changes.tidy ? [[t('visualize.dashboards.ai.format.layout'), t('visualize.dashboards.ai.format.asIs'), t('visualize.dashboards.ai.format.tidied')] as [string, string, string]] : []),
      ]
    : [];
  return (
    <div className="dash-dialog-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dash-dialog narrow" role="dialog" aria-label={t('visualize.dashboards.ai.format.title')} data-testid="auto-format">
        <header className="flex items-center gap-2">
          <Wand2 size={16} aria-hidden />
          <h2 className="flex-1 text-sm font-semibold">{t('visualize.dashboards.ai.format.title')}</h2>
          <button type="button" className="viz-icon-button" onClick={onClose} aria-label={t('visualize.dashboards.ai.close')}>
            <X size={14} />
          </button>
        </header>
        <div className="dash-dialog-body">
          <p className="block text-xs font-medium">{t('visualize.dashboards.ai.format.question')}</p>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('visualize.dashboards.ai.format.question')}>
            {FORMAT_KEYWORDS.map((keyword) => (
              <button
                key={keyword}
                type="button"
                className="viz-chip"
                aria-pressed={keywords.includes(keyword)}
                onClick={() => setKeywords((current) => (current.includes(keyword) ? current.filter((k) => k !== keyword) : [...current, keyword]))}
                data-testid={`auto-format-${keyword}`}
              >
                {t(`visualize.dashboards.ai.format.keywords.${keyword}`)}
              </button>
            ))}
          </div>
          <input
            id="auto-format-prompt"
            className="viz-field"
            value={extra}
            maxLength={400}
            placeholder={t('visualize.dashboards.ai.format.otherPlaceholder')}
            aria-label={t('visualize.dashboards.ai.format.other')}
            onChange={(event) => setExtra(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && prompt && format.mutate()}
            data-testid="auto-format-prompt"
          />
          <p className="text-[11px] text-muted-foreground">{t('visualize.dashboards.ai.format.note')}</p>
          <button type="button" className="viz-chip primary self-start" disabled={!prompt || format.isPending} onClick={() => format.mutate()} data-testid="auto-format-preview">
            <Sparkles size={12} aria-hidden /> {format.isPending ? t('visualize.dashboards.ai.working') : t('visualize.dashboards.ai.preview')}
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
                <p className="text-xs text-muted-foreground">{t('visualize.dashboards.ai.format.nothing')}</p>
              )}
              <SourceNote source={result.source} credits={result.usage.credits} />
              <div className="flex justify-end gap-2">
                <button type="button" className="viz-chip" onClick={onClose} data-testid="ai-discard">
                  {t('visualize.dashboards.ai.discard')}
                </button>
                <button type="button" className="viz-chip primary" disabled={!changes.length} onClick={() => (onApply(result.spec), onClose())} data-testid="ai-apply">
                  <Check size={12} aria-hidden /> {t('visualize.dashboards.ai.apply')}
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
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const [question, setQuestion] = useState('');
  const [pinning, setPinning] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const ask = useMutation({ mutationFn: () => visualize.aiAsk({ datasetId, question: question.trim(), filters, theme: themeId, mode, dashboardId }) });
  const answer = ask.data;
  return (
    <div className="dash-ask" role="dialog" aria-label={t('visualize.dashboards.ai.askTitle')} data-testid="ask-box">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (question.trim()) ask.mutate();
        }}
      >
        <MessageCircleQuestion size={16} aria-hidden />
        <input ref={input} className="viz-field flex-1" placeholder={t('visualize.dashboards.ai.askPlaceholder')} value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} aria-label={t('visualize.dashboards.ai.question')} data-testid="ask-input" />
        <button type="submit" className="viz-chip primary" disabled={!question.trim() || ask.isPending} data-testid="ask-submit">
          <Send size={12} aria-hidden /> {ask.isPending ? t('visualize.dashboards.ai.thinking') : t('visualize.dashboards.ai.ask')}
        </button>
        <button type="button" className="viz-icon-button" onClick={onClose} aria-label={t('visualize.dashboards.ai.close')}>
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
              <Pin size={12} aria-hidden /> {t('visualize.dashboards.ai.pin')}
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

/** An ISO date (or date-time) as a date in the chosen language. */
const day = (value: string | undefined) => (value ? formatDate(value.slice(0, 10)) : '');

/** “Explain this change”: the members that moved a measure most in a period. */
export function ExplainCard({ request, x, y, onClose }: { request: ExplainRequest; x: number; y: number; onClose: () => void }) {
  const { t } = useTranslation();
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
    <div ref={box} className="dash-popover dash-explain" style={{ left, top }} role="dialog" aria-label={t('visualize.dashboards.ai.explain.title')} data-testid="explain-card">
      <p className="dash-menu-title">{t('visualize.dashboards.ai.explain.title')}</p>
      {explain.isLoading && <p className="text-xs text-muted-foreground">{t('visualize.dashboards.ai.explain.loading')}</p>}
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
            <p className="text-xs text-muted-foreground">{t('visualize.dashboards.ai.explain.none')}</p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">
            {t('visualize.dashboards.ai.explain.periods', {
              from: day(body.period[0]),
              to: day(body.period[1]),
              previousFrom: day(body.previousPeriod[0]),
              previousTo: day(body.previousPeriod[1]),
            })}
          </p>
        </>
      )}
    </div>
  );
}
