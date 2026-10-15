import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  BarChart3,
  BarChartBig,
  Box,
  BrainCircuit,
  Calendar,
  ChevronDown,
  Download,
  Lightbulb,
  Globe2,
  Hash,
  PieChart,
  ScatterChart,
  Sigma,
  ToggleLeft,
  TrendingUp,
  Type,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/http';
import type { ChartExplanation, ChartTable, Dataset, VizCategory, VizPalette, VizQuality, VizStat } from '@/lib/data';
import { useVisualize } from './context';

const ICONS: Record<string, LucideIcon> = {
  BarChart3,
  TrendingUp,
  PieChart,
  BarChartBig,
  Sigma,
  ScatterChart,
  Workflow,
  Globe2,
  Box,
  BrainCircuit,
};

export function categoryIcon(category: VizCategory | undefined): LucideIcon {
  return (category && ICONS[category.icon]) || BarChart3;
}

export function colorVar(color: string | undefined): CSSProperties {
  return { '--c': color ?? '#6366f1' } as CSSProperties;
}

export function CategoryBadge({ category }: { category: VizCategory | undefined }) {
  if (!category) return null;
  const Icon = categoryIcon(category);
  return (
    <span className="viz-badge" style={colorVar(category.color)}>
      <Icon size={12} aria-hidden /> {category.name}
    </span>
  );
}

const KIND_ICONS: Record<string, LucideIcon> = { numeric: Hash, datetime: Calendar, boolean: ToggleLeft, categorical: Type, text: Type };
const KIND_COLORS: Record<string, string> = { numeric: '#6366f1', datetime: '#0ea5e9', boolean: '#f59e0b', categorical: '#ec4899', text: '#64748b' };

export function KindBadge({ kind }: { kind: string }) {
  const Icon = KIND_ICONS[kind] ?? Type;
  return (
    <span className="viz-badge" style={colorVar(KIND_COLORS[kind])} title={kind}>
      <Icon size={11} aria-hidden /> {kind}
    </span>
  );
}

export function PaletteSwatch({ palette }: { palette: VizPalette }) {
  return (
    <span className="viz-swatch" aria-hidden>
      {palette.colors.slice(0, 6).map((color) => (
        <span key={color} style={{ background: color }} />
      ))}
    </span>
  );
}

const QUALITY_COLORS: Record<VizQuality, string> = {
  excellent: '#10b981',
  good: '#0ea5e9',
  fair: '#f59e0b',
  weak: '#ef4444',
  unknown: '#64748b',
};

export function QualityBadge({ quality }: { quality?: VizQuality }) {
  if (!quality) return null;
  return (
    <span className="viz-badge" style={colorVar(QUALITY_COLORS[quality])}>
      {quality}
    </span>
  );
}

const ACRONYMS = new Set(['id', 'uuid', 'url', 'kpi', 'sku', 'iso', 'iso2', 'iso3', 'gdp', 'roi', 'vat', 'usd', 'eur', 'ugx']);

