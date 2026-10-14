import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRepository, type DashboardFieldRef, type DashboardFilter, type DashboardPage, type DashboardSpec, type DashboardTheme, type DashboardVisual, type VisualOutput } from '@/lib/data';
import { useDebounced } from '../controls';
import { slicerFilter, VisualRenderer, type PointHandler, type SelectHandler, type SlicerValue } from './visuals';

/** Pages are designed at 1280 px wide on a 24-column grid with 24 px rows, then scaled to fit. */
export const PAGE_WIDTH = 1280;
export const ROW_PX = 24;
export const COLUMNS = 24;

const CHART_TYPES = new Set(['bar', 'column', 'line', 'area', 'combo']);

export interface Selection {
  source: string;
  /** Each clicked member's filters (Ctrl/⌘-click adds members). */
  members: DashboardFilter[][];
}

/** How a click in ``source`` affects ``target``: highlight charts, filter everything else. */
export function interaction(source: DashboardVisual, target: DashboardVisual): 'filter' | 'highlight' | 'none' {
  const chosen = source.interactions?.[target.id];
  if (chosen) return chosen;
  // Slicers keep showing the user's own choice; a chart click never changes them.
  if (target.type === 'text' || target.type === 'slicer') return 'none';
  return CHART_TYPES.has(target.type) ? 'highlight' : 'filter';
}

/** The page height in grid rows (16:9 → 30 rows; other presets keep their aspect ratio). */
export function pageRows(page: DashboardPage | undefined): number {
  const width = page?.canvas?.width ?? PAGE_WIDTH;
  const height = page?.canvas?.height ?? 720;
  return Math.round((height * PAGE_WIDTH) / (ROW_PX * width));
}

/** The element's width, measured whenever it appears (a callback ref) and on every resize. */
export function useWidth<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!node) return;
    setWidth(node.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width] as const;
}

export interface DrillState {
  level: number;
  /** Members drilled into, each tagged with the level it was clicked at (``next level`` adds none). */
  path: { level: number; filter: DashboardFilter }[];
}

const DATE_LEVELS = ['year', 'quarter', 'month', 'day'] as const;
const DRILLABLE = new Set(['bar', 'column', 'line', 'area', 'combo', 'donut', 'pie', 'treemap', 'funnel', 'waterfall', 'table', 'matrix']);

/** A visual's drill hierarchy: several category fields, or a date's year › quarter › month › day.
 *  ``start`` is the level the author chose; drilling up can go above it. */
export function hierarchyOf(visual: DashboardVisual): { levels: DashboardFieldRef[]; start: number } | null {
  if (!DRILLABLE.has(visual.type)) return null;
  const key = visual.type === 'matrix' ? 'rows' : 'category';
  const refs = visual.data.wells[key] ?? [];
  if (refs.length > 1 && visual.type !== 'matrix' && visual.type !== 'table') return { levels: refs, start: 0 };
  const first = refs[0];
  if (first?.grain) {
    const levels = DATE_LEVELS.map((grain) => ({ ...first, grain }));
    const start = Math.max(0, DATE_LEVELS.indexOf(first.grain as (typeof DATE_LEVELS)[number]));
    return { levels, start };
  }
  return null;
}

/** The visual as drawn at its current drill level (category swapped, drilled members filtered). */
export function drilled(visual: DashboardVisual, state: DrillState | undefined): DashboardVisual {
  const hierarchy = hierarchyOf(visual);
  if (!hierarchy || !state) return visual;
  const key = visual.type === 'matrix' ? 'rows' : 'category';
  const level = hierarchy.levels[Math.min(state.level, hierarchy.levels.length - 1)]!;
  const path = state.path.filter((step) => step.level < state.level).map((step) => step.filter);
  return {
    ...visual,
    data: { ...visual.data, wells: { ...visual.data.wells, [key]: [level] }, filters: [...(visual.data.filters ?? []), ...path] },
  };
}

