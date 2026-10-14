import type { DashboardPage, DashboardSpec, DashboardVisual } from '@/lib/data';
import { pageRows } from '../runtime';
import { newId } from './catalog';

/** Pure operations on a dashboard spec (no React): every editor action goes through these. */

type Layout = DashboardVisual['layout'];

export function mapPage(spec: DashboardSpec, pageId: string, update: (page: DashboardPage) => DashboardPage): DashboardSpec {
  return { ...spec, pages: spec.pages.map((page) => (page.id === pageId ? update(page) : page)) };
}

export function mapVisuals(spec: DashboardSpec, pageId: string, ids: string[], update: (visual: DashboardVisual) => DashboardVisual): DashboardSpec {
  const wanted = new Set(ids);
  return mapPage(spec, pageId, (page) => ({ ...page, visuals: page.visuals.map((visual) => (wanted.has(visual.id) ? update(visual) : visual)) }));
}

export function updateVisual(spec: DashboardSpec, pageId: string, id: string, patch: Partial<DashboardVisual>): DashboardSpec {
  return mapVisuals(spec, pageId, [id], (visual) => ({ ...visual, ...patch }));
}

/** Set one format section key (``format.legend.show`` …); ``undefined`` removes it. */
export function setFormat(visual: DashboardVisual, section: string, key: string, value: unknown): DashboardVisual {
  const current = { ...(visual.format?.[section] ?? {}) } as Record<string, unknown>;
  if (value === undefined) delete current[key];
  else current[key] = value;
  const format = { ...(visual.format ?? {}) };
  if (Object.keys(current).length) format[section] = current;
  else delete format[section];
  return { ...visual, format };
}

/** The first free spot (top-to-bottom, left-to-right) where a ``w × h`` visual fits. */
export function freeSpot(page: DashboardPage, w: number, h: number): { x: number; y: number } {
  const overlaps = (x: number, y: number) =>
    page.visuals.some((v) => !v.hidden && x < v.layout.x + v.layout.w && x + w > v.layout.x && y < v.layout.y + v.layout.h && y + h > v.layout.y);
  for (let y = 0; y < 400; y += 1) {
    for (let x = 0; x + w <= 24; x += 1) if (!overlaps(x, y)) return { x, y };
  }
  return { x: 0, y: Math.max(0, ...page.visuals.map((v) => v.layout.y + v.layout.h)) };
}

export function addVisual(spec: DashboardSpec, pageId: string, visual: Omit<DashboardVisual, 'layout'> & { layout?: Partial<Layout> }, size: { w: number; h: number }): { spec: DashboardSpec; id: string } {
  const page = spec.pages.find((item) => item.id === pageId)!;
  const spot = visual.layout?.x != null && visual.layout.y != null ? { x: visual.layout.x, y: visual.layout.y } : freeSpot(page, size.w, size.h);
  const z = Math.max(0, ...page.visuals.map((v) => v.layout.z ?? 0)) + 1;
  const created: DashboardVisual = { ...visual, layout: { ...spot, w: size.w, h: size.h, z } };
  return { spec: mapPage(spec, pageId, (p) => ({ ...p, visuals: [...p.visuals, created] })), id: created.id };
}

export function removeVisuals(spec: DashboardSpec, pageId: string, ids: string[]): DashboardSpec {
  const gone = new Set(ids);
  return mapPage(spec, pageId, (page) => ({ ...page, visuals: page.visuals.filter((visual) => !gone.has(visual.id)) }));
}

/** Copies placed one grid step down-right, with fresh ids (groups keep together under a new id). */
export function cloneVisuals(visuals: DashboardVisual[], offset = 1): DashboardVisual[] {
  const groups = new Map<string, string>();
  return visuals.map((visual) => {
    const groupId = visual.groupId ? (groups.get(visual.groupId) ?? groups.set(visual.groupId, newId('group')).get(visual.groupId)) : undefined;
    return {
      ...structuredClone(visual),
      id: newId(visual.type),
      ...(groupId ? { groupId } : {}),
      layout: { ...visual.layout, x: Math.min(visual.layout.x + offset, 24 - visual.layout.w), y: visual.layout.y + offset },
    };
  });
}

