import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Compass, Pin, Search, Sparkles } from 'lucide-react';
import { useRepository, type VizCatalog } from '@/lib/data';
import { useCatalogText } from '../catalogText';
import { useVisualize } from '../context';
import { PinDialog, type PinnableVisual } from '../dashboards/PinDialog';
import { ChartThumb } from '../thumbs';
import { categoryIcon, colorVar, SkeletonBlock } from '../ui';

type CatalogChart = VizCatalog['charts'][number];

/** First sentence, at most ~70 characters (cards keep text short). */
function short(text: string): string {
  const first = text.split(/(?<=\.)\s/)[0] ?? text;
  return first.length > 72 ? `${first.slice(0, 70).trimEnd()}…` : first;
}

function ChartCard({ chart, color, onOpen, onPin, reason }: { chart: CatalogChart; color: string; onOpen: () => void; onPin?: () => void; reason?: string }) {
  const { t } = useTranslation();
  const text = useCatalogText();
  const description = text.chartDescription(chart);
  return (
    <article className="viz-card viz-gallery-card" style={colorVar(color)}>
      <button type="button" className="viz-gallery-open" onClick={onOpen} data-testid={`gallery-chart-${chart.id}`} title={description}>
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
    </article>
  );
}

/** Every chart type, grouped by the business question it answers. */
export function GalleryPage() {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const { catalog, openStudio, setAssistantContext, datasetId, dataset } = useVisualize();
  const text = useCatalogText();
  const [pinning, setPinning] = useState<{ visual: PinnableVisual; title: string } | null>(null);
  const recommended = useQuery({ queryKey: ['visualize', 'recommend', datasetId], queryFn: () => visualize.recommend(datasetId), enabled: !!datasetId, staleTime: 300_000 });
  const pin = async (chart: CatalogChart) => {
    // The chart's best field mapping for the active dataset, then the pin dialog.
    const result = await visualize.recommend(datasetId, chart.id);
    setPinning({ title: text.chartName(chart), visual: { type: 'chart', data: { datasetId, wells: {} }, format: { chart: { chartType: chart.id, fields: result.fields ?? {}, options: {} } } } });
  };
  const [params, setParams] = useSearchParams();
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
    <div className="space-y-5" data-testid="visualize-gallery">
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
                  onPin={() => setPinning({ title: text.chartName({ id: item.chartType, name: item.name }), visual: { type: 'chart', data: { datasetId, wells: {} }, format: { chart: { chartType: chart.id, fields: item.fields, options: item.options ?? {} } } } })}
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
                <ChartCard key={chart.id} chart={chart} color={entry.color} onOpen={() => openStudio({ chartType: chart.id })} onPin={datasetId ? () => void pin(chart) : undefined} />
              ))}
            </div>
          </section>
        );
      })}
      {pinning && <PinDialog visual={pinning.visual} title={pinning.title} onClose={() => setPinning(null)} />}
    </div>
  );
}
