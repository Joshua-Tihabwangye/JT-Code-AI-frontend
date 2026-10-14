import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Eraser, Filter, FilterX, Pencil, Sparkles, Undo2 } from 'lucide-react';
import { useRepository, type DashboardFilter, type DashboardPage as Page, type DashboardVisual } from '@/lib/data';
import { useTheme } from '@/lib/theme';
import { useVisualize } from '../context';
import { ErrorNote, SkeletonBlock } from '../ui';
import { describeFilter, FiltersPane } from './FiltersPane';
import { hierarchyOf, kpiIndexes, mergeMembers, pageRows, PAGE_WIDTH, ROW_PX, slicerKey, Tile, useDashboardRuntime, useWidth } from './runtime';
import { slicerFilter } from './slicers';
import { resolveMode, resolveTheme, themeStyle, useBuiltInThemes } from './theme';
import { FocusOverlay, PointContextMenu, TooltipCard, VisualHeader, type PointMenu } from './viewer';
import { tileStyle } from './visuals';

interface Drillthrough {
  pageId: string;
  filters: DashboardFilter[];
  from: string;
}

/** View a dashboard: slicers, filters, click-to-filter, drill and drill-through; Python builds each visual. */
export function DashboardPage() {
  const { t } = useTranslation();
  const { dashboardId = '' } = useParams();
  const visualize = useRepository('visualize');
  const { resolvedTheme } = useTheme();
  const { datasets, setAssistantContext, setAssistantOpen } = useVisualize();
  const record = useQuery({ queryKey: ['visualize', 'dashboard', dashboardId], queryFn: () => visualize.getDashboard(dashboardId), enabled: !!dashboardId });
  const themes = useBuiltInThemes();
  const spec = record.data?.spec;
  const [pageId, setPageId] = useState('');
  const [drillthrough, setDrillthrough] = useState<Drillthrough | null>(null);
  const [personal, setPersonal] = useState<DashboardFilter[]>([]);
  const [focus, setFocus] = useState('');
  const [spotlight, setSpotlight] = useState('');
  const [tables, setTables] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<PointMenu | null>(null);
  const [hover, setHover] = useState<{ visualId: string; filters: DashboardFilter[]; x: number; y: number } | null>(null);
  const [paneOpen, setPaneOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [canvas, width] = useWidth<HTMLDivElement>();
  const viewable = (spec?.pages ?? []).filter((item) => !item.hidden && (item.type ?? 'page') === 'page');
  const page = drillthrough
    ? spec?.pages.find((item) => item.id === drillthrough.pageId)
    : (spec?.pages.find((item) => item.id === pageId) ?? viewable[0] ?? spec?.pages[0]);
  const theme = resolveTheme(spec?.theme, themes.data?.themes);
  const mode = resolveMode(spec?.mode, resolvedTheme === 'dark' ? 'dark' : 'light');
  const extraFilters = useMemo(() => [...(drillthrough?.filters ?? []), ...personal], [drillthrough, personal]);
  const runtime = useDashboardRuntime({ spec, page, mode, dashboardId, extraFilters });

  useEffect(() => {
    setAssistantContext({ page: 'dashboard', title: record.data?.name });
  }, [record.data?.name, setAssistantContext]);
  const closeMenu = useCallback(() => setMenu(null), []);

  /** Which dataset (and kind) a field belongs to on this page — for filter cards. */
  const datasetFor = useCallback(
    (field: string) => {
      const used = [...new Set((page?.visuals ?? []).map((visual) => visual.data.datasetId).filter(Boolean))];
      const profiles = used.map((id) => ({ id, profile: datasets.find((item) => item.id === id)?.profile.columnProfiles ?? [] }));
      const match = profiles.find((entry) => entry.profile.some((p) => p.name === field)) ?? profiles[0];
      return {
        datasetId: match?.id,
        kind: match?.profile.find((p) => p.name === field)?.kind ?? 'categorical',
        fields: (match?.profile ?? []).map((p) => ({ name: p.name, kind: p.kind })),
      };
    },
    [page, datasets],
  );

  if (record.isLoading) return <SkeletonBlock height={520} />;
  if (record.error || !spec || !page) return <ErrorNote error={record.error ?? new Error('Dashboard not found.')} />;

  const { visuals, outputs, rendered, selection, setSelection, onSelect } = runtime;
  const rowHeight = Math.max((width / PAGE_WIDTH) * ROW_PX, 1);
  const stacked = width > 0 && width < 640;
  const height = Math.max(...visuals.map((visual) => visual.layout.y + visual.layout.h), pageRows(page)) * rowHeight;
  const kpis = kpiIndexes(visuals);
  const canEdit = record.data?.role === 'owner' || record.data?.role === 'editor';
  const showPane = spec.settings?.showFiltersPane !== false;
  const slicerFilters = page.visuals
    .filter((visual) => visual.type === 'slicer')
    .map((visual) => slicerFilter(visual, outputs[visual.id]?.slicer, runtime.slicers[slicerKey(visual)]))
    .filter((filter): filter is DashboardFilter => !!filter);
  const activeCount = runtime.effective.dashboard.length + runtime.effective.page.length + slicerFilters.length + personal.length + (selection ? 1 : 0);
  const filtersOn = (visual: DashboardVisual) => [
    ...runtime.effective.dashboard,
    ...runtime.effective.page,
    ...slicerFilters,
    ...extraFilters,
    ...(runtime.effective.visual[visual.id] ?? []),
    ...(selection && selection.source !== visual.id ? mergeMembers(selection.members) : []),
  ];
  const tooltipPage = (visual: DashboardVisual) => {
    const id = (visual.format?.tooltip as { page?: string } | undefined)?.page;
    return id ? spec.pages.find((item) => item.id === id && item.type === 'tooltip') : undefined;
  };

  const tile = (visual: DashboardVisual, style: React.CSSProperties, inFocus = false) => {
    const hierarchy = hierarchyOf(visual);
    const state = runtime.drill[visual.id];
    const level = state?.level ?? hierarchy?.start ?? 0;
    return (
      <Tile
        key={visual.id}
        visual={visual}
        output={outputs[visual.id]}
        theme={theme}
        kpiIndex={kpis[visual.id] ?? -1}
        className={`${selection?.source === visual.id ? 'selected' : ''}${spotlight && spotlight !== visual.id && !inFocus ? ' dimmed' : ''}`}
        style={style}
        onSelect={onSelect(visual.id)}
        asTable={tables.has(visual.id)}
        onPoint={(kind, filters, event) => {
          if (kind === 'menu') {
            if (filters && event) setMenu({ x: event.clientX, y: event.clientY, visualId: visual.id, filters });
            return;
          }
          clearTimeout(hoverTimer.current);
          const tip = tooltipPage(visual);
          if (!tip || !filters || !event) return setHover(null);
          const at = { x: event.clientX, y: event.clientY };
          hoverTimer.current = setTimeout(() => setHover({ visualId: visual.id, filters, ...at }), 350);
        }}
        slicerValue={runtime.slicerValue(visual)}
        onSlicerChange={(value) => runtime.setSlicer(visual, value)}
        data-drill={hierarchy ? String(level) : undefined}
      >
        {!stacked && (
          <VisualHeader
            visual={visual}
            output={outputs[visual.id]}
            filters={filtersOn(visual)}
            asTable={tables.has(visual.id)}
            spotlight={spotlight === visual.id}
            onFocus={() => setFocus(visual.id)}
            onTable={() => setTables((current) => new Set(current.has(visual.id) ? [...current].filter((id) => id !== visual.id) : [...current, visual.id]))}
            onSpotlight={() => setSpotlight(spotlight === visual.id ? '' : visual.id)}
            drill={
              hierarchy
                ? {
                    canUp: level > 0,
                    canDown: level < hierarchy.levels.length - 1,
                    mode: !!runtime.drillMode[visual.id],
                    onUp: () => runtime.drillUp(visual),
                    onToggle: () => runtime.setDrillMode((current) => ({ ...current, [visual.id]: !current[visual.id] })),
                    onNext: () => runtime.nextLevel(visual),
                  }
                : undefined
            }
          />
        )}
      </Tile>
    );
  };

  const focused = visuals.find((visual) => visual.id === focus);
  const hovered = hover ? visuals.find((visual) => visual.id === hover.visualId) : undefined;
  const hoverPage = hovered ? tooltipPage(hovered) : undefined;

  return (
    <div className="space-y-2" data-testid="dashboard-page">
      <header className="flex flex-wrap items-center gap-2">
        {drillthrough ? (
          <button type="button" className="viz-icon-button" onClick={() => setDrillthrough(null)} data-testid="drillthrough-back" aria-label="Back">
            <Undo2 size={16} aria-hidden /> {t('visualize.dashboards.backFromDetail', 'Back')}
          </button>
        ) : (
          <Link to="/app/visualize/dashboards" className="viz-icon-button" aria-label={t('visualize.dashboards.back', 'All dashboards')}>
            <ArrowLeft size={16} aria-hidden />
          </Link>
        )}
        <h1 className="mr-2 truncate text-lg font-semibold" data-testid="dashboard-name">
          {record.data?.name}
          {drillthrough && (
            <span className="ml-2 text-sm font-normal text-muted-foreground" data-testid="drillthrough-filters">› {page.name}
              {drillthrough.filters.length > 0 && ` · ${drillthrough.filters.map(describeFilter).join(', ')}`}
            </span>
          )}
        </h1>
        {!drillthrough && viewable.length > 1 && (
          <nav className="viz-segment" aria-label={t('visualize.dashboards.pages', 'Pages')}>
            {viewable.map((item) => (
              <button key={item.id} type="button" aria-pressed={item.id === page.id} onClick={() => setPageId(item.id)} data-testid={`view-page-${item.id}`}>
                {item.name}
              </button>
            ))}
          </nav>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {activeCount > 0 && (
            <span className="dash-active-chip" data-testid="active-filters">
              {activeCount} filter{activeCount === 1 ? '' : 's'} active ·{' '}
              <button
                type="button"
                onClick={() => {
                  setSelection(null);
                  runtime.clearSlicers();
                  runtime.resetOverrides();
                  setPersonal([]);
                }}
              >
                {t('visualize.dashboards.clear', 'Clear')}
              </button>
            </span>
          )}
          {selection && (
            <button type="button" className="viz-chip" onClick={() => setSelection(null)} data-testid="clear-selection">
              <Eraser size={12} aria-hidden /> {t('visualize.dashboards.clearSelection', 'Clear selection')}
            </button>
          )}
          {runtime.pending && (
            <button type="button" className="viz-primary inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-white" onClick={runtime.applyPending} data-testid="apply-slicers">
              <Check size={12} aria-hidden /> {t('visualize.dashboards.apply', 'Apply')}
            </button>
          )}
          {Object.values(runtime.slicers).some(Boolean) && (
            <button type="button" className="viz-chip" onClick={runtime.clearSlicers} data-testid="clear-slicers">
              <FilterX size={12} aria-hidden /> {t('visualize.dashboards.clearSlicers', 'Clear all slicers')}
            </button>
          )}
          {rendered.isFetching ? <span>{t('visualize.dashboards.updating', 'Updating…')}</span> : rendered.data && <span data-testid="render-time">{(rendered.data.meta.ms / 1000).toFixed(1)} s</span>}
          {showPane && (
            <button type="button" className="viz-chip" aria-pressed={paneOpen} onClick={() => setPaneOpen(!paneOpen)} data-testid="toggle-filters">
              <Filter size={12} aria-hidden /> {t('visualize.dashboards.filters', 'Filters')}
            </button>
          )}
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
      <div className="relative">
        <div
          className={`dash-canvas ${mode}`}
          style={{ ...themeStyle(theme, mode, spec.density), ...(page.canvas?.background ? { background: page.canvas.background } : {}) }}
          data-testid="dashboard-canvas"
          data-mode={mode}
          onMouseLeave={() => {
            clearTimeout(hoverTimer.current);
            setHover(null);
          }}
        >
          <div ref={canvas} className={stacked ? 'dash-stack' : 'dash-grid'} style={stacked ? undefined : { height }}>
            {width > 0 &&
              [...visuals]
                .sort((a, b) => (stacked ? a.layout.y - b.layout.y || a.layout.x - b.layout.x : 0))
                .map((visual) => tile(visual, stacked ? { height: Math.max(visual.layout.h * 24, 72) } : tileStyle(visual, rowHeight)))}
          </div>
        </div>
        {showPane && paneOpen && (
          <aside className="dash-filters-aside" aria-label="Filters">
            <FiltersPane
              spec={spec}
              page={page}
              editable={false}
              overrides={runtime.overrides}
              onOverride={runtime.setOverride}
              onReset={runtime.resetOverrides}
              datasetFor={datasetFor}
            />
            {personal.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="viz-label">Your keep/exclude filters</p>
                {personal.map((filter, index) => (
                  <button key={index} type="button" className="viz-chip w-full justify-between" onClick={() => setPersonal(personal.filter((_, i) => i !== index))}>
                    {filter.op === 'not_in' ? 'Excluding' : 'Only'} {(filter.value as unknown[]).map(String).join(', ')} ✕
                  </button>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>
      {focused && (
        <FocusOverlay onClose={() => setFocus('')}>
          <div className={`dash-canvas ${mode} h-full`} style={themeStyle(theme, mode, spec.density)}>
            <div className="dash-grid h-full">{tile(focused, { left: 0, top: 0, width: '100%', height: '100%' }, true)}</div>
          </div>
        </FocusOverlay>
      )}
      {menu && (
        <PointContextMenu
          menu={menu}
          pages={spec.pages}
          onClose={closeMenu}
          onKeep={() => {
            setPersonal([...personal, ...menu.filters]);
            setMenu(null);
          }}
          onExclude={() => {
            setPersonal([...personal, ...menu.filters.map((filter) => ({ ...filter, op: 'not_in' }))]);
            setMenu(null);
          }}
          onDrillthrough={(target: Page) => {
            setDrillthrough({ pageId: target.id, filters: menu.filters.filter((filter) => (target.drillthroughFields ?? []).includes(filter.field)), from: page.id });
            setSelection(null);
            setMenu(null);
          }}
        />
      )}
      {hover && hoverPage && (
        <TooltipCard spec={spec} page={hoverPage} filters={[...filtersOn(hovered!), ...hover.filters]} theme={theme} mode={mode} dashboardId={dashboardId} x={hover.x} y={hover.y} />
      )}
    </div>
  );
}
