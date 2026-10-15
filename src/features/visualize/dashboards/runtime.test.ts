import { describe, expect, it } from 'vitest';
import type { DashboardSpec, DashboardVisual } from '@/lib/data';
import { syncGroupOf, syncSlicer } from './editor/actions';
import { drilled, filterCards, hierarchyOf, mergeMembers, slicerKey } from './runtime';
import { slicerFilter } from './slicers';

const chart = (wells: DashboardVisual['data']['wells'], type: DashboardVisual['type'] = 'column'): DashboardVisual => ({
  id: 'v',
  type,
  layout: { x: 0, y: 0, w: 4, h: 4 },
  data: { datasetId: 'd', wells },
});

describe('drill', () => {
  it('drills dates through year › quarter › month › day and fields through their order', () => {
    const monthly = chart({ category: [{ field: 'date', grain: 'month' }], values: [{ field: 'revenue' }] });
    const hierarchy = hierarchyOf(monthly)!;
    expect(hierarchy.levels.map((level) => level.grain)).toEqual(['year', 'quarter', 'month', 'day']);
    expect(hierarchy.start).toBe(2);
    const intoMarch = { field: 'date', op: 'between', value: ['2025-03-01T00:00:00', '2025-03-31T23:59:59'] };
    const day = drilled(monthly, { level: 3, path: [{ level: 2, filter: intoMarch }] });
    expect(day.data.wells.category).toEqual([{ field: 'date', grain: 'day' }]);
    expect(day.data.filters).toEqual([intoMarch]);
    const backUp = drilled(monthly, { level: 1, path: [{ level: 2, filter: intoMarch }] });
    expect(backUp.data.filters).toEqual([]);
    const geo = chart({ category: [{ field: 'region' }, { field: 'country' }], values: [{ field: 'revenue' }] });
    expect(hierarchyOf(geo)!.levels.map((l) => l.field)).toEqual(['region', 'country']);
    expect(hierarchyOf(chart({ category: [{ field: 'region' }] }))).toBeNull();
    expect(hierarchyOf(chart({ values: [{ field: 'revenue' }] }, 'kpi'))).toBeNull();
  });

  it('merges Ctrl-clicked members into one filter', () => {
    const east = [{ field: 'region', op: 'in', value: ['East'] }];
    const west = [{ field: 'region', op: 'in', value: ['West'] }];
    expect(mergeMembers([east, west])).toEqual([{ field: 'region', op: 'in', value: ['East', 'West'] }]);
    const months = [[{ field: 'date', op: 'between', value: ['a', 'b'] }], [{ field: 'date', op: 'between', value: ['c', 'd'] }]];
    expect(mergeMembers(months)[0]!.op).toBe('or');
  });
});

describe('slicers', () => {
  const slicer = chart({ category: [{ field: 'region' }] }, 'slicer');
  it('turns every style into a filter', () => {
    expect(slicerFilter(slicer, undefined, undefined)).toBeNull();
    expect(slicerFilter(slicer, undefined, { values: ['East'] })).toMatchObject({ field: 'region', op: 'in', value: ['East'] });
    expect(slicerFilter(slicer, undefined, { input: { op: 'contains', text: 'ea' } })).toMatchObject({ op: 'contains', value: 'ea' });
    expect(slicerFilter(slicer, undefined, { relative: { mode: 'last', n: 3, unit: 'month' } })).toMatchObject({ op: 'relative' });
    const range = { field: 'units', label: 'Units', range: { min: 1, max: 9 } };
    expect(slicerFilter(slicer, range, { from: '2', to: '5' })).toMatchObject({ field: 'units', op: 'between', value: [2, 5] });
    const tree = { field: 'region', label: 'Region', fields: ['region', 'country'] };
    expect(slicerFilter(slicer, tree, { paths: [['East'], ['West', 'Ghana']] })).toMatchObject({
      op: 'or',
      value: [
        { field: 'region', op: 'in', value: ['East'] },
        { field: 'country', op: 'in', value: ['Ghana'] },
      ],
    });
  });

  it('syncs a slicer onto other pages, visible or hidden, and back off', () => {
    const spec: DashboardSpec = {
      theme: 'executive',
      mode: 'system',
      pages: [
        { id: 'a', name: 'A', visuals: [slicer] },
        { id: 'b', name: 'B', visuals: [] },
      ],
    };
    const synced = syncSlicer(spec, 'a', 'v', 'b', true, false);
    const group = syncGroupOf(synced.pages[0]!.visuals[0]);
    const copy = synced.pages[1]!.visuals[0]!;
    expect(group).toBeTruthy();
    expect(syncGroupOf(copy)).toBe(group);
    expect(copy.hidden).toBe(true);
    expect(slicerKey(copy)).toBe(slicerKey(synced.pages[0]!.visuals[0]!));
    expect(syncSlicer(synced, 'a', 'v', 'b', true, true).pages[1]!.visuals[0]!.hidden).toBe(false);
    expect(syncSlicer(synced, 'a', 'v', 'b', false, false).pages[1]!.visuals).toHaveLength(0);
  });
});

describe('filter cards', () => {
  it('lists dashboard, page and visual filters with stable keys', () => {
    const spec: DashboardSpec = {
      theme: 'executive',
      mode: 'system',
      filters: [{ id: 'f1', field: 'region', op: 'in', value: ['East'] }],
      pages: [{ id: 'p', name: 'P', filters: [{ field: 'channel', op: 'in', value: [] }], visuals: [{ ...slicerVisual(), data: { datasetId: 'd', wells: {}, filters: [{ id: 'f3', field: 'units', op: 'gt', value: 2 }] } }] }],
    };
    expect(filterCards(spec, spec.pages[0]).map((card) => card.key)).toEqual(['dashboard:f1', 'page:p:0', 'visual:v:f3']);
  });
});

function slicerVisual(): DashboardVisual {
  return chart({}, 'table');
}