export function pasteVisuals(spec: DashboardSpec, pageId: string, visuals: DashboardVisual[], offset = 1): { spec: DashboardSpec; ids: string[] } {
  const copies = cloneVisuals(visuals, offset);
  return { spec: mapPage(spec, pageId, (page) => ({ ...page, visuals: [...page.visuals, ...copies] })), ids: copies.map((v) => v.id) };
}

export type AlignOp = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export function align(spec: DashboardSpec, pageId: string, ids: string[], op: AlignOp): DashboardSpec {
  const page = spec.pages.find((item) => item.id === pageId);
  const chosen = page?.visuals.filter((visual) => ids.includes(visual.id)) ?? [];
  if (chosen.length < 2) return spec;
  const left = Math.min(...chosen.map((v) => v.layout.x));
  const right = Math.max(...chosen.map((v) => v.layout.x + v.layout.w));
  const top = Math.min(...chosen.map((v) => v.layout.y));
  const bottom = Math.max(...chosen.map((v) => v.layout.y + v.layout.h));
  return mapVisuals(spec, pageId, ids, (visual) => {
    const l = visual.layout;
    const next = { ...l };
    if (op === 'left') next.x = left;
    if (op === 'right') next.x = right - l.w;
    if (op === 'center') next.x = round((left + right) / 2 - l.w / 2);
    if (op === 'top') next.y = top;
    if (op === 'bottom') next.y = bottom - l.h;
    if (op === 'middle') next.y = round((top + bottom) / 2 - l.h / 2);
    return { ...visual, layout: next };
  });
}

/** Equal gaps between three or more visuals, horizontally or vertically. */
export function distribute(spec: DashboardSpec, pageId: string, ids: string[], axis: 'horizontal' | 'vertical'): DashboardSpec {
  const page = spec.pages.find((item) => item.id === pageId);
  const chosen = [...(page?.visuals.filter((visual) => ids.includes(visual.id)) ?? [])];
  if (chosen.length < 3) return spec;
  const [pos, size] = axis === 'horizontal' ? (['x', 'w'] as const) : (['y', 'h'] as const);
  chosen.sort((a, b) => a.layout[pos] - b.layout[pos]);
  const start = chosen[0]!.layout[pos];
  const end = chosen[chosen.length - 1]!.layout[pos] + chosen[chosen.length - 1]!.layout[size];
  const used = chosen.reduce((total, v) => total + v.layout[size], 0);
  const gap = (end - start - used) / (chosen.length - 1);
  let cursor = start;
  const positions = new Map<string, number>();
  for (const visual of chosen) {
    positions.set(visual.id, round(cursor));
    cursor += visual.layout[size] + gap;
  }
  return mapVisuals(spec, pageId, ids, (visual) => ({ ...visual, layout: { ...visual.layout, [pos]: positions.get(visual.id) ?? visual.layout[pos] } }));
}

export function matchSize(spec: DashboardSpec, pageId: string, ids: string[], dimension: 'w' | 'h', from: string): DashboardSpec {
  const reference = spec.pages.find((item) => item.id === pageId)?.visuals.find((visual) => visual.id === from);
  if (!reference) return spec;
  return mapVisuals(spec, pageId, ids, (visual) => ({ ...visual, layout: { ...visual.layout, [dimension]: reference.layout[dimension] } }));
}

export type LayerOp = 'front' | 'back' | 'forward' | 'backward';

export function layer(spec: DashboardSpec, pageId: string, ids: string[], op: LayerOp): DashboardSpec {
  const page = spec.pages.find((item) => item.id === pageId);
  if (!page) return spec;
  const order = [...page.visuals].sort((a, b) => (a.layout.z ?? 0) - (b.layout.z ?? 0)).map((visual) => visual.id);
  const moving = order.filter((id) => ids.includes(id));
  let rest = order.filter((id) => !ids.includes(id));
  if (op === 'front') rest = [...rest, ...moving];
  else if (op === 'back') rest = [...moving, ...rest];
  else {
    const anchor = op === 'forward' ? Math.max(...moving.map((id) => order.indexOf(id))) : Math.min(...moving.map((id) => order.indexOf(id)));
    const neighbour = order[anchor + (op === 'forward' ? 1 : -1)];
    const at = neighbour ? rest.indexOf(neighbour) + (op === 'forward' ? 1 : 0) : op === 'forward' ? rest.length : 0;
    rest.splice(at, 0, ...moving);
  }
  const z = new Map(rest.map((id, index) => [id, index]));
  return mapPage(spec, pageId, (p) => ({ ...p, visuals: p.visuals.map((visual) => ({ ...visual, layout: { ...visual.layout, z: z.get(visual.id) ?? 0 } })) }));
}

