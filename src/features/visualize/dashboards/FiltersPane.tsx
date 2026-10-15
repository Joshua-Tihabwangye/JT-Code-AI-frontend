import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronRight, Eye, EyeOff, Lock, Plus, RotateCcw, Search, Trash2, Unlock, X } from 'lucide-react';
import { useRepository, type DashboardFilter, type DashboardPage, type DashboardSpec, type DashboardVisual } from '@/lib/data';
import { useVisualize } from '../context';
import { humanize } from '../ui';
import { filterCards, type FilterCard } from './runtime';

type Level = FilterCard['level'];
const OPERATORS: [string, string][] = [
  ['eq', 'is'],
  ['ne', 'is not'],
  ['contains', 'contains'],
  ['starts_with', 'starts with'],
  ['gt', 'is greater than'],
  ['gte', 'is at least'],
  ['lt', 'is less than'],
  ['lte', 'is at most'],
  ['blank', 'is blank'],
  ['not_blank', 'is not blank'],
];

/** A short, plain description of a filter (“Region is East, West”). */
export function describeFilter(filter: DashboardFilter): string {
  const name = filter.label || humanize(filter.field);
  const value = filter.value;
  switch (filter.op) {
    case 'in':
      return Array.isArray(value) && value.length ? `${name} is ${value.slice(0, 3).map(String).join(', ')}${value.length > 3 ? ` +${value.length - 3}` : ''}` : `${name}: all`;
    case 'not_in':
      return `${name} is not ${(value as unknown[]).map(String).join(', ')}`;
    case 'between':
      return `${name} ${(value as unknown[]).map((v) => String(v).slice(0, 10)).join(' – ')}`;
    case 'top': {
      const top = value as { n: number; direction?: string; by?: { field: string } };
      return `${top.direction === 'bottom' ? 'Bottom' : 'Top'} ${top.n} ${name} by ${top.by?.field === '*' ? 'count' : humanize(top.by?.field ?? '')}`;
    }
    case 'relative': {
      const rel = value as { mode: string; n?: number; unit: string };
      return `${name}: ${rel.mode} ${rel.mode === 'this' ? '' : `${rel.n ?? 1} `}${rel.unit}${rel.mode === 'this' || rel.n === 1 ? '' : 's'}`;
    }
    case 'or':
    case 'and':
      return (value as DashboardFilter[]).map(describeFilter).join(filter.op === 'or' ? ' or ' : ' and ');
    case 'blank':
    case 'not_blank':
      return `${name} ${filter.op === 'blank' ? 'is blank' : 'is not blank'}`;
    default:
      return `${name} ${OPERATORS.find(([op]) => op === filter.op)?.[1] ?? filter.op} ${typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value)}`;
  }
}

/** The values a field takes (asked of Python through a throwaway slicer visual). */
function useFieldValues(datasetId: string | undefined, field: string, enabled: boolean) {
  const visualize = useRepository('visualize');
  return useQuery({
    queryKey: ['visualize', 'field-values', datasetId, field],
    queryFn: () =>
      visualize.renderVisuals({
        visuals: [{ id: 'values', type: 'slicer', layout: { x: 0, y: 0, w: 1, h: 1 }, data: { datasetId: datasetId!, wells: { category: [{ field }] } }, format: { slicer: { style: 'list' } } }],
        mode: 'light',
      }),
    enabled: enabled && !!datasetId && !!field,
    staleTime: 5 * 60_000,
    select: (response) => response.visuals[0]?.slicer?.options ?? [],
  });
}

