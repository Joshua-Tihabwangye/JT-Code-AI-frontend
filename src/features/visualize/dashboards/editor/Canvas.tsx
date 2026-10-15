import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDownWideNarrow, Ban, Copy, Filter, Highlighter, List, Paintbrush, Tag, Trash2 } from 'lucide-react';
import type { DashboardTheme, DashboardVisual, DashboardVisualType, VisualOutput } from '@/lib/data';
import { interaction, kpiIndexes, PAGE_WIDTH, ROW_PX, Tile } from '../runtime';
import type { LocalContext } from '../local';
import type { SlicerValue } from '../visuals';
import { clamp, expandGroups, mapVisuals, pageHeightRows, pasteVisuals, removeVisuals, round, setFormat } from './actions';
import { COMPATIBLE, retype, VISUAL_BY_TYPE } from './catalog';
import { currentPage, useEditor } from './store';

type Box = { x: number; y: number; w: number; h: number };
type Direction = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Direction[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const GUIDE_REACH = 0.4;

interface Guides {
  x: number[];
  y: number[];
}

function bounds(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/** Snap a moving box to other visuals' edges and centres; returns the shift and the guide lines. */
function smartGuides(box: Box, others: Box[]): { dx: number; dy: number; guides: Guides } {
  const xs = (b: Box) => [b.x, b.x + b.w / 2, b.x + b.w];
  const ys = (b: Box) => [b.y, b.y + b.h / 2, b.y + b.h];
  let best = { dx: 0, dy: 0, gx: Infinity, gy: Infinity };
  const guides: Guides = { x: [], y: [] };
  for (const other of others) {
    for (const target of xs(other))
      for (const edge of xs(box)) {
        const gap = target - edge;
        if (Math.abs(gap) < GUIDE_REACH && Math.abs(gap) < Math.abs(best.gx)) best = { ...best, dx: gap, gx: gap };
      }
    for (const target of ys(other))
      for (const edge of ys(box)) {
        const gap = target - edge;
        if (Math.abs(gap) < GUIDE_REACH && Math.abs(gap) < Math.abs(best.gy)) best = { ...best, dy: gap, gy: gap };
      }
  }
  const moved = { ...box, x: box.x + best.dx, y: box.y + best.dy };
  for (const other of others) {
    for (const target of xs(other)) if (xs(moved).some((edge) => Math.abs(edge - target) < 0.01)) guides.x.push(target);
    for (const target of ys(other)) if (ys(moved).some((edge) => Math.abs(edge - target) < 0.01)) guides.y.push(target);
  }
  // One line per position (several visuals often share an edge; duplicate keys would leave lines behind).
  return { dx: best.dx, dy: best.dy, guides: { x: [...new Set(guides.x)], y: [...new Set(guides.y)] } };
}

export function EditorCanvas({
  outputs,
  theme,
  mode,
  width,
  slicerValue,
  onSlicerChange,
  onFormat,
  interactionSource,
  local,
  painting = false,
}: {
  outputs: Record<string, VisualOutput>;
  theme: DashboardTheme | undefined;
  mode: 'light' | 'dark';
  width: number;
  slicerValue: (visual: DashboardVisual) => SlicerValue;
  onSlicerChange: (visual: DashboardVisual, value: SlicerValue) => void;
  onFormat: () => void;
  /** Edit interactions: how clicking this visual affects each other visual. */
  interactionSource?: DashboardVisual;
  /** Parameter controls, buttons and navigators (they work in the editor too). */
  local?: LocalContext;
  /** Format painter armed: the next visual clicked takes the copied formatting. */
  painting?: boolean;
}) {
  const state = useEditor();
  const { selected, select, change, checkpoint, snap, gridlines } = state;
  const page = currentPage(state);
  const grid = useRef<HTMLDivElement>(null);
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] });
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  if (!page) return null;
  const pageId = page.id;
  const colWidth = width / 24;
  const rowHeight = (width / PAGE_WIDTH) * ROW_PX;
  const unit = snap ? 1 : 0.25;
  const rows = pageHeightRows(page) + 6;
  const kpis = kpiIndexes(page.visuals);
  const visible = page.visuals.filter((visual) => !visual.hidden);

  const toGrid = (event: { clientX: number; clientY: number }) => {
    const rect = grid.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / colWidth, y: (event.clientY - rect.top) / rowHeight };
  };

  function track(onMove: (event: PointerEvent) => void, onEnd: (event: PointerEvent) => void) {
    let frame = 0;
    let latest: PointerEvent | null = null;
    // Moves are applied once per animation frame, so a fast drag never queues stale updates.
    const move = (event: PointerEvent) => {
      latest = event;
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (latest) onMove(latest);
        });
      }
    };
    // Capture phase: charts inside tiles stop pointer events from bubbling, so listen before them.
    const up = (event: PointerEvent) => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      if (frame) cancelAnimationFrame(frame);
      if (latest) onMove(latest);
      onEnd(event);
      setGuides({ x: [], y: [] });
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }

  function startMove(event: ReactPointerEvent, visual: DashboardVisual) {
    if (event.button !== 0 || (event.target as HTMLElement).closest('input, select, textarea, [data-no-drag], .dash-handle')) return;
    event.stopPropagation();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    let ids = selected.includes(visual.id) && !additive ? selected : [visual.id];
    ids = expandGroups(page, ids);
    if (additive) select(ids, 'toggle');
    else if (!selected.includes(visual.id)) select(ids);
    const origins = new Map(page!.visuals.filter((v) => ids.includes(v.id)).map((v) => [v.id, { ...v.layout }]));
    if ([...origins.keys()].some((id) => page!.visuals.find((v) => v.id === id)?.locked)) return;
    const others = visible.filter((v) => !ids.includes(v.id)).map((v) => v.layout);
    const start = { x: event.clientX, y: event.clientY };
    let moved = false;
    track(
      (move) => {
        const px = move.clientX - start.x;
        const py = move.clientY - start.y;
        if (!moved && Math.hypot(px, py) < 4) return;
        if (!moved) checkpoint();
        moved = true;
        const box = bounds([...origins.values()]);
        let dx = Math.round(px / colWidth / unit) * unit;
        let dy = Math.round(py / rowHeight / unit) * unit;
        const snapped = smartGuides({ ...box, x: box.x + dx, y: box.y + dy }, others);
        dx = clamp(dx + snapped.dx, -box.x, 24 - box.x - box.w);
        dy = Math.max(dy + snapped.dy, -box.y);
        setGuides(snapped.guides);
        change(
          (spec) =>
            mapVisuals(spec, pageId, [...origins.keys()], (v) => {
              const origin = origins.get(v.id)!;
              return { ...v, layout: { ...v.layout, x: round(origin.x + dx), y: round(origin.y + dy) } };
            }),
          { record: false },
        );
      },
      () => setGuides({ x: [], y: [] }),
    );
  }

  function startResize(event: ReactPointerEvent, visual: DashboardVisual, direction: Direction) {
    event.stopPropagation();
    event.preventDefault();
    const origin = { ...visual.layout };
    const others = visible.filter((v) => v.id !== visual.id).map((v) => v.layout);
    const start = { x: event.clientX, y: event.clientY };
    const minimum = snap ? 1 : 0.5;
    checkpoint();
    track(
      (move) => {
        const dx = Math.round((move.clientX - start.x) / colWidth / unit) * unit;
        const dy = Math.round((move.clientY - start.y) / rowHeight / unit) * unit;
        const next = { ...origin };
        if (direction.includes('e')) next.w = clamp(origin.w + dx, minimum, 24 - origin.x);
        if (direction.includes('s')) next.h = Math.max(origin.h + dy, minimum);
        if (direction.includes('w')) {
          const x = clamp(origin.x + dx, 0, origin.x + origin.w - minimum);
          next.w = origin.w + (origin.x - x);
          next.x = x;
        }
        if (direction.includes('n')) {
          const y = clamp(origin.y + dy, 0, origin.y + origin.h - minimum);
          next.h = origin.h + (origin.y - y);
          next.y = y;
        }
        // Guides for the moving edges only.
        const edges = smartGuides(next, others);
        if (direction.includes('e') && edges.dx) next.w = round(next.w + edges.dx);
        if (direction.includes('s') && edges.dy) next.h = round(next.h + edges.dy);
        setGuides(edges.guides);
        change((spec) => mapVisuals(spec, pageId, [visual.id], (v) => ({ ...v, layout: { ...v.layout, ...next } })), { record: false });
      },
      () => setGuides({ x: [], y: [] }),
    );
  }

  function startMarquee(event: ReactPointerEvent) {
    if (event.button !== 0 || event.target !== grid.current) return;
    const origin = toGrid(event);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    let moved = false;
    track(
      (move) => {
        const point = toGrid(move);
        moved = true;
        setMarquee({ x: Math.min(origin.x, point.x), y: Math.min(origin.y, point.y), w: Math.abs(point.x - origin.x), h: Math.abs(point.y - origin.y) });
      },
      (end) => {
        const point = toGrid(end);
        setMarquee(null);
        if (!moved) return select([]);
        const box = { x: Math.min(origin.x, point.x), y: Math.min(origin.y, point.y), w: Math.abs(point.x - origin.x), h: Math.abs(point.y - origin.y) };
        const hits = visible
          .filter((v) => !v.locked && v.layout.x < box.x + box.w && v.layout.x + v.layout.w > box.x && v.layout.y < box.y + box.h && v.layout.y + v.layout.h > box.y)
          .map((v) => v.id);
        select(expandGroups(page, hits), additive ? 'add' : 'replace');
      },
    );
  }

  const single = selected.length === 1 ? page.visuals.find((v) => v.id === selected[0]) : undefined;
  const gridStyle: CSSProperties = {
    height: rows * rowHeight,
    ...(gridlines
      ? {
          backgroundImage: 'linear-gradient(to right, color-mix(in srgb, var(--dash-muted) 14%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--dash-muted) 14%, transparent) 1px, transparent 1px)',
          backgroundSize: `${colWidth}px ${rowHeight}px`,
        }
      : {}),
  };

  const update = (id: string, mutate: (visual: DashboardVisual) => DashboardVisual, merge?: string) =>
    change((spec) => mapVisuals(spec, pageId, [id], mutate), merge ? { merge } : {});

  return (
    <div ref={grid} className={`dash-grid dash-edit-grid ${mode}${painting ? ' painting' : ''}`} style={gridStyle} onPointerDown={startMarquee} data-testid="editor-canvas">
      {/* The page boundary: content below it scrolls on a 16:9 page. */}
      <div className="dash-page-edge" style={{ top: pageHeightRows({ ...page, visuals: [] }) * rowHeight }} aria-hidden />
      {visible.map((visual) => {
        const isSelected = selected.includes(visual.id);
        const style: CSSProperties = {
          left: visual.layout.x * colWidth,
          top: visual.layout.y * rowHeight,
          width: visual.layout.w * colWidth,
          height: visual.layout.h * rowHeight,
          zIndex: (visual.layout.z ?? 0) + (isSelected ? 500 : 0),
        };
        const titleText = (visual.format?.title as { text?: string } | undefined)?.text ?? outputs[visual.id]?.title ?? visual.title ?? '';
        return (
          <div
            key={visual.id}
            className={`dash-edit-frame${isSelected ? ' selected' : ''}${visual.locked ? ' locked' : ''}`}
            style={style}
            onPointerDown={(event) => startMove(event, visual)}
            onDoubleClick={(event) => {
              if ((event.target as HTMLElement).closest('.dash-tile-title')) setEditingTitle(visual.id);
              else onFormat();
            }}
            data-testid={`frame-${visual.id}`}
          >
            <Tile
              visual={visual}
              output={outputs[visual.id]}
              theme={theme}
              kpiIndex={kpis[visual.id] ?? -1}
              style={{ position: 'absolute', inset: 0, padding: 'calc(var(--dash-gap) / 2)' }}
              onSelect={() => undefined}
              slicerValue={slicerValue(visual)}
              onSlicerChange={(value) => onSlicerChange(visual, value)}
              local={local}
              title={
                editingTitle === visual.id ? (
                  <input
                    autoFocus
                    className="dash-title-input"
                    defaultValue={titleText}
                    aria-label="Visual title"
                    onBlur={(event) => {
                      const text = event.target.value.trim();
                      update(visual.id, (v) => setFormat(v, 'title', 'text', text || undefined));
                      setEditingTitle('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                      if (event.key === 'Escape') setEditingTitle('');
                    }}
                  />
                ) : undefined
              }
            />
            {visual.type === 'text' && isSelected && (
              <textarea
                className="dash-text-editor"
                defaultValue={visual.text ?? ''}
                placeholder="Type text…"
                aria-label="Text"
                onBlur={(event) => update(visual.id, (v) => ({ ...v, text: event.target.value }))}
              />
            )}
            {interactionSource && interactionSource.id !== visual.id && visual.type !== 'text' && (
              <div className="dash-interact" data-no-drag onPointerDown={(event) => event.stopPropagation()} data-testid={`interact-${visual.id}`}>
                {(['filter', 'highlight', 'none'] as const).map((how) => (
                  <button
                    key={how}
                    type="button"
                    aria-pressed={interaction(interactionSource, visual) === how}
                    title={how === 'filter' ? 'Filter: show only the clicked data' : how === 'highlight' ? 'Highlight: fade the rest' : 'None: not affected'}
                    onClick={() =>
                      update(interactionSource.id, (source) => ({ ...source, interactions: { ...(source.interactions ?? {}), [visual.id]: how } }))
                    }
                    data-testid={`interact-${visual.id}-${how}`}
                  >
                    {how === 'filter' ? <Filter size={13} /> : how === 'highlight' ? <Highlighter size={13} /> : <Ban size={13} />}
                  </button>
                ))}
              </div>
            )}
            {single?.id === visual.id && !visual.locked && (
              <>
                {HANDLES.map((direction) => (
                  <span key={direction} className={`dash-handle ${direction}`} onPointerDown={(event) => startResize(event, visual, direction)} aria-hidden />
                ))}
                <MiniToolbar visual={visual} onFormat={onFormat} update={(mutate, merge) => update(visual.id, mutate, merge)} />
              </>
            )}
          </div>
        );
      })}
      {guides.x.map((x) => (
        <span key={`gx-${x}`} className="dash-guide vertical" style={{ left: x * colWidth }} aria-hidden />
      ))}
      {guides.y.map((y) => (
        <span key={`gy-${y}`} className="dash-guide horizontal" style={{ top: y * rowHeight }} aria-hidden />
      ))}
      {marquee && <span className="dash-marquee" style={{ left: marquee.x * colWidth, top: marquee.y * rowHeight, width: marquee.w * colWidth, height: marquee.h * rowHeight }} aria-hidden />}
    </div>
  );
}

