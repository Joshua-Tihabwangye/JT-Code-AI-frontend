import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { useVisualize } from '../context';
import { categoryIcon, colorVar, SkeletonBlock } from '../ui';

/** Every chart type, grouped by the business question it answers. */
export function GalleryPage() {
  const { t } = useTranslation();
  const { catalog, openStudio, setAssistantContext } = useVisualize();
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
        (!needle || [chart.name, chart.description, ...chart.tags].join(' ').toLowerCase().includes(needle)),
    );
  }, [catalog, category, level, query]);

  if (!catalog) return <SkeletonBlock height={420} />;
  const byCategory = catalog.categories
    .map((entry) => ({ category: entry, charts: charts.filter((chart) => chart.category === entry.id) }))
    .filter((group) => group.charts.length);

  return (
    <div className="space-y-5" data-testid="visualize-gallery">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold">{t('visualize.gallery.title', 'Chart gallery')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('visualize.gallery.subtitle', '{{count}} chart types for small businesses and large enterprises: pick one and the Studio fills in your columns.', {
            count: catalog.charts.length,
          })}
        </p>
      </header>
      <div className="viz-toolbar" data-testid="gallery-toolbar">
        <label className="viz-search">
          <Search size={15} aria-hidden />
          <input
            className="viz-field"
            placeholder={t('visualize.gallery.search', 'Search charts, e.g. “forecast”, “share”')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t('visualize.gallery.searchLabel', 'Search charts')}
            data-testid="gallery-search"
          />
        </label>
        <div className="viz-segment" role="radiogroup" aria-label={t('visualize.gallery.level', 'Level')} data-testid="gallery-level">
          {(
            [
              ['all', t('visualize.gallery.allLevels', 'All levels')],
              ['essential', t('visualize.gallery.essentialShort', 'Essential')],
              ['advanced', t('visualize.gallery.advancedShort', 'Advanced')],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={level === value} aria-pressed={level === value} onClick={() => setLevel(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="viz-toolbar-scroll" data-testid="gallery-categories">
          <button type="button" className="viz-chip" aria-pressed={category === 'all'} onClick={() => setParams({})}>
            {t('visualize.gallery.all', 'All')} · {catalog.charts.length}
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
                <Icon size={13} aria-hidden /> {entry.name} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!byCategory.length && <p className="text-sm text-muted-foreground">{t('visualize.gallery.empty', 'No chart matches that search.')}</p>}
      {byCategory.map(({ category: entry, charts: group }) => {
        const Icon = categoryIcon(entry);
        return (
          <section key={entry.id} style={colorVar(entry.color)}>
            <div className="mb-3 flex items-center gap-2">
              <span className="viz-icon h-8 w-8">
                <Icon size={16} aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold">{entry.name}</h2>
                <p className="text-xs text-muted-foreground">{entry.description}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {group.map((chart) => (
                <button
                  key={chart.id}
                  type="button"
                  className="viz-card viz-card-pad viz-lift flex flex-col items-start gap-2 text-left"
                  onClick={() => openStudio({ chartType: chart.id })}
                  data-testid={`gallery-chart-${chart.id}`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="viz-icon h-9 w-9">
                      <Icon size={17} aria-hidden />
                    </span>
                    {chart.level === 'advanced' && <span className="viz-badge" style={colorVar('#8b5cf6')}>Advanced</span>}
                  </div>
                  <p className="font-semibold">{chart.name}</p>
                  <p className="text-xs text-muted-foreground">{chart.description}</p>
                  <p className="mt-auto text-[11px] text-muted-foreground">
                    {chart.slots
                      .filter((slot) => slot.required)
                      .map((slot) => slot.label)
                      .join(' · ')}
                  </p>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