export function group(spec: DashboardSpec, pageId: string, ids: string[]): DashboardSpec {
  if (ids.length < 2) return spec;
  const groupId = newId('group');
  return mapVisuals(spec, pageId, ids, (visual) => ({ ...visual, groupId }));
}

export function ungroup(spec: DashboardSpec, pageId: string, ids: string[]): DashboardSpec {
  return mapVisuals(spec, pageId, ids, (visual) => {
    const copy = { ...visual };
    delete copy.groupId;
    return copy;
  });
}

/** Selecting one member of a group selects the whole group (like Power BI's selection pane). */
export function expandGroups(page: DashboardPage | undefined, ids: string[]): string[] {
  if (!page) return ids;
  const groups = new Set(page.visuals.filter((visual) => ids.includes(visual.id) && visual.groupId).map((visual) => visual.groupId));
  return page.visuals.filter((visual) => ids.includes(visual.id) || (visual.groupId && groups.has(visual.groupId))).map((visual) => visual.id);
}

export function moveBy(spec: DashboardSpec, pageId: string, ids: string[], dx: number, dy: number): DashboardSpec {
  return mapVisuals(spec, pageId, ids, (visual) => ({
    ...visual,
    layout: { ...visual.layout, x: clamp(round(visual.layout.x + dx), 0, 24 - visual.layout.w), y: Math.max(0, round(visual.layout.y + dy)) },
  }));
}

// --- Pages ---------------------------------------------------------------------------------------

export function addPage(spec: DashboardSpec, name?: string): { spec: DashboardSpec; id: string } {
  const id = newId('page');
  const page: DashboardPage = { id, name: name ?? `Page ${spec.pages.length + 1}`, visuals: [], canvas: { preset: '16:9', width: 1280, height: 720 } };
  return { spec: { ...spec, pages: [...spec.pages, page] }, id };
}

export function duplicatePage(spec: DashboardSpec, pageId: string): { spec: DashboardSpec; id: string } {
  const source = spec.pages.find((page) => page.id === pageId)!;
  const id = newId('page');
  const copy: DashboardPage = { ...structuredClone(source), id, name: `${source.name} (copy)`.slice(0, 60), visuals: cloneVisuals(source.visuals, 0) };
  const index = spec.pages.indexOf(source);
  return { spec: { ...spec, pages: [...spec.pages.slice(0, index + 1), copy, ...spec.pages.slice(index + 1)] }, id };
}

export function removePage(spec: DashboardSpec, pageId: string): DashboardSpec {
  return spec.pages.length > 1 ? { ...spec, pages: spec.pages.filter((page) => page.id !== pageId) } : spec;
}

export function movePage(spec: DashboardSpec, pageId: string, delta: number): DashboardSpec {
  const pages = [...spec.pages];
  const from = pages.findIndex((page) => page.id === pageId);
  const to = clamp(from + delta, 0, pages.length - 1);
  const [page] = pages.splice(from, 1);
  pages.splice(to, 0, page!);
  return { ...spec, pages };
}

export const CANVAS_PRESETS: Record<string, { width: number; height: number; label: string }> = {
  '16:9': { width: 1280, height: 720, label: '16:9 (1280 × 720)' },
  '4:3': { width: 1280, height: 960, label: '4:3 (1280 × 960)' },
  letter: { width: 1280, height: 1656, label: 'Letter (portrait)' },
  'fit-width': { width: 1280, height: 720, label: 'Fit to width (grows)' },
};

export function pageHeightRows(page: DashboardPage): number {
  const content = Math.max(0, ...page.visuals.map((visual) => visual.layout.y + visual.layout.h));
  return page.canvas?.preset === 'fit-width' ? Math.max(content, pageRows(page)) : Math.max(pageRows(page), content);
}

export function round(value: number): number {
  return Math.round(value * 4) / 4;
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
