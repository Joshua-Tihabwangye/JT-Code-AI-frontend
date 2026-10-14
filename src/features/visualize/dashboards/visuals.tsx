import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { DashboardFilter, DashboardTheme, DashboardVisual, KpiData, SlicerData, VisualOutput, VisualTable } from '@/lib/data';
import { EChart, type EChartClick } from '../EChart';
import { kpiTileStyle } from './theme';

/** A click on a data point: the filter it implies (null clears). */
export type SelectHandler = (filters: DashboardFilter[] | null) => void;

function Sparkline({ values, inverted }: { values: number[]; inverted: boolean }) {
  if (values.length < 2) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${28 - ((value - low) / span) * 24}`).join(' ');
  const stroke = inverted ? 'rgba(255,255,255,0.9)' : 'var(--kpi-accent, var(--dash-accent))';
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="dash-spark" aria-hidden>
      <polyline points={`0,30 ${points} 100,30`} fill={inverted ? 'rgba(255,255,255,0.18)' : 'color-mix(in srgb, var(--kpi-accent, var(--dash-accent)) 16%, transparent)'} stroke="none" />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function KpiCard({ kpi, theme, index }: { kpi: KpiData; theme: DashboardTheme | undefined; index: number }) {
  const { style, inverted } = kpiTileStyle(theme, index);
  const delta = kpi.delta;
  return (
    <div className={`dash-kpi${inverted ? ' inverted' : ''}`} style={style} data-testid="kpi-card">
      <div className="dash-kpi-label" title={kpi.label}>
        {kpi.label}
      </div>
      <div className="dash-kpi-value" title={kpi.value == null ? '' : String(kpi.value)}>
        {kpi.display}
      </div>
      <div className="dash-kpi-meta">
        {delta && (
          <span className={`dash-delta ${delta.good ? 'good' : 'bad'}`} title={`${delta.period} ${delta.label}`}>
            {delta.display}
          </span>
        )}
        {delta && <span className="dash-kpi-compare">{delta.label}</span>}
        {kpi.target && !delta && <span className="dash-kpi-compare">Target {kpi.target.display}</span>}
      </div>
      {kpi.target && (
        <div className="dash-progress" title={`${kpi.target.progressDisplay} of ${kpi.target.display}`}>
          <span style={{ width: `${Math.min(kpi.target.progress, 1) * 100}%` }} />
        </div>
      )}
      {kpi.sparkline && <Sparkline values={kpi.sparkline} inverted={inverted} />}
    </div>
  );
}

function Cards({ output }: { output: VisualOutput }) {
  return (
    <div className="dash-cards">
      {output.cards?.map((card) => (
        <div key={card.label} className="dash-card-item">
          <span className="dash-kpi-label">{card.label}</span>
          <span className="dash-card-value">{card.display}</span>
        </div>
      ))}
    </div>
  );
}

function formatCell(value: unknown, percent?: boolean): string {
  if (value === null || value === undefined) return '—';
  if (typeof value !== 'number') return typeof value === 'string' ? value : JSON.stringify(value);
  if (percent) return `${(value * 100).toFixed(1)}%`;
  const magnitude = Math.abs(value);
  if (magnitude >= 1e6) return `${(value / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (magnitude >= 1e4) return `${(value / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return value.toLocaleString(undefined, { maximumFractionDigits: magnitude >= 100 ? 0 : 2 });
}

function TableVisual({ table, onRow }: { table: VisualTable; onRow: (index: number) => void }) {
  const columns = table.columns.filter((c): c is Exclude<VisualTable['columns'][number], string> => typeof c !== 'string');
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.align === 'right' ? 'num' : ''}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={index} onClick={() => onRow(index)}>
              {columns.map((column) => {
                const value = row[column.key];
                const peak = table.bars?.[column.key];
                const share = typeof value === 'number' && peak ? Math.min(Math.abs(value) / peak, 1) : 0;
                return (
                  <td key={column.key} className={column.align === 'right' ? 'num' : ''}>
                    {share > 0 && <span className="dash-bar" style={{ width: `${share * 100}%` }} aria-hidden />}
                    <span className="relative">{formatCell(value, column.percent)}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {table.totals && (
          <tfoot>
            <tr>
              {columns.map((column, index) => (
                <td key={column.key} className={column.align === 'right' ? 'num' : ''}>
                  {index === 0 ? 'Total' : table.totals?.[column.key] != null ? formatCell(table.totals[column.key], column.percent) : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function MatrixVisual({ table, onRow }: { table: VisualTable; onRow: (index: number) => void }) {
  const accent = table.accent ?? 'var(--dash-accent)';
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr>
            <th>{table.rowHeader}</th>
            {(table.columns as string[]).map((column) => (
              <th key={column} className="num">
                {column}
              </th>
            ))}
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => {
            const cells = row.cells as { value: number | null; display: string; shade: number }[];
            return (
              <tr key={index} onClick={() => onRow(index)}>
                <td>{String(row.label)}</td>
                {cells.map((cell, cellIndex) => (
                  <td key={cellIndex} className="num" style={{ background: `color-mix(in srgb, ${accent} ${Math.round(cell.shade * 100)}%, transparent)` }}>
                    {cell.display}
                  </td>
                ))}
                <td className="num font-semibold">{String(row.totalDisplay)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            {table.columnTotals?.map((total, index) => (
              <td key={index} className="num">
                {total}
              </td>
            ))}
            <td className="num">{table.grandTotal}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export type SlicerValue = { values?: (string | number | boolean | null)[]; from?: string; to?: string } | undefined;

/** The filter a slicer's value implies (none when everything is selected). */
export function slicerFilter(visual: DashboardVisual, slicer: SlicerData | undefined, value: SlicerValue): DashboardFilter | null {
  const field = slicer?.field ?? visual.data.wells.category?.[0]?.field;
  if (!field || !value) return null;
  if (value.values && value.values.length) return { field, op: 'in', value: value.values, datasetId: visual.data.datasetId };
  if (value.from || value.to) {
    const isDate = typeof slicer?.range?.min === 'string';
    const low = value.from || String(slicer?.range?.min ?? '');
    const high = value.to || String(slicer?.range?.max ?? '');
    return { field, op: 'between', value: isDate ? [low.slice(0, 10), `${high.slice(0, 10)}T23:59:59`] : [Number(low), Number(high)], datasetId: visual.data.datasetId };
  }
  return null;
}

function SlicerVisual({ slicer, value, onChange, style }: { slicer: SlicerData; value: SlicerValue; onChange: (value: SlicerValue) => void; style?: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  if (slicer.range) {
    const isDate = typeof slicer.range.min === 'string';
    const min = isDate ? String(slicer.range.min ?? '').slice(0, 10) : String(slicer.range.min ?? '');
    const max = isDate ? String(slicer.range.max ?? '').slice(0, 10) : String(slicer.range.max ?? '');
    return (
      <div className="dash-slicer-range" data-testid="slicer-range">
        <input
          type={isDate ? 'date' : 'number'}
          value={value?.from ?? min}
          min={min}
          max={max}
          onChange={(event) => onChange({ ...value, from: event.target.value })}
          aria-label={`${slicer.label} from`}
        />
        <span aria-hidden>–</span>
        <input
          type={isDate ? 'date' : 'number'}
          value={value?.to ?? max}
          min={min}
          max={max}
          onChange={(event) => onChange({ ...value, to: event.target.value })}
          aria-label={`${slicer.label} to`}
        />
        {(value?.from || value?.to) && (
          <button type="button" className="dash-icon" onClick={() => onChange(undefined)} aria-label="Clear">
            <X size={13} />
          </button>
        )}
      </div>
    );
  }
  const options = slicer.options ?? [];
  const selected = new Set((value?.values ?? []).map((v) => String(v)));
  const toggle = (option: (typeof options)[number]) => {
    const key = String(option.value);
    const next = selected.has(key) ? (value?.values ?? []).filter((v) => String(v) !== key) : [...(value?.values ?? []), option.value];
    onChange(next.length ? { values: next } : undefined);
  };
  if (style === 'tiles' || style === 'list') {
    return (
      <div className={style === 'tiles' ? 'dash-slicer-tiles' : 'dash-slicer-list'}>
        {options.map((option) => (
          <button key={option.label} type="button" aria-pressed={selected.has(String(option.value))} onClick={() => toggle(option)}>
            {option.label}
          </button>
        ))}
      </div>
    );
  }
  const label = selected.size === 0 ? 'All' : selected.size === 1 ? (options.find((o) => selected.has(String(o.value)))?.label ?? '1 selected') : `${selected.size} selected`;
  const shown = options.filter((option) => !search || option.label.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="dash-slicer" ref={box} onBlur={(event) => !box.current?.contains(event.relatedTarget) && setOpen(false)}>
      <button type="button" className="dash-slicer-button" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="slicer-button">
        <span className="truncate">{label}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div className="dash-slicer-menu" role="listbox" aria-multiselectable>
          {options.length > 8 && (
            <label className="dash-slicer-search">
              <Search size={12} aria-hidden />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" aria-label={`Search ${slicer.label}`} />
            </label>
          )}
          <button type="button" className="dash-slicer-option" onClick={() => onChange(undefined)}>
            <span className="dash-check">{selected.size === 0 && <Check size={12} />}</span> Select all
          </button>
          {shown.map((option) => (
            <button key={option.label} type="button" role="option" aria-selected={selected.has(String(option.value))} className="dash-slicer-option" onClick={() => toggle(option)}>
              <span className="dash-check">{selected.has(String(option.value)) && <Check size={12} />}</span>
              <span className="truncate">{option.label}</span>
              <span className="ml-auto text-[10px] opacity-60">{option.count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function clickFilters(output: VisualOutput, params: EChartClick): DashboardFilter[] | null {
  const selectors = output.selectors;
  if (!selectors) return null;
  const filters: DashboardFilter[] = [];
  let index = params.dataIndex;
  if (output.type === 'map' && params.name && selectors.names) index = selectors.names.indexOf(params.name);
  const category = index != null && index >= 0 ? selectors.category?.[index] : undefined;
  if (category) filters.push(category);
  const series = params.seriesIndex != null ? selectors.series?.[params.seriesIndex] : undefined;
  if (series) filters.push(series);
  return filters.length ? filters : null;
}

/** Shows what Python built for a visual: a chart, KPI, cards, table, matrix, slicer or text. */
export function VisualRenderer({
  visual,
  output,
  theme,
  kpiIndex,
  onSelect,
  slicerValue,
  onSlicerChange,
}: {
  visual: DashboardVisual;
  output: VisualOutput | undefined;
  theme: DashboardTheme | undefined;
  kpiIndex: number;
  onSelect: SelectHandler;
  slicerValue?: SlicerValue;
  onSlicerChange?: (value: SlicerValue) => void;
}) {
  const option = useMemo(() => output?.option, [output]);
  if (visual.type === 'text') return <p className="dash-text">{visual.text}</p>;
  if (!output) return <div className="dash-skeleton" aria-busy="true" />;
  if (output.status === 'error') return <p className="dash-message error">{output.message ?? 'This visual could not be drawn.'}</p>;
  if (output.status === 'empty') {
    return (
      <div className="dash-message">
        <span>{output.message ?? 'No data for the current filters'}</span>
        <button type="button" onClick={() => onSelect(null)}>
          Clear selection
        </button>
      </div>
    );
  }
  if (output.kpi && (visual.type === 'kpi' || visual.type === 'card')) return <KpiCard kpi={output.kpi} theme={theme} index={kpiIndex} />;
  if (output.cards) return <Cards output={output} />;
  if (output.slicer) {
    const style = (visual.format?.slicer as { style?: string } | undefined)?.style;
    return <SlicerVisual slicer={output.slicer} value={slicerValue} onChange={(value) => onSlicerChange?.(value)} style={style} />;
  }
  if (output.table) {
    const onRow = (index: number) => {
      const filter = output.selectors?.category?.[index];
      onSelect(filter ? [filter] : null);
    };
    return output.table.matrix ? <MatrixVisual table={output.table} onRow={onRow} /> : <TableVisual table={output.table} onRow={onRow} />;
  }
  if (option) {
    return <EChart option={option} height="100%" testId={`visual-${visual.id}`} onClick={(params) => onSelect(clickFilters(output, params))} />;
  }
  return <p className="dash-message">Nothing to show.</p>;
}

export function tileStyle(visual: DashboardVisual, rowHeight: number): CSSProperties {
  const { x, y, w, h, z } = visual.layout;
  return {
    left: `${(x / 24) * 100}%`,
    width: `${(w / 24) * 100}%`,
    top: y * rowHeight,
    height: h * rowHeight,
    // Slicers sit above other tiles so their menus are never hidden behind them.
    zIndex: (z ?? 0) + (visual.type === 'slicer' ? 20 : 0),
  };
}
