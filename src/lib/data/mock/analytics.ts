// In-memory analytics for mock mode. It mirrors the backend's declarative
// transform language (filters -> group/aggregate -> select -> sort -> limit) so
// the Data Analytics page behaves the same without a server.
import type {
  AnalysisRun,
  AnalysisTransform,
  ColumnKind,
  ColumnProfile,
  Dataset,
  DatasetProfile,
  Visualization,
} from '../types';
import type { AnalyticsRepository, CreateDatasetInput, CreateVisualizationInput } from '../contracts';

type Row = Record<string, string | number | null>;

const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export function parseCsv(text: string): { columns: string[]; rows: Row[] } {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      if (record.some((value) => value !== '')) records.push(record);
      record = [];
      field = '';
    } else field += char;
  }
  record.push(field);
  if (record.some((value) => value !== '')) records.push(record);
  const [header, ...body] = records;
  if (!header?.length) throw new Error('The CSV needs a header row.');
  const columns = header.map((name) => name.trim());
  if (new Set(columns).size !== columns.length) throw new Error('Column names must be unique.');
  const rows = body.map((values) =>
    Object.fromEntries(
      columns.map((column, index) => {
        const raw = values[index] ?? '';
        const number = Number(raw);
        return [column, raw === '' ? null : Number.isFinite(number) && raw.trim() !== '' ? number : raw];
      }),
    ),
  );
  return { columns, rows };
}

function profile(columns: string[], rows: Row[]): DatasetProfile {
  const columnProfiles: ColumnProfile[] = columns.map((name) => {
    const values = rows.map((row) => row[name]).filter((value) => value !== null && value !== undefined);
    const numbers = values.filter((value): value is number => typeof value === 'number');
    const numeric = values.length > 0 && numbers.length === values.length;
    const nulls = rows.length - values.length;
    const base = {
      name,
      dtype: numeric ? 'float64' : 'object',
      kind: (numeric ? 'numeric' : 'categorical') as ColumnKind,
      nulls,
      nullRatio: rows.length ? nulls / rows.length : 0,
      distinct: new Set(values.map(String)).size,
    };
    if (numeric) {
      const sorted = [...numbers].sort((a, b) => a - b);
      const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
      return { ...base, min: sorted[0], max: sorted[sorted.length - 1], mean, median: sorted[Math.floor(sorted.length / 2)] };
    }
    const counts = new Map<string, number>();
    values.forEach((value) => counts.set(String(value), (counts.get(String(value)) ?? 0) + 1));
    const topValues = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([value, count]) => ({ value, count }));
    return { ...base, topValues };
  });
  return { rows: rows.length, column_count: columns.length, columns, columnProfiles };
}

export function applyTransform(rows: Row[], transform: AnalysisTransform): Row[] {
  let out = rows.filter((row) =>
    (transform.filters ?? []).every(({ column, operator, value }) => {
      const cell = row[column];
      switch (operator) {
        case 'eq': return cell == value;
        case 'ne': return cell != value;
        case 'gt': return Number(cell) > Number(value);
        case 'gte': return Number(cell) >= Number(value);
        case 'lt': return Number(cell) < Number(value);
        case 'lte': return Number(cell) <= Number(value);
        case 'contains': return String(cell ?? '').includes(String(value));
        case 'in': return Array.isArray(value) && value.map(String).includes(String(cell));
        default: return true;
      }
    }),
  );
  if (transform.group_by?.length && transform.aggregate) {
    const groups = new Map<string, Row[]>();
    out.forEach((row) => {
      const key = JSON.stringify(transform.group_by!.map((column) => row[column]));
      groups.set(key, [...(groups.get(key) ?? []), row]);
    });
    const numericColumns = Object.keys(out[0] ?? {}).filter(
      (column) => !transform.group_by!.includes(column) && out.every((row) => typeof row[column] === 'number' || row[column] === null),
    );
    const specs: [string, string][] =
      typeof transform.aggregate === 'string'
        ? transform.aggregate === 'count'
          ? [['', 'count']]
          : numericColumns.map((column) => [column, transform.aggregate as string])
        : Object.entries(transform.aggregate);
    out = [...groups.values()].map((members) => {
      const row: Row = {};
      transform.group_by!.forEach((column) => (row[column] = members[0]?.[column] ?? null));
      specs.forEach(([column, op]) => {
        if (op === 'count') {
          row[column ? `${column}_count` : 'count'] = members.length;
          return;
        }
        const values = members.map((member) => Number(member[column])).filter(Number.isFinite);
        const result =
          op === 'sum' ? values.reduce((a, b) => a + b, 0)
          : op === 'mean' ? values.reduce((a, b) => a + b, 0) / (values.length || 1)
          : op === 'min' ? Math.min(...values)
          : Math.max(...values);
        row[typeof transform.aggregate === 'string' ? column : `${column}_${op}`] = result;
      });
      return row;
    });
  }
  if (transform.select?.length) out = out.map((row) => Object.fromEntries(transform.select!.map((column) => [column, row[column] ?? null])));
  for (const { column, direction } of [...(transform.sort ?? [])].reverse()) {
    out = [...out].sort((a, b) => {
      const left = a[column];
      const right = b[column];
      const cmp = typeof left === 'number' && typeof right === 'number' ? left - right : String(left ?? '').localeCompare(String(right ?? ''));
      return direction === 'desc' ? -cmp : cmp;
    });
  }
  return transform.limit ? out.slice(0, transform.limit) : out;
}

