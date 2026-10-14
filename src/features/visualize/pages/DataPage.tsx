import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardPaste,
  Database,
  Download,
  Eraser,
  Eye,
  FileJson,
  FileSpreadsheet,
  FileUp,
  Filter,
  Hash,
  Home,
  Info,
  Lightbulb,
  ListChecks,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
  Save,
  ScanSearch,
  Search,
  Share2,
  Sparkles,
  Table2,
  ToggleLeft,
  Trash2,
  TrendingUp,
  Type,
  Upload,
  Wand2,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  useRepository,
  type AnalysisTransform,
  type ColumnProfile,
  type Dataset,
  type VizCellEdit,
  type VizInsight,
  type VizIssue,
  type VizOrganizeSteps,
  type VizQualityReport,
} from '@/lib/data';
import { Button, ConfirmDialog } from '@/shared/components';
import { TransformBuilder } from '@/features/analytics/TransformBuilder';
import { useVisualize } from '../context';
import { safeName, saveBlob } from '../echarts';
import { Ribbon, RibbonField, RibbonGroup } from '../Ribbon';
import { colorVar, ErrorNote, formatValue, humanize, KindBadge, SkeletonBlock } from '../ui';

type RibbonTabId = 'home' | 'quality' | 'organize' | 'profile' | 'insights';
const PAGE = 50;
const KIND_STYLE: Record<string, { color: string; icon: LucideIcon }> = {
  numeric: { color: '#6366f1', icon: Hash },
  datetime: { color: '#0ea5e9', icon: Calendar },
  categorical: { color: '#ec4899', icon: Type },
  boolean: { color: '#f59e0b', icon: ToggleLeft },
  text: { color: '#64748b', icon: Type },
};
const SEVERITY: Record<string, { color: string; icon: LucideIcon; label: string }> = {
  error: { color: '#ef4444', icon: AlertOctagon, label: 'Must fix' },
  warning: { color: '#f59e0b', icon: AlertTriangle, label: 'Should check' },
  info: { color: '#0ea5e9', icon: Info, label: 'Good to know' },
};

function cellKey(row: number, column: string) {
  return `${row}\u0000${column}`;
}

/** A titled, collapsible workspace panel under the ribbon. */
function Workspace({ title, subtitle, icon: Icon, color, children, actions }: { title: string; subtitle?: string; icon: LucideIcon; color: string; children: React.ReactNode; actions?: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="viz-workspace space-y-3" style={colorVar(color)} data-testid="data-workspace">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="viz-icon h-9 w-9">
            <Icon size={18} aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <button type="button" className="viz-chip" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />} {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </header>
      {open && children}
    </section>
  );
}

/* --- Check quality ------------------------------------------------------------------------- */

function QualityRibbon({ report, loading, onScan, filter, setFilter, hidden, setHidden }: { report: VizQualityReport | undefined; loading: boolean; onScan: () => void; filter: string; setFilter: (value: string) => void; hidden: Set<string>; setHidden: (value: Set<string>) => void }) {
  return (
    <>
      <RibbonGroup title="Scan">
        <button type="button" className="viz-tool" style={colorVar('#10b981')} onClick={onScan} disabled={loading} data-testid="scan-quality">
          {loading ? <RefreshCw size={20} className="animate-spin" aria-hidden /> : <ScanSearch size={20} aria-hidden />}
          {report ? 'Re-scan' : 'Check data'}
        </button>
      </RibbonGroup>
      <RibbonGroup title="Highlight colours (click to hide)">
        <div className="flex max-w-[520px] flex-wrap gap-1.5" data-testid="issue-legend">
          {report?.types.map((type) => (
            <button
              key={type.type}
              type="button"
              className="viz-chip"
              style={colorVar(type.color)}
              aria-pressed={!hidden.has(type.type)}
              onClick={() => {
                const next = new Set(hidden);
                if (next.has(type.type)) next.delete(type.type);
                else next.add(type.type);
                setHidden(next);
              }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: type.color }} /> {type.label} · {type.count.toLocaleString()}
            </button>
          ))}
          {!report && <span className="text-xs text-muted-foreground">Run a check to see the colour key.</span>}
          {report && !report.types.length && <span className="text-sm text-emerald-600">No issues found 🎉</span>}
        </div>
      </RibbonGroup>
      <RibbonGroup title="Show rows">
        <RibbonField label="Rows in the table" width={210}>
          <select className="viz-field" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Row filter" data-testid="issue-filter" disabled={!report}>
            <option value="">All rows</option>
            <option value="issues">Only rows with issues</option>
            {report?.types.map((type) => (
              <option key={type.type} value={type.type}>
                {type.label}
              </option>
            ))}
          </select>
        </RibbonField>
      </RibbonGroup>
    </>
  );
}

function IssueCard({ issue, onShow }: { issue: VizIssue; onShow: () => void }) {
  return (
    <article className="flex gap-3 rounded-xl border border-border bg-[var(--card)] p-3" style={{ borderLeft: `4px solid ${issue.color}` }}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: issue.color }} />
          <b className="text-sm">{issue.label}</b>
          {issue.column && <span className="viz-badge" style={colorVar('#64748b')}>{issue.column}</span>}
          <span className="ml-auto text-sm font-bold" style={{ color: issue.color }}>
            {issue.count.toLocaleString()}
          </span>
        </div>
        <p className="text-xs">{issue.detail}</p>
        <p className="text-xs text-muted-foreground">💡 {issue.suggestion}</p>
        {issue.examples.length > 0 && <p className="truncate text-[11px] text-muted-foreground">e.g. {issue.examples.slice(0, 5).join(' · ')}</p>}
      </div>
      {issue.rows.length > 0 && (
        <button type="button" className="viz-chip self-start" onClick={onShow}>
          <Eye size={12} aria-hidden /> Rows
        </button>
      )}
    </article>
  );
}