/** The floating toolbar over the selected visual: type, labels, legend, sort, duplicate, delete. */
function MiniToolbar({ visual, onFormat, update }: { visual: DashboardVisual; onFormat: () => void; update: (mutate: (visual: DashboardVisual) => DashboardVisual, merge?: string) => void }) {
  const { change, select, pageId } = useEditor();
  const options = COMPATIBLE[visual.type] ?? [];
  const labels = (visual.format?.labels as { show?: boolean } | undefined)?.show;
  const legend = (visual.format?.legend as { show?: boolean } | undefined)?.show;
  const sort = (visual.format?.sort as { by?: string; dir?: string } | undefined) ?? {};
  const charts = ['bar', 'column', 'line', 'area', 'combo', 'donut', 'pie', 'treemap', 'funnel', 'waterfall', 'scatter'].includes(visual.type);
  return (
    <div className="dash-minibar" data-no-drag onPointerDown={(event) => event.stopPropagation()} data-testid="mini-toolbar">
      {options.length > 0 && (
        <select
          value={visual.type}
          onChange={(event) => update((v) => retype(v, event.target.value as DashboardVisualType))}
          aria-label="Visual type"
          data-testid="minibar-type"
        >
          <option value={visual.type}>{VISUAL_BY_TYPE[visual.type]?.label ?? visual.type}</option>
          {options.map((type) => (
            <option key={type} value={type}>
              {VISUAL_BY_TYPE[type]?.label ?? type}
            </option>
          ))}
        </select>
      )}
      {charts && (
        <>
          <button type="button" aria-pressed={labels === true} title="Data labels" onClick={() => update((v) => setFormat(v, 'labels', 'show', labels === true ? false : true))}>
            <Tag size={13} />
          </button>
          <button type="button" aria-pressed={legend !== false} title="Legend" onClick={() => update((v) => setFormat(v, 'legend', 'show', legend === false ? undefined : false))}>
            <List size={13} />
          </button>
          <button
            type="button"
            title={sort.by === 'category' ? 'Sorted by name' : sort.dir === 'asc' ? 'Sorted ascending' : 'Sorted descending'}
            onClick={() =>
              update((v) => {
                const next = !sort.by && sort.dir !== 'asc' ? { dir: 'asc' } : !sort.by ? { by: 'category', dir: 'asc' } : {};
                return { ...v, format: { ...(v.format ?? {}), sort: next } };
              })
            }
          >
            <ArrowDownWideNarrow size={13} />
          </button>
        </>
      )}
      <button type="button" title="Format" onClick={onFormat}>
        <Paintbrush size={13} />
      </button>
      <button
        type="button"
        title="Duplicate (Ctrl+D)"
        onClick={() =>
          change((spec) => {
            const result = pasteVisuals(spec, pageId, [visual]);
            queueMicrotask(() => select(result.ids));
            return result.spec;
          })
        }
      >
        <Copy size={13} />
      </button>
      <button type="button" title="Delete" onClick={() => change((spec) => removeVisuals(spec, pageId, [visual.id]))} data-testid="minibar-delete">
        <Trash2 size={13} />
      </button>
    </div>
  );
}
