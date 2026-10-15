import { describe, expect, it } from 'vitest';
import { MockAnalyticsRepository, applyTransform, parseCsv } from '../mock/analytics';

// jsdom's Blob has no .text(); read it the way older browsers do.
const readText = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(blob);
  });

const CSV = 'region,product,revenue\nEast,A,120\nEast,B,80\nWest,A,200\n"North, Far",A,75\n';

describe('mock analytics engine (mirrors the backend transform language)', () => {
  it('parses quoted CSV and numbers', () => {
    const { columns, rows } = parseCsv(CSV);
    expect(columns).toEqual(['region', 'product', 'revenue']);
    expect(rows[3]).toEqual({ region: 'North, Far', product: 'A', revenue: 75 });
  });

  it('rejects duplicate column names', () => {
    expect(() => parseCsv('a,a\n1,2\n')).toThrow(/unique/);
  });

  it('filters, groups, aggregates and sorts', () => {
    const { rows } = parseCsv(CSV);
    expect(
      applyTransform(rows, {
        filters: [{ column: 'revenue', operator: 'gte', value: 80 }],
        group_by: ['region'],
        aggregate: { revenue: 'sum' },
        sort: [{ column: 'revenue_sum', direction: 'desc' }],
      }),
    ).toEqual([
      { region: 'East', revenue_sum: 200 },
      { region: 'West', revenue_sum: 200 },
    ]);
    expect(applyTransform(rows, { group_by: ['product'], aggregate: 'count' })).toEqual([
      { product: 'A', count: 3 },
      { product: 'B', count: 1 },
    ]);
    expect(applyTransform(rows, { filters: [{ column: 'region', operator: 'in', value: ['West'] }], select: ['revenue'] })).toEqual([
      { revenue: 200 },
    ]);
  });

  it('runs the full dataset → run → chart flow', async () => {
    const repo = new MockAnalyticsRepository();
    const dataset = await repo.createDataset({ name: 'Sales', csv: CSV });
    expect(dataset.rowCount).toBe(4);
    expect(dataset.profile.columnProfiles?.find((p) => p.name === 'revenue')?.kind).toBe('numeric');
    const run = await repo.createRun(dataset.id, { limit: 2 });
    expect(run).toMatchObject({ status: 'completed', rowCount: 2 });
    expect(await readText(await repo.downloadRun(run.id))).toBe('region,product,revenue\nEast,A,120\nEast,B,80\n');
    const chart = await repo.createVisualization({ runId: run.id, kind: 'bar', xColumn: 'region', yColumn: 'revenue' });
    expect(await repo.listVisualizations(run.id)).toEqual([chart]);
    await repo.deleteDataset(dataset.id);
    expect(await repo.listDatasets()).toEqual([]);
  });
});
