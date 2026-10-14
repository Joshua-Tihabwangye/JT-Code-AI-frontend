import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowLeft,
  BringToFront,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Copy,
  EyeOff,
  Grid2x2,
  History,
  LayoutTemplate,
  Loader2,
  Magnet,
  Monitor,
  MousePointerClick,
  Paintbrush,
  Palette,
  Plus,
  Settings2,
  Smartphone,
  Redo2,
  SendToBack,
  StretchHorizontal,
  StretchVertical,
  Trash2,
  Undo2,
} from 'lucide-react';
import { apiErrorMessage, apiErrorStatus } from '@/lib/api/http';
import { useAppStore } from '@/lib/appStore';
import { useRepository, type DashboardPage, type DashboardSpec, type DashboardVisual, type DashboardVisualType } from '@/lib/data';
import { useTheme } from '@/lib/theme';
import { useVisualize } from '../../context';
import { ErrorNote, SkeletonBlock } from '../../ui';
import { paintFormat } from '../customize';
import type { ButtonAction, LocalContext } from '../local';
import { useDashboardRuntime, useWidth } from '../runtime';
import { resolveMode, resolveTheme, themeStyle, useBuiltInThemes } from '../theme';
import { captureThumbnail } from '../thumbnail';
import {
  addPage,
  addVisual,
  align,
  distribute,
  duplicatePage,
  expandGroups,
  group,
  layer,
  mapPage,
  mapVisuals,
  matchSize,
  movePage,
  moveBy,
  pasteVisuals,
  removePage,
  removeVisuals,
  ungroup,
} from './actions';
import { BuildPane } from './BuildPane';
import { EditorCanvas } from './Canvas';
import { fieldKind, newId, suggestType, VISUAL_BY_TYPE, VISUALS, wellFor, wellItem } from './catalog';
import { FiltersPane } from '../FiltersPane';
import { PYTHON_STARTER } from './FormatExtras';
import { FormatPane } from './FormatPane';
import { MobileLayoutEditor } from './MobileLayout';
import { SelectionPane } from './SelectionPane';
import { ThemeDialog } from './ThemeDialog';
import { ViewsPane } from './ViewsPane';
import { currentPage, readClipboard, selectedVisuals, useEditor, writeClipboard } from './store';

type Menu = 'insert' | 'arrange' | 'theme' | 'versions' | null;
type PaneTab = 'build' | 'format' | 'filters' | 'selection' | 'views';
const THUMBNAIL_EVERY_MS = 30_000;

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName));
}

/** The dashboard editor: canvas, Insert/Arrange/Theme menus, Build/Format/Selection panes, pages,
 *  autosave with conflict detection, versions and undo/redo. Python still builds every visual. */
