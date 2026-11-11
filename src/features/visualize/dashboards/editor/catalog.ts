import {
  AreaChart,
  BarChart3,
  BarChartHorizontal,
  BarChart4,
  Code2,
  Compass,
  Filter,
  MousePointerClick,
  SlidersVertical,
  Gauge,
  Grid3x3,
  Hash,
  LayoutGrid,
  LineChart,
  Map,
  PieChart,
  ScatterChart,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Type,
  type LucideIcon,
} from 'lucide-react';
import i18n from '@/i18n/config';
import type { ColumnProfile, DashboardFieldRef, DashboardVisual, DashboardVisualType, DashboardWell } from '@/lib/data';

export type FieldKind = 'numeric' | 'datetime' | 'category' | 'any';

export interface WellSpec {
  key: DashboardWell;
  /** i18n key of the well's name; `label` is that name in the chosen language. */
  labelKey: string;
  readonly label: string;
  accepts: FieldKind[];
  max: number;
  /** Values wells aggregate (sum, average, …); category wells group. */
  measure: boolean;
}

/** Insert-menu groups (identifiers; `labelKey` is the title shown). */
export type VisualGroup = 'Cards' | 'Charts' | 'Tables' | 'Slicers' | 'Other';
export const VISUAL_GROUPS: { id: VisualGroup; labelKey: string }[] = [
  { id: 'Cards', labelKey: 'visualize.catalog.groups.cards' },
  { id: 'Charts', labelKey: 'visualize.catalog.groups.charts' },
  { id: 'Tables', labelKey: 'visualize.catalog.groups.tables' },
  { id: 'Slicers', labelKey: 'visualize.catalog.groups.slicers' },
  { id: 'Other', labelKey: 'visualize.catalog.groups.other' },
];

export interface VisualSpec {
  type: DashboardVisualType;
  /** i18n key of the visual's name; `label` is that name in the chosen language. */
  labelKey: string;
  readonly label: string;
  icon: LucideIcon;
  group: VisualGroup;
  size: { w: number; h: number };
  wells: WellSpec[];
}

/** `label` is translated each time it is read (never at import), so it follows the chosen language. */
function labelled<T extends { labelKey: string }>(item: T): T & { readonly label: string } {
  return Object.defineProperty(item, 'label', { get: () => i18n.t(item.labelKey), enumerable: true }) as T & { readonly label: string };
}
/** A `[value, label, labelKey]` option whose label is translated when read. */
function option<V extends string>(value: V, labelKey: string): [V, string, string] {
  const tuple = [value, '', labelKey] as [V, string, string];
  return Object.defineProperty(tuple, 1, { get: () => i18n.t(labelKey), enumerable: true });
}

const W = 'visualize.catalog.wells.';
const well = (key: DashboardWell, label: string, accepts: FieldKind[], max: number, measure: boolean): WellSpec => labelled({ key, labelKey: W + label, accepts, max, measure });
const category = (label = 'categoryX', max = 1, accepts: FieldKind[] = ['category', 'datetime', 'numeric']): WellSpec => well('category', label, accepts, max, false);
const values = (label = 'values', max = 6): WellSpec => well('values', label, ['numeric', 'category', 'datetime', 'any'], max, true);
const legend = () => well('legend', 'legend', ['category'], 1, false);
const multiples = () => well('smallMultiples', 'smallMultiples', ['category', 'datetime'], 1, false);
const target = () => well('target', 'target', ['numeric'], 1, true);
const visual = (type: DashboardVisualType, icon: LucideIcon, group: VisualGroup, size: { w: number; h: number }, wells: WellSpec[]): VisualSpec =>
  labelled({ type, labelKey: `visualize.catalog.visuals.${type}`, icon, group, size, wells });

