import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Check, Columns3, LayoutDashboard, MousePointerClick, Plus, Shapes, SlidersHorizontal } from 'lucide-react';
import { useRepository, type DashboardVisualType } from '@/lib/data';
import { Spinner } from '@/shared/components';
import { useCatalogText } from '../../catalogText';
import { useVisualize } from '../../context';
import { ChartThumb } from '../../thumbs';

/** One chart the user can tick: a dashboard visual, or a gallery chart (``chartType``). */
export interface StarterChoice {
  key: string;
  type: DashboardVisualType;
  chartType?: string;
}

const STEPS = [
  { key: 'step1', icon: MousePointerClick },
  { key: 'step2', icon: Columns3 },
  { key: 'step3', icon: SlidersHorizontal },
] as const;

/**
 * The start of a dashboard built by hand. Python reads the dataset and suggests the charts that suit
 * it; the user ticks any number of them and adds them at once. They arrive empty: the user chooses
 * the columns (X, Y, legend…), scales and formatting of each.
 */
export function EmptyPageGuide({ datasetId, onAdd, onGallery }: { datasetId: string; onAdd: (choices: StarterChoice[]) => void; onGallery: () => void }) {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const text = useCatalogText();
  const { datasets } = useVisualize();
  const dataset = datasets.find((item) => item.id === datasetId);
  const profiles = useMemo(() => dataset?.profile.columnProfiles ?? [], [dataset]);
  const insights = useQuery({ queryKey: ['visualize', 'insights', datasetId], queryFn: () => visualize.insights(datasetId), enabled: !!datasetId, staleTime: 300_000 });
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Dashboard visuals that fit this data (from its column kinds, read by Python).
  const basics = useMemo((): (StarterChoice & { hint: string })[] => {
    const numbers = profiles.some((p) => p.kind === 'numeric');
    const dates = profiles.some((p) => p.kind === 'datetime');
    const groups = profiles.filter((p) => p.kind !== 'numeric' && p.kind !== 'datetime');
    const small = groups.some((p) => (p.distinct ?? 99) <= 8);
    const list: (StarterChoice & { hint: string })[] = [];
    if (numbers) list.push({ key: 'card', type: 'card', hint: 'card' });
    if (groups.length && numbers) list.push({ key: 'column', type: 'column', hint: 'column' });
    if (dates) list.push({ key: 'line', type: 'line', hint: 'line' });
    if (small && numbers) list.push({ key: 'donut', type: 'donut', hint: 'donut' });
    list.push({ key: 'table', type: 'table', hint: 'table' });
    if (groups.length || dates) list.push({ key: 'slicer', type: 'slicer', hint: 'slicer' });
    return list;
  }, [profiles]);
  const recommended = (insights.data?.recommendations ?? []).slice(0, 6);

  const toggle = (key: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const choices: StarterChoice[] = [
    ...basics.filter((item) => picked.has(item.key)),
    ...recommended.filter((item) => picked.has(`chart-${item.chartType}`)).map((item) => ({ key: `chart-${item.chartType}`, type: 'chart' as const, chartType: item.chartType })),
  ];

  const tile = (key: string, name: string, hint: string, thumb: string, color: string) => (
    <button key={key} type="button" className={`dash-start-visual${picked.has(key) ? ' picked' : ''}`} style={{ '--c': color } as React.CSSProperties} aria-pressed={picked.has(key)} onClick={() => toggle(key)} data-testid={`starter-${key}`}>
      <span className="dash-start-check" aria-hidden>
        {picked.has(key) && <Check size={13} />}
      </span>
      <span className="dash-start-thumb">
        <ChartThumb id={thumb} color={color} />
      </span>
      <span className="dash-start-name">{name}</span>
      <span className="dash-start-hint">{hint}</span>
    </button>
  );
  const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#ec4899', '#64748b', '#f59e0b', '#8b5cf6', '#14b8a6', '#ef4444'];

  return (
    <div className="dash-start" data-testid="empty-page-guide">
      <header className="dash-start-head">
        <span className="dash-start-badge">
          <LayoutDashboard size={22} aria-hidden />
        </span>
        <div>
          <h2>{t('visualize.editor.guide.title')}</h2>
          <p>{t('visualize.editor.guide.subtitle', { name: dataset?.name ?? '' })}</p>
        </div>
      </header>

      <ol className="dash-start-steps">
        {STEPS.map(({ key, icon: Icon }, index) => (
          <li key={key}>
            <span className="dash-start-step-number">{index + 1}</span>
            <Icon size={16} aria-hidden />
            <span>{t(`visualize.editor.guide.${key}`)}</span>
          </li>
        ))}
      </ol>

      <p className="dash-start-label">{t('visualize.editor.guide.basics')}</p>
      <div className="dash-start-visuals">
        {basics.map((item, index) => tile(item.key, t(`visualize.editor.guide.visuals.${item.type}`), t(`visualize.editor.guide.hints.${item.hint}`), item.type, COLORS[index % COLORS.length]!))}
      </div>

      <p className="dash-start-label">{t('visualize.editor.guide.forData', { name: dataset?.name ?? '' })}</p>
      {insights.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> {t('visualize.editor.guide.reading')}
        </p>
      ) : (
        <div className="dash-start-visuals">
          {recommended.map((item, index) => tile(`chart-${item.chartType}`, text.chartName({ id: item.chartType, name: item.name }), item.reason, item.chartType, COLORS[(index + 3) % COLORS.length]!))}
        </div>
      )}

      <footer className="dash-start-footer">
        <button type="button" className="viz-chip" onClick={onGallery} data-testid="starter-gallery">
          <Shapes size={14} aria-hidden /> {t('visualize.editor.guide.fromGallery')}
        </button>
        <span className="flex-1 text-xs text-muted-foreground">{t('visualize.editor.guide.emptyNote')}</span>
        <button type="button" className="viz-primary dash-start-add" disabled={!choices.length} onClick={() => onAdd(choices)} data-testid="starter-add">
          <Plus size={15} aria-hidden /> {choices.length ? t('visualize.editor.guide.add', { count: choices.length }) : t('visualize.editor.guide.pickSome')}
        </button>
      </footer>
    </div>
  );
}
