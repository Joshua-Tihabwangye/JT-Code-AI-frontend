import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Eraser, Filter, FilterX, Pencil, Sparkles, Undo2 } from 'lucide-react';
import { useRepository, type DashboardBookmark, type DashboardFilter, type DashboardPage as Page, type DashboardPersonalView, type DashboardVisual } from '@/lib/data';
import { useTheme } from '@/lib/theme';
import { useVisualize } from '../context';
import { ErrorNote, SkeletonBlock } from '../ui';
import { LOCAL_TYPES, mobileVisuals, pruneOverrides } from './customize';
import { newId } from './editor/catalog';
import { describeFilter, FiltersPane } from './FiltersPane';
import { safeUrl, type ButtonAction, type LocalContext } from './local';
import { PersonalizePane, ViewsMenu } from './personalize';
import { hierarchyOf, kpiIndexes, mergeMembers, pageRows, PAGE_WIDTH, ROW_PX, slicerKey, Tile, useDashboardRuntime, useWidth } from './runtime';
import { slicerFilter } from './slicers';
import { resolveMode, resolveTheme, themeStyle, useBuiltInThemes } from './theme';
import { FocusOverlay, PointContextMenu, TooltipCard, VisualHeader, type PointMenu } from './viewer';
import { tileStyle } from './visuals';

type PersonalState = DashboardPersonalView['state'];