function FilterEditor({ filter, datasetId, kind, onChange, readOnly }: { filter: DashboardFilter; datasetId?: string; kind: string; onChange: (filter: DashboardFilter) => void; readOnly: boolean }) {
  const type = filter.op === 'top' ? 'top' : filter.op === 'relative' ? 'relative' : filter.op === 'in' || filter.op === 'not_in' ? 'basic' : 'advanced';
  const [search, setSearch] = useState('');
  const values = useFieldValues(datasetId, filter.field, type === 'basic');
  const chosen = new Set(((filter.op === 'in' && Array.isArray(filter.value) ? filter.value : []) as unknown[]).map(String));
  const conditions: DashboardFilter[] = filter.op === 'or' || filter.op === 'and' ? (filter.value as DashboardFilter[]) : [filter];
  const setType = (next: string) => {
    if (next === 'basic') onChange({ ...filter, op: 'in', value: [] });
    else if (next === 'advanced') onChange({ ...filter, op: kind === 'numeric' ? 'gt' : 'contains', value: '' });
    else if (next === 'top') onChange({ ...filter, op: 'top', value: { n: 5, direction: 'top', by: { field: '*', agg: 'count' } } });
    else onChange({ ...filter, op: 'relative', value: { mode: 'last', n: 3, unit: 'month' } });
  };
  return (
    <div className="space-y-2">
      <select className="viz-field" value={type} disabled={readOnly} onChange={(event) => setType(event.target.value)} aria-label="Filter type">
        <option value="basic">Basic</option>
        <option value="advanced">Advanced</option>
        <option value="top">Top N</option>
        {kind === 'datetime' && <option value="relative">Relative date</option>}
      </select>
      {type === 'basic' && (
        <>
          <label className="dash-pane-search">
            <Search size={12} aria-hidden />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" aria-label="Search values" />
          </label>
          <div className="dash-filter-values" data-testid="filter-values">
            {values.data
              ?.filter((option) => !search || option.label.toLowerCase().includes(search.toLowerCase()))
              .map((option) => {
                const on = chosen.has(String(option.value));
                return (
                  <button
                    key={option.label}
                    type="button"
                    disabled={readOnly}
                    className="dash-slicer-option"
                    aria-pressed={on}
                    onClick={() => {
                      const current = (Array.isArray(filter.value) ? filter.value : []) as unknown[];
                      onChange({ ...filter, op: 'in', value: on ? current.filter((v) => String(v) !== String(option.value)) : [...current, option.value] });
                    }}
                  >
                    <span className="dash-check">{on && <Check size={11} />}</span>
                    <span className="truncate">{option.label}</span>
                    <span className="ml-auto text-[10px] opacity-60">{option.count.toLocaleString()}</span>
                  </button>
                );
              })}
            {values.isLoading && <span className="text-xs text-muted-foreground">Loading values…</span>}
          </div>
        </>
      )}
      {type === 'advanced' && (
        <div className="space-y-1.5">
          {conditions.slice(0, 2).map((condition, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr] gap-1">
              <select
                className="viz-field"
                disabled={readOnly}
                value={condition.op}
                onChange={(event) => {
                  const next = [...conditions];
                  next[index] = { ...condition, op: event.target.value };
                  onChange(next.length > 1 ? { ...filter, value: next } : { ...next[0]!, id: filter.id, label: filter.label, locked: filter.locked, hidden: filter.hidden });
                }}
                aria-label="Condition"
              >
                {OPERATORS.map(([op, label]) => (
                  <option key={op} value={op}>
                    {label}
                  </option>
                ))}
              </select>
              {!['blank', 'not_blank'].includes(condition.op) && (
                <input
                  className="viz-field"
                  disabled={readOnly}
                  value={String((condition.value as string | number | undefined) ?? '')}
                  onChange={(event) => {
                    const raw = event.target.value;
                    const typed = kind === 'numeric' && raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
                    const next = [...conditions];
                    next[index] = { ...condition, value: typed };
                    onChange(next.length > 1 ? { ...filter, value: next } : { ...next[0]!, id: filter.id, label: filter.label, locked: filter.locked, hidden: filter.hidden });
                  }}
                  aria-label="Value"
                />
              )}
            </div>
          ))}
          {!readOnly && (
            <div className="flex items-center gap-1 text-xs">
              {conditions.length === 1 ? (
                <>
                  <button type="button" className="viz-chip" onClick={() => onChange({ field: filter.field, op: 'and', value: [conditions[0]!, { field: filter.field, op: conditions[0]!.op, value: '' }], id: filter.id, label: filter.label })}>
                    + And
                  </button>
                  <button type="button" className="viz-chip" onClick={() => onChange({ field: filter.field, op: 'or', value: [conditions[0]!, { field: filter.field, op: conditions[0]!.op, value: '' }], id: filter.id, label: filter.label })}>
                    + Or
                  </button>
                </>
              ) : (
                <>
                  <select className="viz-field w-auto" value={filter.op} onChange={(event) => onChange({ ...filter, op: event.target.value })} aria-label="Combine with">
                    <option value="and">And</option>
                    <option value="or">Or</option>
                  </select>
                  <button type="button" className="viz-chip" onClick={() => onChange({ ...conditions[0]!, id: filter.id, label: filter.label })}>
                    Remove second
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {type === 'top' && <TopEditor filter={filter} datasetId={datasetId} onChange={onChange} readOnly={readOnly} />}
      {type === 'relative' && <RelativeEditor filter={filter} onChange={onChange} readOnly={readOnly} />}
    </div>
  );
}

function TopEditor({ filter, datasetId, onChange, readOnly }: { filter: DashboardFilter; datasetId?: string; onChange: (filter: DashboardFilter) => void; readOnly: boolean }) {
  const { datasets } = useVisualize();
  const numeric = datasets.find((d) => d.id === datasetId)?.profile.columnProfiles?.filter((p) => p.kind === 'numeric') ?? [];
  const value = filter.value as { n: number; direction: string; by: { field: string; agg?: string } };
  const set = (patch: Partial<typeof value>) => onChange({ ...filter, value: { ...value, ...patch } });
  return (
    <div className="grid grid-cols-2 gap-1">
      <select className="viz-field" disabled={readOnly} value={value.direction} onChange={(event) => set({ direction: event.target.value })} aria-label="Top or bottom">
        <option value="top">Top</option>
        <option value="bottom">Bottom</option>
      </select>
      <input className="viz-field" disabled={readOnly} type="number" min={1} max={1000} value={value.n} onChange={(event) => set({ n: Math.max(1, Number(event.target.value) || 1) })} aria-label="How many" />
      <select
        className="viz-field col-span-2"
        disabled={readOnly}
        value={value.by.field}
        onChange={(event) => set({ by: { field: event.target.value, agg: event.target.value === '*' ? 'count' : 'sum' } })}
        aria-label="By value"
      >
        <option value="*">by number of rows</option>
        {numeric.map((profile) => (
          <option key={profile.name} value={profile.name}>
            by total {humanize(profile.name).toLowerCase()}
          </option>
        ))}
      </select>
    </div>
  );
}

function RelativeEditor({ filter, onChange, readOnly }: { filter: DashboardFilter; onChange: (filter: DashboardFilter) => void; readOnly: boolean }) {
  const value = filter.value as { mode: string; n: number; unit: string };
  const set = (patch: Partial<typeof value>) => onChange({ ...filter, value: { ...value, ...patch } });
  return (
    <div className="grid grid-cols-3 gap-1">
      <select className="viz-field" disabled={readOnly} value={value.mode} onChange={(event) => set({ mode: event.target.value })} aria-label="Period">
        <option value="last">Last</option>
        <option value="this">This</option>
        <option value="next">Next</option>
      </select>
      <input className="viz-field" disabled={readOnly || value.mode === 'this'} type="number" min={1} value={value.n} onChange={(event) => set({ n: Math.max(1, Number(event.target.value) || 1) })} aria-label="How many" />
      <select className="viz-field" disabled={readOnly} value={value.unit} onChange={(event) => set({ unit: event.target.value })} aria-label="Unit">
        {['day', 'week', 'month', 'quarter', 'year'].map((unit) => (
          <option key={unit} value={unit}>
            {unit}s
          </option>
        ))}
      </select>
    </div>
  );
}

/** The filters pane: dashboard, page and visual filters as cards (Power BI-style).
 *  Viewers change unlocked cards for themselves; authors add, remove, lock and hide them. */
export function FiltersPane({
  spec,
  page,
  visual,
  editable,
  overrides = {},
  onOverride,
  onReset,
  onEdit,
  datasetFor,
}: {
  spec: DashboardSpec;
  page: DashboardPage;
  visual?: DashboardVisual;
  editable: boolean;
  overrides?: Record<string, DashboardFilter | null>;
  onOverride?: (key: string, filter: DashboardFilter | null | undefined) => void;
  onReset?: () => void;
  /** Editor only: change the author's filters at a level. */
  onEdit?: (level: Level, update: (filters: DashboardFilter[]) => DashboardFilter[], visualId?: string) => void;
  datasetFor: (field: string) => { datasetId?: string; kind: string; fields: { name: string; kind: string }[] };
}) {
  const cards = useMemo(() => filterCards(spec, page), [spec, page]);
  const [open, setOpen] = useState<string>('');
  const [adding, setAdding] = useState<Level | ''>('');
  const sections: { level: Level; title: string; cards: FilterCard[] }[] = [
    ...(visual ? [{ level: 'visual' as const, title: 'Filters on this visual', cards: cards.filter((c) => c.visualId === visual.id) }] : []),
    { level: 'page', title: 'Filters on this page', cards: cards.filter((c) => c.level === 'page') },
    { level: 'dashboard', title: 'Filters on all pages', cards: cards.filter((c) => c.level === 'dashboard') },
  ];
  const active = cards.filter((card) => {
    const filter = card.key in overrides ? overrides[card.key] : card.filter;
    return filter && !(filter.op === 'in' && Array.isArray(filter.value) && !filter.value.length);
  }).length;
  const fields = datasetFor('').fields;

  return (
    <div className="space-y-3" data-testid="filters-pane">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span data-testid="filters-active">
          {active} filter{active === 1 ? '' : 's'} active
        </span>
        {!editable && Object.keys(overrides).length > 0 && (
          <button type="button" className="viz-chip" onClick={onReset}>
            <RotateCcw size={11} aria-hidden /> Reset to author
          </button>
        )}
      </div>
      {sections.map((section) => (
        <section key={section.level}>
          <p className="viz-label">{section.title}</p>
          <div className="space-y-1.5">
            {section.cards
              .filter((card) => editable || !card.filter.hidden)
              .map((card) => {
                const current = (card.key in overrides ? overrides[card.key] : card.filter) ?? { ...card.filter, op: 'in', value: [] };
                const info = datasetFor(card.filter.field);
                const readOnly = !editable && !!card.filter.locked;
                const change = (next: DashboardFilter) => {
                  if (editable) onEdit?.(card.level, (list) => list.map((f, i) => (cardKeyOf(card, f, i) ? { ...next, id: f.id, label: f.label, locked: f.locked, hidden: f.hidden } : f)), card.visualId);
                  else onOverride?.(card.key, next);
                };
                return (
                  <div key={card.key} className="dash-filter-card" data-testid={`filter-card-${card.filter.field}`}>
                    <div className="flex items-center gap-1">
                      <button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-left" onClick={() => setOpen(open === card.key ? '' : card.key)} aria-expanded={open === card.key}>
                        {open === card.key ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold">{card.filter.label || humanize(card.filter.field)}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{describeFilter(current)}</span>
                        </span>
                      </button>
                      {readOnly && <Lock size={11} className="text-muted-foreground" aria-label="Locked by the author" />}
                      {editable && (
                        <>
                          <button type="button" title={card.filter.locked ? 'Unlock for viewers' : 'Lock for viewers'} onClick={() => onEdit?.(card.level, (list) => list.map((f, i) => (cardKeyOf(card, f, i) ? { ...f, locked: !f.locked } : f)), card.visualId)}>
                            {card.filter.locked ? <Lock size={12} /> : <Unlock size={12} />}
                          </button>
                          <button type="button" title={card.filter.hidden ? 'Show to viewers' : 'Hide from viewers'} onClick={() => onEdit?.(card.level, (list) => list.map((f, i) => (cardKeyOf(card, f, i) ? { ...f, hidden: !f.hidden } : f)), card.visualId)}>
                            {card.filter.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <button type="button" title="Remove filter" onClick={() => onEdit?.(card.level, (list) => list.filter((f, i) => !cardKeyOf(card, f, i)), card.visualId)}>
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                      {!editable && card.key in overrides && (
                        <button type="button" title="Back to the author's filter" onClick={() => onOverride?.(card.key, undefined)}>
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    {open === card.key && (
                      <div className="mt-2">
                        {editable && (
                          <input
                            className="viz-field mb-1.5"
                            value={card.filter.label ?? ''}
                            placeholder="Card name (optional)"
                            onChange={(event) => onEdit?.(card.level, (list) => list.map((f, i) => (cardKeyOf(card, f, i) ? { ...f, label: event.target.value || undefined } : f)), card.visualId)}
                            aria-label="Filter card name"
                          />
                        )}
                        <FilterEditor filter={current} datasetId={info.datasetId} kind={info.kind} onChange={change} readOnly={readOnly} />
                      </div>
                    )}
                  </div>
                );
              })}
            {!section.cards.length && <p className="text-[11px] text-muted-foreground">None.</p>}
            {editable &&
              (adding === section.level ? (
                <select
                  className="viz-field"
                  autoFocus
                  defaultValue=""
                  onChange={(event) => {
                    const field = event.target.value;
                    if (!field) return;
                    const id = `f-${Date.now().toString(36)}`;
                    onEdit?.(section.level, (list) => [...list, { id, field, op: 'in', value: [], datasetId: datasetFor(field).datasetId }], section.level === 'visual' ? visual?.id : undefined);
                    setAdding('');
                    setOpen(`${section.level === 'visual' ? `visual:${visual?.id}` : section.level === 'page' ? `page:${page.id}` : 'dashboard'}:${id}`);
                  }}
                  onBlur={() => setAdding('')}
                  aria-label="Field to filter"
                  data-testid={`add-filter-field-${section.level}`}
                >
                  <option value="">Choose a field…</option>
                  {fields.map((field) => (
                    <option key={field.name} value={field.name}>
                      {humanize(field.name)}
                    </option>
                  ))}
                </select>
              ) : (
                <button type="button" className="viz-chip" onClick={() => setAdding(section.level)} data-testid={`add-filter-${section.level}`}>
                  <Plus size={11} aria-hidden /> Add a filter
                </button>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function cardKeyOf(card: FilterCard, filter: DashboardFilter, index: number): boolean {
  const suffix = card.key.slice(card.key.lastIndexOf(':') + 1);
  return (filter.id ?? String(index)) === suffix;
}
