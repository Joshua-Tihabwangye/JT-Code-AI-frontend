import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Compass, MousePointerClick, Pin, Plus, Search, Sparkles } from 'lucide-react';
import { useRepository, type VizCatalog } from '@/lib/data';
import { useCatalogText } from '../catalogText';
import { useVisualize } from '../context';
import { ChartThumb } from '../thumbs';
import { categoryIcon, colorVar, ErrorNote, SkeletonBlock } from '../ui';
import { addVisual } from '../dashboards/editor/actions';
import { newId, VISUAL_BY_TYPE } from '../dashboards/editor/catalog';

type CatalogChart = VizCatalog['charts'][number];

/** First sentence, at most ~70 characters (cards keep text short). */
function short(text: string): string {
  const first = text.split(/(?<=\.)\s/)[0] ?? text;
  return first.length > 72 ? `${first.slice(0, 70).trimEnd()}…` : first;
}

function ChartCard({ chart, color, onOpen, onPin, reason, picking }: { chart: CatalogChart; color: string; onOpen: () => void; onPin?: () => void; reason?: string; picking?: { selected: boolean; onToggle: () => void } }) {
  const { t } = useTranslation();
  const text = useCatalogText();
  const description = text.chartDescription(chart);
  return (
    <article className={`viz-card viz-gallery-card${picking?.selected ? ' picked' : ''}`} style={colorVar(color)}>
      <button type="button" className="viz-gallery-open" onClick={picking ? picking.onToggle : onOpen} aria-pressed={picking ? picking.selected : undefined} data-testid={`gallery-chart-${chart.id}`} title={description}>
        {picking && (
          <span className="viz-gallery-check" aria-hidden>
            {picking.selected && <Check size={14} />}
          </span>
        )}
        <span className="viz-gallery-thumb">
          <ChartThumb id={chart.id} category={chart.category} color={color} />
        </span>
        <span className="flex w-full items-center justify-between gap-1">
          <span className="truncate font-semibold">{text.chartName(chart)}</span>
          {chart.level === 'advanced' && <span className="viz-badge" style={colorVar('#8b5cf6')}>{t('visualize.gallery.advancedBadge')}</span>}
        </span>
        <span className="text-xs text-muted-foreground">{reason ?? short(description)}</span>
        <span className="flex flex-wrap gap-1">
          {chart.slots
            .filter((slot) => slot.required)
            .map((slot) => (
              <span key={slot.key} className="viz-field-chip">
                {text.slotLabel(slot, { kind: 'chart', id: chart.id })}
              </span>
            ))}
        </span>
      </button>
      {!picking && (
      <span className="viz-gallery-actions">
        <button type="button" className="viz-chip" onClick={onOpen}>
          <Compass size={12} aria-hidden /> {t('visualize.gallery.useInExplore')}
        </button>
        {onPin && (
          <button type="button" className="viz-chip" onClick={onPin} data-testid={`gallery-pin-${chart.id}`}>
            <Pin size={12} aria-hidden /> {t('visualize.gallery.addToDashboard')}
          </button>
        )}
      </span>
      )}
    </article>
  );
}

