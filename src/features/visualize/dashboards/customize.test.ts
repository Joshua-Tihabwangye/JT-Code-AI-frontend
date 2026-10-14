import { describe, expect, it } from 'vitest';
import type { DashboardPage, DashboardSpec, DashboardTheme, DashboardVisual } from '@/lib/data';
import { autoMobileLayout, contrast, mobileVisuals, paintFormat, paletteFrom, parameterValue, pruneOverrides, renderContext, resolveVisual } from './customize';
import { retype } from './editor/catalog';
import { themeFromJson } from './editor/ThemeDialog';
import { safeUrl } from './local';

const visual = (id: string, extra: Partial<DashboardVisual> = {}): DashboardVisual => ({
  id,
  type: 'column',
  layout: { x: 0, y: 0, w: 6, h: 6 },
  data: { datasetId: 'd', wells: {} },
  ...extra,
});

const spec: DashboardSpec = {
  theme: 'executive',
  mode: 'system',
  calculations: [{ id: 'c1', name: 'Margin', expression: 'DIVIDE(SUM([profit]), SUM([revenue]))', format: 'percent' }],
  parameters: [
    { id: 'metric', name: 'Metric', kind: 'fields', role: 'measure', options: [{ field: 'revenue', agg: 'sum' }, { field: 'units', agg: 'avg', label: 'Average units' }], default: 0 },
    { id: 'lift', name: 'Price change', kind: 'whatif', min: -0.5, max: 0.5, step: 0.05, default: 0.1 },
  ],
  pages: [{ id: 'p', name: 'P', visuals: [visual('a'), visual('b')] }],
};

describe('parameters and calculations', () => {
  it('swaps field-parameter wells for the chosen option and fills in calculation expressions', () => {
    const chart = visual('v', { data: { datasetId: 'd', wells: { category: [{ field: 'date', grain: 'month' }], values: [{ field: 'revenue', param: 'metric', showValueAs: 'running_total' }, { field: 'Margin', calc: 'c1' }] } } });
    const first = resolveVisual(chart, spec, {});
    expect(first.data.wells.values![0]).toMatchObject({ field: 'revenue', agg: 'sum', param: 'metric', showValueAs: 'running_total' });
    expect(first.data.wells.values![1]).toMatchObject({ field: 'Margin', expr: 'DIVIDE(SUM([profit]), SUM([revenue]))', format: 'percent', label: 'Margin' });
    const second = resolveVisual(chart, spec, { metric: 1 });
    expect(second.data.wells.values![0]).toMatchObject({ field: 'units', agg: 'avg', label: 'Average units' });
    expect(parameterValue(spec.parameters![0]!, { metric: 9 })).toBe(1);
  });

  it('sends what-if values by name and every calculation', () => {
    expect(renderContext(spec, {})).toEqual({ parameters: { 'Price change': 0.1 }, calculations: [{ name: 'Margin', expression: 'DIVIDE(SUM([profit]), SUM([revenue]))' }] });
    expect(renderContext(spec, { lift: -0.2 }).parameters['Price change']).toBe(-0.2);
  });
});

describe('personalization', () => {
  it('merges a viewer’s changes over the author’s visual and drops changes to deleted visuals', () => {
    const base = visual('a', { format: { legend: { show: true, position: 'top' } }, data: { datasetId: 'd', wells: { category: [{ field: 'region' }] } } });
    const mine = resolveVisual(base, spec, {}, { type: 'bar', data: { datasetId: 'd', wells: { category: [{ field: 'channel' }] } }, format: { legend: { show: false } } });
    expect(mine.type).toBe('bar');
    expect(mine.data.wells.category).toEqual([{ field: 'channel' }]);
    expect(mine.format?.legend).toEqual({ show: false, position: 'top' });
    expect(pruneOverrides({ a: { type: 'bar' }, gone: { type: 'line' } }, spec)).toEqual({ a: { type: 'bar' } });
  });
});