type Stored<T> = T & { rows: Row[] };

function strip<T>({ rows: _rows, ...rest }: Stored<T>): T {
  return rest as T;
}

export class MockAnalyticsRepository implements AnalyticsRepository {
  private datasets = new Map<string, Stored<Dataset>>();
  private runs = new Map<string, Stored<AnalysisRun>>();
  private charts = new Map<string, Visualization>();

  listDatasets(): Promise<Dataset[]> {
    return Promise.resolve([...this.datasets.values()].map((dataset) => strip<Dataset>(dataset)));
  }
  async createDataset(input: CreateDatasetInput) {
    const text = input.file ? await input.file.text() : (input.csv ?? '');
    const { columns, rows } = parseCsv(text);
    const now = new Date().toISOString();
    const dataset = {
      id: uid('ds'),
      name: input.name,
      mimeType: 'text/csv',
      sourceType: input.file ? ('asset' as const) : ('inline' as const),
      columns,
      dtypes: {},
      profile: profile(columns, rows),
      rowCount: rows.length,
      byteSize: text.length,
      isShared: input.isShared ?? false,
      createdAt: now,
      updatedAt: now,
      rows,
    };
    this.datasets.set(dataset.id, dataset);
    return strip<Dataset>(dataset);
  }
  deleteDataset(id: string): Promise<void> {
    this.datasets.delete(id);
    return Promise.resolve();
  }
  listRuns(datasetId?: string): Promise<AnalysisRun[]> {
    return Promise.resolve(
      [...this.runs.values()].filter((run) => !datasetId || run.datasetId === datasetId).map((run) => strip<AnalysisRun>(run)),
    );
  }
  getRun(id: string): Promise<AnalysisRun> {
    const run = this.runs.get(id);
    return run ? Promise.resolve(strip<AnalysisRun>(run)) : Promise.reject(new Error('Analysis run not found.'));
  }
  async createRun(datasetId: string, transform: AnalysisTransform) {
    const dataset = this.datasets.get(datasetId);
    if (!dataset) throw new Error('Dataset not found.');
    const rows = applyTransform(dataset.rows, transform);
    const columns = Object.keys(rows[0] ?? {});
    const run = {
      id: uid('run'),
      datasetId,
      status: 'completed' as const,
      transform,
      columns,
      rowCount: rows.length,
      preview: rows.slice(0, 100),
      profile: profile(columns, rows),
      downloadUrl: null,
      errorMessage: '',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      rows,
    };
    this.runs.set(run.id, run);
    return this.getRun(run.id);
  }
  async retryRun(id: string) {
    const run = await this.getRun(id);
    return this.createRun(run.datasetId, run.transform);
  }
  deleteRun(id: string): Promise<void> {
    this.runs.delete(id);
    return Promise.resolve();
  }
  downloadRun(id: string): Promise<Blob> {
    const run = this.runs.get(id);
    if (!run) return Promise.reject(new Error('Analysis run not found.'));
    const escape = (value: string | number | null | undefined) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [run.columns.join(','), ...run.rows.map((row) => run.columns.map((c) => escape(row[c])).join(','))];
    return Promise.resolve(new Blob([`${lines.join('\n')}\n`], { type: 'text/csv' }));
  }
  listVisualizations(runId?: string): Promise<Visualization[]> {
    return Promise.resolve([...this.charts.values()].filter((chart) => !runId || chart.runId === runId));
  }
  getVisualization(id: string): Promise<Visualization> {
    const chart = this.charts.get(id);
    return chart ? Promise.resolve(chart) : Promise.reject(new Error('Chart not found.'));
  }
  createVisualization(input: CreateVisualizationInput): Promise<Visualization> {
    // Mock mode has no chart renderer: the chart is recorded but has no image.
    const chart: Visualization = {
      id: uid('viz'),
      runId: input.runId,
      kind: input.kind,
      xColumn: input.xColumn,
      yColumn: input.yColumn ?? '',
      colorColumn: input.colorColumn ?? '',
      title: input.title ?? '',
      status: 'ready',
      imageUrl: null,
      specUrl: null,
      errorMessage: '',
      createdAt: new Date().toISOString(),
    };
    this.charts.set(chart.id, chart);
    return Promise.resolve(chart);
  }
  deleteVisualization(id: string): Promise<void> {
    this.charts.delete(id);
    return Promise.resolve();
  }
}