/** Every chart type, grouped by the business question it answers. */
export function GalleryPage() {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const { catalog, openStudio, setAssistantContext, datasetId, dataset } = useVisualize();
  const text = useCatalogText();
  const recommended = useQuery({ queryKey: ['visualize', 'recommend', datasetId], queryFn: () => visualize.recommend(datasetId), enabled: !!datasetId, staleTime: 300_000 });
  const [params, setParams] = useSearchParams();
  // Picking mode: opened from "Build it yourself" to choose charts for a dashboard being made.
  const pickFor = params.get('pickFor') ?? '';
  const pickPage = params.get('page') ?? '';
  const [picked, setPicked] = useState<string[]>([]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const target = useQuery({ queryKey: ['visualize', 'dashboard', pickFor], queryFn: () => visualize.getDashboard(pickFor), enabled: !!pickFor });
  const togglePick = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const addPicked = useMutation({
    mutationFn: async () => {
      const record = await visualize.getDashboard(pickFor);
      if (!record.spec) throw new Error(t('visualize.gallery.pick.noSpec'));
      let spec = record.spec;
      const pageId = spec.pages.some((page) => page.id === pickPage) ? pickPage : spec.pages[0]!.id;
      for (const chartType of picked) {
        // Added empty: the user chooses the columns, axes and formatting in the editor.
        spec = addVisual(spec, pageId, { id: newId('chart'), type: 'chart', data: { datasetId, wells: {} }, format: { chart: { chartType, fields: {}, options: {} } } }, VISUAL_BY_TYPE.chart?.size ?? { w: 8, h: 8 }).spec;
      }
      await visualize.updateDashboard(pickFor, { spec, version: record.version });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['visualize', 'dashboard', pickFor] });
      void navigate(`/app/visualize/dashboards/${pickFor}/edit`);
    },
  });
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<'all' | 'essential' | 'advanced'>('all');
  const category = params.get('category') ?? 'all';

  useEffect(() => {
    setAssistantContext({ page: 'gallery' });
  }, [setAssistantContext]);

  const charts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (catalog?.charts ?? []).filter(
      (chart) =>
        (category === 'all' || chart.category === category) &&
        (level === 'all' || chart.level === level) &&
        (!needle || [chart.name, chart.description, text.chartName(chart), text.chartDescription(chart), ...chart.tags].join(' ').toLowerCase().includes(needle)),
    );
  }, [catalog, category, level, query, text]);

  if (!catalog) return <SkeletonBlock height={420} />;
  const byCategory = catalog.categories
    .map((entry) => ({ category: entry, charts: charts.filter((chart) => chart.category === entry.id) }))
    .filter((group) => group.charts.length);

  return (
    <div className={`space-y-5${pickFor ? ' viz-picking' : ''}`} data-testid="visualize-gallery">
      {pickFor && (
        <div className="viz-pick-banner" data-testid="gallery-pick-banner">
          <MousePointerClick size={18} aria-hidden />
          <p className="min-w-0 flex-1 text-sm">{t('visualize.gallery.pick.banner', { name: target.data?.name ?? '' })}</p>
          <Link className="viz-chip" to={`/app/visualize/dashboards/${pickFor}/edit`}>
            <ArrowLeft size={13} aria-hidden /> {t('visualize.gallery.pick.back')}
          </Link>
        </div>
      )}
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold">{t('visualize.gallery.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('visualize.gallery.subtitle', {
            count: catalog.charts.length,
          })}
        </p>
      </header>
      <div className="viz-toolbar" data-testid="gallery-toolbar">
        <label className="viz-search">
          <Search size={15} aria-hidden />
          <input
            className="viz-field"
            placeholder={t('visualize.gallery.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t('visualize.gallery.searchLabel')}
            data-testid="gallery-search"
          />
        </label>
        <div className="viz-segment" role="radiogroup" aria-label={t('visualize.gallery.level')} data-testid="gallery-level">
          {(
            [
              ['all', t('visualize.gallery.allLevels')],
              ['essential', t('visualize.gallery.essentialShort')],
              ['advanced', t('visualize.gallery.advancedShort')],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={level === value} aria-pressed={level === value} onClick={() => setLevel(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="viz-toolbar-scroll" data-testid="gallery-categories">
          <button type="button" className="viz-chip" aria-pressed={category === 'all'} onClick={() => setParams({})}>
            {t('visualize.gallery.all')} · {catalog.charts.length}
          </button>
          {catalog.categories.map((entry) => {
            const Icon = categoryIcon(entry);
            const count = catalog.charts.filter((chart) => chart.category === entry.id).length;
            return (
              <button
                key={entry.id}
                type="button"
                className="viz-chip"
                style={colorVar(entry.color)}
                aria-pressed={category === entry.id}
                onClick={() => setParams({ category: entry.id })}
              >
                <Icon size={13} aria-hidden /> {text.categoryName(entry)} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {datasetId && (recommended.data?.recommendations.length ?? 0) > 0 && !query && category === 'all' && (
        <section data-testid="gallery-recommended">
          <div className="mb-3 flex items-center gap-2">
            <span className="viz-icon h-8 w-8">
              <Sparkles size={16} aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold">{t('visualize.gallery.recommended', { name: dataset?.name ?? t('visualize.gallery.thisDataset') })}</h2>
              <p className="text-xs text-muted-foreground">{t('visualize.gallery.recommendedHint')}</p>
            </div>
          </div>
          <div className="viz-gallery-grid">
            {recommended.data!.recommendations.slice(0, 6).map((item) => {
              const chart = catalog.charts.find((entry) => entry.id === item.chartType);
              if (!chart) return null;
              return (
                <ChartCard
                  key={`rec-${item.chartType}-${item.name}`}
                  chart={chart}
                  color={catalog.categories.find((entry) => entry.id === chart.category)?.color ?? '#6366f1'}
                  reason={item.reason}
                  onOpen={() => openStudio({ chartType: chart.id, fields: item.fields, options: item.options, title: text.chartName({ id: item.chartType, name: item.name }) })}
                  picking={pickFor ? { selected: picked.includes(chart.id), onToggle: () => togglePick(chart.id) } : undefined}
                />
              );
            })}
          </div>
        </section>
      )}
      {!byCategory.length && <p className="text-sm text-muted-foreground">{t('visualize.gallery.empty')}</p>}
      {byCategory.map(({ category: entry, charts: group }) => {
        const Icon = categoryIcon(entry);
        return (
          <section key={entry.id} style={colorVar(entry.color)}>
            <div className="mb-3 flex items-center gap-2">
              <span className="viz-icon h-8 w-8">
                <Icon size={16} aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold">{text.categoryName(entry)}</h2>
                <p className="text-xs text-muted-foreground">{text.categoryDescription(entry)}</p>
              </div>
            </div>
            <div className="viz-gallery-grid">
              {group.map((chart) => (
                <ChartCard key={chart.id} chart={chart} color={entry.color} onOpen={() => openStudio({ chartType: chart.id })} picking={pickFor ? { selected: picked.includes(chart.id), onToggle: () => togglePick(chart.id) } : undefined} />
              ))}
            </div>
          </section>
        );
      })}
      {pickFor && (
        <div className="viz-pick-bar" data-testid="gallery-pick-bar">
          <span className="text-sm font-semibold">{t('visualize.gallery.pick.selected', { count: picked.length })}</span>
          <ErrorNote error={addPicked.error} />
          <span className="flex-1" />
          <button type="button" className="viz-chip" disabled={!picked.length} onClick={() => setPicked([])}>
            {t('visualize.gallery.pick.clear')}
          </button>
          <button type="button" className="viz-primary inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-white" disabled={!picked.length || addPicked.isPending} onClick={() => addPicked.mutate()} data-testid="gallery-pick-add">
            <Plus size={15} aria-hidden /> {t('visualize.gallery.pick.add', { count: picked.length })}
          </button>
        </div>
      )}
    </div>
  );
}
