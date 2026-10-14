import {
  AreaChart,
  BarChart3,
  BarChartHorizontal,
  BarChart4,
  Filter,
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
  Table2,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { ColumnProfile, DashboardFieldRef, DashboardVisual, DashboardVisualType, DashboardWell } from '@/lib/data';

export type FieldKind = 'numeric' | 'datetime' | 'category' | 'any';

export interface WellSpec {
  key: DashboardWell;
  label: string;
  accepts: FieldKind[];
  max: number;
  /** Values wells aggregate (sum, average, …); category wells group. */
  measure: boolean;
}

export interface VisualSpec {
  type: DashboardVisualType;
  label: string;
  icon: LucideIcon;
  group: 'Cards' | 'Charts' | 'Tables' | 'Slicers' | 'Other';
  size: { w: number; h: number };
  wells: WellSpec[];
}

const category = (label = 'Category (X axis)', max = 1): WellSpec => ({ key: 'category', label, accepts: ['category', 'datetime', 'numeric'], max, measure: false });
const values = (label = 'Values', max = 6): WellSpec => ({ key: 'values', label, accepts: ['numeric', 'category', 'datetime', 'any'], max, measure: true });
const legend: WellSpec = { key: 'legend', label: 'Legend (split by)', accepts: ['category'], max: 1, measure: false };

export const VISUALS: VisualSpec[] = [
  { type: 'kpi', label: 'KPI card', icon: Hash, group: 'Cards', size: { w: 4, h: 5 }, wells: [values('Value', 1), { key: 'target', label: 'Target', accepts: ['numeric'], max: 1, measure: true }, { ...category('Trend over (date)'), accepts: ['datetime'] }] },
  { type: 'card', label: 'Card', icon: Hash, group: 'Cards', size: { w: 4, h: 4 }, wells: [values('Value', 1)] },
  { type: 'multi_card', label: 'Multi-card', icon: LayoutGrid, group: 'Cards', size: { w: 8, h: 4 }, wells: [values('Values', 6)] },
  { type: 'gauge', label: 'Gauge', icon: Gauge, group: 'Cards', size: { w: 6, h: 8 }, wells: [values('Value', 1), { key: 'target', label: 'Target', accepts: ['numeric'], max: 1, measure: true }] },
  { type: 'column', label: 'Column chart', icon: BarChart3, group: 'Charts', size: { w: 8, h: 10 }, wells: [category(), values(), legend] },
  { type: 'bar', label: 'Bar chart', icon: BarChartHorizontal, group: 'Charts', size: { w: 8, h: 10 }, wells: [category('Category (Y axis)'), values(), legend] },
  { type: 'line', label: 'Line chart', icon: LineChart, group: 'Charts', size: { w: 12, h: 10 }, wells: [category('X axis (date or category)'), values(), legend] },
  { type: 'area', label: 'Area chart', icon: AreaChart, group: 'Charts', size: { w: 12, h: 10 }, wells: [category('X axis (date or category)'), values(), legend] },
  { type: 'combo', label: 'Combo (bar + line)', icon: BarChart4, group: 'Charts', size: { w: 12, h: 10 }, wells: [category(), values('Columns', 2), { key: 'secondaryValues', label: 'Line (second axis)', accepts: ['numeric', 'any'], max: 2, measure: true }] },
  { type: 'donut', label: 'Donut', icon: PieChart, group: 'Charts', size: { w: 8, h: 10 }, wells: [category('Slices'), values('Value', 1)] },
  { type: 'pie', label: 'Pie', icon: PieChart, group: 'Charts', size: { w: 8, h: 10 }, wells: [category('Slices'), values('Value', 1)] },
  { type: 'treemap', label: 'Treemap', icon: Grid3x3, group: 'Charts', size: { w: 8, h: 10 }, wells: [category('Groups'), values('Size', 1)] },
  { type: 'funnel', label: 'Funnel', icon: Filter, group: 'Charts', size: { w: 8, h: 10 }, wells: [category('Stages'), values('Value', 1)] },
  { type: 'waterfall', label: 'Waterfall', icon: BarChart3, group: 'Charts', size: { w: 12, h: 10 }, wells: [category('Steps'), values('Change', 1)] },
  { type: 'scatter', label: 'Scatter / bubble', icon: ScatterChart, group: 'Charts', size: { w: 8, h: 10 }, wells: [{ key: 'details', label: 'Points (one per)', accepts: ['category'], max: 1, measure: false }, values('X and Y (then size)', 2), { key: 'size', label: 'Bubble size', accepts: ['numeric'], max: 1, measure: true }] },
  { type: 'map', label: 'Map', icon: Map, group: 'Charts', size: { w: 8, h: 12 }, wells: [category('Country'), values('Colour by', 1)] },
  { type: 'chart', label: 'Gallery chart…', icon: Shapes, group: 'Charts', size: { w: 8, h: 10 }, wells: [] },
  { type: 'table', label: 'Table', icon: Table2, group: 'Tables', size: { w: 12, h: 12 }, wells: [category('Columns (group by)', 4), values('Values', 8)] },
  { type: 'matrix', label: 'Matrix', icon: Grid3x3, group: 'Tables', size: { w: 12, h: 12 }, wells: [{ key: 'rows', label: 'Rows', accepts: ['category', 'datetime'], max: 2, measure: false }, { key: 'columns', label: 'Columns', accepts: ['category', 'datetime'], max: 1, measure: false }, values('Values', 1)] },
  { type: 'slicer', label: 'Slicer', icon: SlidersHorizontal, group: 'Slicers', size: { w: 6, h: 3 }, wells: [{ key: 'category', label: 'Field', accepts: ['category', 'datetime', 'numeric'], max: 1, measure: false }] },
  { type: 'text', label: 'Text box', icon: Type, group: 'Other', size: { w: 8, h: 3 }, wells: [] },
];

export const VISUAL_BY_TYPE = Object.fromEntries(VISUALS.map((visual) => [visual.type, visual])) as Record<DashboardVisualType, VisualSpec>;

export const AGGREGATIONS: [string, string][] = [
  ['sum', 'Sum'],
  ['avg', 'Average'],
  ['count', 'Count'],
  ['distinct', 'Distinct count'],
  ['min', 'Minimum'],
  ['max', 'Maximum'],
  ['median', 'Median'],
  ['std', 'Std deviation'],
  ['first', 'First'],
  ['last', 'Last'],
];

export const SHOW_VALUE_AS: [string, string][] = [
  ['none', 'Value'],
  ['pct_total', '% of grand total'],
  ['pct_row', '% of row total'],
  ['pct_column', '% of column total'],
  ['running_total', 'Running total'],
  ['diff_prev', 'Difference from previous'],
  ['pct_diff_prev', '% difference from previous'],
  ['rank', 'Rank'],
];

export const GRAINS: [NonNullable<DashboardFieldRef['grain']>, string][] = [
  ['year', 'Year'],
  ['quarter', 'Quarter'],
  ['month', 'Month'],
  ['week', 'Week'],
  ['day', 'Day'],
];

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