export function DashboardEditor() {
  const { t } = useTranslation();
  const { dashboardId = '' } = useParams();
  const navigate = useNavigate();
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const { datasetId: activeDataset, datasets, setAssistantContext } = useVisualize();
  const record = useQuery({ queryKey: ['visualize', 'dashboard', dashboardId], queryFn: () => visualize.getDashboard(dashboardId), enabled: !!dashboardId, staleTime: Infinity });
  const charts = useQuery({ queryKey: ['visualize', 'charts'], queryFn: () => visualize.listCharts() });
  const versions = useQuery({ queryKey: ['visualize', 'dashboard-versions', dashboardId], queryFn: () => visualize.dashboardVersions(dashboardId), enabled: false });
  const themes = useBuiltInThemes();
  const editor = useEditor();
  const { spec, selected, change, select, undo, redo, saveState, saveError, snap, gridlines, zoom, setOption } = editor;
  const page = currentPage(editor);
  const [menu, setMenu] = useState<Menu>(null);
  const [pane, setPane] = useState<PaneTab>('build');
  const [paneOpen, setPaneOpen] = useState(true);
  const [renamingPage, setRenamingPage] = useState('');
  const [interactions, setInteractions] = useState(false);
  /** Format painter: the visual whose formatting the next clicked visual takes. */
  const [painter, setPainter] = useState<string | null>(null);
  /** The theme before the customize dialog opened (Cancel restores it). */
  const [themeBefore, setThemeBefore] = useState<DashboardSpec['theme'] | null>(null);
  const [layout, setLayout] = useState<'desktop' | 'phone'>('desktop');
  const [area, areaWidth] = useWidth<HTMLDivElement>();
  const lastThumbnail = useRef(0);
  const theme = resolveTheme(spec?.theme, themes.data?.themes);
  const mode = resolveMode(spec?.mode, resolvedTheme === 'dark' ? 'dark' : 'light');
  const runtime = useDashboardRuntime({ spec: spec ?? undefined, page, mode, dashboardId, interactive: false });
  const single = selected.length === 1 ? page?.visuals.find((visual) => visual.id === selected[0]) : undefined;
  const canvasWidth = zoom === 'fit' ? Math.max(areaWidth - 32, 320) : 1280 * zoom;

  useEffect(() => {
    if (record.data && useEditor.getState().record?.id !== record.data.id) useEditor.getState().load(record.data);
  }, [record.data]);
  // Format painter: the next visual selected takes the copied formatting.
  useEffect(() => {
    if (!painter || selected.length !== 1 || selected[0] === painter) return;
    const state = useEditor.getState();
    const current = currentPage(state);
    const source = current?.visuals.find((visual) => visual.id === painter);
    if (current && source) state.change((s) => mapVisuals(s, current.id, [selected[0]!], (target) => paintFormat(source, target)));
    setPainter(null);
  }, [painter, selected]);
  useEffect(() => {
    setAssistantContext({ page: 'dashboard-editor', title: record.data?.name });
  }, [record.data?.name, setAssistantContext]);
  useEffect(() => {
    // The canvas needs the room: collapse the app sidebar while editing.
    const before = useAppStore.getState().sidebarCollapsed;
    useAppStore.getState().setSidebarCollapsed(true);
    return () => useAppStore.getState().setSidebarCollapsed(before);
  }, []);

  // --- Autosave ----------------------------------------------------------------------------------
  const save = useCallback(
    async (force = false) => {
      const state = useEditor.getState();
      if (!state.spec || !state.record) return;
      state.markSaving();
      let thumbnail: string | undefined;
      const grid = document.querySelector<HTMLElement>('[data-testid="editor-canvas"]');
      if (grid && Date.now() - lastThumbnail.current > THUMBNAIL_EVERY_MS && state.pageId === state.spec.pages[0]?.id) {
        thumbnail = captureThumbnail(grid) ?? undefined;
        if (thumbnail) lastThumbnail.current = Date.now();
      }
      try {
        const saved = await visualize.updateDashboard(
          dashboardId,
          { spec: state.spec, name: state.record.name, version: state.version, ...(thumbnail ? { thumbnail } : {}) },
          { force },
        );
        useEditor.getState().markSaved(saved);
        queryClient.setQueryData(['visualize', 'dashboard', dashboardId], { ...saved, spec: useEditor.getState().spec ?? saved.spec });
        void queryClient.invalidateQueries({ queryKey: ['visualize', 'dashboards'] });
      } catch (error) {
        useEditor.getState().markFailed(apiErrorStatus(error) === 409 ? 'conflict' : 'error', apiErrorMessage(error));
      }
    },
    [dashboardId, queryClient, visualize],
  );
  useEffect(() => {
    if (saveState !== 'dirty') return;
    const timer = setTimeout(() => void save(), 800);
    return () => clearTimeout(timer);
  }, [spec, saveState, save]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (['dirty', 'saving'].includes(useEditor.getState().saveState)) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // --- Editing helpers ----------------------------------------------------------------------------
  const updateSelected = (mutate: (visual: DashboardVisual) => DashboardVisual, merge?: string) => {
    if (!page || !single) return;
    change((current) => mapVisuals(current, page.id, [single.id], mutate), merge ? { merge } : {});
  };
  const insert = (type: DashboardVisualType, extra: Partial<DashboardVisual> = {}) => {
    if (!page || !spec) return;
    const datasetId = extra.data?.datasetId || mostUsedDataset(page) || activeDataset;
    const kind = VISUAL_BY_TYPE[type];
    let id = '';
    change((current) => {
      const result = addVisual(
        current,
        page.id,
        { id: newId(type), type, ...extra, data: { datasetId, wells: {}, ...(extra.data ?? {}) } },
        kind?.size ?? { w: 8, h: 8 },
      );
      id = result.id;
      return result.spec;
    });
    select([id]);
    setMenu(null);
    setPane(['text', 'parameter', 'button', 'navigator'].includes(type) ? 'format' : 'build');
    setPaneOpen(true);
  };
  /** Sensible starting settings for visuals that need more than fields. */
  const STARTERS: Partial<Record<DashboardVisualType, Partial<DashboardVisual>>> = {
    button: { format: { button: { action: { kind: 'clear_slicers' } } } },
    navigator: { format: { navigator: { kind: 'pages' } } },
    python: { format: { python: { code: PYTHON_STARTER } } },
  };
  const createFromField = (field: string, datasetId: string) => {
    const profile = datasets.find((item) => item.id === datasetId)?.profile.columnProfiles?.find((p) => p.name === field);
    const kind = fieldKind(profile);
    const draft: DashboardVisual = { id: '', type: kind === 'numeric' ? 'card' : 'bar', layout: { x: 0, y: 0, w: 1, h: 1 }, data: { datasetId, wells: {} } };
    const well = wellFor(draft, kind);
    const wells = well ? { [well.key]: [wellItem(field, kind, well)] } : {};
    if (kind !== 'numeric' && well) wells.values = [{ field: '*', agg: 'count' }];
    const type = suggestType({ ...draft, data: { datasetId, wells } }, { [field]: profile?.kind ?? 'categorical' }) ?? draft.type;
    insert(type, { data: { datasetId, wells } });
  };

  const deleteSelected = () => page && selected.length && change((current) => removeVisuals(current, page.id, selected));
  const duplicateSelected = () => {
    if (!page || !selected.length) return;
    let ids: string[] = [];
    change((current) => {
      const result = pasteVisuals(current, page.id, selectedVisuals(useEditor.getState()));
      ids = result.ids;
      return result.spec;
    });
    select(ids);
  };
  const arrange = (mutate: (current: DashboardSpec, pageId: string, ids: string[]) => DashboardSpec) => {
    if (!page) return;
    change((current) => mutate(current, page.id, selected));
  };

  // --- Keyboard shortcuts --------------------------------------------------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const state = useEditor.getState();
      const current = currentPage(state);
      if (!current) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
      } else if (mod && key === 'y') {
        event.preventDefault();
        state.redo();
      } else if (mod && key === 'a') {
        event.preventDefault();
        state.select(current.visuals.filter((v) => !v.hidden && !v.locked).map((v) => v.id));
      } else if (mod && key === 'c' && state.selected.length) {
        writeClipboard(selectedVisuals(state));
      } else if (mod && key === 'x' && state.selected.length) {
        writeClipboard(selectedVisuals(state));
        state.change((s) => removeVisuals(s, current.id, state.selected));
      } else if (mod && key === 'v') {
        const copied = readClipboard();
        if (!copied.length) return;
        event.preventDefault();
        let ids: string[] = [];
        state.change((s) => {
          const result = pasteVisuals(s, current.id, copied);
          ids = result.ids;
          return result.spec;
        });
        state.select(ids);
      } else if (mod && key === 'd' && state.selected.length) {
        event.preventDefault();
        let ids: string[] = [];
        state.change((s) => {
          const result = pasteVisuals(s, current.id, selectedVisuals(state));
          ids = result.ids;
          return result.spec;
        });
        state.select(ids);
      } else if (mod && key === 'g') {
        event.preventDefault();
        state.change((s) => (event.shiftKey ? ungroup(s, current.id, state.selected) : group(s, current.id, state.selected)));
      } else if ((key === 'delete' || key === 'backspace') && state.selected.length) {
        event.preventDefault();
        state.change((s) => removeVisuals(s, current.id, state.selected));
      } else if (key === 'escape') {
        state.select([]);
        setPainter(null);
      } else if (key.startsWith('arrow') && state.selected.length) {
        event.preventDefault();
        const step = (event.shiftKey ? 4 : 1) * (state.snap ? 1 : 0.25);
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
        state.change((s) => moveBy(s, current.id, expandGroups(current, state.selected), dx, dy), { merge: 'nudge' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Which dataset (and kind) a field belongs to on this page — for filter cards. */
  function datasetFor(field: string) {
    const used = [...new Set((page?.visuals ?? []).map((visual) => visual.data.datasetId).filter(Boolean))];
    if (!used.length && activeDataset) used.push(activeDataset);
    const profiles = used.map((id) => ({ id, profile: datasets.find((item) => item.id === id)?.profile.columnProfiles ?? [] }));
    const match = profiles.find((entry) => entry.profile.some((p) => p.name === field)) ?? profiles[0];
    return {
      datasetId: match?.id,
      kind: match?.profile.find((p) => p.name === field)?.kind ?? 'categorical',
      fields: (match?.profile ?? []).map((p) => ({ name: p.name, kind: p.kind })),
    };
  }

  if (record.isLoading || (record.data && !spec)) return <SkeletonBlock height={520} />;
  if (record.error || !spec || !page) return <ErrorNote error={record.error ?? new Error('Dashboard not found.')} />;
  if (record.data && record.data.role === 'viewer') return <ErrorNote error={new Error('You can view this dashboard but not edit it.')} />;

  const editorAction = (action: ButtonAction) => {
    if (action.kind === 'page' && action.pageId) editor.setPage(action.pageId);
    else if (action.kind === 'bookmark') {
      const bookmark = spec.bookmarks?.find((item) => item.id === action.bookmarkId);
      if (bookmark) {
        editor.setPage(bookmark.pageId);
        runtime.apply(bookmark.state, spec.pages.find((item) => item.id === bookmark.pageId));
      }
    } else if (action.kind === 'clear_slicers') runtime.clearSlicers();
    else if (action.kind === 'apply_slicers') runtime.applyPending();
    else if (action.kind === 'toggle' && action.visualId) runtime.toggleVisual(action.visualId);
  };
  const local: LocalContext = { spec, pageId: page.id, parameters: runtime.parameters, setParameter: runtime.setParameter, bookmarks: spec.bookmarks ?? [], onAction: editorAction };
  const selectedProfiles = datasets.find((item) => item.id === (single?.data.datasetId || mostUsedDataset(page) || activeDataset))?.profile.columnProfiles ?? [];
  const updatePage = (patch: Partial<DashboardPage>) => change((current) => mapPage(current, page.id, (p) => ({ ...p, ...patch })), { merge: `page.${Object.keys(patch).join(',')}` });
  const status = {
    saved: { icon: Check, text: t('visualize.editor.saved', 'Saved') },
    dirty: { icon: Loader2, text: t('visualize.editor.unsaved', 'Unsaved changes') },
    saving: { icon: Loader2, text: t('visualize.editor.saving', 'Saving…') },
    conflict: { icon: CloudOff, text: t('visualize.editor.conflict', 'Changed elsewhere') },
    error: { icon: CloudOff, text: t('visualize.editor.failed', 'Not saved') },
  }[saveState];

  return (
    <div className="dash-editor" data-testid="dashboard-editor" onPointerDown={() => menu && setMenu(null)}>
      <header className="dash-editor-bar" onPointerDown={(event) => event.stopPropagation()}>
        <Link to={`/app/visualize/dashboards/${dashboardId}`} className="viz-icon-button" aria-label={t('visualize.editor.close', 'Back to view')}>
          <ArrowLeft size={16} aria-hidden />
        </Link>
        <input
          className="dash-name-input"
          value={editor.record?.name ?? ''}
          onChange={(event) => useEditor.setState((state) => ({ record: state.record ? { ...state.record, name: event.target.value } : null, saveState: 'dirty' }))}
          aria-label="Dashboard name"
          data-testid="editor-name"
        />
        <div className="dash-toolgroup">
          <button type="button" onClick={undo} disabled={!editor.past.length} title="Undo (Ctrl+Z)" aria-label="Undo" data-testid="undo">
            <Undo2 size={15} />
          </button>
          <button type="button" onClick={redo} disabled={!editor.future.length} title="Redo (Ctrl+Y)" aria-label="Redo" data-testid="redo">
            <Redo2 size={15} />
          </button>
        </div>
        <div className="dash-menu-anchor">
          <button type="button" className="dash-menu-button primary" onClick={() => setMenu(menu === 'insert' ? null : 'insert')} aria-expanded={menu === 'insert'} data-testid="insert-menu">
            <Plus size={14} aria-hidden /> {t('visualize.editor.insert', 'Insert')}
          </button>
          {menu === 'insert' && (
            <div className="dash-menu wide" onPointerDown={(event) => event.stopPropagation()} role="menu">
              {(['Cards', 'Charts', 'Tables', 'Slicers', 'Other'] as const).map((groupName) => (
                <div key={groupName}>
                  <p className="dash-menu-title">{groupName}</p>
                  <div className="dash-menu-grid">
                    {VISUALS.filter((visual) => visual.group === groupName).map((visual) => (
                      <button key={visual.type} type="button" onClick={() => insert(visual.type, STARTERS[visual.type])} data-testid={`insert-${visual.type}`}>
                        <visual.icon size={16} aria-hidden /> {visual.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <p className="dash-menu-title">{t('visualize.editor.library', 'From My visuals')}</p>
              <div className="dash-menu-grid">
                {charts.data
                  ?.filter((chart) => chart.datasetId && !chart.chartType.startsWith('prediction:'))
                  .slice(0, 12)
                  .map((chart) => (
                    <button
                      key={chart.id}
                      type="button"
                      onClick={() =>
                        insert('chart', {
                          data: { datasetId: chart.datasetId!, wells: {} },
                          format: { chart: { chartType: chart.chartType, fields: chart.config.fields ?? {}, options: chart.config.options ?? {} }, title: { text: chart.title } },
                        })
                      }
                    >
                      <LayoutTemplate size={16} aria-hidden /> <span className="truncate">{chart.title}</span>
                    </button>
                  ))}
                {!charts.data?.some((chart) => chart.datasetId) && <span className="text-xs text-muted-foreground">Save charts in the Studio to reuse them here.</span>}
              </div>
            </div>
          )}
        </div>
        <div className="dash-menu-anchor">
          <button type="button" className="dash-menu-button" onClick={() => setMenu(menu === 'arrange' ? null : 'arrange')} disabled={!selected.length} data-testid="arrange-menu">
            <BringToFront size={14} aria-hidden /> {t('visualize.editor.arrange', 'Arrange')}
          </button>
          {menu === 'arrange' && (
            <div className="dash-menu" onPointerDown={(event) => event.stopPropagation()} role="menu">
              <p className="dash-menu-title">Align</p>
              <div className="dash-icon-row">
                {(
                  [
                    ['left', AlignStartVertical],
                    ['center', AlignCenterVertical],
                    ['right', AlignEndVertical],
                    ['top', AlignStartHorizontal],
                    ['middle', AlignCenterHorizontal],
                    ['bottom', AlignEndHorizontal],
                  ] as const
                ).map(([op, Icon]) => (
                  <button key={op} type="button" title={`Align ${op}`} disabled={selected.length < 2} onClick={() => arrange((s, p, ids) => align(s, p, ids, op))} data-testid={`align-${op}`}>
                    <Icon size={15} />
                  </button>
                ))}
              </div>
              <p className="dash-menu-title">Distribute and size</p>
              <div className="dash-icon-row">
                <button type="button" title="Distribute horizontally" disabled={selected.length < 3} onClick={() => arrange((s, p, ids) => distribute(s, p, ids, 'horizontal'))}>
                  <StretchHorizontal size={15} />
                </button>
                <button type="button" title="Distribute vertically" disabled={selected.length < 3} onClick={() => arrange((s, p, ids) => distribute(s, p, ids, 'vertical'))}>
                  <StretchVertical size={15} />
                </button>
                <button type="button" title="Match width" disabled={selected.length < 2} onClick={() => arrange((s, p, ids) => matchSize(s, p, ids, 'w', ids[0]!))}>
                  W
                </button>
                <button type="button" title="Match height" disabled={selected.length < 2} onClick={() => arrange((s, p, ids) => matchSize(s, p, ids, 'h', ids[0]!))}>
                  H
                </button>
              </div>
              <p className="dash-menu-title">Layer</p>
              <div className="dash-icon-row">
                <button type="button" title="Bring to front" onClick={() => arrange((s, p, ids) => layer(s, p, ids, 'front'))}>
                  <BringToFront size={15} />
                </button>
                <button type="button" title="Send to back" onClick={() => arrange((s, p, ids) => layer(s, p, ids, 'back'))}>
                  <SendToBack size={15} />
                </button>
                <button type="button" title="Duplicate (Ctrl+D)" onClick={duplicateSelected}>
                  <Copy size={15} />
                </button>
                <button type="button" title="Delete" onClick={deleteSelected}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="dash-menu-anchor">
          <button type="button" className="dash-menu-button" onClick={() => setMenu(menu === 'theme' ? null : 'theme')} data-testid="theme-menu">
            <Palette size={14} aria-hidden /> {t('visualize.editor.theme', 'Theme')}
          </button>
          {menu === 'theme' && (
            <div className="dash-menu wide" onPointerDown={(event) => event.stopPropagation()} role="menu">
              <p className="dash-menu-title">Theme</p>
              <div className="dash-theme-grid">
                {themes.data?.themes.map((option) => (
                  <button key={option.id} type="button" aria-pressed={(typeof spec.theme === 'string' ? spec.theme : spec.theme.id) === option.id} onClick={() => change((s) => ({ ...s, theme: option.id }))} data-testid={`theme-${option.id}`}>
                    <span className="dash-theme-swatch" style={{ background: option[mode].canvas }}>
                      {option.dataColors.slice(0, 5).map((color) => (
                        <i key={color} style={{ background: color }} />
                      ))}
                    </span>
                    {option.name}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="viz-chip mt-2"
                onClick={() => {
                  setThemeBefore(spec.theme);
                  if (typeof spec.theme === 'string' && theme) change((s) => ({ ...s, theme: { ...theme, id: 'custom', name: `${theme.name} (custom)` } }));
                  setMenu(null);
                }}
                data-testid="theme-customize"
              >
                <Settings2 size={12} aria-hidden /> Customize theme…
              </button>
              <p className="dash-menu-title">Mode and density</p>
              <div className="viz-segment">
                {(['system', 'light', 'dark'] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={spec.mode === value} onClick={() => change((s) => ({ ...s, mode: value }))}>
                    {value === 'system' ? 'Follow app' : value[0]!.toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
              <div className="viz-segment mt-1">
                {(['comfortable', 'compact'] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={(spec.density ?? 'comfortable') === value} onClick={() => change((s) => ({ ...s, density: value }))}>
                    {value[0]!.toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          className="dash-menu-button"
          aria-pressed={interactions}
          onClick={() => setInteractions(!interactions)}
          title="Choose how clicking the selected visual affects each other visual"
          data-testid="edit-interactions"
        >
          <MousePointerClick size={14} aria-hidden /> {t('visualize.editor.interactions', 'Interactions')}
        </button>
        <button
          type="button"
          className="dash-menu-button"
          aria-pressed={!!painter}
          disabled={!single && !painter}
          onClick={() => setPainter(painter ? null : (single?.id ?? null))}
          title="Format painter: copy this visual's formatting, then click another visual"
          data-testid="format-painter"
        >
          <Paintbrush size={14} aria-hidden />
        </button>
        <div className="dash-toolgroup">
          <button type="button" aria-pressed={snap} onClick={() => setOption({ snap: !snap })} title="Snap to grid (off = free positioning)" data-testid="toggle-snap">
            <Magnet size={15} />
          </button>
          <button type="button" aria-pressed={gridlines} onClick={() => setOption({ gridlines: !gridlines })} title="Gridlines">
            <Grid2x2 size={15} />
          </button>
          <select value={String(zoom)} onChange={(event) => setOption({ zoom: event.target.value === 'fit' ? 'fit' : Number(event.target.value) })} aria-label="Zoom" className="dash-zoom">
            <option value="fit">Fit</option>
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
              <option key={value} value={value}>
                {value * 100}%
              </option>
            ))}
          </select>
        </div>
        <div className="dash-menu-anchor">
          <button
            type="button"
            className="dash-menu-button"
            onClick={() => {
              setMenu(menu === 'versions' ? null : 'versions');
              void versions.refetch();
            }}
            data-testid="versions-menu"
          >
            <History size={14} aria-hidden /> {t('visualize.editor.versions', 'Versions')}
          </button>
          {menu === 'versions' && (
            <div className="dash-menu" onPointerDown={(event) => event.stopPropagation()} role="menu">
              <button
                type="button"
                className="viz-chip mb-2"
                onClick={() =>
                  void (async () => {
                    await save();
                    await visualize.saveDashboardVersion(dashboardId, `Saved ${new Date().toLocaleString()}`);
                    await versions.refetch();
                  })()
                }
                data-testid="save-version"
              >
                <Plus size={12} aria-hidden /> Save this version
              </button>
              <ul className="dash-versions">
                {versions.data?.map((version) => (
                  <li key={version.number}>
                    <span>
                      <b>v{version.number}</b> {version.name}
                      <br />
                      <small>{new Date(version.createdAt).toLocaleString()}</small>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void (async () => {
                          const restored = await visualize.restoreDashboardVersion(dashboardId, version.number);
                          useEditor.getState().load(restored);
                          queryClient.setQueryData(['visualize', 'dashboard', dashboardId], restored);
                          setMenu(null);
                        })()
                      }
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <span className={`dash-save ${saveState}`} title={saveError || status.text} data-testid="save-state" data-state={saveState}>
          <status.icon size={13} className={saveState === 'saving' ? 'animate-spin' : ''} aria-hidden /> {status.text}
        </span>
        <button type="button" className="viz-primary ml-1 inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold text-white" onClick={() =>
          void (async () => {
            if (useEditor.getState().saveState !== 'saved') await save();
            void navigate(`/app/visualize/dashboards/${dashboardId}`);
          })()
        } data-testid="done-editing">
          {t('visualize.editor.done', 'Done')}
        </button>
      </header>

      {saveState === 'conflict' && (
        <div className="dash-conflict" role="alert">
          {t('visualize.editor.conflictText', 'Someone saved this dashboard while you were editing.')}
          <button type="button" onClick={() => void record.refetch().then((fresh) => fresh.data && useEditor.getState().load(fresh.data))}>
            {t('visualize.editor.reload', 'Load their version')}
          </button>
          <button type="button" onClick={() => void save(true)}>
            {t('visualize.editor.overwrite', 'Keep mine')}
          </button>
        </div>
      )}
      {saveState === 'error' && <ErrorNote error={new Error(saveError)} />}
      {themeBefore !== null && typeof spec.theme === 'object' && (
        <ThemeDialog
          theme={spec.theme}
          mode={mode}
          onChange={(next) => change((s) => ({ ...s, theme: next }), { merge: 'theme' })}
          onClose={(keep) => {
            if (!keep) change((s) => ({ ...s, theme: themeBefore }));
            setThemeBefore(null);
          }}
        />
      )}

      <div className="dash-editor-body">
        <div ref={area} className="dash-editor-canvas" onPointerDown={(event) => event.target === event.currentTarget && select([])}>
          <div className={`dash-canvas ${mode}`} style={{ width: layout === 'phone' ? undefined : canvasWidth, ...themeStyle(theme, mode, spec.density), ...(page.canvas?.background ? { background: page.canvas.background } : {}) }} data-mode={mode}>
            {layout === 'phone' ? (
              <MobileLayoutEditor
                page={page}
                visuals={runtime.visuals}
                outputs={runtime.outputs}
                theme={theme}
                local={local}
                onChange={(next) => change((current) => mapPage(current, page.id, (p) => ({ ...p, mobileLayout: next })))}
              />
            ) : canvasWidth > 0 && (
              <EditorCanvas
                outputs={runtime.outputs}
                theme={theme}
                mode={mode}
                width={canvasWidth - 20}
                slicerValue={runtime.slicerValue}
                onSlicerChange={runtime.setSlicer}
                onFormat={() => {
                  setPane('format');
                  setPaneOpen(true);
                }}
                interactionSource={interactions ? single : undefined}
                local={local}
                painting={!!painter}
              />
            )}
          </div>
        </div>
        <aside className={`dash-pane${paneOpen ? '' : ' closed'}`} aria-label="Editor pane">
          <button type="button" className="dash-pane-toggle" onClick={() => setPaneOpen(!paneOpen)} aria-label={paneOpen ? 'Hide pane' : 'Show pane'}>
            {paneOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
          {paneOpen && (
            <>
              <div className="dash-pane-tabs" role="tablist">
                {(['build', 'format', 'filters', 'selection', 'views'] as const).map((tab) => (
                  <button key={tab} type="button" role="tab" aria-selected={pane === tab} onClick={() => setPane(tab)} data-testid={`pane-${tab}`}>
                    {tab === 'build' ? 'Build' : tab === 'format' ? 'Format' : tab === 'filters' ? 'Filters' : tab === 'selection' ? 'Selection' : 'Views'}
                  </button>
                ))}
              </div>
              <div className="dash-pane-body">
                {selected.length > 1 && pane !== 'selection' && pane !== 'filters' && pane !== 'views' && <p className="text-xs text-muted-foreground">{selected.length} visuals selected — use Arrange, or pick one to edit.</p>}
                {pane === 'build' && selected.length <= 1 && <BuildPane visual={single} update={updateSelected} onCreate={createFromField} spec={spec} onSpec={(mutate) => change(mutate)} />}
                {pane === 'format' && selected.length <= 1 && (
                  <FormatPane
                    visual={single}
                    update={updateSelected}
                    page={page}
                    updatePage={updatePage}
                    context={{ spec, pageId: page.id, onSpec: (mutate) => change(mutate), output: single ? runtime.outputs[single.id] : undefined, profiles: selectedProfiles }}
                    fields={datasetFor('').fields.map((field) => field.name)}
                  />
                )}
                {pane === 'filters' && (
                  <FiltersPane
                    spec={spec}
                    page={page}
                    visual={single}
                    editable
                    datasetFor={datasetFor}
                    onEdit={(level, edit, visualId) =>
                      change((current) => {
                        if (level === 'dashboard') return { ...current, filters: edit(current.filters ?? []) };
                        if (level === 'page') return mapPage(current, page.id, (p) => ({ ...p, filters: edit(p.filters ?? []) }));
                        return mapVisuals(current, page.id, [visualId!], (v) => ({ ...v, data: { ...v.data, filters: edit(v.data.filters ?? []) } }));
                      })
                    }
                  />
                )}
                {pane === 'selection' && <SelectionPane page={page} outputs={runtime.outputs} />}
                {pane === 'views' && (
                  <ViewsPane
                    spec={spec}
                    pageId={page.id}
                    capture={runtime.capture}
                    onApply={(bookmark) => {
                      editor.setPage(bookmark.pageId);
                      runtime.apply(bookmark.state, spec.pages.find((item) => item.id === bookmark.pageId));
                    }}
                    onSpec={(mutate) => change(mutate)}
                  />
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      <footer className="dash-pages" data-testid="page-tabs">
        {spec.pages.map((item, index) => (
          <div key={item.id} className={`dash-page-tab${item.id === page.id ? ' active' : ''}`}>
            {renamingPage === item.id ? (
              <input
                autoFocus
                defaultValue={item.name}
                aria-label="Page name"
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (name) change((s) => mapPage(s, item.id, (p) => ({ ...p, name })));
                  setRenamingPage('');
                }}
                onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
              />
            ) : (
              <button type="button" onClick={() => editor.setPage(item.id)} onDoubleClick={() => setRenamingPage(item.id)} title="Double-click to rename" data-testid={`page-${index}`}>
                {item.hidden && <EyeOff size={11} aria-hidden />} {item.name}
              </button>
            )}
            {item.id === page.id && (
              <span className="dash-page-actions">
                <button type="button" title="Move left" disabled={index === 0} onClick={() => change((s) => movePage(s, item.id, -1))}>
                  <ChevronLeft size={12} />
                </button>
                <button type="button" title="Move right" disabled={index === spec.pages.length - 1} onClick={() => change((s) => movePage(s, item.id, 1))}>
                  <ChevronRight size={12} />
                </button>
                <button
                  type="button"
                  title="Duplicate page"
                  onClick={() => {
                    let id = '';
                    change((s) => {
                      const result = duplicatePage(s, item.id);
                      id = result.id;
                      return result.spec;
                    });
                    editor.setPage(id);
                  }}
                >
                  <Copy size={12} />
                </button>
                <button type="button" title={item.hidden ? 'Show page to viewers' : 'Hide page from viewers'} onClick={() => change((s) => mapPage(s, item.id, (p) => ({ ...p, hidden: !p.hidden })))}>
                  <EyeOff size={12} />
                </button>
                <button
                  type="button"
                  title="Delete page"
                  disabled={spec.pages.length < 2}
                  onClick={() => {
                    change((s) => removePage(s, item.id));
                    editor.setPage(spec.pages.find((p) => p.id !== item.id)?.id ?? '');
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </span>
            )}
          </div>
        ))}
        <button
          type="button"
          className="dash-page-add"
          onClick={() => {
            let id = '';
            change((s) => {
              const result = addPage(s);
              id = result.id;
              return result.spec;
            });
            editor.setPage(id);
          }}
          aria-label="Add page"
          data-testid="add-page"
        >
          <Plus size={14} />
        </button>
        <div className="viz-segment ml-auto" role="group" aria-label="Layout">
          <button type="button" aria-pressed={layout === 'desktop'} onClick={() => setLayout('desktop')} data-testid="layout-desktop" title="Desktop layout">
            <Monitor size={13} aria-hidden />
          </button>
          <button type="button" aria-pressed={layout === 'phone'} onClick={() => setLayout('phone')} data-testid="layout-phone" title="Phone layout">
            <Smartphone size={13} aria-hidden />
          </button>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {page.visuals.length} visual{page.visuals.length === 1 ? '' : 's'} · {runtime.rendered.isFetching ? 'updating…' : runtime.rendered.data ? `${(runtime.rendered.data.meta.ms / 1000).toFixed(1)} s` : ''}
        </span>
      </footer>
    </div>
  );
}

function mostUsedDataset(page: DashboardPage): string | undefined {
  const counts = new Map<string, number>();
  for (const visual of page.visuals) if (visual.data.datasetId) counts.set(visual.data.datasetId, (counts.get(visual.data.datasetId) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}
