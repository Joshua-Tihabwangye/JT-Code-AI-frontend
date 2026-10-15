import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Button, Input, Select } from '@/shared/components';
import type { AggregateOp, AnalysisTransform, FilterOperator } from '@/lib/data';
import { humanize } from '@/features/visualize/ui';

interface FilterRow {
  column: string;
  operator: FilterOperator;
  value: string;
}

const OPERATORS: FilterOperator[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'];
const AGGREGATES: AggregateOp[] = ['count', 'sum', 'mean', 'min', 'max'];

function parseValue(operator: FilterOperator, raw: string): string | number | (string | number)[] {
  const scalar = (text: string) => {
    const trimmed = text.trim();
    const number = Number(trimmed);
    return trimmed !== '' && Number.isFinite(number) ? number : trimmed;
  };
  if (operator === 'in') return raw.split(',').map(scalar).filter((v) => v !== '');
  if (operator === 'contains') return raw;
  return scalar(raw);
}

/** Builds the backend's declarative transform (filters, group/aggregate, sort, limit). */
export function TransformBuilder({
  columns,
  busy,
  onRun,
  runLabel,
}: {
  columns: string[];
  busy: boolean;
  onRun: (transform: AnalysisTransform) => void;
  runLabel?: string;
}) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [groupBy, setGroupBy] = useState('');
  const [aggregate, setAggregate] = useState<AggregateOp>('count');
  const [aggregateColumn, setAggregateColumn] = useState('');
  const [sortColumn, setSortColumn] = useState('');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState('');

  const columnOptions = columns.map((c) => ({ value: c, label: humanize(c) }));
  const optional = [{ value: '', label: t('analytics.builder.none') }, ...columnOptions];

  function build(): AnalysisTransform {
    const transform: AnalysisTransform = {};
    const valid = filters.filter((f) => f.column && f.value.trim() !== '');
    if (valid.length) transform.filters = valid.map((f) => ({ column: f.column, operator: f.operator, value: parseValue(f.operator, f.value) }));
    if (groupBy) {
      transform.group_by = [groupBy];
      transform.aggregate = aggregate === 'count' || !aggregateColumn ? aggregate : { [aggregateColumn]: aggregate };
    }
    if (sortColumn) transform.sort = [{ column: sortColumn, direction }];
    const n = Number(limit);
    if (Number.isInteger(n) && n > 0) transform.limit = Math.min(n, 10_000);
    return transform;
  }

  // Columns produced by grouping, so sorting can target them.
  const sortOptions = groupBy
    ? [
        { value: '', label: t('analytics.builder.none') },
        { value: groupBy, label: humanize(groupBy) },
        aggregate === 'count'
          ? { value: 'count', label: 'count' }
          : aggregateColumn
            ? { value: `${aggregateColumn}_${aggregate}`, label: `${humanize(aggregateColumn)} (${aggregate})` }
            : null,
      ].filter((o): o is { value: string; label: string } => o !== null)
    : optional;

  return (
    <div className="space-y-4" data-testid="transform-builder">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-medium text-foreground">{t('analytics.builder.filters')}</h4>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1"
            disabled={filters.length >= 20 || !columns.length}
            onClick={() => setFilters([...filters, { column: columns[0] ?? '', operator: 'eq', value: '' }])}
          >
            <Plus size={14} /> {t('analytics.builder.addFilter')}
          </Button>
        </div>
        {filters.length === 0 && <p className="text-xs text-muted-foreground">{t('analytics.builder.noFilters')}</p>}
        {filters.map((filter, index) => (
          <div key={index} className="mb-2 grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
            <Select
              aria-label={t('analytics.builder.column')}
              options={columnOptions}
              value={filter.column}
              onChange={(e) => setFilters(filters.map((f, i) => (i === index ? { ...f, column: e.target.value } : f)))}
            />
            <Select
              aria-label={t('analytics.builder.operator')}
              options={OPERATORS.map((op) => ({ value: op, label: t(`analytics.operators.${op}`) }))}
              value={filter.operator}
              onChange={(e) => setFilters(filters.map((f, i) => (i === index ? { ...f, operator: e.target.value as FilterOperator } : f)))}
            />
            <Input
              aria-label={t('analytics.builder.value')}
              placeholder={filter.operator === 'in' ? t('analytics.builder.inPlaceholder') : t('analytics.builder.value')}
              value={filter.value}
              onChange={(e) => setFilters(filters.map((f, i) => (i === index ? { ...f, value: e.target.value } : f)))}
            />
            <Button type="button" variant="ghost" size="sm" aria-label={t('analytics.builder.removeFilter')} onClick={() => setFilters(filters.filter((_, i) => i !== index))}>
              <X size={14} />
            </Button>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">{t('analytics.builder.groupBy')}</label>
          <Select aria-label={t('analytics.builder.groupBy')} options={optional} value={groupBy} onChange={(e) => { setGroupBy(e.target.value); setSortColumn(''); }} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">{t('analytics.builder.aggregate')}</label>
          <Select
            aria-label={t('analytics.builder.aggregate')}
            disabled={!groupBy}
            options={AGGREGATES.map((op) => ({ value: op, label: t(`analytics.aggregates.${op}`) }))}
            value={aggregate}
            onChange={(e) => setAggregate(e.target.value as AggregateOp)}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">{t('analytics.builder.ofColumn')}</label>
          <Select
            aria-label={t('analytics.builder.ofColumn')}
            disabled={!groupBy || aggregate === 'count'}
            options={[{ value: '', label: t('analytics.builder.allNumeric') }, ...columnOptions.filter((o) => o.value !== groupBy)]}
            value={aggregateColumn}
            onChange={(e) => setAggregateColumn(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">{t('analytics.builder.sortBy')}</label>
          <Select aria-label={t('analytics.builder.sortBy')} options={sortOptions} value={sortColumn} onChange={(e) => setSortColumn(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">{t('analytics.builder.direction')}</label>
          <Select
            aria-label={t('analytics.builder.direction')}
            disabled={!sortColumn}
            options={[
              { value: 'desc', label: t('analytics.builder.desc') },
              { value: 'asc', label: t('analytics.builder.asc') },
            ]}
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'asc' | 'desc')}
          />
        </div>
        <Input label={t('analytics.builder.limit')} type="number" min={1} max={10000} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="10000" />
      </div>

      <Button type="button" onClick={() => onRun(build())} disabled={busy || !columns.length}>
        {busy ? t('common.loading') : (runLabel ?? t('analytics.builder.run'))}
      </Button>
    </div>
  );
}
