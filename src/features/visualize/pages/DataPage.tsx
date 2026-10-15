import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Hash,
  Home,
  Info,
  Lightbulb,
  Pin,
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
  type ColumnProfile,
  type Dataset,
  type VizCellEdit,
  type VizInsight,
  type VizIssue,
  type VizPipelineStep,
  type VizQualityReport,
} from '@/lib/data';
import { Button, ConfirmDialog } from '@/shared/components';
import { useVisualize } from '../context';
import { safeName, saveBlob } from '../echarts';
import { Ribbon, RibbonField, RibbonGroup } from '../Ribbon';
import { PinDialog, type PinnableVisual } from '../dashboards/PinDialog';
import { ChartThumb } from '../thumbs';
import { colorVar, ErrorNote, formatValue, humanize, KindBadge, MenuButton, SkeletonBlock } from '../ui';
import { fixFor, KIND_BY_OP, newStep } from './data/steps';
import { TransformWorkspace } from './data/Transform';

type RibbonTabId = 'home' | 'quality' | 'transform' | 'profile' | 'insights';
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

function IssueCard({ issue, onShow, onFix }: { issue: VizIssue; onShow: () => void; onFix: (steps: VizPipelineStep[]) => void }) {
  const fix = fixFor(issue);
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
      <div className="flex flex-col gap-1 self-start">
        {issue.rows.length > 0 && (
          <button type="button" className="viz-chip" onClick={onShow}>
            <Eye size={12} aria-hidden /> Rows
          </button>
        )}
        {fix && (
          <button type="button" className="viz-chip primary" onClick={() => onFix(fix.steps)} title="Adds a step in Transform; nothing changes until you save" data-testid={`fix-${issue.type}`}>
            <Wand2 size={12} aria-hidden /> {fix.label}
          </button>
        )}
      </div>
    </article>
  );
}