export const VISUALS: VisualSpec[] = [
  visual('kpi', Hash, 'Cards', { w: 4, h: 5 }, [values('value', 1), target(), category('trendOver', 1, ['datetime'])]),
  visual('card', Hash, 'Cards', { w: 4, h: 4 }, [values('value', 1)]),
  visual('multi_card', LayoutGrid, 'Cards', { w: 8, h: 4 }, [values('values', 6)]),
  visual('summary', Sparkles, 'Cards', { w: 8, h: 6 }, [values('measure', 1), category('breakDownBy')]),
  visual('gauge', Gauge, 'Cards', { w: 6, h: 8 }, [values('value', 1), target()]),
  visual('column', BarChart3, 'Charts', { w: 8, h: 10 }, [category(), values(), legend(), multiples()]),
  visual('bar', BarChartHorizontal, 'Charts', { w: 8, h: 10 }, [category('categoryY'), values(), legend(), multiples()]),
  visual('line', LineChart, 'Charts', { w: 12, h: 10 }, [category('xAxis'), values(), legend(), multiples()]),
  visual('area', AreaChart, 'Charts', { w: 12, h: 10 }, [category('xAxis'), values(), legend(), multiples()]),
  visual('combo', BarChart4, 'Charts', { w: 12, h: 10 }, [category(), values('columns', 2), well('secondaryValues', 'secondLine', ['numeric', 'any'], 2, true)]),
  visual('donut', PieChart, 'Charts', { w: 8, h: 10 }, [category('slices'), values('value', 1)]),
  visual('pie', PieChart, 'Charts', { w: 8, h: 10 }, [category('slices'), values('value', 1)]),
  visual('treemap', Grid3x3, 'Charts', { w: 8, h: 10 }, [category('groups'), values('size', 1)]),
  visual('funnel', Filter, 'Charts', { w: 8, h: 10 }, [category('stages'), values('value', 1)]),
  visual('waterfall', BarChart3, 'Charts', { w: 12, h: 10 }, [category('steps'), values('change', 1)]),
  visual('scatter', ScatterChart, 'Charts', { w: 8, h: 10 }, [well('details', 'points', ['category'], 1, false), values('xAndY', 2), well('size', 'bubbleSize', ['numeric'], 1, true)]),
  visual('map', Map, 'Charts', { w: 8, h: 12 }, [category('country'), values('colourBy', 1)]),
  visual('chart', Shapes, 'Charts', { w: 8, h: 10 }, []),
  visual('table', Table2, 'Tables', { w: 12, h: 12 }, [category('columnsGroupBy', 4), values('values', 8)]),
  visual('matrix', Grid3x3, 'Tables', { w: 12, h: 12 }, [well('rows', 'rows', ['category', 'datetime'], 2, false), well('columns', 'columns', ['category', 'datetime'], 1, false), values('values', 1)]),
  visual('slicer', SlidersHorizontal, 'Slicers', { w: 6, h: 3 }, [well('category', 'field', ['category', 'datetime', 'numeric'], 1, false)]),
  visual('parameter', SlidersVertical, 'Slicers', { w: 6, h: 3 }, []),
  visual('text', Type, 'Other', { w: 8, h: 3 }, []),
  visual('button', MousePointerClick, 'Other', { w: 4, h: 2 }, []),
  visual('navigator', Compass, 'Other', { w: 12, h: 2 }, []),
  visual('python', Code2, 'Other', { w: 8, h: 10 }, [values('scriptFields', 12)]),
];

export const VISUAL_BY_TYPE = Object.fromEntries(VISUALS.map((visual) => [visual.type, visual])) as Record<DashboardVisualType, VisualSpec>;

/** `[value, label, labelKey]`; the label is translated when read. */
export const AGGREGATIONS: [string, string, string][] = ['sum', 'avg', 'count', 'distinct', 'min', 'max', 'median', 'std', 'first', 'last'].map((value) => option(value, `visualize.catalog.aggregations.${value}`));

export const SHOW_VALUE_AS: [string, string, string][] = (
  [
    ['none', 'value'],
    ['pct_total', 'pctTotal'],
    ['pct_row', 'pctRow'],
    ['pct_column', 'pctColumn'],
    ['running_total', 'runningTotal'],
    ['diff_prev', 'diffPrev'],
    ['pct_diff_prev', 'pctDiffPrev'],
    ['rank', 'rank'],
    ['moving_avg', 'movingAvg'],
    ['yoy_pct', 'yoyPct'],
  ] as const
).map(([value, key]) => option(value, `visualize.catalog.showValueAs.${key}`));

export const GRAINS: [NonNullable<DashboardFieldRef['grain']>, string, string][] = (['year', 'quarter', 'month', 'week', 'day'] as const).map((value) => option(value, `visualize.catalog.grains.${value}`));

/** Types a visual can switch to while keeping its fields (the mini toolbar's type picker). */
export const COMPATIBLE: Partial<Record<DashboardVisualType, DashboardVisualType[]>> = {
  column: ['bar', 'line', 'area', 'combo', 'donut', 'pie', 'treemap', 'funnel', 'waterfall', 'table'],
  bar: ['column', 'line', 'area', 'donut', 'pie', 'treemap', 'funnel', 'table'],
  line: ['area', 'column', 'bar', 'combo', 'waterfall', 'table'],
  area: ['line', 'column', 'bar', 'combo', 'table'],
  combo: ['column', 'line', 'area', 'table'],
  donut: ['pie', 'treemap', 'funnel', 'column', 'bar', 'table'],
  pie: ['donut', 'treemap', 'funnel', 'column', 'bar', 'table'],
  treemap: ['donut', 'pie', 'column', 'bar', 'table'],
  funnel: ['column', 'bar', 'donut', 'table'],
  waterfall: ['column', 'line', 'table'],
  card: ['kpi', 'gauge', 'multi_card'],
  kpi: ['card', 'gauge'],
  gauge: ['kpi', 'card'],
  multi_card: ['card', 'kpi', 'table'],
  table: ['matrix', 'column', 'bar'],
  matrix: ['table'],
};