function QualityWorkspace({ report, loading, error, setFilter }: { report: VizQualityReport | undefined; loading: boolean; error: unknown; setFilter: (value: string) => void }) {
  if (!report && !loading && !error) {
    return (
      <Workspace title="Data quality report" subtitle="Python checks — no AI and nothing is changed" icon={ListChecks} color="#10b981">
        <p className="text-sm text-muted-foreground">
          Press <b>Check data</b> to scan for duplicate rows and IDs, missing values and IDs, gaps in ID sequences, wrong types, invalid emails and dates, extreme outliers, unexpected negatives, inconsistent spellings and extra spaces. Problem cells are coloured in the table below; you decide what to fix.
        </p>
      </Workspace>
    );
  }
  if (loading && !report) return <SkeletonBlock height={200} />;
  const score = report?.summary.score ?? 0;
  const scoreColor = score >= 98 ? '#10b981' : score >= 90 ? '#f59e0b' : '#ef4444';
  const bySeverity = (['error', 'warning', 'info'] as const).map((level) => ({ level, items: report?.issues.filter((issue) => issue.severity === level) ?? [] }));
  return (
    <Workspace title="Data quality report" subtitle="Python checks — no AI and nothing is changed" icon={ListChecks} color="#10b981">
      <ErrorNote error={error} />
      {report && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="quality-score">
            <div className="viz-tile flex items-center gap-3" style={colorVar(scoreColor)}>
              <div className="relative h-14 w-14 flex-shrink-0 rounded-full" style={{ background: `conic-gradient(${scoreColor} ${score * 3.6}deg, var(--muted) 0deg)` }}>
                <div className="absolute inset-1.5 flex items-center justify-center rounded-full bg-[var(--card)] text-sm font-bold">{Math.round(score)}</div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Quality score</p>
                <p className="font-semibold" style={{ color: scoreColor }}>
                  {score >= 98 ? 'Excellent' : score >= 90 ? 'Needs a look' : 'Needs work'}
                </p>
              </div>
            </div>
            {[
              { label: 'Issues found', value: report.summary.issues, color: '#ef4444' },
              { label: 'Rows affected', value: report.summary.affectedRows, color: '#f59e0b' },
              { label: 'Cells flagged', value: report.summary.flaggedCells, color: '#8b5cf6' },
              { label: 'Rows × columns checked', value: `${report.summary.rows.toLocaleString()} × ${report.summary.columns}`, color: '#0ea5e9' },
            ].map((tile) => (
              <div key={tile.label} className="viz-tile" style={colorVar(tile.color)}>
                <p className="text-xs text-muted-foreground">{tile.label}</p>
                <p className="text-2xl font-bold" style={{ color: tile.color }}>
                  {typeof tile.value === 'number' ? tile.value.toLocaleString() : tile.value}
                </p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3" data-testid="issue-list">
            {bySeverity.map(({ level, items }) => {
              const meta = SEVERITY[level]!;
              return (
                <div key={level} className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: meta.color }}>
                    <meta.icon size={15} aria-hidden /> {meta.label} · {items.length}
                  </h3>
                  {items.map((issue) => (
                    <IssueCard key={issue.id} issue={issue} onShow={() => setFilter(issue.type)} />
                  ))}
                  {!items.length && <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">Nothing here.</p>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Workspace>
  );
}

/* --- Organize ------------------------------------------------------------------------------- */

const DATE_PARTS = ['year', 'quarter', 'month', 'month_name', 'week', 'weekday_name', 'day', 'hour'];
const FILL_STRATEGIES = ['mean', 'median', 'mode', 'zero', 'forward', 'value'] as const;
const FILL_LABELS: Record<(typeof FILL_STRATEGIES)[number], string> = {
  mean: 'Average',
  median: 'Median (middle value)',
  mode: 'Most common value',
  zero: 'Zero',
  forward: 'Value from the row above',
  value: 'My own value…',
};
type Fill = { column: string; strategy: (typeof FILL_STRATEGIES)[number]; value: string };
type Cast = { column: string; type: 'number' | 'date' | 'text' };
type Rename = { column: string; name: string };

function useOrganize(dataset: Dataset | undefined) {
  const visualize = useRepository('visualize');
  const { refreshDatasets, setDatasetId } = useVisualize();
  const [dedupe, setDedupe] = useState(false);
  const [trim, setTrim] = useState(false);
  const [dropBlanks, setDropBlanks] = useState(false);
  const [dropColumns, setDropColumns] = useState<string[]>([]);
  const [fills, setFills] = useState<Fill[]>([]);
  const [casts, setCasts] = useState<Cast[]>([]);
  const [renames, setRenames] = useState<Rename[]>([]);
  const [dateColumn, setDateColumn] = useState('');
  const [parts, setParts] = useState<string[]>([]);
  const [transform, setTransform] = useState<AnalysisTransform>({});
  const [saveName, setSaveName] = useState('');
  const reset = () => {
    setDedupe(false);
    setTrim(false);
    setDropBlanks(false);
    setDropColumns([]);
    setFills([]);
    setCasts([]);
    setRenames([]);
    setDateColumn('');
    setParts([]);
    setTransform({});
  };
  useEffect(() => {
    reset();
    setSaveName(dataset ? `${dataset.name} (organized)` : '');
  }, [dataset?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = useMemo<VizOrganizeSteps>(() => {
    const clean: NonNullable<VizOrganizeSteps['clean']> = {};
    if (dedupe) clean.dedupe = true;
    if (trim) clean.trim_text = true;
    if (dropBlanks) clean.drop_missing = 'any';
    if (dropColumns.length) clean.drop_columns = dropColumns;
    const validFills = fills.filter((fill) => fill.column);
    if (validFills.length) clean.fill_missing = Object.fromEntries(validFills.map((fill) => [fill.column, { strategy: fill.strategy, value: fill.value }]));
    const validCasts = casts.filter((cast) => cast.column);
    if (validCasts.length) clean.cast = Object.fromEntries(validCasts.map((cast) => [cast.column, cast.type]));
    const validRenames = renames.filter((rename) => rename.column && rename.name.trim());
    if (validRenames.length) clean.rename = Object.fromEntries(validRenames.map((rename) => [rename.column, rename.name.trim()]));
    if (dateColumn && parts.length) clean.date_parts = { [dateColumn]: parts };
    return { clean, transform };
  }, [dedupe, trim, dropBlanks, dropColumns, fills, casts, renames, dateColumn, parts, transform]);
  const stepCount = Object.keys(steps.clean ?? {}).length + Object.keys(transform).length;

  const preview = useMutation({ mutationFn: (next: VizOrganizeSteps) => visualize.organizePreview(dataset?.id ?? '', next) });
  const save = useMutation({
    mutationFn: () => visualize.organizeSave(dataset?.id ?? '', steps, saveName.trim() || `${dataset?.name ?? 'Dataset'} (organized)`),
    onSuccess: async (created) => {
      await refreshDatasets();
      setDatasetId(created.id);
    },
  });
  return { dedupe, setDedupe, trim, setTrim, dropBlanks, setDropBlanks, dropColumns, setDropColumns, fills, setFills, casts, setCasts, renames, setRenames, dateColumn, setDateColumn, parts, setParts, transform, setTransform, saveName, setSaveName, steps, stepCount, preview, save, reset };
}
type Organize = ReturnType<typeof useOrganize>;

function OrganizeRibbon({ organize }: { organize: Organize }) {
  const { preview, save, steps } = organize;
  return (
    <>
      <RibbonGroup title="Quick clean-up">
        <button type="button" className="viz-tool" aria-pressed={organize.dedupe} onClick={() => organize.setDedupe(!organize.dedupe)} data-testid="organize-dedupe">
          <Trash2 size={18} aria-hidden /> Duplicates
        </button>
        <button type="button" className="viz-tool" aria-pressed={organize.trim} onClick={() => organize.setTrim(!organize.trim)}>
          <Eraser size={18} aria-hidden /> Trim spaces
        </button>
        <button type="button" className="viz-tool" aria-pressed={organize.dropBlanks} onClick={() => organize.setDropBlanks(!organize.dropBlanks)}>
          <Filter size={18} aria-hidden /> Drop blanks
        </button>
      </RibbonGroup>
      <RibbonGroup title="Steps">
        <div className="flex flex-col items-center px-2">
          <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{organize.stepCount}</span>
          <span className="text-[11px] text-muted-foreground">active</span>
        </div>
        <button type="button" className="viz-tool" onClick={organize.reset} disabled={!organize.stepCount}>
          <RotateCcw size={18} aria-hidden /> Reset
        </button>
      </RibbonGroup>
      <RibbonGroup title="Result">
        <button type="button" className="viz-tool" style={colorVar('#0ea5e9')} onClick={() => preview.mutate(steps)} disabled={preview.isPending} data-testid="organize-preview">
          {preview.isPending ? <RefreshCw size={18} className="animate-spin" aria-hidden /> : <Eye size={18} aria-hidden />} Preview
        </button>
        <RibbonField label="Save as a new dataset" width={200}>
          <input className="viz-field" value={organize.saveName} onChange={(event) => organize.setSaveName(event.target.value)} aria-label="New dataset name" />
        </RibbonField>
        <button type="button" className="viz-tool" style={colorVar('#10b981')} onClick={() => save.mutate()} disabled={save.isPending} data-testid="organize-save">
          <Save size={18} aria-hidden /> Save
        </button>
      </RibbonGroup>
    </>
  );
}

function StepCard({ title, icon: Icon, color, children, onAdd }: { title: string; icon: LucideIcon; color: string; children: React.ReactNode; onAdd?: () => void }) {
  return (
    <div className="rounded-xl border border-border p-3" style={{ ...colorVar(color), borderTop: `3px solid ${color}` }}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Icon size={14} style={{ color }} aria-hidden /> {title}
        </h3>
        {onAdd && (
          <button type="button" className="viz-chip" onClick={onAdd}>
            <Plus size={12} aria-hidden /> Add
          </button>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Remove({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-md px-1.5 text-muted-foreground hover:bg-accent" aria-label="Remove step">
      <X size={14} />
    </button>
  );
}

function OrganizeWorkspace({ organize, profiles }: { organize: Organize; profiles: ColumnProfile[] }) {
  const columns = profiles.map((profile) => profile.name);
  const dates = profiles.filter((profile) => profile.kind === 'datetime').map((profile) => profile.name);
  const options = columns.map((column) => (
    <option key={column} value={column}>
      {humanize(column)}
    </option>
  ));
  const { fills, setFills, casts, setCasts, renames, setRenames, preview, save } = organize;
  const previewColumns = preview.data?.profile.columns ?? [];
  return (
    <Workspace title="Organize" subtitle="Build cleaning steps, preview the result, then save it as a new dataset (the original stays as it is)" icon={Eraser} color="#8b5cf6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <StepCard title="Fill blanks" icon={ClipboardPaste} color="#f59e0b" onAdd={() => setFills([...fills, { column: '', strategy: 'median', value: '' }])}>
          {!fills.length && <p className="text-xs text-muted-foreground">Replace empty cells with an average, the most common value or your own value.</p>}
          {fills.map((fill, index) => (
            <div key={index} className="flex gap-1.5">
              <select className="viz-field" value={fill.column} onChange={(event) => setFills(fills.map((f, i) => (i === index ? { ...f, column: event.target.value } : f)))} aria-label="Column to fill">
                <option value="">Column…</option>
                {options}
              </select>
              <select className="viz-field" value={fill.strategy} onChange={(event) => setFills(fills.map((f, i) => (i === index ? { ...f, strategy: event.target.value as Fill['strategy'] } : f)))} aria-label="Fill with">
                {FILL_STRATEGIES.map((strategy) => (
                  <option key={strategy} value={strategy}>
                    {FILL_LABELS[strategy]}
                  </option>
                ))}
              </select>
              {fill.strategy === 'value' && <input className="viz-field" value={fill.value} onChange={(event) => setFills(fills.map((f, i) => (i === index ? { ...f, value: event.target.value } : f)))} aria-label="Fill value" />}
              <Remove onClick={() => setFills(fills.filter((_, i) => i !== index))} />
            </div>
          ))}
        </StepCard>
        <StepCard title="Change column type" icon={Hash} color="#6366f1" onAdd={() => setCasts([...casts, { column: '', type: 'number' }])}>
          {!casts.length && <p className="text-xs text-muted-foreground">Turn text into numbers or dates (currency symbols and commas are removed).</p>}
          {casts.map((cast, index) => (
            <div key={index} className="flex gap-1.5">
              <select className="viz-field" value={cast.column} onChange={(event) => setCasts(casts.map((c, i) => (i === index ? { ...c, column: event.target.value } : c)))} aria-label="Column to convert">
                <option value="">Column…</option>
                {options}
              </select>
              <select className="viz-field" value={cast.type} onChange={(event) => setCasts(casts.map((c, i) => (i === index ? { ...c, type: event.target.value as Cast['type'] } : c)))} aria-label="New type">
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="text">Text</option>
              </select>
              <Remove onClick={() => setCasts(casts.filter((_, i) => i !== index))} />
            </div>
          ))}
        </StepCard>
        <StepCard title="Rename columns" icon={Type} color="#ec4899" onAdd={() => setRenames([...renames, { column: '', name: '' }])}>
          {!renames.length && <p className="text-xs text-muted-foreground">Give columns clearer names for charts and reports.</p>}
          {renames.map((rename, index) => (
            <div key={index} className="flex gap-1.5">
              <select className="viz-field" value={rename.column} onChange={(event) => setRenames(renames.map((r, i) => (i === index ? { ...r, column: event.target.value } : r)))} aria-label="Column to rename">
                <option value="">Column…</option>
                {options}
              </select>
              <input className="viz-field" placeholder="New name" value={rename.name} onChange={(event) => setRenames(renames.map((r, i) => (i === index ? { ...r, name: event.target.value } : r)))} aria-label="New name" />
              <Remove onClick={() => setRenames(renames.filter((_, i) => i !== index))} />
            </div>
          ))}
        </StepCard>
        <StepCard title="Remove columns" icon={Trash2} color="#ef4444">
          <div className="flex flex-wrap gap-1.5">
            {columns.map((column) => (
              <button
                key={column}
                type="button"
                className="viz-chip"
                style={colorVar('#ef4444')}
                aria-pressed={organize.dropColumns.includes(column)}
                title={column}
                onClick={() => organize.setDropColumns(organize.dropColumns.includes(column) ? organize.dropColumns.filter((c) => c !== column) : [...organize.dropColumns, column])}
              >
                {humanize(column)}
              </button>
            ))}
          </div>
        </StepCard>
        <StepCard title="Split dates into parts" icon={Calendar} color="#0ea5e9">
          {dates.length ? (
            <>
              <select className="viz-field" value={organize.dateColumn} onChange={(event) => organize.setDateColumn(event.target.value)} aria-label="Date column">
                <option value="">Date column…</option>
                {dates.map((column) => (
                  <option key={column} value={column}>
                    {humanize(column)}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-1.5">
                {DATE_PARTS.map((part) => (
                  <button key={part} type="button" className="viz-chip" aria-pressed={organize.parts.includes(part)} onClick={() => organize.setParts(organize.parts.includes(part) ? organize.parts.filter((p) => p !== part) : [...organize.parts, part])}>
                    {humanize(part)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">This dataset has no date columns.</p>
          )}
        </StepCard>
        <StepCard title="Filter, group and sort" icon={Filter} color="#10b981">
          <TransformBuilder
            columns={columns}
            busy={preview.isPending}
            runLabel="Apply and preview"
            onRun={(next) => {
              organize.setTransform(next);
              preview.mutate({ ...organize.steps, transform: next });
            }}
          />
        </StepCard>
      </div>
      <ErrorNote error={preview.error ?? save.error} />
      {save.isSuccess && <p className="text-sm text-emerald-600">Saved and opened the new dataset.</p>}
      {preview.data && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">
            Result preview · {preview.data.profile.rows?.toLocaleString()} rows × {previewColumns.length} columns
          </p>
          <div className="viz-scroll" data-testid="organize-result" style={{ maxHeight: 300 }}>
            <table className="viz-table">
              <thead>
                <tr>
                  {previewColumns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.data.preview.slice(0, 100).map((row, index) => (
                  <tr key={index}>
                    {previewColumns.map((column) => (
                      <td key={column}>{formatValue(row[column])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Workspace>
  );
}

/* --- Column profile --------------------------------------------------------------------------- */

function ProfileRibbon({ search, setSearch, kind, setKind, sort, setSort }: { search: string; setSearch: (v: string) => void; kind: string; setKind: (v: string) => void; sort: string; setSort: (v: string) => void }) {
  return (
    <>
      <RibbonGroup title="Find">
        <RibbonField label="Column name" width={200}>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input className="viz-field pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search columns" aria-label="Search columns" />
          </div>
        </RibbonField>
      </RibbonGroup>
      <RibbonGroup title="Type">
        <div className="flex flex-wrap gap-1.5">
          {['all', 'numeric', 'categorical', 'datetime', 'boolean'].map((value) => (
            <button key={value} type="button" className="viz-chip" style={colorVar(KIND_STYLE[value]?.color)} aria-pressed={kind === value} onClick={() => setKind(value)}>
              {value === 'all' ? 'All types' : value}
            </button>
          ))}
        </div>
      </RibbonGroup>
      <RibbonGroup title="Order">
        <RibbonField label="Sort by" width={170}>
          <select className="viz-field" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort columns">
            <option value="position">Dataset order</option>
            <option value="name">Name</option>
            <option value="missing">Most missing</option>
            <option value="distinct">Most distinct</option>
          </select>
        </RibbonField>
      </RibbonGroup>
    </>
  );
}

function ProfileWorkspace({ profiles, search, kind, sort }: { profiles: ColumnProfile[]; search: string; kind: string; sort: string }) {
  const shown = profiles
    .filter((profile) => (kind === 'all' || profile.kind === kind) && profile.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'missing' ? b.nullRatio - a.nullRatio : sort === 'distinct' ? b.distinct - a.distinct : 0));
  return (
    <Workspace title="Column profile" subtitle={`${shown.length} of ${profiles.length} columns`} icon={Table2} color="#6366f1">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="profile-cards">
        {shown.map((profile) => {
          const style = KIND_STYLE[profile.kind] ?? KIND_STYLE.text!;
          const filled = 1 - profile.nullRatio;
          const top = profile.topValues ?? [];
          const max = Math.max(1, ...top.map((value) => value.count));
          const numericRange = typeof profile.min === 'number' && typeof profile.max === 'number' && typeof profile.median === 'number';
          const position = numericRange && profile.max !== profile.min ? (((profile.median as number) - (profile.min as number)) / ((profile.max as number) - (profile.min as number))) * 100 : 50;
          return (
            <article key={profile.name} className="overflow-hidden rounded-xl border border-border">
              <header className="flex items-center justify-between gap-2 px-3 py-2" style={{ background: `color-mix(in srgb, ${style.color} 12%, transparent)` }}>
                <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                  <style.icon size={14} style={{ color: style.color }} aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate" title={profile.name}>
                      {humanize(profile.name)}
                    </span>
                    {humanize(profile.name) !== profile.name && <span className="block truncate font-mono text-[10px] font-normal text-muted-foreground">{profile.name}</span>}
                  </span>
                </span>
                <KindBadge kind={profile.kind} />
              </header>
              <div className="space-y-2 p-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="relative h-11 w-11 flex-shrink-0 rounded-full" style={{ background: `conic-gradient(${filled > 0.8 ? '#10b981' : '#f59e0b'} ${filled * 360}deg, var(--muted) 0deg)` }}>
                    <div className="absolute inset-1 flex items-center justify-center rounded-full bg-[var(--card)] text-[10px] font-bold">{Math.round(filled * 100)}%</div>
                  </div>
                  <dl className="grid flex-1 grid-cols-2 gap-x-2">
                    <dt className="text-muted-foreground">Filled</dt>
                    <dd className="text-right font-medium">{(filled * 100).toFixed(1)}%</dd>
                    <dt className="text-muted-foreground">Distinct</dt>
                    <dd className="text-right font-medium">{profile.distinct.toLocaleString()}</dd>
                    {profile.kind === 'numeric' && (
                      <>
                        <dt className="text-muted-foreground">Average</dt>
                        <dd className="text-right font-medium">{formatValue(profile.mean)}</dd>
                      </>
                    )}
                  </dl>
                </div>
                {numericRange && (
                  <div>
                    <div className="relative h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${style.color}33, ${style.color})` }}>
                      <span className="absolute -top-1 h-4 w-1 rounded bg-[var(--foreground)]" style={{ left: `${position}%` }} title="Median" />
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>{formatValue(profile.min)}</span>
                      <span>median {formatValue(profile.median)}</span>
                      <span>{formatValue(profile.max)}</span>
                    </div>
                  </div>
                )}
                {profile.kind === 'datetime' && (
                  <p className="text-muted-foreground">
                    {String(profile.min ?? '').slice(0, 10)} → {String(profile.max ?? '').slice(0, 10)}
                  </p>
                )}
                {top.length > 0 && (
                  <ul className="space-y-1">
                    {top.map((value) => (
                      <li key={value.value} className="flex items-center gap-2">
                        <span className="w-20 truncate" title={value.value}>
                          {value.value}
                        </span>
                        <span className="h-2 rounded-full" style={{ width: `${(value.count / max) * 55}%`, background: style.color }} />
                        <span className="text-muted-foreground">{value.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </Workspace>
  );
}

/* --- Insights --------------------------------------------------------------------------------- */

const INSIGHT_STYLE: Record<string, { color: string; icon: LucideIcon; label: string }> = {
  overview: { color: '#6366f1', icon: Database, label: 'Overview' },
  quality: { color: '#f59e0b', icon: AlertTriangle, label: 'Data quality' },
  correlation: { color: '#ec4899', icon: Sparkles, label: 'Relationships' },
  distribution: { color: '#10b981', icon: Hash, label: 'Distributions' },
  outliers: { color: '#ef4444', icon: AlertOctagon, label: 'Outliers' },
  composition: { color: '#8b5cf6', icon: Type, label: 'Composition' },
  trend: { color: '#0ea5e9', icon: TrendingUp, label: 'Trends' },
  comparison: { color: '#14b8a6', icon: Table2, label: 'Comparisons' },
};

function InsightsRibbon({ kinds, kind, setKind, onRefresh, loading }: { kinds: string[]; kind: string; setKind: (v: string) => void; onRefresh: () => void; loading: boolean }) {
  return (
    <>
      <RibbonGroup title="Show">
        <div className="flex max-w-[620px] flex-wrap gap-1.5">
          <button type="button" className="viz-chip" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>
            All
          </button>
          {kinds.map((value) => (
            <button key={value} type="button" className="viz-chip" style={colorVar(INSIGHT_STYLE[value]?.color)} aria-pressed={kind === value} onClick={() => setKind(value)}>
              {INSIGHT_STYLE[value]?.label ?? value}
            </button>
          ))}
        </div>
      </RibbonGroup>
      <RibbonGroup title="Refresh">
        <button type="button" className="viz-tool" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} aria-hidden /> Recalculate
        </button>
      </RibbonGroup>
    </>
  );
}

function InsightsWorkspace({ insights, recommendations, kind, loading, error }: { insights: VizInsight[]; recommendations: { chartType: string; name: string; category: string; reason: string; fields: Record<string, string | string[]>; options?: Record<string, string | number | boolean> }[]; kind: string; loading: boolean; error: unknown }) {
  const { catalog, openStudio, datasetId } = useVisualize();
  if (loading && !insights.length) return <SkeletonBlock height={220} />;
  const shown = insights.filter((item) => kind === 'all' || item.kind === kind);
  const chartName = (id: string) => catalog?.charts.find((chart) => chart.id === id)?.name ?? id;
  return (
    <Workspace title="Insights" subtitle="Found by pandas and SciPy — no AI credits used" icon={Lightbulb} color="#f59e0b">
      <ErrorNote error={error} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="insights-panel">
        {shown.map((insight) => {
          const style = INSIGHT_STYLE[insight.kind] ?? INSIGHT_STYLE.overview!;
          return (
            <article key={insight.id} className="flex gap-3 rounded-xl border border-border p-3" style={{ ...colorVar(style.color), borderLeft: `4px solid ${style.color}` }}>
              <span className="viz-icon h-9 w-9">
                <style.icon size={17} aria-hidden />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: style.color }}>
                  {style.label}
                </p>
                <p className="text-sm font-semibold">{insight.title}</p>
                <p className="text-xs text-muted-foreground">{insight.detail}</p>
                {insight.chart && (
                  <button type="button" className="text-xs font-semibold hover:underline" style={{ color: style.color }} onClick={() => openStudio({ ...insight.chart!, datasetId })}>
                    Show as {chartName(insight.chart.chartType).toLowerCase()} →
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {recommendations.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Suggested charts</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="recommendations">
            {recommendations.map((item) => {
              const category = catalog?.categories.find((entry) => entry.id === item.category);
              return (
                <button key={item.chartType} type="button" className="viz-card viz-lift p-3 text-left" style={{ ...colorVar(category?.color), boxShadow: 'none' }} onClick={() => openStudio({ chartType: item.chartType, fields: item.fields, options: item.options, datasetId })}>
                  <span className="viz-badge mb-1">{category?.name}</span>
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.reason}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Workspace>
  );
}

/* --- Page ------------------------------------------------------------------------------------- */

export function DataPage() {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const { dataset, datasetId, setAssistantContext, refreshDatasets } = useVisualize();
  const [tab, setTab] = useState<RibbonTabId>('home');
  const [scanned, setScanned] = useState(false);
  const [filter, setFilter] = useState('');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [sort, setSort] = useState('position');
  const [insightKind, setInsightKind] = useState('all');
  const profiles = dataset?.profile.columnProfiles ?? [];
  const organize = useOrganize(dataset);

  useEffect(() => {
    setAssistantContext({ page: 'data' });
  }, [setAssistantContext]);
  useEffect(() => {
    setScanned(false);
    setFilter('');
  }, [datasetId]);
  const firstPreview = useQuery({
    queryKey: ['visualize', 'preview-profile', datasetId],
    queryFn: () => visualize.preview(datasetId, 0, 1),
    enabled: !!datasetId && !profiles.length,
  });
  useEffect(() => {
    if (firstPreview.data && !profiles.length) void refreshDatasets();
  }, [firstPreview.data, profiles.length, refreshDatasets]);
  const quality = useQuery({
    queryKey: ['visualize', 'quality', datasetId, dataset?.updatedAt],
    queryFn: () => visualize.quality(datasetId),
    enabled: scanned && !!datasetId,
  });
  const insights = useQuery({
    queryKey: ['visualize', 'insights', datasetId],
    queryFn: () => visualize.insights(datasetId),
    enabled: !!datasetId && tab === 'insights',
  });
  const insightKinds = [...new Set((insights.data?.insights ?? []).map((item) => item.kind))];

  return (
    <div className="space-y-4" data-testid="visualize-data">
      <Ribbon
        testId="data-ribbon"
        active={tab}
        onChange={(id) => setTab(id as RibbonTabId)}
        tabs={[
          { id: 'home', label: t('visualize.data.home', 'Home'), icon: Home },
          { id: 'quality', label: t('visualize.data.quality', 'Check quality'), icon: ListChecks },
          { id: 'organize', label: t('visualize.data.organize', 'Organize'), icon: Eraser },
          { id: 'profile', label: t('visualize.data.profile', 'Column profile'), icon: Table2 },
          { id: 'insights', label: t('visualize.data.insightsTab', 'Insights'), icon: Lightbulb },
        ]}
        aside={dataset ? <span className="hidden text-xs text-muted-foreground md:inline">{dataset.name}</span> : null}
      >
        {tab === 'home' && <HomeTab dataset={dataset} onDeleted={() => setFilter('')} />}
        {tab === 'quality' && (
          <QualityRibbon report={quality.data} loading={quality.isFetching} onScan={() => (scanned ? void quality.refetch() : setScanned(true))} filter={filter} setFilter={setFilter} hidden={hidden} setHidden={setHidden} />
        )}
        {tab === 'organize' && <OrganizeRibbon organize={organize} />}
        {tab === 'profile' && <ProfileRibbon search={search} setSearch={setSearch} kind={kind} setKind={setKind} sort={sort} setSort={setSort} />}
        {tab === 'insights' && <InsightsRibbon kinds={insightKinds} kind={insightKind} setKind={setInsightKind} onRefresh={() => void insights.refetch()} loading={insights.isFetching} />}
      </Ribbon>
      {tab === 'quality' && dataset && <QualityWorkspace report={quality.data} loading={quality.isFetching} error={quality.error} setFilter={setFilter} />}
      {tab === 'organize' && dataset && profiles.length > 0 && <OrganizeWorkspace organize={organize} profiles={profiles} />}
      {tab === 'profile' && profiles.length > 0 && <ProfileWorkspace profiles={profiles} search={search} kind={kind} sort={sort} />}
      {tab === 'insights' && dataset && (
        <InsightsWorkspace insights={insights.data?.insights ?? []} recommendations={insights.data?.recommendations ?? []} kind={insightKind} loading={insights.isLoading} error={insights.error} />
      )}
      {dataset ? (
        <DataGrid dataset={dataset} profiles={profiles} report={quality.data} scanned={scanned && !!quality.data} filter={filter} hidden={hidden} />
      ) : (
        <div className="viz-card viz-card-pad flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
          <Database size={28} aria-hidden />
          {t('visualize.data.pick', 'Add data from the Home tab: upload a file, paste CSV or load a sample.')}
        </div>
      )}
    </div>
  );
}

/** Ribbon “Home”: choose, add, replace, share, download and delete datasets. */
function HomeTab({ dataset, onDeleted }: { dataset: Dataset | undefined; onDeleted: () => void }) {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const analytics = useRepository('analytics');
  const queryClient = useQueryClient();
  const { catalog, datasets, datasetId, setDatasetId, refreshDatasets, openStudio, openPredict } = useVisualize();
  const upload = useRef<HTMLInputElement>(null);
  const replace = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [csv, setCsv] = useState('');
  const [sample, setSample] = useState('');
  const [name, setName] = useState(dataset?.name ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setName(dataset?.name ?? ''), [dataset?.name]);

  const select = async (created: Dataset) => {
    await refreshDatasets();
    setDatasetId(created.id);
  };
  const create = useMutation({
    mutationFn: async (input: { file?: File; csv?: string; sample?: string }) => {
      // New data is named after its file or sample; the single “Name” field renames it afterwards.
      if (input.file) return visualize.importFile(input.file);
      if (input.csv !== undefined) return analytics.createDataset({ name: 'Pasted data', csv: input.csv });
      return visualize.createSample(input.sample || catalog?.samples[0]?.id || 'retail_sales');
    },
    onSuccess: async (created) => {
      setPasting(false);
      setCsv('');
      await select(created);
    },
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['visualize'] });
  const replaceData = useMutation({
    mutationFn: (file: File) => visualize.replaceDataset(datasetId, file),
    onSuccess: async () => {
      await refreshDatasets();
      await invalidate();
    },
  });
  const update = useMutation({
    mutationFn: (patch: { name?: string; isShared?: boolean }) => visualize.updateDataset(datasetId, patch),
    onSuccess: () => refreshDatasets(),
  });
  const remove = useMutation({
    mutationFn: () => analytics.deleteDataset(datasetId),
    onSuccess: async () => {
      setConfirmDelete(false);
      await refreshDatasets();
      await invalidate();
      onDeleted();
    },
  });
  const exporter = useMutation({
    mutationFn: async ({ type, graphs = false }: { type: 'csv' | 'xlsx' | 'json'; graphs?: boolean }) =>
      saveBlob(await visualize.exportDataset(datasetId, type, { graphs }), `${safeName(dataset?.name ?? 'dataset')}${graphs ? '-with-charts' : ''}.${type}`),
  });
  const accept = catalog?.importFormats.flatMap((format) => format.extensions.split(',')).join(',') ?? '.csv';
  const busy = create.isPending || replaceData.isPending;

  return (
    <>
      <RibbonGroup title={t('visualize.data.dataset', 'Dataset')}>
        <RibbonField label={t('visualize.data.open', 'Open')} width={210}>
          <select className="viz-field" value={datasetId} onChange={(event) => setDatasetId(event.target.value)} aria-label="Dataset" data-testid="dataset-picker">
            {!datasets.length && <option value="">No datasets yet</option>}
            {datasets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </RibbonField>
        <RibbonField label={t('visualize.data.rename', 'Name')} width={170}>
          <input
            className="viz-field"
            value={name}
            disabled={!dataset}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => dataset && name.trim() && name.trim() !== dataset.name && update.mutate({ name: name.trim() })}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            title="Rename this dataset (new data is named after its file)"
            aria-label="Dataset name"
            data-testid="dataset-name"
          />
        </RibbonField>
        <button type="button" className="viz-tool" disabled={!dataset} aria-pressed={dataset?.isShared ?? false} onClick={() => dataset && update.mutate({ isShared: !dataset.isShared })} title="Share with your workspace">
          <Share2 size={18} aria-hidden /> {dataset?.isShared ? 'Shared' : 'Share'}
        </button>
        <button type="button" className="viz-tool" style={colorVar('#ef4444')} disabled={!dataset} onClick={() => setConfirmDelete(true)}>
          <Trash2 size={18} aria-hidden /> Delete
        </button>
      </RibbonGroup>
      <RibbonGroup title={t('visualize.data.add', 'Add data')}>
        <input
          ref={upload}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) create.mutate({ file });
            event.target.value = '';
          }}
          data-testid="import-file"
        />
        <button type="button" className="viz-tool" onClick={() => upload.current?.click()} disabled={busy} title="CSV, TSV, TXT, JSON, JSONL or Excel (.xlsx)">
          <Upload size={18} aria-hidden /> Upload
        </button>
        <button type="button" className="viz-tool" aria-pressed={pasting} onClick={() => setPasting(!pasting)} data-testid="toggle-paste">
          <ClipboardPaste size={18} aria-hidden /> Paste
        </button>
        <RibbonField label={t('visualize.data.sample', 'Sample')} width={160}>
          <select className="viz-field" value={sample} onChange={(event) => setSample(event.target.value)} aria-label="Sample dataset">
            {catalog?.samples.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </RibbonField>
        <button type="button" className="viz-tool" onClick={() => create.mutate({ sample: sample || catalog?.samples[0]?.id })} disabled={busy} data-testid="load-sample">
          <Rocket size={18} aria-hidden /> Load
        </button>
      </RibbonGroup>
      {pasting && (
        <RibbonGroup title={t('visualize.data.paste', 'Paste CSV')} grow>
          <textarea
            className="viz-field font-mono text-xs"
            rows={4}
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            placeholder={'region,product,revenue\nEast,A,120'}
            aria-label="CSV text"
            data-testid="import-paste"
          />
          <Button size="sm" className="viz-primary gap-1.5" disabled={!csv.trim()} isLoading={create.isPending} onClick={() => create.mutate({ csv })} data-testid="import-submit">
            <Plus size={14} aria-hidden /> Add dataset
          </Button>
        </RibbonGroup>
      )}
      <RibbonGroup title={t('visualize.data.fix', 'Corrected file')}>
        <input
          ref={replace}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) replaceData.mutate(file);
            event.target.value = '';
          }}
          data-testid="replace-file"
        />
        <button type="button" className="viz-tool" disabled={!dataset || busy} onClick={() => replace.current?.click()} title="Fixed it in Excel? Re-upload to replace this dataset's data.">
          <FileUp size={18} aria-hidden /> Re-upload
        </button>
      </RibbonGroup>
      <RibbonGroup title={t('visualize.data.download', 'Download')}>
        <button type="button" className="viz-tool" disabled={!dataset || exporter.isPending} onClick={() => exporter.mutate({ type: 'csv' })} data-testid="export-csv">
          <Download size={18} aria-hidden /> CSV
        </button>
        <button type="button" className="viz-tool" disabled={!dataset || exporter.isPending} onClick={() => exporter.mutate({ type: 'xlsx' })} title="Excel workbook: the values and their profile" data-testid="export-xlsx">
          <FileSpreadsheet size={18} aria-hidden /> Excel values
        </button>
        <button
          type="button"
          className="viz-tool"
          style={colorVar('#10b981')}
          disabled={!dataset || exporter.isPending}
          onClick={() => exporter.mutate({ type: 'xlsx', graphs: true })}
          title="Excel workbook: the values plus suggested charts, each drawn as an editable Excel chart beside its numbers"
          data-testid="export-xlsx-charts"
        >
          {exporter.isPending && exporter.variables?.graphs ? <RefreshCw size={18} className="animate-spin" aria-hidden /> : <BarChart3 size={18} aria-hidden />} Excel + charts
        </button>
        <button type="button" className="viz-tool" disabled={!dataset || exporter.isPending} onClick={() => exporter.mutate({ type: 'json' })} data-testid="export-json">
          <FileJson size={18} aria-hidden /> JSON
        </button>
      </RibbonGroup>
      {(create.error ?? replaceData.error ?? update.error ?? exporter.error ?? remove.error) ? (
        <RibbonGroup title="" grow>
          <ErrorNote error={create.error ?? replaceData.error ?? update.error ?? exporter.error ?? remove.error} />
        </RibbonGroup>
      ) : null}
      <RibbonGroup title={t('visualize.data.next', 'Next')} pinned>
        <button type="button" className="viz-tool visualize" disabled={!dataset} onClick={() => openStudio({ chartType: 'bar', datasetId })} data-testid="go-visualize">
          <Wand2 size={18} aria-hidden /> Visualize
        </button>
        <button type="button" className="viz-tool predict" disabled={!dataset} onClick={() => openPredict({ task: 'forecast', datasetId })} data-testid="go-predict">
          <BrainCircuit size={18} aria-hidden /> Predict
        </button>
      </RibbonGroup>
      <ConfirmDialog
        open={confirmDelete}
        title={t('visualize.data.deleteTitle', 'Delete dataset?')}
        description={t('visualize.data.deleteText', 'This removes {{name}} and its analysis results. Saved charts keep their snapshot.', { name: dataset?.name ?? '' })}
        confirmLabel={t('common.delete', 'Delete')}
        destructive
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

/** The dataset itself: issues coloured in place, double-click a cell to edit, mark rows for deletion. */
function DataGrid({
  dataset,
  profiles,
  report,
  scanned,
  filter,
  hidden,
}: {
  dataset: Dataset;
  profiles: ColumnProfile[];
  report: VizQualityReport | undefined;
  scanned: boolean;
  filter: string;
  hidden: Set<string>;
}) {
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const { refreshDatasets } = useVisualize();
  const [offset, setOffset] = useState(0);
  const [edits, setEdits] = useState<Map<string, VizCellEdit>>(new Map());
  const [deletes, setDeletes] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  useEffect(() => {
    setOffset(0);
    setEdits(new Map());
    setDeletes(new Set());
  }, [dataset.id, dataset.updatedAt, filter]);
  const preview = useQuery({
    queryKey: ['visualize', 'preview', dataset.id, dataset.updatedAt, offset, scanned, filter],
    queryFn: () => visualize.preview(dataset.id, offset, PAGE, { issues: scanned, filter }),
  });
  const kinds = Object.fromEntries(profiles.map((profile) => [profile.name, profile.kind]));
  const meta = useMemo(() => Object.fromEntries((report?.types ?? []).map((type) => [type.type, type])), [report]);
  const columns = preview.data?.profile.columns ?? dataset.columns;
  const total = preview.data?.total ?? 0;
  const save = useMutation({
    mutationFn: () => visualize.editDataset(dataset.id, [...edits.values()], [...deletes]),
    onSuccess: async () => {
      setEdits(new Map());
      setDeletes(new Set());
      await refreshDatasets();
      await queryClient.invalidateQueries({ queryKey: ['visualize'] });
    },
  });
  const pending = edits.size + deletes.size;

  if (preview.isLoading) return <SkeletonBlock height={420} />;
  return (
    <section className="viz-card viz-card-pad space-y-2" data-testid="data-grid">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold" data-testid="active-dataset">
            {dataset.name}
          </h1>
          <p className="text-xs text-muted-foreground">
            {(preview.data?.datasetRows ?? dataset.rowCount ?? 0).toLocaleString()} rows · {columns.length} columns
            {filter && ` · showing ${total.toLocaleString()} ${filter === 'issues' ? 'rows with issues' : (meta[filter]?.label ?? filter).toLowerCase() + ' rows'}`}
            {' · '}double-click a cell to correct it
          </p>
        </div>
        {pending > 0 && (
          <div className="flex items-center gap-2" data-testid="pending-edits">
            <span className="text-xs text-muted-foreground">
              {edits.size} cell edit(s), {deletes.size} row(s) to delete
            </span>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => { setEdits(new Map()); setDeletes(new Set()); }}>
              <RotateCcw size={13} aria-hidden /> Discard
            </Button>
            <Button size="sm" className="viz-primary gap-1" isLoading={save.isPending} onClick={() => save.mutate()} data-testid="save-edits">
              <Save size={13} aria-hidden /> Save changes
            </Button>
          </div>
        )}
      </div>
      <ErrorNote error={preview.error ?? save.error} />
      <div className="viz-scroll" style={{ maxHeight: '68vh' }}>
        <table className="viz-table">
          <thead>
            <tr>
              <th className="text-muted-foreground">#</th>
              {columns.map((column) => (
                <th key={column}>
                  <div className="flex items-center gap-1.5">
                    {column} {kinds[column] && <KindBadge kind={kinds[column]} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.data?.rows.map((row, index) => {
              const position = preview.data.rowNumbers[index] ?? offset + index;
              const flags = preview.data.flags?.[String(position)] ?? {};
              const rowTypes = (flags['*'] ?? []).filter((type) => !hidden.has(type));
              const rowColor = rowTypes.length ? meta[rowTypes[0] ?? '']?.color : undefined;
              const deleted = deletes.has(position);
              return (
                <tr key={position} className={`${rowColor ? 'flagged-row' : ''} ${deleted ? 'deleted' : ''}`} style={rowColor ? ({ '--flag': rowColor } as React.CSSProperties) : undefined} title={rowTypes.map((type) => meta[type]?.label).join(', ')}>
                  <td className="whitespace-nowrap text-muted-foreground">
                    <button
                      type="button"
                      className="mr-1 rounded p-0.5 hover:bg-accent hover:text-destructive"
                      aria-label={deleted ? `Keep row ${position + 1}` : `Delete row ${position + 1}`}
                      onClick={() => {
                        const next = new Set(deletes);
                        if (next.has(position)) next.delete(position);
                        else next.add(position);
                        setDeletes(next);
                      }}
                    >
                      {deleted ? <RotateCcw size={12} /> : <Trash2 size={12} />}
                    </button>
                    {position + 1}
                  </td>
                  {columns.map((column) => {
                    const key = cellKey(position, column);
                    const types = (flags[column] ?? []).filter((type) => !hidden.has(type));
                    const flag = types.length ? meta[types[0] ?? '']?.color : undefined;
                    const edit = edits.get(key);
                    const value = edit ? edit.value : row[column];
                    return (
                      <td
                        key={column}
                        className={`${flag ? 'flagged' : ''} ${edit ? 'edited' : ''}`}
                        style={flag ? ({ '--flag': flag } as React.CSSProperties) : undefined}
                        title={types.length ? types.map((type) => meta[type]?.label).join(', ') : formatValue(value)}
                        onDoubleClick={() => setEditing(key)}
                        data-flag={types[0]}
                      >
                        {editing === key ? (
                          <input
                            autoFocus
                            defaultValue={value == null ? '' : formatValue(value).replace(/,/g, '')}
                            aria-label={`Edit ${column} in row ${position + 1}`}
                            onBlur={(event) => {
                              const next = new Map(edits);
                              next.set(key, { row: position, column, value: event.target.value });
                              setEdits(next);
                              setEditing(null);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') event.currentTarget.blur();
                              if (event.key === 'Escape') setEditing(null);
                            }}
                          />
                        ) : (
                          formatValue(value)
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Rows {total ? offset + 1 : 0}–{Math.min(offset + PAGE, total)} of {total.toLocaleString()}
        </span>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} aria-label="Previous rows">
            <ChevronLeft size={14} />
          </Button>
          <Button size="sm" variant="outline" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} aria-label="Next rows">
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </section>
  );
}