/** A column or option name as people read it: `unit_price` → “Unit price”, `orderId` → “Order ID”. */
export function humanize(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z][a-z])|([a-z])([A-Z])/g, (_m, a?: string, b?: string, c?: string, d?: string) => `${a ?? c ?? ''} ${b ?? d ?? ''}`)
    .replace(/[_\s]+/g, ' ')
    .trim();
  if (!spaced) return name;
  const words = spaced.split(' ').map((word) => (ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word));
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatValue(value: unknown, format?: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'number') return JSON.stringify(value) ?? '';
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`;
  if (format === 'percent_value') return `${value.toFixed(1)}%`;
  if (format === 'integer') return Math.round(value).toLocaleString();
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return Number.isInteger(value) ? String(value) : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function StatChips({ stats }: { stats: VizStat[] }) {
  if (!stats.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" data-testid="chart-stats">
      {stats.map((stat) => (
        <li key={stat.label} className="viz-card px-3 py-1.5 text-xs" style={{ boxShadow: 'none' }}>
          <span className="text-muted-foreground">{stat.label}</span>{' '}
          <b className="text-sm text-foreground">{formatValue(stat.value, stat.format)}</b>
        </li>
      ))}
    </ul>
  );
}

export function DatasetPicker({ label = 'Dataset', compact = false }: { label?: string; compact?: boolean }) {
  const { datasets, datasetId, setDatasetId } = useVisualize();
  return (
    <label className={compact ? 'block min-w-[220px]' : 'block'}>
      <span className="viz-label">{label}</span>
      <select
        className="viz-field"
        value={datasetId}
        onChange={(event) => setDatasetId(event.target.value)}
        aria-label={label}
        data-testid="dataset-picker"
      >
        {!datasets.length && <option value="">No datasets yet</option>}
        {datasets.map((dataset: Dataset) => (
          <option key={dataset.id} value={dataset.id}>
            {dataset.name} {dataset.rowCount ? `· ${dataset.rowCount.toLocaleString()} rows` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {apiErrorMessage(error)}
    </p>
  );
}

export function SkeletonBlock({ height = 240 }: { height?: number }) {
  return <div className="viz-skeleton w-full" style={{ height }} aria-busy="true" />;
}

/** A compact explanation: what the chart is about and its key takeaway; “How to read” expands on demand. */
export function Explanation({ explanation, compact: _compact = false }: { explanation?: Partial<ChartExplanation>; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!explanation || (!explanation.about && !explanation.insight)) return null;
  return (
    <div className="viz-explain" data-testid="chart-explanation">
      <p className="line-clamp-2">
        {explanation.insight ? (
          <>
            <Lightbulb size={12} className="mr-1 inline text-amber-500" aria-hidden />
            {explanation.insight}
          </>
        ) : (
          explanation.about
        )}
        {explanation.howToRead && (
          <button type="button" className="ml-1.5 font-semibold text-indigo-600 hover:underline dark:text-indigo-400" onClick={(event) => { event.stopPropagation(); setOpen(!open); }} aria-expanded={open}>
            {open ? 'Less' : 'How to read it'}
          </button>
        )}
      </p>
      {open && explanation.howToRead && <p className="mt-0.5 text-muted-foreground">{explanation.howToRead}</p>}
    </div>
  );
}

function toCsv(table: ChartTable): string {
  const quote = (value: string | number | boolean | null) => {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [table.columns, ...table.rows].map((row) => row.map(quote).join(',')).join('\n');
}

/** The organized data behind a chart, in a readable table with a CSV download. */
export function DataTableModal({ title, table, onClose }: { title: string; table: ChartTable; onClose: () => void }) {
  return (
    <div className="viz-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="viz-modal" role="dialog" aria-modal="true" aria-label={`${title} data`} onClick={(event) => event.stopPropagation()} data-testid="chart-data-modal">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">
              {table.rows.length.toLocaleString()} rows × {table.columns.length} columns{table.truncated ? ' (first rows)' : ''} — the data this chart shows
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="viz-chip"
              onClick={() => {
                const blob = new Blob([toCsv(table)], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${title.replace(/[^\w.-]+/g, '-').slice(0, 60) || 'chart'}-data.csv`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Download size={13} aria-hidden /> CSV
            </button>
            <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-accent" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="viz-scroll m-3" style={{ maxHeight: '65vh' }}>
          <table className="viz-table">
            <thead>
              <tr>
                {table.columns.map((column, index) => (
                  <th key={`${column}-${index}`}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, column) => (
                    <td key={column} className={typeof cell === 'number' ? 'text-right tabular-nums' : ''}>
                      {formatValue(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** A compact toolbar menu: a button that opens a list (closes on outside click or Escape). */
export function MenuButton({ label, icon: Icon, children, testId, disabled = false }: { label: string; icon: LucideIcon; children: ReactNode; testId?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => !box.current?.contains(event.target as Node) && setOpen(false);
    const key = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div ref={box} className="viz-menu-anchor">
      <button type="button" className="viz-chip" aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)} data-testid={testId}>
        <Icon size={14} aria-hidden /> {label} <ChevronDown size={12} aria-hidden />
      </button>
      {/* Kept in the page while closed (hidden) so its file inputs and actions stay reachable. */}
      <div className="viz-menu" role="menu" hidden={!open} onClick={(event) => (event.target as HTMLElement).closest('[data-close]') && setOpen(false)}>
        {children}
      </div>
    </div>
  );
}
