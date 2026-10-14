import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowDownToLine, ArrowUp, ChevronsDown, Copy, Filter, Maximize2, MoreHorizontal, Pencil, Sun, Table2, X } from 'lucide-react';
import { useRepository, type DashboardFilter, type DashboardPage, type DashboardSpec, type DashboardTheme, type DashboardVisual, type VisualOutput } from '@/lib/data';
import { saveBlob, safeName } from '../echarts';
import { describeFilter } from './FiltersPane';
import { kpiIndexes, PAGE_WIDTH, ROW_PX, Tile } from './runtime';
import { themeStyle } from './theme';
import { dataCsv } from './visuals';

/** The hover header on a visual: filters affecting it, drill controls, focus and a “more” menu. */
export function VisualHeader({
  visual,
  output,
  filters,
  drill,
  asTable,
  spotlight,
  onFocus,
  onTable,
  onSpotlight,
  onPersonalize,
  personalized,
}: {
  visual: DashboardVisual;
  output: VisualOutput | undefined;
  filters: DashboardFilter[];
  drill?: { canUp: boolean; canDown: boolean; mode: boolean; onUp: () => void; onToggle: () => void; onNext: () => void };
  asTable: boolean;
  spotlight: boolean;
  onFocus: () => void;
  onTable: () => void;
  onSpotlight: () => void;
  /** Viewer personalization (when the author allows it). */
  onPersonalize?: () => void;
  personalized?: boolean;
}) {
  const [menu, setMenu] = useState<'' | 'filters' | 'more'>('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => !box.current?.contains(event.target as Node) && setMenu('');
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);
  if (visual.type === 'text' || visual.type === 'parameter' || visual.type === 'button' || visual.type === 'navigator') return null;
  const title = output?.title || visual.title || 'visual';
  const exportCsv = () => output?.data && saveBlob(new Blob([dataCsv(output.data)], { type: 'text/csv' }), `${safeName(title)}.csv`);
  const copyImage = async () => {
    const canvas = document.querySelector<HTMLCanvasElement>(`[data-testid="tile-${visual.id}"] canvas`);
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch {
      saveBlob(blob, `${safeName(title)}.png`);
    }
  };
  return (
    <div ref={box} className={`dash-vheader${menu ? ' open' : ''}`} data-testid={`vheader-${visual.id}`} onClick={(event) => event.stopPropagation()}>
      {filters.length > 0 && (
        <button type="button" title={`${filters.length} filter${filters.length === 1 ? '' : 's'} apply`} onClick={() => setMenu(menu === 'filters' ? '' : 'filters')} data-testid="vheader-filters">
          <Filter size={12} />
          <span className="text-[10px]">{filters.length}</span>
        </button>
      )}
      {drill && (
        <>
          <button type="button" title="Drill up" disabled={!drill.canUp} onClick={drill.onUp} data-testid="drill-up">
            <ArrowUp size={12} />
          </button>
          <button type="button" title={drill.mode ? 'Drill mode on: click a point to drill into it' : 'Drill mode: click a point to drill into it'} aria-pressed={drill.mode} disabled={!drill.canDown} onClick={drill.onToggle} data-testid="drill-mode">
            <ArrowDown size={12} />
          </button>
          <button type="button" title="Go to the next level" disabled={!drill.canDown} onClick={drill.onNext} data-testid="drill-next">
            <ChevronsDown size={12} />
          </button>
        </>
      )}
      {onPersonalize && (
        <button type="button" title={personalized ? 'Personalized for you — change or reset' : 'Personalize this visual'} aria-pressed={!!personalized} onClick={onPersonalize} data-testid="vheader-personalize">
          <Pencil size={12} />
        </button>
      )}
      <button type="button" title="Focus mode" onClick={onFocus} data-testid="vheader-focus">
        <Maximize2 size={12} />
      </button>
      <button type="button" title="More options" onClick={() => setMenu(menu === 'more' ? '' : 'more')} data-testid="vheader-more">
        <MoreHorizontal size={12} />
      </button>
      {menu === 'filters' && (
        <div className="dash-popover" role="dialog" aria-label="Filters on this visual">
          <p className="dash-menu-title">Filters on this visual</p>
          <ul className="space-y-1 text-xs">
            {filters.map((filter, index) => (
              <li key={index}>{describeFilter(filter)}</li>
            ))}
          </ul>
        </div>
      )}
      {menu === 'more' && (
        <div className="dash-popover menu" role="menu">
          <button type="button" role="menuitem" onClick={() => (onTable(), setMenu(''))} data-testid="menu-show-table">
            <Table2 size={13} /> {asTable ? 'Show as visual' : 'Show as table'}
          </button>
          <button type="button" role="menuitem" disabled={!output?.data} onClick={() => (exportCsv(), setMenu(''))} data-testid="menu-export">
            <ArrowDownToLine size={13} /> Export data (CSV)
          </button>
          <button type="button" role="menuitem" onClick={() => void copyImage().then(() => setMenu(''))}>
            <Copy size={13} /> Copy as image
          </button>
          <button type="button" role="menuitem" onClick={() => (onSpotlight(), setMenu(''))} data-testid="menu-spotlight">
            <Sun size={13} /> {spotlight ? 'Leave spotlight' : 'Spotlight'}
          </button>
        </div>
      )}
    </div>
  );
}

