import { beforeEach, describe, expect, it } from 'vitest';
import type { DashboardRecord, DashboardSpec, DashboardVisual } from '@/lib/data';
import { addPage, addVisual, align, cloneVisuals, distribute, duplicatePage, expandGroups, freeSpot, group, layer, moveBy, movePage, removePage, setFormat, ungroup } from './actions';
import { suggestType, wellFor, wellItem } from './catalog';
import { useEditor } from './store';

const visual = (id: string, x: number, y: number, w = 4, h = 4, extra: Partial<DashboardVisual> = {}): DashboardVisual => ({
  id,
  type: 'column',
  layout: { x, y, w, h, z: 0 },
  data: { datasetId: 'd', wells: {} },
  ...extra,
});

const spec = (visuals: DashboardVisual[]): DashboardSpec => ({ theme: 'executive', mode: 'system', pages: [{ id: 'p', name: 'Page', visuals }] });
const layouts = (s: DashboardSpec) => Object.fromEntries(s.pages[0]!.visuals.map((v) => [v.id, v.layout]));

describe('arrange', () => {
  it('aligns and distributes on the grid', () => {
    const base = spec([visual('a', 0, 0), visual('b', 6, 3), visual('c', 18, 1)]);
    expect(Object.values(layouts(align(base, 'p', ['a', 'b', 'c'], 'top'))).map((l) => l.y)).toEqual([0, 0, 0]);
    expect(layouts(align(base, 'p', ['a', 'b', 'c'], 'right')).a!.x).toBe(18);
    const spread = layouts(distribute(base, 'p', ['a', 'b', 'c'], 'horizontal'));
    expect([spread.a!.x, spread.b!.x, spread.c!.x]).toEqual([0, 9, 18]);
  });

  it('layers, groups and moves', () => {
    const base = spec([visual('a', 0, 0), visual('b', 4, 0), visual('c', 8, 0)]);
    const front = layouts(layer(base, 'p', ['a'], 'front'));
    expect(front.a!.z).toBeGreaterThan(front.c!.z!);
    const grouped = group(base, 'p', ['a', 'b']);
    expect(expandGroups(grouped.pages[0], ['a'])).toEqual(['a', 'b']);
    expect(expandGroups(ungroup(grouped, 'p', ['a', 'b']).pages[0], ['a'])).toEqual(['a']);
    const moved = layouts(moveBy(base, 'p', ['c'], 30, -5));
    expect(moved.c).toMatchObject({ x: 20, y: 0 }); // kept on the page
  });
});

describe('adding and copying', () => {
  it('places new visuals in the first free spot and copies with fresh ids', () => {
    const base = spec([visual('a', 0, 0, 12, 4)]);
    expect(freeSpot(base.pages[0]!, 8, 4)).toEqual({ x: 12, y: 0 });
    const { spec: next, id } = addVisual(base, 'p', { id: 'n', type: 'kpi', data: { datasetId: 'd', wells: {} } }, { w: 4, h: 5 });
    expect(id).toBe('n');
    expect(layouts(next).n).toMatchObject({ x: 12, y: 0, w: 4, h: 5 });
    const grouped = group(spec([visual('a', 0, 0), visual('b', 4, 0)]), 'p', ['a', 'b']).pages[0]!.visuals;
    const copies = cloneVisuals(grouped);
    expect(copies.map((v) => v.id)).not.toContain('a');
    expect(copies[0]!.groupId).toBe(copies[1]!.groupId);
    expect(copies[0]!.groupId).not.toBe(grouped[0]!.groupId);
  });

  it('manages pages', () => {
    const base = spec([visual('a', 0, 0)]);
    const added = addPage(base);
    expect(added.spec.pages).toHaveLength(2);
    const copied = duplicatePage(added.spec, 'p');
    expect(copied.spec.pages[1]!.name).toBe('Page (copy)');
    expect(copied.spec.pages[1]!.visuals[0]!.id).not.toBe('a');
    expect(movePage(copied.spec, added.id, -2).pages[0]!.id).toBe(added.id);
    expect(removePage(base, 'p').pages).toHaveLength(1); // the last page stays
  });

  it('sets and clears format keys', () => {
    const styled = setFormat(visual('a', 0, 0), 'legend', 'show', false);
    expect(styled.format?.legend).toEqual({ show: false });
    expect(setFormat(styled, 'legend', 'show', undefined).format?.legend).toBeUndefined();
  });
});

describe('fields and suggestions', () => {
  it('routes fields to wells and suggests a visual type', () => {
    const empty = visual('a', 0, 0, 4, 4, { type: 'column' });
    expect(wellFor(empty, 'numeric')?.key).toBe('values');
    expect(wellFor(empty, 'category')?.key).toBe('category');
    expect(wellItem('satisfaction', 'numeric', wellFor(empty, 'numeric')!)).toEqual({ field: 'satisfaction', agg: 'avg' });
    expect(wellItem('date', 'datetime', wellFor(empty, 'datetime')!)).toEqual({ field: 'date', grain: 'month' });
    const kinds = { date: 'datetime', region: 'categorical', revenue: 'numeric', country: 'categorical' };
    const withWells = (wells: DashboardVisual['data']['wells']) => ({ ...empty, data: { datasetId: 'd', wells } });
    expect(suggestType(withWells({ values: [{ field: 'revenue' }] }), kinds)).toBe('card');
    expect(suggestType(withWells({ category: [{ field: 'date', grain: 'month' }], values: [{ field: 'revenue' }] }), kinds)).toBe('line');
    expect(suggestType(withWells({ category: [{ field: 'country' }], values: [{ field: 'revenue' }] }), kinds)).toBe('map');
    expect(suggestType(withWells({ category: [{ field: 'region' }], legend: [{ field: 'country' }], values: [{ field: 'revenue' }] }), kinds)).toBe('matrix');
  });
});

describe('editor store', () => {
  beforeEach(() => {
    const record = { id: 'x', name: 'D', version: 3, role: 'owner', spec: spec([visual('a', 0, 0)]) } as unknown as DashboardRecord;
    useEditor.getState().load(record);
  });

  it('undoes, redoes and merges rapid edits into one step', () => {
    const { change } = useEditor.getState();
    change((s) => moveBy(s, 'p', ['a'], 1, 0));
    change((s) => moveBy(s, 'p', ['a'], 1, 0), { merge: 'nudge' });
    change((s) => moveBy(s, 'p', ['a'], 1, 0), { merge: 'nudge' });
    expect(useEditor.getState().past).toHaveLength(2);
    expect(useEditor.getState().saveState).toBe('dirty');
    useEditor.getState().undo();
    expect(layouts(useEditor.getState().spec!).a!.x).toBe(1);
    useEditor.getState().redo();
    expect(layouts(useEditor.getState().spec!).a!.x).toBe(3);
  });

  it('keeps edits made during a save unsaved', () => {
    const state = useEditor.getState();
    state.change((s) => moveBy(s, 'p', ['a'], 1, 0));
    state.markSaving();
    useEditor.getState().change((s) => moveBy(s, 'p', ['a'], 1, 0));
    useEditor.getState().markSaved({ id: 'x', name: 'D', version: 4 } as DashboardRecord);
    expect(useEditor.getState().saveState).toBe('dirty');
    expect(useEditor.getState().version).toBe(4);
  });
});
