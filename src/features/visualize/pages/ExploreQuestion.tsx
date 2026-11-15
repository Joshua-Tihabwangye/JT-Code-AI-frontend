import { useTranslation } from 'react-i18next';
import { BarChart3, CalendarClock, Grid3x3, Hash, PieChart, ScatterChart, Sigma, Trophy, type LucideIcon } from 'lucide-react';
import type { ColumnProfile, DashboardVisual } from '@/lib/data';
import { AGGREGATIONS } from '../dashboards/editor/catalog';

/** What the user wants to see; each becomes one chart built by Python. */
export type Intent = 'compare' | 'trend' | 'share' | 'top' | 'relation' | 'spread' | 'total' | 'table';
type Grain = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface Question {
  intent: Intent;
  group: string;
  date: string;
  grain: Grain;
  split: string;
  measure: string; // a numeric column, or '*' = number of rows
  measure2: string;
  agg: string;
  n: number;
}

export const INTENTS: { id: Intent; icon: LucideIcon; color: string }[] = [
  { id: 'compare', icon: BarChart3, color: '#6366f1' },
  { id: 'trend', icon: CalendarClock, color: '#0ea5e9' },
  { id: 'share', icon: PieChart, color: '#ec4899' },
  { id: 'top', icon: Trophy, color: '#f59e0b' },
  { id: 'relation', icon: ScatterChart, color: '#10b981' },
  { id: 'spread', icon: Sigma, color: '#8b5cf6' },
  { id: 'total', icon: Hash, color: '#14b8a6' },
  { id: 'table', icon: Grid3x3, color: '#64748b' },
];
const GRAINS: Grain[] = ['day', 'week', 'month', 'quarter', 'year'];

// Levels and rates are averaged (adding up prices or scores means nothing), as Build dashboard does.
const LEVEL_WORDS = new Set(['open', 'high', 'low', 'close', 'price', 'rate', 'ratio', 'score', 'rating', 'percent', 'pct', 'avg', 'average', 'mean', 'median', 'age', 'temperature', 'balance', 'margin', 'discount', 'satisfaction', 'level', 'index', 'yield']);
const FLOW_WORDS = new Set(['sales', 'revenue', 'amount', 'qty', 'quantity', 'units', 'orders', 'count', 'cost', 'profit', 'volume', 'clicks', 'visits', 'sessions', 'spend', 'income', 'total']);

/** The natural calculation for a number column: average for levels, total for flows. */
export function naturalAgg(column: string): string {
  if (column === '*') return 'count';
  const words = column.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/);
  if (words.some((word) => FLOW_WORDS.has(word))) return 'sum';
  return words.some((word) => LEVEL_WORDS.has(word)) ? 'avg' : 'sum';
}

const groups = (profiles: ColumnProfile[]) => profiles.filter((p) => p.kind !== 'numeric' && p.kind !== 'datetime');
const dates = (profiles: ColumnProfile[]) => profiles.filter((p) => p.kind === 'datetime');
const numbers = (profiles: ColumnProfile[]) => profiles.filter((p) => p.kind === 'numeric');

/** A good first question for the dataset (and the defaults when the user switches intent). */
export function defaultQuestion(profiles: ColumnProfile[], intent?: Intent): Question {
  const group = groups(profiles)[0]?.name ?? '';
  const date = dates(profiles)[0]?.name ?? '';
  // Price data leads with the closing price, like the dashboards Build dashboard makes.
  // Business data leads with revenue or sales; price data with the closing price.
  const named = (pattern: RegExp) => numbers(profiles).find((p) => pattern.test(p.name.replace(/_/g, ' ')));
  const measure = (named(/\b(revenue|sales|amount|profit|total)\b/i) ?? named(/\b(close|price)\b/i) ?? numbers(profiles)[0])?.name ?? '*';
  const measure2 = numbers(profiles)[1]?.name ?? measure;
  const chosen: Intent = intent ?? (date ? 'trend' : group ? 'compare' : 'spread');
  return { intent: chosen, group, date, grain: 'month', split: '', measure, measure2, agg: naturalAgg(measure), n: 10 };
}