describe('layout and formatting', () => {
  const page: DashboardPage = {
    id: 'p',
    name: 'P',
    visuals: [visual('chart', { layout: { x: 0, y: 6, w: 12, h: 10 } }), visual('kpi', { type: 'kpi', layout: { x: 0, y: 0, w: 4, h: 5 } }), visual('hidden', { hidden: true })],
  };

  it('stacks visuals for phones in the author’s order, or reading order without one', () => {
    expect(mobileVisuals(page, page.visuals).map((item) => item.visual.id)).toEqual(['kpi', 'hidden', 'chart']);
    const layout = autoMobileLayout(page);
    expect(layout).toEqual([
      { visualId: 'kpi', y: 0, h: 4 },
      { visualId: 'chart', y: 1, h: 9 },
    ]);
    const custom = { ...page, mobileLayout: [{ visualId: 'chart', y: 0, h: 12 }] };
    expect(mobileVisuals(custom, page.visuals)).toEqual([{ visual: page.visuals[0], h: 12 }]);
  });

  it('format painter copies the look, not the data bindings or the title text', () => {
    const source = visual('s', { format: { colors: { series: ['#ff0000'] }, title: { text: 'Source', show: false }, chart: { chartType: 'box' }, conditional: { rules: [] } } });
    const target = visual('t', { format: { title: { text: 'Target' }, python: { code: 'x' } } });
    expect(paintFormat(source, target).format).toEqual({ colors: { series: ['#ff0000'] }, title: { text: 'Target', show: false }, python: { code: 'x' } });
  });
});

describe('switching type', () => {
  it('moves fields to the wells the new type has', () => {
    const matrix = visual('m', { type: 'matrix', data: { datasetId: 'd', wells: { rows: [{ field: 'region' }], columns: [{ field: 'channel' }], values: [{ field: 'revenue', agg: 'sum' }] } } });
    const table = retype(matrix, 'table');
    expect(table.data.wells).toEqual({ category: [{ field: 'region' }, { field: 'channel' }], values: [{ field: 'revenue', agg: 'sum' }] });
    const column = retype(matrix, 'column');
    expect(column.data.wells).toEqual({ category: [{ field: 'region' }], values: [{ field: 'revenue', agg: 'sum' }], legend: [{ field: 'channel' }] });
    expect(retype(table, 'matrix').data.wells).toEqual({ rows: [{ field: 'region' }, { field: 'channel' }], values: [{ field: 'revenue', agg: 'sum' }] });
  });
});

describe('themes', () => {
  const base: DashboardTheme = {
    id: 'executive',
    name: 'Executive',
    dataColors: ['#111111', '#222222', '#333333'],
    good: '#16a34a',
    neutral: '#94a3b8',
    bad: '#dc2626',
    light: { canvas: '#f4f6fa', tile: '#ffffff', border: '#e5e7eb', gridline: '#eeeeee', text: '#0f172a', mutedText: '#64748b', accent: '#4f46e5' },
    dark: { canvas: '#0b1020', tile: '#121a2e', border: '#1f2a44', gridline: '#1c2640', text: '#e5e9f2', mutedText: '#8a96b0', accent: '#818cf8' },
    fontFamily: 'Inter',
    radius: 12,
    shadow: 'soft',
    kpiStyle: 'plain',
    density: 'comfortable',
  };

  it('generates palettes, checks contrast and imports theme JSON safely', () => {
    const palette = paletteFrom('#4f46e5', 8);
    expect(palette).toHaveLength(8);
    expect(new Set(palette).size).toBe(8);
    expect(palette.every((color) => /^#[0-9A-F]{6}$/.test(color))).toBe(true);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#888888')).toBeLessThan(2);
    const imported = themeFromJson({ name: 'Brand', dataColors: ['#aa0000', '#00aa00', '#0000aa', 'red'], background: '#fafafa', radius: 99, kpiStyle: 'evil' }, base);
    expect(imported.dataColors).toEqual(['#aa0000', '#00aa00', '#0000aa']);
    expect(imported.light.canvas).toBe('#fafafa');
    expect(imported.radius).toBe(24);
    expect(imported.kpiStyle).toBe('plain');
    expect(() => themeFromJson({ dataColors: ['#000000'] }, base)).toThrow(/at least 3/);
  });

  it('only opens http(s) links from buttons', () => {
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,x')).toBeNull();
    expect(safeUrl('not a url')).toBeNull();
  });
});
