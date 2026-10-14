import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Eraser, FilterX, Pencil, Sparkles } from 'lucide-react';
import { useRepository } from '@/lib/data';
import { useTheme } from '@/lib/theme';
import { useVisualize } from '../context';
import { ErrorNote, SkeletonBlock } from '../ui';
import { kpiIndexes, pageRows, PAGE_WIDTH, ROW_PX, Tile, useDashboardRuntime, useWidth } from './runtime';
import { resolveMode, resolveTheme, themeStyle, useBuiltInThemes } from './theme';
import { tileStyle } from './visuals';

/** View a dashboard: slicers and click-to-filter redraw every visual; Python builds each one. */
export function DashboardPage() {
  const { t } = useTranslation();
  const { dashboardId = '' } = useParams();
  const visualize = useRepository('visualize');
  const { resolvedTheme } = useTheme();
  const { setAssistantContext, setAssistantOpen } = useVisualize();
  const record = useQuery({ queryKey: ['visualize', 'dashboard', dashboardId], queryFn: () => visualize.getDashboard(dashboardId), enabled: !!dashboardId });
  const themes = useBuiltInThemes();
  const spec = record.data?.spec;
  const [pageId, setPageId] = useState('');
  const [canvas, width] = useWidth<HTMLDivElement>();
  const page = spec?.pages.find((item) => item.id === pageId) ?? spec?.pages.find((item) => !item.hidden) ?? spec?.pages[0];
  const theme = resolveTheme(spec?.theme, themes.data?.themes);
  const mode = resolveMode(spec?.mode, resolvedTheme === 'dark' ? 'dark' : 'light');
  const runtime = useDashboardRuntime({ spec, page, mode, dashboardId });

  useEffect(() => {
    setAssistantContext({ page: 'dashboard', title: record.data?.name });
  }, [record.data?.name, setAssistantContext]);

  if (record.isLoading) return <SkeletonBlock height={520} />;
  if (record.error || !spec || !page) return <ErrorNote error={record.error ?? new Error('Dashboard not found.')} />;

  const { visuals, outputs, rendered, slicers, setSlicers, selection, setSelection, onSelect } = runtime;
  const rowHeight = Math.max((width / PAGE_WIDTH) * ROW_PX, 1);
  const stacked = width > 0 && width < 640;
  const height = Math.max(...visuals.map((visual) => visual.layout.y + visual.layout.h), pageRows(page)) * rowHeight;
  const anySlicer = Object.values(slicers).some(Boolean);
  const kpis = kpiIndexes(visuals);
  const canEdit = record.data?.role === 'owner' || record.data?.role === 'editor';

  return (
    <div className="space-y-2" data-testid="dashboard-page">
      <header className="flex flex-wrap items-center gap-2">
        <Link to="/app/visualize/dashboards" className="viz-icon-button" aria-label={t('visualize.dashboards.back', 'All dashboards')}>
          <ArrowLeft size={16} aria-hidden />
        </Link>
        <h1 className="mr-2 truncate text-lg font-semibold" data-testid="dashboard-name">
          {record.data?.name}
        </h1>
        {spec.pages.filter((item) => !item.hidden).length > 1 && (
          <nav className="viz-segment" aria-label={t('visualize.dashboards.pages', 'Pages')}>
            {spec.pages
              .filter((item) => !item.hidden)
              .map((item) => (
                <button key={item.id} type="button" aria-pressed={item.id === page.id} onClick={() => setPageId(item.id)}>
                  {item.name}
                </button>
              ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {selection && (
            <button type="button" className="viz-chip" onClick={() => setSelection(null)} data-testid="clear-selection">
              <Eraser size={12} aria-hidden /> {t('visualize.dashboards.clearSelection', 'Clear selection')}
            </button>
          )}
          {anySlicer && (
            <button type="button" className="viz-chip" onClick={() => setSlicers({})} data-testid="clear-slicers">
              <FilterX size={12} aria-hidden /> {t('visualize.dashboards.clearSlicers', 'Clear all slicers')}
            </button>
          )}
          {rendered.isFetching ? <span>{t('visualize.dashboards.updating', 'Updating…')}</span> : rendered.data && <span data-testid="render-time">{(rendered.data.meta.ms / 1000).toFixed(1)} s</span>}
          <button type="button" className="viz-chip" onClick={() => setAssistantOpen(true)} data-testid="open-assistant">
            <Sparkles size={12} aria-hidden /> {t('visualize.askAi', 'Ask AI')}
          </button>
          {canEdit && (
            <Link to={`/app/visualize/dashboards/${dashboardId}/edit`} className="viz-primary inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white" data-testid="edit-dashboard">
              <Pencil size={13} aria-hidden /> {t('visualize.dashboards.edit', 'Edit')}
            </Link>
          )}
        </div>
      </header>
      <ErrorNote error={rendered.error} />
      <div className={`dash-canvas ${mode}`} style={{ ...themeStyle(theme, mode, spec.density), ...(page.canvas?.background ? { background: page.canvas.background } : {}) }} data-testid="dashboard-canvas" data-mode={mode}>
        <div ref={canvas} className={stacked ? 'dash-stack' : 'dash-grid'} style={stacked ? undefined : { height }}>
          {width > 0 &&
            [...visuals]
              .sort((a, b) => (stacked ? a.layout.y - b.layout.y || a.layout.x - b.layout.x : 0))
              .map((visual) => (
                <Tile
                  key={visual.id}
                  visual={visual}
                  output={outputs[visual.id]}
                  theme={theme}
                  kpiIndex={kpis[visual.id] ?? -1}
                  className={selection?.source === visual.id ? 'selected' : ''}
                  style={stacked ? { height: Math.max(visual.layout.h * 24, 72) } : tileStyle(visual, rowHeight)}
                  onSelect={onSelect(visual.id)}
                  slicerValue={slicers[visual.id]}
                  onSlicerChange={(value) => setSlicers((current) => ({ ...current, [visual.id]: value }))}
                />
              ))}
        </div>
      </div>
    </div>
  );
}