export function fieldKind(profile: ColumnProfile | undefined): FieldKind {
  if (!profile) return 'any';
  if (profile.kind === 'numeric') return 'numeric';
  if (profile.kind === 'datetime') return 'datetime';
  return 'category';
}

/** Which well a clicked field goes to: numbers to values, dates and categories to the axis. */
export function wellFor(visual: DashboardVisual, kind: FieldKind): WellSpec | undefined {
  const spec = VISUAL_BY_TYPE[visual.type];
  if (!spec) return undefined;
  const free = (well: WellSpec) => (visual.data.wells[well.key]?.length ?? 0) < well.max;
  const ordered = kind === 'numeric' ? [...spec.wells].sort((a, b) => Number(b.measure) - Number(a.measure)) : spec.wells;
  return ordered.find((well) => free(well) && (well.accepts.includes(kind) || (kind === 'numeric' && well.measure)));
}

/** A field as a well item: measures get a sensible aggregation, dates a monthly grain. */
export function wellItem(field: string, kind: FieldKind, well: WellSpec): DashboardFieldRef {
  if (well.measure) return { field, agg: kind === 'numeric' ? (/rate|ratio|score|satisf|percent|price|discount|age/i.test(field) ? 'avg' : 'sum') : 'count' };
  if (kind === 'datetime' && well.key !== 'columns') return { field, grain: 'month' };
  return { field };
}

/** Power BI-style “auto visual”: the chart type that best fits the fields chosen so far. */
export function suggestType(visual: DashboardVisual, kinds: Record<string, string>): DashboardVisualType | null {
  const wells = visual.data.wells;
  const groups = [...(wells.category ?? []), ...(wells.legend ?? []), ...(wells.rows ?? []), ...(wells.columns ?? [])];
  const measures = [...(wells.values ?? []), ...(wells.secondaryValues ?? [])];
  const dates = groups.filter((g) => kinds[g.field] === 'datetime');
  const geo = groups.some((g) => /country|nation|iso/i.test(g.field));
  if (!groups.length && measures.length === 1) return 'card';
  if (!groups.length && measures.length > 1) return 'multi_card';
  if (dates.length && measures.length) return measures.length > 1 && (wells.secondaryValues?.length ?? 0) > 0 ? 'combo' : 'line';
  if (geo && groups.length === 1 && measures.length === 1) return 'map';
  if (groups.length >= 2 && measures.length) return 'matrix';
  if (groups.length === 1 && measures.length === 2 && !dates.length) return 'scatter';
  if (groups.length === 1) return 'bar';
  return null;
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}`.slice(0, 40);
}

const GROUP_WELLS: DashboardWell[] = ['category', 'rows', 'columns', 'legend', 'details', 'smallMultiples'];
const MEASURE_WELLS: DashboardWell[] = ['values', 'secondaryValues', 'size', 'target'];

/** A visual switched to another type, its fields moved to the wells that type has
 *  (e.g. a matrix's rows and columns become a table's columns). */
export function retype(visual: DashboardVisual, type: DashboardVisualType): DashboardVisual {
  const target = VISUAL_BY_TYPE[type];
  if (!target || !target.wells.length) return { ...visual, type };
  const wells = visual.data.wells;
  const next: Partial<Record<DashboardWell, DashboardFieldRef[]>> = {};
  const used = new Set<DashboardFieldRef>();
  for (const well of target.wells) {
    const kept = (wells[well.key] ?? []).slice(0, well.max);
    if (kept.length) {
      next[well.key] = kept;
      kept.forEach((ref) => used.add(ref));
    }
  }
  const pool = (keys: DashboardWell[]) => keys.flatMap((key) => wells[key] ?? []).filter((ref) => !used.has(ref));
  for (const well of target.wells) {
    if (next[well.key]) continue;
    const taken = pool(well.measure ? MEASURE_WELLS : GROUP_WELLS).slice(0, well.max);
    if (!taken.length) continue;
    next[well.key] = well.measure ? taken.map((ref) => ({ ...ref, agg: ref.agg ?? 'sum' })) : taken.map(({ agg: _agg, showValueAs: _show, ...ref }) => ref);
    taken.forEach((ref) => used.add(ref));
  }
  return { ...visual, type, data: { ...visual.data, wells: next } };
}