function mergeOverride(previous: Partial<DashboardVisual> | undefined, change: Partial<DashboardVisual>): Partial<DashboardVisual> {
  const next: Partial<DashboardVisual> = { ...(previous ?? {}), ...change };
  if (change.format) {
    const format: NonNullable<DashboardVisual['format']> = { ...(previous?.format ?? {}) };
    for (const [section, value] of Object.entries(change.format)) format[section] = { ...(format[section] ?? {}), ...(value ?? {}) };
    next.format = format;
  } else if (previous?.format) next.format = previous.format;
  return next;
}

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
  const [personalizing, setPersonalizing] = useState('');
  const [activeView, setActiveView] = useState<string | undefined>();
  const [history, setHistory] = useState<string[]>([]);
  const [undo, setUndo] = useState<NonNullable<PersonalState['visualOverrides']>[]>([]);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The viewer's own view (saved per user; the author's dashboard never changes).
  const personalView = useQuery({ queryKey: ['visualize', 'personal-view', dashboardId], queryFn: () => visualize.personalView(dashboardId), enabled: !!dashboardId, staleTime: Infinity, retry: false });
  const [mine, setMine] = useState<PersonalState | null>(null);
  const saved = useRef('');
  useEffect(() => {
    if (mine === null && (personalView.isSuccess || personalView.isError)) {
      const state = personalView.data?.state ?? {};
      saved.current = JSON.stringify(state);
      setMine(state);
    }
  }, [mine, personalView.isSuccess, personalView.isError, personalView.data]);
  const allowPersonalize = spec?.settings?.allowPersonalize !== false;
  useEffect(() => {
    if (!mine || !allowPersonalize || JSON.stringify(mine) === saved.current) return;
    const timer = setTimeout(() => {
      saved.current = JSON.stringify(mine);
      void visualize.savePersonalView(dashboardId, mine).catch(() => undefined);
    }, 800);
    return () => clearTimeout(timer);
  }, [mine, allowPersonalize, dashboardId, visualize]);
  const personalOverrides = useMemo(() => pruneOverrides(mine?.visualOverrides, spec), [mine?.visualOverrides, spec]);
  const [canvas, width] = useWidth<HTMLDivElement>();
  const viewable = (spec?.pages ?? []).filter((item) => !item.hidden && (item.type ?? 'page') === 'page');
  const page = drillthrough
    ? spec?.pages.find((item) => item.id === drillthrough.pageId)
    : (spec?.pages.find((item) => item.id === pageId) ?? viewable[0] ?? spec?.pages[0]);
  const theme = resolveTheme(spec?.theme, themes.data?.themes);
  const appMode = resolvedTheme === 'dark' ? 'dark' : 'light';
  const mode = mine?.mode === 'light' || mine?.mode === 'dark' ? mine.mode : mine?.mode === 'system' ? appMode : resolveMode(spec?.mode, appMode);
  const density = mine?.density ?? spec?.density;
  const extraFilters = useMemo(() => [...(drillthrough?.filters ?? []), ...personal], [drillthrough, personal]);
  const runtime = useDashboardRuntime({ spec, page, mode, dashboardId, extraFilters, personal: personalOverrides });
  const bookmarks = useMemo(() => [...(spec?.bookmarks ?? []), ...(mine?.bookmarks ?? [])], [spec?.bookmarks, mine?.bookmarks]);

  const goTo = useCallback(
    (id: string) => {
      setHistory((current) => [...current.slice(-19), page?.id ?? '']);
      setDrillthrough(null);
      setPageId(id);
    },
    [page?.id],
  );
  const applyView = (bookmark: DashboardBookmark) => {
    const target = spec?.pages.find((item) => item.id === bookmark.pageId) ?? page;
    if (target && target.id !== page?.id) goTo(target.id);
    runtime.apply(bookmark.state, target);
    setActiveView(bookmark.id);
  };
  // Open with the viewer's default view, once.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !spec || !mine) return;
    opened.current = true;
    const preferred = bookmarks.find((bookmark) => bookmark.id === mine.defaultBookmark);
    if (preferred) applyView(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applied once, when both are loaded
  }, [spec, mine]);
  const updateMine = (change: (state: PersonalState) => PersonalState) => setMine((current) => change(current ?? {}));
  const resetAll = () => {
    void visualize.resetPersonalView(dashboardId).catch(() => undefined);
    saved.current = '{}';
    setMine({});
    setUndo([]);
    setPersonal([]);
    setActiveView(undefined);
    runtime.apply({});
    runtime.resetOverrides();
  };

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
  const onAction = (action: ButtonAction) => {
    switch (action.kind) {
      case 'page':
        if (action.pageId && spec.pages.some((item) => item.id === action.pageId)) goTo(action.pageId);
        break;
      case 'bookmark': {
        const bookmark = bookmarks.find((item) => item.id === action.bookmarkId);
        if (bookmark) applyView(bookmark);
        break;
      }
      case 'back':
        if (drillthrough) setDrillthrough(null);
        else if (history.length) {
          setPageId(history[history.length - 1]!);
          setHistory(history.slice(0, -1));
        }
        break;
      case 'clear_slicers':
        runtime.clearSlicers();
        break;
      case 'apply_slicers':
        runtime.applyPending();
        break;
      case 'url': {
        const url = safeUrl(action.url);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        break;
      }
      case 'toggle':
        if (action.visualId) runtime.toggleVisual(action.visualId);
        break;
      case 'ask_ai':
        setAssistantOpen(true);
        break;
      case 'reset':
        resetAll();
        break;
    }
  };
  const local: LocalContext = { spec, pageId: page.id, parameters: runtime.parameters, setParameter: runtime.setParameter, bookmarks, activeBookmark: activeView, onAction };
  const canPersonalize = (visual: DashboardVisual) => allowPersonalize && visual.allowPersonalize !== false && !LOCAL_TYPES.has(visual.type) && visual.type !== 'slicer' && visual.type !== 'chart' && visual.type !== 'python';
  const changeOverride = (id: string, change: Partial<DashboardVisual> | null) => {
    setUndo((current) => [...current.slice(-19), mine?.visualOverrides ?? {}]);
    updateMine((state) => {
      const overrides = { ...(state.visualOverrides ?? {}) };
      if (change) overrides[id] = mergeOverride(overrides[id], change);
      else delete overrides[id];
      return { ...state, visualOverrides: overrides };
    });
  };
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
        local={local}
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
            onPersonalize={canPersonalize(visual) ? () => setPersonalizing(personalizing === visual.id ? '' : visual.id) : undefined}
            personalized={!!personalOverrides[visual.id]}
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
          {(bookmarks.length > 0 || allowPersonalize) && (
            <ViewsMenu
              author={spec.bookmarks ?? []}
              personal={mine?.bookmarks ?? []}
              active={activeView}
              defaultView={mine?.defaultBookmark}
              display={{ mode: mine?.mode ?? null, density: mine?.density ?? null }}
              canSave={allowPersonalize}
              onApply={applyView}
              onSave={(name) => {
                const bookmark: DashboardBookmark = { id: newId('view'), name, pageId: page.id, state: runtime.capture() };
                updateMine((state) => ({ ...state, bookmarks: [...(state.bookmarks ?? []), bookmark].slice(-30) }));
                setActiveView(bookmark.id);
              }}
              onDelete={(id) => updateMine((state) => ({ ...state, bookmarks: (state.bookmarks ?? []).filter((item) => item.id !== id), defaultBookmark: state.defaultBookmark === id ? undefined : state.defaultBookmark }))}
              onDefault={(id) => updateMine((state) => ({ ...state, defaultBookmark: id }))}
              onDisplay={(display) => updateMine((state) => ({ ...state, mode: display.mode, density: display.density }))}
              onReset={resetAll}
            />
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
          style={{ ...themeStyle(theme, mode, density), ...(page.canvas?.background ? { background: page.canvas.background } : {}) }}
          data-testid="dashboard-canvas"
          data-mode={mode}
          onMouseLeave={() => {
            clearTimeout(hoverTimer.current);
            setHover(null);
          }}
        >
          <div ref={canvas} className={stacked ? 'dash-stack' : 'dash-grid'} style={stacked ? undefined : { height }}>
            {width > 0 &&
              (stacked
                ? // Phones: the page's mobile layout (or reading order), one visual per row.
                  mobileVisuals(page, visuals).map(({ visual, h }) => tile(visual, { height: Math.max(h * 24, 56) }))
                : visuals.map((visual) => tile(visual, tileStyle(visual, rowHeight))))}
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
          <div className={`dash-canvas ${mode} h-full`} style={themeStyle(theme, mode, density)}>
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
      {personalizing &&
        (() => {
          const base = page.visuals.find((visual) => visual.id === personalizing);
          const current = visuals.find((visual) => visual.id === personalizing);
          if (!base || !current) return null;
          return (
            <PersonalizePane
              visual={current}
              base={base}
              profiles={datasets.find((item) => item.id === base.data.datasetId)?.profile.columnProfiles ?? []}
              canUndo={undo.length > 0}
              onChange={(change) => changeOverride(base.id, change)}
              onReset={() => changeOverride(base.id, null)}
              onUndo={() => {
                const previous = undo[undo.length - 1];
                setUndo(undo.slice(0, -1));
                updateMine((state) => ({ ...state, visualOverrides: previous ?? {} }));
              }}
              onClose={() => setPersonalizing('')}
            />
          );
        })()}
      {hover && hoverPage && (
        <TooltipCard spec={spec} page={hoverPage} filters={[...filtersOn(hovered!), ...hover.filters]} theme={theme} mode={mode} dashboardId={dashboardId} x={hover.x} y={hover.y} />
      )}
    </div>
  );
}