/** Several clicked members of one visual as one filter (``in`` when possible, otherwise ``or``). */
export function mergeMembers(members: DashboardFilter[][]): DashboardFilter[] {
  if (members.length <= 1) return members[0] ?? [];
  const firsts = members.map((member) => member[0]!).filter(Boolean);
  if (firsts.every((filter) => filter.op === 'in' && filter.field === firsts[0]!.field)) {
    return [{ ...firsts[0]!, value: firsts.flatMap((filter) => filter.value as unknown[]) }];
  }
  return [{ field: firsts[0]!.field, op: 'or', value: firsts }];
}

export function slicerKey(visual: DashboardVisual): string {
  return (visual.format?.slicer as { syncGroup?: string } | undefined)?.syncGroup || visual.id;
}

export interface FilterCard {
  key: string;
  level: 'dashboard' | 'page' | 'visual';
  visualId?: string;
  filter: DashboardFilter;
}

/** Every author filter as a card (dashboard, page and visual level) with a stable key. */
export function filterCards(spec: DashboardSpec | undefined, page: DashboardPage | undefined): FilterCard[] {
  const cards: FilterCard[] = [];
  (spec?.filters ?? []).forEach((filter, index) => cards.push({ key: `dashboard:${filter.id ?? index}`, level: 'dashboard', filter }));
  (page?.filters ?? []).forEach((filter, index) => cards.push({ key: `page:${page!.id}:${filter.id ?? index}`, level: 'page', filter }));
  for (const visual of page?.visuals ?? []) {
    (visual.data.filters ?? []).forEach((filter, index) => cards.push({ key: `visual:${visual.id}:${filter.id ?? index}`, level: 'visual', visualId: visual.id, filter }));
  }
  return cards;
}