/** The question as a dashboard visual (the same visuals dashboards use, drawn by Python). */
export function questionVisual(question: Question, base: DashboardVisual): DashboardVisual {
  const value = question.measure === '*' ? { field: '*', agg: 'count' } : { field: question.measure, agg: question.agg };
  const format = { ...(base.format ?? {}) };
  delete (format as Record<string, unknown>).topN;
  delete (format as Record<string, unknown>).chart;
  const data = (wells: DashboardVisual['data']['wells']) => ({ ...base.data, wells });
  switch (question.intent) {
    case 'compare':
      return { ...base, type: 'column', format, data: data({ category: [{ field: question.group }], values: [value] }) };
    case 'trend':
      return {
        ...base,
        type: 'line',
        format,
        data: data({ category: [{ field: question.date, grain: question.grain }], values: [value], ...(question.split ? { legend: [{ field: question.split }] } : {}) }),
      };
    case 'share':
      return { ...base, type: 'donut', format, data: data({ category: [{ field: question.group }], values: [value] }) };
    case 'top':
      return { ...base, type: 'bar', format: { ...format, topN: { n: question.n, others: false } }, data: data({ category: [{ field: question.group }], values: [value] }) };
    case 'relation':
      return {
        ...base,
        type: 'scatter',
        format,
        data: data({ details: question.group ? [{ field: question.group }] : [], values: [{ field: question.measure, agg: 'sum' }, { field: question.measure2, agg: 'sum' }] }),
      };
    case 'spread':
      return { ...base, type: 'chart', format: { ...format, chart: { chartType: 'histogram', fields: { x: question.measure }, options: {} } }, data: data({}) };
    case 'total':
      return { ...base, type: 'card', format, data: data({ values: [value] }) };
    default:
      return { ...base, type: 'table', format, data: data({ category: question.group ? [{ field: question.group }] : [], values: [value] }) };
  }
}