function QualityWorkspace({ report, loading, error, filter, setFilter, onFix }: { report: VizQualityReport | undefined; loading: boolean; error: unknown; filter: string; setFilter: (value: string) => void; onFix: (steps: VizPipelineStep[]) => void }) {
  if (!report && !loading && !error) {
    return (
      <Workspace title="Data quality report" subtitle="Python checks — no AI and nothing is changed" icon={ListChecks} color="#10b981">
        <p className="text-sm text-muted-foreground">Press <b>Check data</b>: problems are coloured in the table and each comes with a one-click fix.</p>
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
          <div className="flex flex-wrap gap-1.5" data-testid="quality-chips">
            {report.types.map((type) => (
              <button key={type.type} type="button" className="viz-chip" style={colorVar(type.color)} aria-pressed={filter === type.type} onClick={() => setFilter(filter === type.type ? '' : type.type)} data-testid={`quality-chip-${type.type}`}>
                <span className="h-2 w-2 rounded-full" style={{ background: type.color }} /> {type.label} · {type.count.toLocaleString()}
              </button>
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
                    <IssueCard key={issue.id} issue={issue} onShow={() => setFilter(issue.type)} onFix={onFix} />
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

/* --- Column profile ------------------------------------------------------------------------- */

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

function Histogram({ counts, color }: { counts: number[]; color: string }) {
  const peak = Math.max(1, ...counts);
  return (
    <svg viewBox={`0 0 ${counts.length * 6} 24`} className="h-6 w-full" preserveAspectRatio="none" aria-label="Distribution" data-testid="profile-histogram">
      {counts.map((count, index) => (
        <rect key={index} x={index * 6 + 0.5} y={24 - (count / peak) * 24} width={5} height={(count / peak) * 24} fill={color} rx={0.8} />
      ))}
    </svg>
  );
}

function ProfileDetails({ profile, onClose }: { profile: ColumnProfile; onClose: () => void }) {
  const rows: [string, unknown][] = [
    ['Type', profile.kind],
    ['Filled', `${((1 - profile.nullRatio) * 100).toFixed(1)}%`],
    ['Blank', profile.nulls],
    ['Distinct', profile.distinct],
    ['Minimum', profile.min],
    ['25th percentile', (profile as { p25?: number }).p25],
    ['Median', profile.median],
    ['Average', profile.mean],
    ['75th percentile', (profile as { p75?: number }).p75],
    ['Maximum', profile.max],
    ['Standard deviation', profile.std],
  ];
  return (
    <aside className="dash-personalize" role="dialog" aria-label={`${profile.name} details`} data-testid="profile-details">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{humanize(profile.name)}</p>
        <button type="button" className="viz-icon-button" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>
      {profile.histogram && <Histogram counts={profile.histogram} color="#6366f1" />}
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {rows
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{typeof value === 'number' ? formatValue(value) : String(value)}</dd>
            </div>
          ))}
      </dl>
      {(profile.topValues?.length ?? 0) > 0 && (
        <>
          <p className="viz-label mt-3">Most common</p>
          <ul className="space-y-0.5 text-xs">
            {profile.topValues!.map((value) => (
              <li key={value.value} className="flex justify-between gap-2">
                <span className="truncate">{value.value}</span>
                <span className="text-muted-foreground">{value.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

function ProfileWorkspace({ profiles, search, kind, sort, onStep }: { profiles: ColumnProfile[]; search: string; kind: string; sort: string; onStep: (steps: VizPipelineStep[]) => void }) {
  const [details, setDetails] = useState<ColumnProfile | null>(null);
  const shown = profiles
    .filter((profile) => (kind === 'all' || profile.kind === kind) && profile.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'missing' ? b.nullRatio - a.nullRatio : sort === 'distinct' ? b.distinct - a.distinct : 0));
  return (
    <Workspace title="Column profile" subtitle={`${shown.length} of ${profiles.length} columns`} icon={Table2} color="#6366f1">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" data-testid="profile-cards">
        {shown.map((profile) => {
          const style = KIND_STYLE[profile.kind] ?? KIND_STYLE.text!;
          const filled = 1 - profile.nullRatio;
          const top = profile.topValues ?? [];
          const max = Math.max(1, ...top.map((value) => value.count));
          const numericRange = typeof profile.min === 'number' && typeof profile.max === 'number' && typeof profile.median === 'number';
          const position = numericRange && profile.max !== profile.min ? (((profile.median as number) - (profile.min as number)) / ((profile.max as number) - (profile.min as number))) * 100 : 50;
          return (
            <article key={profile.name} className="overflow-hidden rounded-xl border border-border" data-testid={`profile-${profile.name}`}>
              <header
                className="flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5"
                style={{ background: `color-mix(in srgb, ${style.color} 12%, transparent)` }}
                onClick={() => setDetails(profile)}
                title="Full statistics"
              >
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
              <div className="space-y-1.5 p-2.5 text-xs">
                {profile.histogram && <Histogram counts={profile.histogram} color={style.color} />}
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
                  <ul className="space-y-0.5">
                    {top.map((value) => (
                      <li key={value.value} className="viz-profile-value">
                        <span className="w-20 truncate" title={value.value}>
                          {value.value}
                        </span>
                        <span className="h-2 rounded-full" style={{ width: `${(value.count / max) * 45}%`, background: style.color }} />
                        <span className="text-muted-foreground">{value.count}</span>
                        <span className="viz-value-actions">
                          <button type="button" title="Keep only these rows" onClick={() => onStep([{ ...newStep('filter_rows'), conditions: [{ field: profile.name, op: 'in', value: [value.value] }] }])} data-testid={`keep-${profile.name}-${value.value}`}>
                            Keep
                          </button>
                          <button type="button" title="Exclude these rows" onClick={() => onStep([{ ...newStep('filter_rows'), mode: 'remove', conditions: [{ field: profile.name, op: 'in', value: [value.value] }] }])}>
                            Exclude
                          </button>
                          <button type="button" title="Replace this value" onClick={() => onStep([{ ...newStep('replace_values', profile.name), find: value.value, replace: '' }])}>
                            Replace
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {details && <ProfileDetails profile={details} onClose={() => setDetails(null)} />}
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
  const [pinning, setPinning] = useState<{ visual: PinnableVisual; title: string } | null>(null);
  const [open, setOpen] = useState('');
  if (loading && !insights.length) return <SkeletonBlock height={220} />;
  const shown = insights.filter((item) => kind === 'all' || item.kind === kind);
  return (
    <Workspace title="Insights" subtitle="Found by pandas and SciPy — no AI credits used" icon={Lightbulb} color="#f59e0b">
      <ErrorNote error={error} />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="insights-panel">
        {shown.map((insight) => {
          const style = INSIGHT_STYLE[insight.kind] ?? INSIGHT_STYLE.overview!;
          const chart = insight.chart;
          return (
            <article key={insight.id} className="viz-insight-card" style={{ ...colorVar(style.color), borderLeft: `4px solid ${style.color}` }} data-testid={`insight-${insight.id}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: style.color }}>
                    {style.label}
                  </p>
                  <p className="line-clamp-2 text-sm font-semibold" title={insight.title}>
                    {insight.headline ?? insight.title}
                  </p>
                  {insight.value && (
                    <p className="text-lg font-bold" style={{ color: style.color }}>
                      {insight.value}
                    </p>
                  )}
                </div>
                {chart && (
                  <span className="w-16 flex-none">
                    <ChartThumb id={chart.chartType} color={style.color} />
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <button type="button" className="viz-icon-button" aria-expanded={open === insight.id} onClick={() => setOpen(open === insight.id ? '' : insight.id)} aria-label="Why" title="What this means">
                  <Info size={13} />
                </button>
                {chart && (
                  <>
                    <button type="button" className="viz-chip" onClick={() => openStudio({ ...chart, datasetId })}>
                      Explore
                    </button>
                    <button
                      type="button"
                      className="viz-chip"
                      onClick={() => setPinning({ title: insight.headline ?? insight.title, visual: { type: 'chart', data: { datasetId, wells: {} }, format: { chart: { chartType: chart.chartType, fields: chart.fields ?? {}, options: chart.options ?? {} } } } })}
                      data-testid={`insight-pin-${insight.id}`}
                    >
                      <Pin size={12} aria-hidden /> Add to dashboard
                    </button>
                  </>
                )}
              </div>
              {open === insight.id && (
                <p className="text-xs text-muted-foreground" role="note">
                  {insight.title}. {insight.detail}
                </p>
              )}
            </article>
          );
        })}
      </div>
      {pinning && <PinDialog visual={pinning.visual} title={pinning.title} onClose={() => setPinning(null)} />}
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
  // Applied steps (Transform tab); quality fixes and profile actions add to them.
  const [pipeline, setPipeline] = useState<VizPipelineStep[]>([]);
  const [selectedStep, setSelectedStep] = useState(0);
  useEffect(() => {
    setPipeline([]);
    setSelectedStep(0);
  }, [datasetId]);
  const addSteps = (steps: VizPipelineStep[]) => {
    setPipeline((current) => [...current, ...steps]);
    setSelectedStep(pipeline.length + steps.length - 1);
    setTab('transform');
  };

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
          { id: 'transform', label: pipeline.length ? `${t('visualize.data.transform', 'Transform')} · ${pipeline.length}` : t('visualize.data.transform', 'Transform'), icon: Eraser },
          { id: 'profile', label: t('visualize.data.profile', 'Column profile'), icon: Table2 },
          { id: 'insights', label: t('visualize.data.insightsTab', 'Insights'), icon: Lightbulb },
        ]}
        aside={dataset ? <span className="hidden text-xs text-muted-foreground md:inline">{dataset.name}</span> : null}
      >
        {tab === 'home' && <HomeTab dataset={dataset} onDeleted={() => setFilter('')} />}
        {tab === 'quality' && (
          <QualityRibbon report={quality.data} loading={quality.isFetching} onScan={() => (scanned ? void quality.refetch() : setScanned(true))} filter={filter} setFilter={setFilter} hidden={hidden} setHidden={setHidden} />
        )}
        {tab === 'transform' && (
          <RibbonGroup title={t('visualize.data.quick', 'Quick clean-up')}>
            {(['remove_duplicates', 'trim', 'remove_blank_rows'] as const).map((op) => (
              <button key={op} type="button" className="viz-tool" disabled={!dataset} onClick={() => addSteps([newStep(op)])} data-testid={`quick-${op}`}>
                <Wand2 size={18} aria-hidden /> {KIND_BY_OP[op]!.label}
              </button>
            ))}
            <button type="button" className="viz-tool" disabled={!pipeline.length} onClick={() => setPipeline([])}>
              <RotateCcw size={18} aria-hidden /> {t('visualize.data.clearSteps', 'Clear steps')}
            </button>
          </RibbonGroup>
        )}
        {tab === 'profile' && <ProfileRibbon search={search} setSearch={setSearch} kind={kind} setKind={setKind} sort={sort} setSort={setSort} />}
        {tab === 'insights' && <InsightsRibbon kinds={insightKinds} kind={insightKind} setKind={setInsightKind} onRefresh={() => void insights.refetch()} loading={insights.isFetching} />}
      </Ribbon>
      {tab === 'quality' && dataset && <QualityWorkspace report={quality.data} loading={quality.isFetching} error={quality.error} filter={filter} setFilter={setFilter} onFix={addSteps} />}
      {tab === 'transform' && dataset && profiles.length > 0 && <TransformWorkspace dataset={dataset} pipeline={pipeline} setPipeline={setPipeline} selected={selectedStep} setSelected={setSelectedStep} />}
      {tab === 'profile' && profiles.length > 0 && <ProfileWorkspace profiles={profiles} search={search} kind={kind} sort={sort} onStep={addSteps} />}
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
  const { catalog, datasetId, setDatasetId, refreshDatasets, openStudio, openPredict } = useVisualize();
  const navigate = useNavigate();
  const upload = useRef<HTMLInputElement>(null);
  const replace = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [csv, setCsv] = useState('');
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

  const build = useMutation({
    mutationFn: () => visualize.autoDashboard(datasetId),
    onSuccess: (dashboard) => void navigate(`/app/visualize/dashboards/${dashboard.id}`),
  });
  const error = create.error ?? replaceData.error ?? update.error ?? exporter.error ?? remove.error ?? build.error;

  return (
    <>
      <div className="viz-data-toolbar" data-testid="data-toolbar">
        <MenuButton label={dataset ? dataset.name : t('visualize.data.dataset', 'Dataset')} icon={Database} testId="menu-dataset" disabled={!dataset}>
          <label className="viz-menu-field">
            <span>{t('visualize.data.rename', 'Name')}</span>
            <input
              className="viz-field h-8"
              value={name}
              disabled={!dataset}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => dataset && name.trim() && name.trim() !== dataset.name && update.mutate({ name: name.trim() })}
              onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
              aria-label="Dataset name"
              data-testid="dataset-name"
            />
          </label>
          <button type="button" role="menuitem" disabled={!dataset} onClick={() => dataset && update.mutate({ isShared: !dataset.isShared })} data-close>
            <Share2 size={14} aria-hidden /> {dataset?.isShared ? 'Stop sharing' : 'Share with my workspace'}
          </button>
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
          <button type="button" role="menuitem" disabled={!dataset || busy} onClick={() => replace.current?.click()} title="Fixed it in Excel? Re-upload to replace this dataset's data." data-close>
            <FileUp size={14} aria-hidden /> Re-upload a corrected file
          </button>
          <button type="button" role="menuitem" className="text-destructive" disabled={!dataset} onClick={() => setConfirmDelete(true)} data-close>
            <Trash2 size={14} aria-hidden /> Delete dataset
          </button>
        </MenuButton>
        <MenuButton label={t('visualize.data.add', 'Add data')} icon={Plus} testId="menu-add">
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
          <button type="button" role="menuitem" onClick={() => upload.current?.click()} disabled={busy} title="CSV, TSV, TXT, JSON, JSONL or Excel (.xlsx)" data-close>
            <Upload size={14} aria-hidden /> Upload a file
          </button>
          <button type="button" role="menuitem" onClick={() => setPasting(!pasting)} data-testid="toggle-paste" data-close>
            <ClipboardPaste size={14} aria-hidden /> Paste CSV
          </button>
          <p className="dash-menu-title">Samples</p>
          {catalog?.samples.map((item) => (
            <button key={item.id} type="button" role="menuitem" disabled={busy} onClick={() => create.mutate({ sample: item.id })} title={item.description} data-testid={`load-sample-${item.id}`} data-close>
              <Rocket size={14} aria-hidden /> {item.name}
            </button>
          ))}
        </MenuButton>
        <MenuButton label={t('visualize.data.download', 'Download')} icon={Download} testId="menu-download" disabled={!dataset}>
          <button type="button" role="menuitem" disabled={!dataset || exporter.isPending} onClick={() => exporter.mutate({ type: 'csv' })} data-testid="export-csv" data-close>
            <Download size={14} aria-hidden /> CSV
          </button>
          <button type="button" role="menuitem" disabled={!dataset || exporter.isPending} onClick={() => exporter.mutate({ type: 'xlsx' })} data-testid="export-xlsx" data-close>
            <FileSpreadsheet size={14} aria-hidden /> Excel (values and profile)
          </button>
          <button type="button" role="menuitem" disabled={!dataset || exporter.isPending} onClick={() => exporter.mutate({ type: 'xlsx', graphs: true })} data-testid="export-xlsx-charts" data-close>
            <BarChart3 size={14} aria-hidden /> Excel with charts
          </button>
          <button type="button" role="menuitem" disabled={!dataset || exporter.isPending} onClick={() => exporter.mutate({ type: 'json' })} data-testid="export-json" data-close>
            <FileJson size={14} aria-hidden /> JSON
          </button>
        </MenuButton>
        {exporter.isPending && <RefreshCw size={14} className="animate-spin text-muted-foreground" aria-label="Preparing download" />}
        <span className="flex-1" />
        <span className="text-xs text-muted-foreground" data-testid="active-dataset">
          {dataset ? `${dataset.name} · ${(dataset.profile.rows ?? dataset.rowCount ?? 0).toLocaleString()} rows` : ''}
        </span>
      </div>
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
      {error ? (
        <RibbonGroup title="" grow>
          <ErrorNote error={error} />
        </RibbonGroup>
      ) : null}
      <RibbonGroup title={t('visualize.data.next', 'Next')} pinned>
        <button type="button" className="viz-tool" disabled={!dataset} onClick={() => openStudio({ chartType: 'bar', datasetId })} data-testid="go-visualize">
          <Wand2 size={18} aria-hidden /> Explore
        </button>
        <button type="button" className="viz-tool predict" disabled={!dataset} onClick={() => openPredict({ task: 'forecast', datasetId })} data-testid="go-predict">
          <BrainCircuit size={18} aria-hidden /> Predict
        </button>
        <button type="button" className="viz-primary inline-flex h-9 items-center gap-1.5 self-center rounded-lg px-3 text-sm font-semibold text-white" disabled={!dataset || build.isPending} onClick={() => build.mutate()} data-testid="build-dashboard">
          <Sparkles size={15} aria-hidden /> {build.isPending ? 'Building…' : 'Build dashboard →'}
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
  /** Valid / problem / empty shares of a column (Power Query's quality bar): empty from the
   *  profile, problems from the last quality scan. */
  const columnHealth = (column: string) => {
    const profile = profiles.find((entry) => entry.name === column);
    const rows = report?.summary.rows ?? dataset.profile.rows ?? 0;
    if (!profile || !rows) return null;
    const empty = Math.min(1, profile.nullRatio);
    const flagged = new Set((report?.issues ?? []).filter((issue) => issue.column === column && issue.type !== 'missing_value').flatMap((issue) => issue.rows));
    const error = Math.min(1 - empty, flagged.size / rows);
    return { valid: Math.max(0, 1 - empty - error), error, empty };
  };
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
              {columns.map((column) => {
                const health = columnHealth(column);
                return (
                  <th key={column}>
                    <div className="flex items-center gap-1.5">
                      {column} {kinds[column] && <KindBadge kind={kinds[column]} />}
                    </div>
                    {health && (
                      <div
                        className="viz-quality-bar"
                        title={`${(health.valid * 100).toFixed(1)}% valid · ${(health.error * 100).toFixed(1)}% with problems · ${(health.empty * 100).toFixed(1)}% empty`}
                        data-testid={`quality-bar-${column}`}
                      >
                        <span className="valid" style={{ width: `${health.valid * 100}%` }} />
                        <span className="error" style={{ width: `${health.error * 100}%` }} />
                        <span className="empty" style={{ width: `${health.empty * 100}%` }} />
                      </div>
                    )}
                  </th>
                );
              })}
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

