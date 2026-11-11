import { describe, expect, it } from 'vitest';
import type { DashboardPage, DashboardSpec, DashboardVisual, RenderVisualsInput } from '@/lib/data';
import { drilled } from './runtime';
import { embedCode, shareUrl } from './ShareDialog';
import { sharedRequest } from './SharedDashboardPage';

const trend: DashboardVisual = {
  id: 'trend',
  type: 'line',
  layout: { x: 0, y: 0, w: 12, h: 10 },
  data: { datasetId: 'd', wells: { category: [{ field: 'date', grain: 'month' }], values: [{ field: 'revenue', param: 'metric' }] } },
};
const page: DashboardPage = { id: 'p', name: 'Overview', visuals: [trend, { ...trend, id: 'bars', type: 'bar', data: { datasetId: 'd', wells: { category: [{ field: 'region' }], values: [{ field: 'revenue' }] } } }] };
const spec: DashboardSpec = {
  theme: 'executive',
  mode: 'light',
  parameters: [{ id: 'metric', name: 'Metric', kind: 'fields', role: 'measure', options: [{ field: 'revenue', agg: 'sum' }, { field: 'profit', agg: 'sum' }], default: 0 }],
  pages: [page],
};

describe('shared links', () => {
  it('asks for visuals by id with the viewer’s clicks and drill level, never the visual itself', () => {
    const march = { field: 'date', op: 'between', value: ['2025-03-01T00:00:00', '2025-03-31T23:59:59'] };
    const east = { field: 'region', op: 'in', value: ['East'] };
    const yearly = drilled(trend, { level: 0, path: [] });
    const input: RenderVisualsInput = {
      visuals: [{ ...yearly, data: { ...yearly.data, highlight: [east] } }, { ...page.visuals[1]!, data: { ...page.visuals[1]!.data, filters: [march] } }],
      filters: [{ field: 'channel', op: 'in', value: ['Online'] }],
      mode: 'dark',
      today: '2026-10-16',
    };
    const request = sharedRequest(input, spec, page, { metric: 1 });
    expect(request.visuals).toEqual([
      { id: 'trend', highlight: [east], level: 0 },
      { id: 'bars', filters: [march] },
    ]);
    expect(request.parameters).toEqual({ metric: 1 });
    expect(request.filters).toEqual(input.filters);
    expect(request.mode).toBe('dark');
    // Not drilled: no level is sent (the server keeps the author's).
    expect(sharedRequest({ ...input, visuals: [trend] }, spec, page, {}).visuals).toEqual([{ id: 'trend' }]);
  });

  it('builds the link and the embed code', () => {
    expect(shareUrl('abc123', 'link')).toMatch(/\/share\/abc123$/);
    expect(shareUrl('abc123', 'embed')).toMatch(/\/embed\/abc123$/);
    expect(embedCode('abc123')).toMatch(/^<iframe src="[^"]+\/embed\/abc123"/);
  });
});