/** Explore's simple mode: "What do you want to see?" then the columns, in plain words. */
export function ExploreQuestion({ question, profiles, onChange }: { question: Question; profiles: ColumnProfile[]; onChange: (question: Question) => void }) {
  const { t } = useTranslation();
  const set = (patch: Partial<Question>) => onChange({ ...question, ...patch });
  const groupColumns = groups(profiles);
  const dateColumns = dates(profiles);
  const numberColumns = numbers(profiles);
  const possible = (intent: Intent) => {
    if (intent === 'trend') return dateColumns.length > 0;
    if (intent === 'compare' || intent === 'share' || intent === 'top') return groupColumns.length > 0;
    if (intent === 'relation') return numberColumns.length > 1;
    if (intent === 'spread') return numberColumns.length > 0;
    return true;
  };
  const columnSelect = (label: string, value: string, columns: ColumnProfile[], change: (value: string) => void, optional = false, testId = '') => (
    <label className="block text-xs">
      <span className="viz-label">{label}</span>
      <select className="viz-field" value={value} onChange={(event) => change(event.target.value)} data-testid={testId}>
        {optional && <option value="">{t('visualize.explore.ask.none')}</option>}
        {columns.map((column) => (
          <option key={column.name} value={column.name}>
            {column.name}
          </option>
        ))}
      </select>
    </label>
  );
  const measureSelect = (label: string, value: string, change: (value: string) => void, withRows = true, testId = '') => (
    <label className="block text-xs">
      <span className="viz-label">{label}</span>
      <select className="viz-field" value={value} onChange={(event) => change(event.target.value)} data-testid={testId}>
        {withRows && <option value="*">{t('visualize.explore.ask.rows')}</option>}
        {numberColumns.map((column) => (
          <option key={column.name} value={column.name}>
            {column.name}
          </option>
        ))}
      </select>
    </label>
  );
  const aggSelect = question.measure !== '*' && (
    <label className="block text-xs">
      <span className="viz-label">{t('visualize.explore.ask.calculate')}</span>
      <select className="viz-field" value={question.agg} onChange={(event) => set({ agg: event.target.value })} data-testid="ask-agg">
        {AGGREGATIONS.filter(([value]) => ['sum', 'avg', 'count', 'distinct', 'min', 'max', 'median'].includes(value)).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4" data-testid="explore-question">
      <section>
        <h3 className="explore-ask-title">{t('visualize.explore.ask.step1')}</h3>
        <div className="explore-intents">
          {INTENTS.map(({ id, icon: Icon, color }) => (
            <button
              key={id}
              type="button"
              className="explore-intent"
              style={{ '--c': color } as React.CSSProperties}
              aria-pressed={question.intent === id}
              disabled={!possible(id)}
              title={possible(id) ? t(`visualize.explore.ask.intents.${id}.example`) : t('visualize.explore.ask.notForData')}
              onClick={() => {
                const next = { ...defaultQuestion(profiles, id), ...pick(question), intent: id };
                // Spreads and relationships need number columns, not a count of rows.
                if ((id === 'spread' || id === 'relation') && next.measure === '*') next.measure = numberColumns[0]?.name ?? '*';
                if (next.measure === '*') next.agg = 'count';
                onChange(next);
              }}
              data-testid={`ask-intent-${id}`}
            >
              <Icon size={17} aria-hidden />
              <span className="font-semibold">{t(`visualize.explore.ask.intents.${id}.name`)}</span>
              <span className="text-[11px] text-muted-foreground">{t(`visualize.explore.ask.intents.${id}.example`)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="explore-ask-title">{t('visualize.explore.ask.step2')}</h3>
        {(question.intent === 'compare' || question.intent === 'share' || question.intent === 'top') && (
          <>
            {columnSelect(t('visualize.explore.ask.groupBy'), question.group, groupColumns, (group) => set({ group }), false, 'ask-group')}
            {measureSelect(t('visualize.explore.ask.measure'), question.measure, (measure) => set({ measure, agg: naturalAgg(measure) }), true, 'ask-measure')}
            {aggSelect}
            {question.intent === 'top' && (
              <label className="block text-xs">
                <span className="viz-label">{t('visualize.explore.ask.howMany')}</span>
                <input type="number" className="viz-field" min={1} max={50} value={question.n} onChange={(event) => set({ n: Math.max(1, Math.min(50, Number(event.target.value) || 10)) })} />
              </label>
            )}
          </>
        )}
        {question.intent === 'trend' && (
          <>
            {columnSelect(t('visualize.explore.ask.dateColumn'), question.date, dateColumns, (date) => set({ date }), false, 'ask-date')}
            <label className="block text-xs">
              <span className="viz-label">{t('visualize.explore.ask.every')}</span>
              <select className="viz-field" value={question.grain} onChange={(event) => set({ grain: event.target.value as Grain })} data-testid="ask-grain">
                {GRAINS.map((grain) => (
                  <option key={grain} value={grain}>
                    {t(`visualize.explore.ask.grains.${grain}`)}
                  </option>
                ))}
              </select>
            </label>
            {measureSelect(t('visualize.explore.ask.measure'), question.measure, (measure) => set({ measure, agg: naturalAgg(measure) }), true, 'ask-measure')}
            {aggSelect}
            {columnSelect(t('visualize.explore.ask.splitBy'), question.split, groupColumns, (split) => set({ split }), true, 'ask-split')}
          </>
        )}
        {question.intent === 'relation' && (
          <>
            {measureSelect(t('visualize.explore.ask.across'), question.measure, (measure) => set({ measure }), false, 'ask-x')}
            {measureSelect(t('visualize.explore.ask.up'), question.measure2, (measure2) => set({ measure2 }), false, 'ask-y')}
            {columnSelect(t('visualize.explore.ask.onePointPer'), question.group, groupColumns, (group) => set({ group }), true, 'ask-points')}
          </>
        )}
        {question.intent === 'spread' && measureSelect(t('visualize.explore.ask.number'), question.measure, (measure) => set({ measure }), false, 'ask-measure')}
        {question.intent === 'total' && (
          <>
            {measureSelect(t('visualize.explore.ask.measure'), question.measure, (measure) => set({ measure, agg: naturalAgg(measure) }), true, 'ask-measure')}
            {aggSelect}
          </>
        )}
        {question.intent === 'table' && (
          <>
            {columnSelect(t('visualize.explore.ask.rowsPer'), question.group, groupColumns, (group) => set({ group }), true, 'ask-group')}
            {measureSelect(t('visualize.explore.ask.measure'), question.measure, (measure) => set({ measure, agg: naturalAgg(measure) }), true, 'ask-measure')}
            {aggSelect}
          </>
        )}
      </section>
    </div>
  );
}

/** Keeps the user's columns when switching what to see. */
function pick(question: Question): Partial<Question> {
  const kept: Partial<Question> = {};
  if (question.group) kept.group = question.group;
  if (question.date) kept.date = question.date;
  if (question.measure) kept.measure = question.measure;
  if (question.measure2) kept.measure2 = question.measure2;
  return kept;
}
