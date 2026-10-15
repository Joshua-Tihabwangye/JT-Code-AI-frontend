// Chart options arrive as plain JSON from the server. Where ECharts needs a function
// (formatters, custom shapes) the server writes {"$fn": name, ...}; this replaces those
// markers with a fixed set of functions, so an option can never carry code.
// Mirrors jt-code-backend/apps/visualize/static/hydrate.js (used by exported reports).
import type { ChartOption, ChartTable } from '@/lib/data';

type Json = unknown;
type Shape = { type?: string; points?: number[][]; color?: string; opacity?: number; stroke?: string; strokeWidth?: number; width?: number; text?: string; textColor?: string; font?: string };
type SeriesLike = { data?: { shapes?: Shape[] }[] } | null;

interface RenderApi {
  coord: (value: number[]) => number[];
  visual: (key: string) => unknown;
}

export const HYDRATION_FUNCTIONS = ['dataTable', 'shapes', 'number', 'compact', 'percent', 'indexLabel', 'cellValue', 'labelValue', 'shapeTooltip'] as const;

function text(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function formatNumber(value: unknown, digits = 4): string {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString(undefined, { maximumFractionDigits: digits });
  return text(value);
}

export function compact(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return text(value);
  const magnitude = Math.abs(value);
  for (const [size, suffix] of [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ] as const) {
    if (magnitude >= size) return `${(value / size).toFixed(1).replace(/\.0$/, '')}${suffix}`;
  }
  return magnitude < 1 && magnitude > 0 ? value.toPrecision(2) : formatNumber(value, 2);
}

function shapes(series: SeriesLike) {
  return (params: { dataIndex: number }, api: RenderApi) => {
    const item = series?.data?.[params.dataIndex] ?? {};
    const children = (item.shapes ?? []).map((shape) => {
      const points = (shape.points ?? []).map((point) => {
        const at = api.coord([point[0] ?? 0, point[1] ?? 0]);
        return [(at[0] ?? 0) + (point[2] ?? 0), (at[1] ?? 0) + (point[3] ?? 0)];
      });
      const colour = shape.color ?? (api.visual('color') as string);
      if (shape.type === 'text') {
        const [x = 0, y = 0] = points[0] ?? [];
        return { type: 'text', x, y, silent: true, style: { text: shape.text, fill: shape.textColor ?? '#fff', font: shape.font ?? '600 11px sans-serif', align: 'center', verticalAlign: 'middle' } };
      }
      if (shape.type === 'polyline') {
        return { type: 'polyline', shape: { points }, style: { stroke: colour, lineWidth: shape.width ?? 1.5, fill: null } };
      }
      return { type: 'polygon', shape: { points }, style: { fill: colour, opacity: shape.opacity ?? 0.85, stroke: shape.stroke ?? null, lineWidth: shape.strokeWidth ?? 0 } };
    });
    return { type: 'group', children };
  };
}

type Spec = Record<string, unknown>;

function escapeHtml(value: unknown): string {
  return text(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
}

/** The organized table ECharts shows from its toolbox “View data” button. */
export function tableHtml(table: ChartTable): string {
  const head = table.columns.map((column) => `<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #6366f1;position:sticky;top:0;background:inherit">${escapeHtml(column)}</th>`).join('');
  const body = table.rows
    .map(
      (row, index) =>
        `<tr style="background:${index % 2 ? 'rgba(99,102,241,.06)' : 'transparent'}">${row
          .map((cell) => `<td style="padding:5px 10px;border-bottom:1px solid rgba(148,163,184,.25);${typeof cell === 'number' ? 'text-align:right' : ''}">${typeof cell === 'number' ? formatNumber(cell) : escapeHtml(cell)}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  const note = table.truncated ? `<p style="font:12px sans-serif;opacity:.7">Showing the first ${table.rows.length} rows.</p>` : '';
  return `<div style="max-height:100%;overflow:auto;font:13px Inter,system-ui,sans-serif"><table style="border-collapse:collapse;width:100%"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${note}</div>`;
}
const factories: Record<string, (spec: Spec) => unknown> = {
  dataTable: (spec) => () => tableHtml((spec.table as ChartTable | undefined) ?? { columns: [], rows: [], truncated: false }),
  number: () => (value: unknown) => formatNumber(value),
  compact: () => compact,
  percent: (spec) => (value: unknown) =>
    typeof value === 'number' ? `${(value * ((spec.scale as number) ?? 1)).toFixed((spec.digits as number) ?? 1)}%` : value,
  indexLabel: (spec) => (value: number) => {
    const labels = (spec.labels as string[]) ?? [];
    return Math.abs(value - Math.round(value)) < 1e-6 ? (labels[Math.round(value)] ?? '') : '';
  },
  cellValue: () => (params: { value: unknown }) => compact(Array.isArray(params.value) ? params.value[2] : params.value),
  labelValue: (spec) => (params: { value: unknown }) => {
    const value: unknown = Array.isArray(params.value) ? params.value[1] : params.value;
    if (value == null) return '';
    return spec.percent ? `${formatNumber(value, 1)}%` : compact(value);
  },
  shapeTooltip: () => (params: { value: unknown; name?: string; seriesName?: string; marker?: string }) => {
    const value = params.value;
    const size = Array.isArray(value) && value.length > 2 ? `: ${formatNumber(value[2])}` : '';
    return `${params.marker ?? ''}${params.name || params.seriesName || ''}${size}`;
  },
};

function walk(value: Json, series: SeriesLike): Json {
  if (Array.isArray(value)) return value.map((item) => walk(item, series));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, Json>;
  if (typeof record.$fn === 'string') {
    if (record.$fn === 'shapes') return shapes(series);
    const factory = factories[record.$fn];
    return factory ? factory(record) : undefined;
  }
  const out: Record<string, Json> = {};
  for (const [key, child] of Object.entries(record)) {
    out[key] = key === 'series' && Array.isArray(child) ? child.map((entry) => walk(entry, entry as SeriesLike)) : walk(child, series);
  }
  return out;
}

export function hydrate(option: ChartOption): Record<string, unknown> {
  return walk(option, null) as Record<string, unknown>;
}

/** True when an option needs echarts-gl (3D) or the world map. */
export function optionNeeds(option: ChartOption): { gl: boolean; map: boolean } {
  const series = (option.series ?? []) as { type?: string }[];
  return {
    gl: series.some((item) => String(item.type ?? '').endsWith('3D') || item.type === 'surface'),
    map: 'geo' in option || series.some((item) => item.type === 'map'),
  };
}