export interface PointMenu {
  x: number;
  y: number;
  visualId: string;
  filters: DashboardFilter[];
}

/** Right-click on a data point: keep only, exclude, or drill through to a detail page. */
export function PointContextMenu({
  menu,
  pages,
  onKeep,
  onExclude,
  onDrillthrough,
  onClose,
}: {
  menu: PointMenu;
  pages: DashboardPage[];
  onKeep: () => void;
  onExclude: () => void;
  onDrillthrough: (page: DashboardPage) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => !box.current?.contains(event.target as Node) && onClose();
    const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);
  const fields = new Set(menu.filters.map((filter) => filter.field));
  const targets = pages.filter((page) => page.type === 'drillthrough' && (page.drillthroughFields ?? []).some((field) => fields.has(field)));
  const canExclude = menu.filters.every((filter) => filter.op === 'in');
  return (
    <div ref={box} className="dash-popover menu dash-context" style={{ left: menu.x, top: menu.y }} role="menu" data-testid="point-menu">
      {targets.map((page) => (
        <button key={page.id} type="button" role="menuitem" onClick={() => onDrillthrough(page)} data-testid={`drillthrough-${page.id}`}>
          Drill through ▸ {page.name}
        </button>
      ))}
      <button type="button" role="menuitem" onClick={onKeep} data-testid="keep-only">
        Keep only
      </button>
      <button type="button" role="menuitem" disabled={!canExclude} onClick={onExclude} data-testid="exclude">
        Exclude
      </button>
    </div>
  );
}

/** A report-page tooltip: a small page drawn for the hovered member. */
export function TooltipCard({
  spec,
  page,
  filters,
  theme,
  mode,
  dashboardId,
  x,
  y,
}: {
  spec: DashboardSpec;
  page: DashboardPage;
  filters: DashboardFilter[];
  theme: DashboardTheme | undefined;
  mode: 'light' | 'dark';
  dashboardId: string;
  x: number;
  y: number;
}) {
  const visualize = useRepository('visualize');
  const visuals = page.visuals.filter((visual) => !visual.hidden && visual.type !== 'text');
  const rendered = useQuery({
    queryKey: ['visualize', 'tooltip', page.id, filters, mode],
    queryFn: ({ signal }) => visualize.renderVisuals({ visuals, filters: [...(spec.filters ?? []), ...(page.filters ?? []), ...filters], theme: spec.theme, mode, dashboardId }, signal),
    staleTime: 60_000,
  });
  const width = Math.min(page.canvas?.width ?? 320, 420);
  const height = Math.min(page.canvas?.height ?? 240, 320);
  const scale = width / PAGE_WIDTH;
  const outputs = Object.fromEntries((rendered.data?.visuals ?? []).map((output) => [output.id, output]));
  const kpis = kpiIndexes(page.visuals);
  const left = Math.min(x + 16, window.innerWidth - width - 12);
  const top = Math.min(y + 16, window.innerHeight - height - 12);
  return (
    <div className={`dash-canvas dash-tooltip-page ${mode}`} style={{ ...themeStyle(theme, mode, 'compact'), left, top, width, height }} data-testid="tooltip-page">
      <div className="dash-grid" style={{ height: '100%' }}>
        {page.visuals
          .filter((visual) => !visual.hidden)
          .map((visual) => (
            <Tile
              key={visual.id}
              visual={visual}
              output={outputs[visual.id]}
              theme={theme}
              kpiIndex={kpis[visual.id] ?? -1}
              style={{ left: `${(visual.layout.x / 24) * 100}%`, width: `${(visual.layout.w / 24) * 100}%`, top: visual.layout.y * ROW_PX * scale, height: visual.layout.h * ROW_PX * scale }}
              onSelect={() => undefined}
            />
          ))}
      </div>
    </div>
  );
}

/** Focus mode: one visual filling the screen (Esc or ✕ to return). */
export function FocusOverlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="dash-focus" role="dialog" aria-label="Focus mode" data-testid="focus-mode">
      <button type="button" className="dash-focus-close" onClick={onClose} aria-label="Close focus mode">
        <X size={16} />
      </button>
      {children}
    </div>
  );
}
