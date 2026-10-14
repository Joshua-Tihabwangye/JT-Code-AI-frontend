import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRepository, type DashboardFilter, type DashboardPage, type DashboardSpec, type DashboardTheme, type DashboardVisual, type VisualOutput } from '@/lib/data';
import { useDebounced } from '../controls';
import { slicerFilter, VisualRenderer, type SelectHandler, type SlicerValue } from './visuals';

/** Pages are designed at 1280 px wide on a 24-column grid with 24 px rows, then scaled to fit. */
export const PAGE_WIDTH = 1280;
export const ROW_PX = 24;
export const COLUMNS = 24;

const CHART_TYPES = new Set(['bar', 'column', 'line', 'area', 'combo']);

export interface Selection {
  source: string;
  filters: DashboardFilter[];
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

/** Slicers, click selection and the batched request that redraws a page's visuals. */
export function useDashboardRuntime({
  spec,
  page,
  mode,
  dashboardId,
  interactive = true,
}: {
  spec: DashboardSpec | undefined;
  page: DashboardPage | undefined;
  mode: 'light' | 'dark';
  dashboardId?: string;
  interactive?: boolean;
}) {
  const visualize = useRepository('visualize');
  const [slicers, setSlicers] = useState<Record<string, SlicerValue>>({});
  const [selection, setSelection] = useState<Selection | null>(null);
  const [outputs, setOutputs] = useState<Record<string, VisualOutput>>({});
  const visuals = useMemo(() => (page?.visuals ?? []).filter((visual) => !visual.hidden), [page]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setSelection(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const request = useMemo(() => {
    if (!spec || !page) return null;
    const slicerFilters = visuals
      .filter((visual) => visual.type === 'slicer')
      .map((visual) => slicerFilter(visual, outputs[visual.id]?.slicer, slicers[visual.id]))
      .filter((filter): filter is DashboardFilter => !!filter);
    const source = selection ? visuals.find((visual) => visual.id === selection.source) : undefined;
    const prepared = visuals
      .filter((visual) => visual.type !== 'text')
      .map((visual) => {
        if (!source || !selection || visual.id === source.id) return visual;
        const how = interaction(source, visual);
        if (how === 'none') return visual;
        const key = how === 'highlight' && !visual.data.wells.legend?.length ? 'highlight' : 'filters';
        return { ...visual, data: { ...visual.data, [key]: [...(visual.data[key] ?? []), ...selection.filters] } };
      });
    return {
      visuals: prepared,
      filters: [...(spec.filters ?? []), ...(page.filters ?? []), ...slicerFilters],
      theme: spec.theme,
      mode,
      today: new Date().toISOString().slice(0, 10),
      dashboardId,
    };
  }, [spec, page, visuals, outputs, slicers, selection, mode, dashboardId]);
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

  const onSelect = (visualId: string): SelectHandler => (filters) => {
    if (!interactive) return;
    setSelection((current) =>
      !filters || (current?.source === visualId && JSON.stringify(current.filters) === JSON.stringify(filters)) ? null : { source: visualId, filters },
    );
  };
  return { visuals, outputs, rendered, slicers, setSlicers, selection, setSelection, onSelect };
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
          <VisualRenderer visual={visual} output={output} theme={theme} kpiIndex={kpiIndex} onSelect={onSelect} slicerValue={slicerValue} onSlicerChange={onSlicerChange} />
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