/** Slicers, filters, click selection, drill state and the batched request that redraws a page. */
export function useDashboardRuntime({
  spec,
  page,
  mode,
  dashboardId,
  interactive = true,
  extraFilters = [],
}: {
  spec: DashboardSpec | undefined;
  page: DashboardPage | undefined;
  mode: 'light' | 'dark';
  dashboardId?: string;
  interactive?: boolean;
  /** Filters from outside the page: a drill-through's member, a viewer's keep/exclude. */
  extraFilters?: DashboardFilter[];
}) {
  const visualize = useRepository('visualize');
  const [slicers, setSlicers] = useState<Record<string, SlicerValue>>({});
  const [pending, setPending] = useState<Record<string, SlicerValue> | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [drill, setDrill] = useState<Record<string, DrillState>>({});
  const [drillMode, setDrillMode] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, DashboardFilter | null>>({});
  const [outputs, setOutputs] = useState<Record<string, VisualOutput>>({});
  const visuals = useMemo(() => (page?.visuals ?? []).filter((visual) => !visual.hidden), [page]);
  const applyWithButton = (spec?.settings as { applyMode?: string } | undefined)?.applyMode === 'button';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setSelection(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Author filters with the viewer's changes (locked cards cannot change). */
  const effective = useMemo(() => {
    const cards = filterCards(spec, page);
    const pick = (card: FilterCard) => (card.filter.locked || !(card.key in overrides) ? card.filter : overrides[card.key]);
    const keep = (filter: DashboardFilter | null | undefined): filter is DashboardFilter => !!filter && filter.op !== 'none';
    return {
      dashboard: cards.filter((c) => c.level === 'dashboard').map(pick).filter(keep),
      page: cards.filter((c) => c.level === 'page').map(pick).filter(keep),
      visual: Object.fromEntries(
        (page?.visuals ?? []).map((visual) => [visual.id, cards.filter((c) => c.visualId === visual.id).map(pick).filter(keep)]),
      ),
    };
  }, [spec, page, overrides]);

  const request = useMemo(() => {
    if (!spec || !page) return null;
    // Every slicer on the page applies — hidden synced copies included.
    const slicerFilters = (page.visuals ?? [])
      .filter((visual) => visual.type === 'slicer')
      .map((visual) => slicerFilter(visual, outputs[visual.id]?.slicer, slicers[slicerKey(visual)]))
      .filter((filter): filter is DashboardFilter => !!filter);
    const source = selection ? visuals.find((visual) => visual.id === selection.source) : undefined;
    const chosen = selection ? mergeMembers(selection.members) : [];
    const prepared = visuals
      .filter((visual) => visual.type !== 'text')
      .map((visual) => {
        let next = drilled({ ...visual, data: { ...visual.data, filters: effective.visual[visual.id] ?? [] } }, drill[visual.id]);
        if (source && chosen.length && visual.id !== source.id) {
          const how = interaction(source, visual);
          if (how !== 'none') {
            const key = how === 'highlight' && !next.data.wells.legend?.length ? 'highlight' : 'filters';
            next = { ...next, data: { ...next.data, [key]: [...(next.data[key] ?? []), ...chosen] } };
          }
        }
        return next;
      });
    return {
      visuals: prepared,
      filters: [...effective.dashboard, ...effective.page, ...slicerFilters, ...extraFilters],
      theme: spec.theme,
      mode,
      today: new Date().toISOString().slice(0, 10),
      dashboardId,
    };
  }, [spec, page, visuals, outputs, slicers, selection, mode, dashboardId, effective, drill, extraFilters]);
  const debounced = useDebounced(request, 150);
  const rendered = useQuery({
    queryKey: ['visualize', 'visuals', debounced],
    queryFn: ({ signal }) => visualize.renderVisuals(debounced!, signal),
    enabled: !!debounced && debounced.visuals.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });
  useEffect(() => {
    if (rendered.data) setOutputs((current) => ({ ...current, ...Object.fromEntries(rendered.data.visuals.map((output) => [output.id, output])) }));
  }, [rendered.data]);

  const drillInto = (visual: DashboardVisual, filters: DashboardFilter[]) => {
    const hierarchy = hierarchyOf(visual);
    if (!hierarchy) return false;
    const state = drill[visual.id] ?? { level: hierarchy.start, path: [] };
    if (state.level >= hierarchy.levels.length - 1 || !filters[0]) return false;
    setDrill((current) => ({ ...current, [visual.id]: { level: state.level + 1, path: [...state.path, { level: state.level, filter: filters[0]! }] } }));
    return true;
  };

  const onSelect =
    (visualId: string): SelectHandler =>
    (filters, additive) => {
      if (!interactive) return;
      const visual = visuals.find((item) => item.id === visualId);
      if (visual && filters && drillMode[visualId] && drillInto(visual, filters)) return;
      setSelection((current) => {
        if (!filters) return null;
        const same = current?.source === visualId;
        const key = JSON.stringify(filters);
        if (additive && same) {
          const exists = current.members.some((member) => JSON.stringify(member) === key);
          const members = exists ? current.members.filter((member) => JSON.stringify(member) !== key) : [...current.members, filters];
          return members.length ? { source: visualId, members } : null;
        }
        if (same && current.members.length === 1 && JSON.stringify(current.members[0]) === key) return null;
        return { source: visualId, members: [filters] };
      });
    };

  const setSlicer = (visual: DashboardVisual, value: SlicerValue) => {
    const key = slicerKey(visual);
    if (applyWithButton && interactive) setPending((current) => ({ ...(current ?? slicers), [key]: value }));
    else setSlicers((current) => ({ ...current, [key]: value }));
  };
  const slicerValue = (visual: DashboardVisual) => (pending ?? slicers)[slicerKey(visual)];

  return {
    visuals,
    outputs,
    rendered,
    slicers,
    setSlicers,
    setSlicer,
    slicerValue,
    pending,
    applyPending: () => {
      if (pending) setSlicers(pending);
      setPending(null);
    },
    clearSlicers: () => {
      setSlicers({});
      setPending(null);
    },
    selection,
    setSelection,
    onSelect,
    drill,
    drillMode,
    setDrillMode,
    drillUp: (visual: DashboardVisual) =>
      setDrill((current) => {
        const hierarchy = hierarchyOf(visual);
        const state = current[visual.id] ?? (hierarchy ? { level: hierarchy.start, path: [] } : undefined);
        if (!hierarchy || !state || state.level <= 0) return current;
        const level = state.level - 1;
        return { ...current, [visual.id]: { level, path: state.path.filter((step) => step.level < level) } };
      }),
    nextLevel: (visual: DashboardVisual) =>
      setDrill((current) => {
        const hierarchy = hierarchyOf(visual);
        if (!hierarchy) return current;
        const state = current[visual.id] ?? { level: hierarchy.start, path: [] };
        if (state.level >= hierarchy.levels.length - 1) return current;
        return { ...current, [visual.id]: { level: state.level + 1, path: state.path } };
      }),
    overrides,
    setOverride: (key: string, filter: DashboardFilter | null | undefined) =>
      setOverrides((current) => {
        const next = { ...current };
        if (filter === undefined) delete next[key];
        else next[key] = filter;
        return next;
      }),
    resetOverrides: () => setOverrides({}),
    effective,
  };
}

/** One visual on the canvas: tile chrome (from the theme) around what Python built. */
export function Tile({
  visual,
  output,
  theme,
  kpiIndex,
  style,
  className = '',
  onSelect,
  onPoint,
  asTable,
  slicerValue,
  onSlicerChange,
  title,
  children,
  ...rest
}: {
  visual: DashboardVisual;
  output: VisualOutput | undefined;
  theme: DashboardTheme | undefined;
  kpiIndex: number;
  style: CSSProperties;
  className?: string;
  onSelect: SelectHandler;
  onPoint?: PointHandler;
  asTable?: boolean;
  slicerValue?: SlicerValue;
  onSlicerChange?: (value: SlicerValue) => void;
  /** Replaces the title (the editor's inline rename). */
  title?: ReactNode;
  children?: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  const isKpi = visual.type === 'kpi' || visual.type === 'card';
  const tileFormat = (visual.format?.tile ?? {}) as { background?: string; border?: string; radius?: number; shadow?: boolean };
  const showTitle = !isKpi && visual.type !== 'text' && (visual.format?.title as { show?: boolean } | undefined)?.show !== false;
  const inner: CSSProperties = {
    ...(tileFormat.background ? { background: tileFormat.background } : {}),
    ...(tileFormat.border ? { borderColor: tileFormat.border } : {}),
    ...(tileFormat.radius != null ? { borderRadius: tileFormat.radius } : {}),
    ...(tileFormat.shadow === false ? { boxShadow: 'none' } : {}),
  };
  return (
    <section
      className={`dash-tile${isKpi ? ' kpi' : ''}${visual.type === 'slicer' ? ' slicer' : ''} ${className}`}
      style={style}
      data-testid={`tile-${visual.id}`}
      data-status={visual.type === 'text' ? 'ok' : (output?.status ?? 'loading')}
      aria-label={visual.altText || output?.title || visual.title || visual.type}
      {...rest}
    >
      <div className="dash-tile-inner" style={inner}>
        {showTitle &&
          (title ?? (
            <h2 className="dash-tile-title" title={output?.title}>
              {output?.title ?? visual.title ?? ''}
              {output?.notes?.length ? <span className="dash-note">{output.notes[0]}</span> : null}
            </h2>
          ))}
        <div className="dash-tile-body">
          <VisualRenderer visual={visual} output={output} theme={theme} kpiIndex={kpiIndex} onSelect={onSelect} onPoint={onPoint} asTable={asTable} slicerValue={slicerValue} onSlicerChange={onSlicerChange} />
        </div>
      </div>
      {children}
    </section>
  );
}

/** KPI tiles take theme colours in order; this numbers them as they appear on the page. */
export function kpiIndexes(visuals: DashboardVisual[]): Record<string, number> {
  let index = -1;
  return Object.fromEntries(visuals.map((visual) => [visual.id, visual.type === 'kpi' || visual.type === 'card' ? (index += 1) : -1]));
}
