import { describe, expect, it } from 'vitest';
import { compact, hydrate, HYDRATION_FUNCTIONS, optionNeeds, tableHtml } from './hydrate';

describe('chart option hydration', () => {
  it('turns server markers into the fixed client functions', () => {
    const option = hydrate({
      xAxis: { axisLabel: { formatter: { $fn: 'compact' } } },
      yAxis: { axisLabel: { formatter: { $fn: 'indexLabel', labels: ['East', 'West'] } } },
      tooltip: { valueFormatter: { $fn: 'percent', digits: 0, scale: 100 } },
      series: [{ type: 'bar', data: [1, 2] }],
    }) as Record<string, Record<string, Record<string, (value: number) => string>>>;
    expect(option.xAxis!.axisLabel!.formatter!(1_250_000)).toBe('1.3M');
    expect(option.yAxis!.axisLabel!.formatter!(1)).toBe('West');
    expect(option.yAxis!.axisLabel!.formatter!(0.5)).toBe('');
    expect((option.tooltip as unknown as { valueFormatter: (v: number) => string }).valueFormatter(0.25)).toBe('25%');
  });

  it('never runs unknown markers (an option cannot carry code)', () => {
    const option = hydrate({ title: { text: { $fn: 'eval', code: 'alert(1)' } } }) as { title: { text: unknown } };
    expect(option.title.text).toBeUndefined();
    expect(HYDRATION_FUNCTIONS).not.toContain('eval');
  });

  it('draws custom shapes from the series data in data coordinates', () => {
    const series = [{ type: 'custom', renderItem: { $fn: 'shapes' }, data: [{ value: [0, 1], shapes: [{ type: 'polygon', points: [[0, 0], [1, 0], [1, 1, 3, 4]] }] }] }];
    const option = hydrate({ series }) as { series: { renderItem: (p: unknown, api: unknown) => { children: { shape: { points: number[][] } }[] } }[] };
    const group = option.series[0]!.renderItem({ dataIndex: 0 }, { coord: ([x, y]: number[]) => [x! * 10, y! * 10], visual: () => '#123456' });
    expect(group.children[0]!.shape.points).toEqual([[0, 0], [10, 0], [13, 14]]);
  });

  it('detects 3D and map options', () => {
    expect(optionNeeds({ series: [{ type: 'scatter3D' }] })).toEqual({ gl: true, map: false });
    expect(optionNeeds({ geo: {}, series: [] })).toEqual({ gl: false, map: true });
    expect(compact(950)).toBe('950');
  });

  it('renders organized chart data as an escaped table', () => {
    expect(HYDRATION_FUNCTIONS).toContain('dataTable');
    const option = hydrate({ toolbox: { feature: { dataView: { optionToContent: { $fn: 'dataTable', table: { columns: ['Region', 'Sales'], rows: [['<b>North</b>', 1200]], truncated: false } } } } } }) as {
      toolbox: { feature: { dataView: { optionToContent: () => string } } };
    };
    const html = option.toolbox.feature.dataView.optionToContent();
    expect(html).toContain('<th');
    expect(html).toContain('&lt;b&gt;North&lt;/b&gt;');
    expect(html).not.toContain('<b>North');
    expect(tableHtml({ columns: ['a'], rows: [], truncated: true })).toContain('first 0 rows');
  });
});
