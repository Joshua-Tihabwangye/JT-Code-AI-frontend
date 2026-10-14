import { useMemo, type CSSProperties } from 'react';
import type { DashboardFilter, DashboardTheme, DashboardVisual, KpiData, VisualOutput, VisualTable } from '@/lib/data';
import { EChart, type EChartClick } from '../EChart';
import { SlicerVisual, type SlicerValue } from './slicers';
import { kpiTileStyle } from './theme';

export { slicerFilter, type SlicerValue } from './slicers';

/** A click on a data point: the filter it implies (null clears). */
/** A click on a data point: the filter it implies (null clears); ``additive`` with Ctrl/⌘. */
export type SelectHandler = (filters: DashboardFilter[] | null, additive?: boolean) => void;
/** Right-click (``menu``) or hover (``hover``) over a data point, with the filters it implies. */
export type PointHandler = (kind: 'menu' | 'hover', filters: DashboardFilter[] | null, event: MouseEvent | null) => void;

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

type RowHandler = (index: number, event: React.MouseEvent, kind?: 'menu') => void;

function TableVisual({ table, onRow }: { table: VisualTable; onRow: RowHandler }) {
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
            <tr key={index} onClick={(event) => onRow(index, event)} onContextMenu={(event) => onRow(index, event, 'menu')}>
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

function MatrixVisual({ table, onRow }: { table: VisualTable; onRow: RowHandler }) {
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
              <tr key={index} onClick={(event) => onRow(index, event)} onContextMenu={(event) => onRow(index, event, 'menu')}>
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
  onPoint,
  slicerValue,
  onSlicerChange,
  asTable = false,
}: {
  visual: DashboardVisual;
  output: VisualOutput | undefined;
  theme: DashboardTheme | undefined;
  kpiIndex: number;
  onSelect: SelectHandler;
  onPoint?: PointHandler;
  slicerValue?: SlicerValue;
  onSlicerChange?: (value: SlicerValue) => void;
  /** “Show as table”: the visual's numbers instead of the chart. */
  asTable?: boolean;
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
  if (asTable && output.data) return <DataTable data={output.data} />;
  if (output.kpi && (visual.type === 'kpi' || visual.type === 'card')) return <KpiCard kpi={output.kpi} theme={theme} index={kpiIndex} />;
  if (output.cards) return <Cards output={output} />;
  if (output.slicer) {
    const settings = (visual.format?.slicer ?? {}) as { style?: string; single?: boolean };
    return <SlicerVisual slicer={output.slicer} value={slicerValue} onChange={(value) => onSlicerChange?.(value)} style={settings.style} single={settings.single} />;
  }
  if (output.table) {
    const onRow: RowHandler = (index, event, kind) => {
      const filter = output.selectors?.category?.[index];
      if (kind === 'menu') {
        event.preventDefault();
        onPoint?.('menu', filter ? [filter] : null, event.nativeEvent);
      } else onSelect(filter ? [filter] : null, event.ctrlKey || event.metaKey);
    };
    return output.table.matrix ? <MatrixVisual table={output.table} onRow={onRow} /> : <TableVisual table={output.table} onRow={onRow} />;
  }
  if (option) {
    return (
      <EChart
        option={option}
        height="100%"
        testId={`visual-${visual.id}`}
        onClick={(params) => onSelect(clickFilters(output, params), !!(params.event?.event?.ctrlKey || params.event?.event?.metaKey))}
        onContextMenu={(params, event) => onPoint?.('menu', clickFilters(output, params), event)}
        onHover={(params, event) => onPoint?.('hover', params ? clickFilters(output, params) : null, event)}
      />
    );
  }
  return <p className="dash-message">Nothing to show.</p>;
}

/** “Show as table” and the accessible fallback: the visual's numbers, exactly as Python organised them. */
export function DataTable({ data }: { data: NonNullable<VisualOutput['data']> }) {
  return (
    <div className="dash-table-wrap" data-testid="visual-as-table">
      <table className="dash-table">
        <thead>
          <tr>
            {data.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={typeof cell === 'number' ? 'num' : ''}>
                  {formatCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The visual's numbers as CSV text (for “Export data”). */
export function dataCsv(data: NonNullable<VisualOutput['data']>): string {
  const quote = (value: string | number | boolean | null) => {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [data.columns, ...data.rows].map((row) => row.map(quote).join(',')).join('\n');
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
