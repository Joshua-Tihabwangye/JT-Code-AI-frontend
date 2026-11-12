import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronRight, Eye, EyeOff, Lock, Plus, RotateCcw, Search, Trash2, Unlock, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n/config';
import { formatNumber, inlineLabel } from '@/i18n/format';
import { useRepository, type DashboardFilter, type DashboardPage, type DashboardSpec, type DashboardVisual } from '@/lib/data';
import { useVisualize } from '../context';
import { humanize } from '../ui';
import { filterCards, type FilterCard } from './runtime';

type Level = FilterCard['level'];
/** Condition operators (ids); their names are `visualize.dashboards.filters.ops.<id>`. */
const OPERATORS = ['eq', 'ne', 'contains', 'starts_with', 'gt', 'gte', 'lt', 'lte', 'blank', 'not_blank'] as const;
const UNITS = ['day', 'week', 'month', 'quarter', 'year'] as const;

/** A short, plain description of a filter (“Region is East, West”), in the chosen language. */
export function describeFilter(filter: DashboardFilter): string {
  const t = i18n.t.bind(i18n);
  const name = filter.label || humanize(filter.field);
  const value = filter.value;
  switch (filter.op) {
    case 'in': {
      if (!Array.isArray(value) || !value.length) return t('visualize.dashboards.filters.describe.all', { name });
      const values = value.slice(0, 3).map(String).join(', ');
      return value.length > 3 ? t('visualize.dashboards.filters.describe.inMore', { name, values, more: value.length - 3 }) : t('visualize.dashboards.filters.describe.in', { name, values });
    }
    case 'not_in':
      return t('visualize.dashboards.filters.describe.notIn', { name, values: (value as unknown[]).map(String).join(', ') });
    case 'between':
      return t('visualize.dashboards.filters.describe.between', { name, range: (value as unknown[]).map((v) => String(v).slice(0, 10)).join(' – ') });
    case 'top': {
      const top = value as { n: number; direction?: string; by?: { field: string } };
      const by = top.by?.field === '*' ? t('visualize.dashboards.filters.describe.byCount') : humanize(top.by?.field ?? '');
      return t(top.direction === 'bottom' ? 'visualize.dashboards.filters.describe.bottom' : 'visualize.dashboards.filters.describe.top', { n: top.n, name, by });
    }
    case 'relative': {
      const rel = value as { mode: string; n?: number; unit: string };
      const count = rel.mode === 'this' ? 1 : (rel.n ?? 1);
      const unit = t(`visualize.dashboards.filters.units.${rel.unit}`, { count });
      return t(`visualize.dashboards.filters.describe.relative.${rel.mode === 'next' ? 'next' : rel.mode === 'this' ? 'this' : 'last'}`, { name, count, unit });
    }
    case 'or':
    case 'and':
      return (value as DashboardFilter[]).map(describeFilter).join(t(filter.op === 'or' ? 'visualize.dashboards.filters.describe.orJoin' : 'visualize.dashboards.filters.describe.andJoin'));
    case 'blank':
    case 'not_blank':
      return t(`visualize.dashboards.filters.describe.${filter.op === 'blank' ? 'blank' : 'notBlank'}`, { name });
    default: {
      const op = (OPERATORS as readonly string[]).includes(filter.op) ? t(`visualize.dashboards.filters.ops.${filter.op}`) : filter.op;
      return t('visualize.dashboards.filters.describe.condition', { name, op, value: typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value) });
    }
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
  const { t } = useTranslation();
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
      <select className="viz-field" value={type} disabled={readOnly} onChange={(event) => setType(event.target.value)} aria-label={t('visualize.dashboards.filters.type')}>
        <option value="basic">{t('visualize.dashboards.filters.types.basic')}</option>
        <option value="advanced">{t('visualize.dashboards.filters.types.advanced')}</option>
        <option value="top">{t('visualize.dashboards.filters.types.top')}</option>
        {kind === 'datetime' && <option value="relative">{t('visualize.dashboards.filters.types.relative')}</option>}
      </select>
      {type === 'basic' && (
        <>
          <label className="dash-pane-search">
            <Search size={12} aria-hidden />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('visualize.dashboards.filters.search')} aria-label={t('visualize.dashboards.filters.searchValues')} />
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
                    <span className="ml-auto text-[10px] opacity-60">{formatNumber(option.count)}</span>
                  </button>
                );
              })}
            {values.isLoading && <span className="text-xs text-muted-foreground">{t('visualize.dashboards.filters.loadingValues')}</span>}
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
                aria-label={t('visualize.dashboards.filters.condition')}
              >
                {OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {t(`visualize.dashboards.filters.ops.${op}`)}
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
                  aria-label={t('visualize.dashboards.filters.value')}
                />
              )}
            </div>
          ))}
          {!readOnly && (
            <div className="flex items-center gap-1 text-xs">
              {conditions.length === 1 ? (
                <>
                  <button type="button" className="viz-chip" onClick={() => onChange({ field: filter.field, op: 'and', value: [conditions[0]!, { field: filter.field, op: conditions[0]!.op, value: '' }], id: filter.id, label: filter.label })}>
                    {t('visualize.dashboards.filters.addAnd')}
                  </button>
                  <button type="button" className="viz-chip" onClick={() => onChange({ field: filter.field, op: 'or', value: [conditions[0]!, { field: filter.field, op: conditions[0]!.op, value: '' }], id: filter.id, label: filter.label })}>
                    {t('visualize.dashboards.filters.addOr')}
                  </button>
                </>
              ) : (
                <>
                  <select className="viz-field w-auto" value={filter.op} onChange={(event) => onChange({ ...filter, op: event.target.value })} aria-label={t('visualize.dashboards.filters.combineWith')}>
                    <option value="and">{t('visualize.dashboards.filters.and')}</option>
                    <option value="or">{t('visualize.dashboards.filters.or')}</option>
                  </select>
                  <button type="button" className="viz-chip" onClick={() => onChange({ ...conditions[0]!, id: filter.id, label: filter.label })}>
                    {t('visualize.dashboards.filters.removeSecond')}
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
  const { t } = useTranslation();
  const { datasets } = useVisualize();
  const numeric = datasets.find((d) => d.id === datasetId)?.profile.columnProfiles?.filter((p) => p.kind === 'numeric') ?? [];
  const value = filter.value as { n: number; direction: string; by: { field: string; agg?: string } };
  const set = (patch: Partial<typeof value>) => onChange({ ...filter, value: { ...value, ...patch } });
  return (
    <div className="grid grid-cols-2 gap-1">
      <select className="viz-field" disabled={readOnly} value={value.direction} onChange={(event) => set({ direction: event.target.value })} aria-label={t('visualize.dashboards.filters.topOrBottom')}>
        <option value="top">{t('visualize.dashboards.filters.topWord')}</option>
        <option value="bottom">{t('visualize.dashboards.filters.bottomWord')}</option>
      </select>
      <input className="viz-field" disabled={readOnly} type="number" min={1} max={1000} value={value.n} onChange={(event) => set({ n: Math.max(1, Number(event.target.value) || 1) })} aria-label={t('visualize.dashboards.filters.howMany')} />
      <select
        className="viz-field col-span-2"
        disabled={readOnly}
        value={value.by.field}
        onChange={(event) => set({ by: { field: event.target.value, agg: event.target.value === '*' ? 'count' : 'sum' } })}
        aria-label={t('visualize.dashboards.filters.byValue')}
      >
        <option value="*">{t('visualize.dashboards.filters.byRows')}</option>
        {numeric.map((profile) => (
          <option key={profile.name} value={profile.name}>
            {t('visualize.dashboards.filters.byTotal', { field: inlineLabel(humanize(profile.name)) })}
          </option>
        ))}
      </select>
    </div>
  );
}

function RelativeEditor({ filter, onChange, readOnly }: { filter: DashboardFilter; onChange: (filter: DashboardFilter) => void; readOnly: boolean }) {
  const { t } = useTranslation();
  const value = filter.value as { mode: string; n: number; unit: string };
  const set = (patch: Partial<typeof value>) => onChange({ ...filter, value: { ...value, ...patch } });
  return (
    <div className="grid grid-cols-3 gap-1">
      <select className="viz-field" disabled={readOnly} value={value.mode} onChange={(event) => set({ mode: event.target.value })} aria-label={t('visualize.dashboards.filters.period')}>
        <option value="last">{t('visualize.dashboards.filters.modes.last')}</option>
        <option value="this">{t('visualize.dashboards.filters.modes.this')}</option>
        <option value="next">{t('visualize.dashboards.filters.modes.next')}</option>
      </select>
      <input className="viz-field" disabled={readOnly || value.mode === 'this'} type="number" min={1} value={value.n} onChange={(event) => set({ n: Math.max(1, Number(event.target.value) || 1) })} aria-label={t('visualize.dashboards.filters.howMany')} />
      <select className="viz-field" disabled={readOnly} value={value.unit} onChange={(event) => set({ unit: event.target.value })} aria-label={t('visualize.dashboards.filters.unit')}>
        {UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {t(`visualize.dashboards.filters.units.${unit}`, { count: value.mode === 'this' ? 1 : value.n })}
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
  const { t } = useTranslation();
  const cards = useMemo(() => filterCards(spec, page), [spec, page]);
  const [open, setOpen] = useState<string>('');
  const [adding, setAdding] = useState<Level | ''>('');
  const sections: { level: Level; title: string; cards: FilterCard[] }[] = [
    ...(visual ? [{ level: 'visual' as const, title: t('visualize.dashboards.filters.onVisual'), cards: cards.filter((c) => c.visualId === visual.id) }] : []),
    { level: 'page', title: t('visualize.dashboards.filters.onPage'), cards: cards.filter((c) => c.level === 'page') },
    { level: 'dashboard', title: t('visualize.dashboards.filters.onAllPages'), cards: cards.filter((c) => c.level === 'dashboard') },
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
          {t('visualize.dashboards.filters.active', { count: active })}
        </span>
        {!editable && Object.keys(overrides).length > 0 && (
          <button type="button" className="viz-chip" onClick={onReset}>
            <RotateCcw size={11} aria-hidden /> {t('visualize.dashboards.filters.resetToAuthor')}
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
                      {readOnly && <Lock size={11} className="text-muted-foreground" aria-label={t('visualize.dashboards.filters.lockedByAuthor')} />}
                      {editable && (
                        <>
                          <button type="button" title={card.filter.locked ? t('visualize.dashboards.filters.unlock') : t('visualize.dashboards.filters.lock')} onClick={() => onEdit?.(card.level, (list) => list.map((f, i) => (cardKeyOf(card, f, i) ? { ...f, locked: !f.locked } : f)), card.visualId)}>
                            {card.filter.locked ? <Lock size={12} /> : <Unlock size={12} />}
                          </button>
                          <button type="button" title={card.filter.hidden ? t('visualize.dashboards.filters.showToViewers') : t('visualize.dashboards.filters.hideFromViewers')} onClick={() => onEdit?.(card.level, (list) => list.map((f, i) => (cardKeyOf(card, f, i) ? { ...f, hidden: !f.hidden } : f)), card.visualId)}>
                            {card.filter.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <button type="button" title={t('visualize.dashboards.filters.remove')} onClick={() => onEdit?.(card.level, (list) => list.filter((f, i) => !cardKeyOf(card, f, i)), card.visualId)}>
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                      {!editable && card.key in overrides && (
                        <button type="button" title={t('visualize.dashboards.filters.backToAuthor')} onClick={() => onOverride?.(card.key, undefined)}>
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
                            placeholder={t('visualize.dashboards.filters.cardName')}
                            onChange={(event) => onEdit?.(card.level, (list) => list.map((f, i) => (cardKeyOf(card, f, i) ? { ...f, label: event.target.value || undefined } : f)), card.visualId)}
                            aria-label={t('visualize.dashboards.filters.cardNameLabel')}
                          />
                        )}
                        <FilterEditor filter={current} datasetId={info.datasetId} kind={info.kind} onChange={change} readOnly={readOnly} />
                      </div>
                    )}
                  </div>
                );
              })}
            {!section.cards.length && <p className="text-[11px] text-muted-foreground">{t('visualize.dashboards.filters.none')}</p>}
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
                  aria-label={t('visualize.dashboards.filters.fieldToFilter')}
                  data-testid={`add-filter-field-${section.level}`}
                >
                  <option value="">{t('visualize.dashboards.filters.chooseField')}</option>
                  {fields.map((field) => (
                    <option key={field.name} value={field.name}>
                      {humanize(field.name)}
                    </option>
                  ))}
                </select>
              ) : (
                <button type="button" className="viz-chip" onClick={() => setAdding(section.level)} data-testid={`add-filter-${section.level}`}>
                  <Plus size={11} aria-hidden /> {t('visualize.dashboards.filters.add')}
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
