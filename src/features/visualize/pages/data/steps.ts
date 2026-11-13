import i18n from '@/i18n/config';
import type { VizIssue, VizPipelineStep } from '@/lib/data';

/** How a step's settings are edited (one generic form renders every step). */
export type FieldType = 'column' | 'columns' | 'text' | 'number' | 'select' | 'conditions' | 'rules' | 'aggregations' | 'sortBy' | 'dataset' | 'parts' | 'edges' | 'names';

/** Catalogue groups; `groupKey(group)` is the i18n key of a group's name. */
export type StepGroup = 'clean' | 'rows' | 'columns' | 'text' | 'numbers' | 'shape' | 'combine';

export interface StepField {
  key: string;
  /** i18n key of the field's label. */
  labelKey: string;
  type: FieldType;
  /** [value, i18n key of the option's text]. */
  options?: [string, string][];
  optional?: boolean;
  /** An example in data syntax (symbols, formula), shown as is. */
  placeholder?: string;
}

export interface StepKind {
  op: string;
  /** i18n key of the step's name. */
  labelKey: string;
  group: StepGroup;
  /** Extra search words (English), matched besides the translated name and group. */
  keywords: string;
  fields: StepField[];
  defaults?: Record<string, unknown>;
}

const KIND = (key: string) => `visualize.steps.kinds.${key}`;
const FIELD = (key: string) => `visualize.steps.fields.${key}`;
const OPTION = (key: string) => `visualize.steps.options.${key}`;

export const groupKey = (group: StepGroup) => `visualize.steps.groups.${group}`;

/** Aggregations: [value, i18n key of its name]. */
export const AGGREGATIONS: [string, string][] = [
  ['sum', OPTION('aggs.sum')],
  ['avg', OPTION('aggs.avg')],
  ['count', OPTION('aggs.count')],
  ['distinct', OPTION('aggs.distinct')],
  ['min', OPTION('aggs.min')],
  ['max', OPTION('aggs.max')],
  ['median', OPTION('aggs.median')],
];

/** Date parts: [value, i18n key of its name]. */
export const DATE_PARTS: [string, string][] = [
  ['year', 'visualize.steps.parts.year'],
  ['quarter', 'visualize.steps.parts.quarter'],
  ['month', 'visualize.steps.parts.month'],
  ['month_name', 'visualize.steps.parts.monthName'],
  ['week', 'visualize.steps.parts.week'],
  ['weekday', 'visualize.steps.parts.weekday'],
  ['weekday_name', 'visualize.steps.parts.weekdayName'],
  ['day', 'visualize.steps.parts.day'],
  ['hour', 'visualize.steps.parts.hour'],
];

/** Condition operators: [value, i18n key of its text]. */
export const CONDITION_OPS: [string, string][] = [
  ['eq', 'visualize.steps.conditionOps.eq'],
  ['ne', 'visualize.steps.conditionOps.ne'],
  ['in', 'visualize.steps.conditionOps.in'],
  ['not_in', 'visualize.steps.conditionOps.notIn'],
  ['gt', 'visualize.steps.conditionOps.gt'],
  ['gte', 'visualize.steps.conditionOps.gte'],
  ['lt', 'visualize.steps.conditionOps.lt'],
  ['lte', 'visualize.steps.conditionOps.lte'],
  ['between', 'visualize.steps.conditionOps.between'],
  ['contains', 'visualize.steps.conditionOps.contains'],
  ['starts_with', 'visualize.steps.conditionOps.startsWith'],
  ['ends_with', 'visualize.steps.conditionOps.endsWith'],
  ['blank', 'visualize.steps.conditionOps.blank'],
  ['not_blank', 'visualize.steps.conditionOps.notBlank'],
];

const TYPES: [string, string][] = [
  ['number', OPTION('types.number')],
  ['date', OPTION('types.date')],
  ['text', OPTION('types.text')],
];

export const STEP_KINDS: StepKind[] = [
  { op: 'remove_duplicates', labelKey: KIND('removeDuplicates'), group: 'clean', keywords: 'dedupe unique', fields: [{ key: 'columns', labelKey: FIELD('compareColumns'), type: 'columns', optional: true }] },
  { op: 'trim', labelKey: KIND('trim'), group: 'clean', keywords: 'whitespace clean', fields: [{ key: 'columns', labelKey: FIELD('trimColumns'), type: 'columns', optional: true }] },
  {
    op: 'remove_blank_rows',
    labelKey: KIND('removeBlankRows'),
    group: 'clean',
    keywords: 'empty missing drop',
    fields: [
      { key: 'columns', labelKey: FIELD('blankIn'), type: 'columns', optional: true },
      { key: 'how', labelKey: FIELD('removeWhen'), type: 'select', options: [['any', OPTION('blankHow.any')], ['all', OPTION('blankHow.all')]] },
    ],
    defaults: { how: 'any' },
  },
  {
    op: 'fill_blanks',
    labelKey: KIND('fillBlanks'),
    group: 'clean',
    keywords: 'missing impute empty',
    fields: [
      { key: 'column', labelKey: FIELD('column'), type: 'column' },
      {
        key: 'strategy',
        labelKey: FIELD('with'),
        type: 'select',
        options: [['mean', OPTION('fill.mean')], ['median', OPTION('fill.median')], ['mode', OPTION('fill.mode')], ['zero', OPTION('fill.zero')], ['down', OPTION('fill.down')], ['up', OPTION('fill.up')], ['value', OPTION('fill.value')]],
      },
      { key: 'value', labelKey: FIELD('value'), type: 'text', optional: true },
    ],
    defaults: { strategy: 'median' },
  },
  {
    op: 'replace_values',
    labelKey: KIND('replaceValues'),
    group: 'clean',
    keywords: 'find substitute',
    fields: [
      { key: 'column', labelKey: FIELD('column'), type: 'column' },
      { key: 'find', labelKey: FIELD('find'), type: 'text' },
      { key: 'replace', labelKey: FIELD('replaceWith'), type: 'text', optional: true },
      { key: 'match', labelKey: FIELD('match'), type: 'select', options: [['exact', OPTION('replaceMatch.exact')], ['contains', OPTION('replaceMatch.contains')]] },
    ],
    defaults: { match: 'exact' },
  },
  { op: 'change_type', labelKey: KIND('changeType'), group: 'clean', keywords: 'cast number date text', fields: [{ key: 'column', labelKey: FIELD('column'), type: 'column' }, { key: 'type', labelKey: FIELD('to'), type: 'select', options: TYPES }], defaults: { type: 'number' } },
  {
    op: 'outliers',
    labelKey: KIND('outliers'),
    group: 'clean',
    keywords: 'extreme cap remove flag iqr',
    fields: [
      { key: 'column', labelKey: FIELD('column'), type: 'column' },
      { key: 'action', labelKey: FIELD('action'), type: 'select', options: [['cap', OPTION('outliers.cap')], ['remove', OPTION('outliers.remove')], ['flag', OPTION('outliers.flag')]] },
    ],
    defaults: { action: 'cap' },
  },
  {
    op: 'filter_rows',
    labelKey: KIND('filterRows'),
    group: 'rows',
    keywords: 'where keep only exclude condition',
    fields: [
      { key: 'mode', labelKey: FIELD('rowsThatMatch'), type: 'select', options: [['keep', OPTION('filterMode.keep')], ['remove', OPTION('filterMode.remove')]] },
      { key: 'combine', labelKey: FIELD('match'), type: 'select', options: [['and', OPTION('combine.and')], ['or', OPTION('combine.or')]] },
      { key: 'conditions', labelKey: FIELD('conditions'), type: 'conditions' },
    ],
    defaults: { mode: 'keep', combine: 'and', conditions: [{ field: '', op: 'eq', value: '' }] },
  },
  { op: 'sort', labelKey: KIND('sort'), group: 'rows', keywords: 'order ascending descending', fields: [{ key: 'by', labelKey: FIELD('sortBy'), type: 'sortBy' }], defaults: { by: [{ column: '', dir: 'asc' }] } },
  {
    op: 'keep_rows',
    labelKey: KIND('keepRows'),
    group: 'rows',
    keywords: 'head tail first last limit',
    fields: [
      { key: 'mode', labelKey: FIELD('keep'), type: 'select', options: [['top', OPTION('keepRows.top')], ['bottom', OPTION('keepRows.bottom')]] },
      { key: 'n', labelKey: FIELD('howMany'), type: 'number' },
    ],
    defaults: { mode: 'top', n: 100 },
  },
  { op: 'remove_columns', labelKey: KIND('removeColumns'), group: 'columns', keywords: 'drop delete', fields: [{ key: 'columns', labelKey: FIELD('columns'), type: 'columns' }] },
  { op: 'keep_columns', labelKey: KIND('keepColumns'), group: 'columns', keywords: 'select choose', fields: [{ key: 'columns', labelKey: FIELD('columns'), type: 'columns' }] },
  { op: 'rename', labelKey: KIND('rename'), group: 'columns', keywords: 'name', fields: [{ key: 'column', labelKey: FIELD('column'), type: 'column' }, { key: 'name', labelKey: FIELD('newName'), type: 'text' }] },
  {
    op: 'calculated_column',
    labelKey: KIND('calculatedColumn'),
    group: 'columns',
    keywords: 'formula compute expression new column',
    fields: [
      { key: 'name', labelKey: FIELD('newColumn'), type: 'text' },
      { key: 'expression', labelKey: FIELD('formula'), type: 'text', placeholder: '[revenue] - [cost]' },
    ],
  },
  {
    op: 'conditional_column',
    labelKey: KIND('conditionalColumn'),
    group: 'columns',
    keywords: 'if then else rule category',
    fields: [
      { key: 'name', labelKey: FIELD('newColumn'), type: 'text' },
      { key: 'rules', labelKey: FIELD('ifThen'), type: 'rules' },
      { key: 'else', labelKey: FIELD('otherwise'), type: 'text', optional: true },
    ],
    defaults: { rules: [{ field: '', op: 'gte', value: '', then: '' }], else: '' },
  },
  {
    op: 'split_column',
    labelKey: KIND('splitColumn'),
    group: 'text',
    keywords: 'delimiter separate',
    fields: [
      { key: 'column', labelKey: FIELD('column'), type: 'column' },
      { key: 'delimiter', labelKey: FIELD('at'), type: 'text', placeholder: ',' },
      { key: 'into', labelKey: FIELD('intoParts'), type: 'number' },
      { key: 'names', labelKey: FIELD('newNames'), type: 'names', optional: true },
    ],
    defaults: { delimiter: ',', into: 2 },
  },
  {
    op: 'merge_columns',
    labelKey: KIND('mergeColumns'),
    group: 'text',
    keywords: 'join concatenate combine text',
    fields: [
      { key: 'columns', labelKey: FIELD('columns'), type: 'columns' },
      { key: 'separator', labelKey: FIELD('separator'), type: 'text', optional: true },
      { key: 'name', labelKey: FIELD('newColumn'), type: 'text' },
    ],
    defaults: { separator: ' ' },
  },
  {
    op: 'text_case',
    labelKey: KIND('textCase'),
    group: 'text',
    keywords: 'upper lower title capital',
    fields: [
      { key: 'column', labelKey: FIELD('column'), type: 'column' },
      { key: 'case', labelKey: FIELD('case'), type: 'select', options: [['title', OPTION('textCase.title')], ['upper', OPTION('textCase.upper')], ['lower', OPTION('textCase.lower')]] },
    ],
    defaults: { case: 'title' },
  },
  {
    op: 'bins',
    labelKey: KIND('bins'),
    group: 'numbers',
    keywords: 'bucket range band histogram',
    fields: [
      { key: 'column', labelKey: FIELD('column'), type: 'column' },
      { key: 'method', labelKey: FIELD('bins'), type: 'select', options: [['equal', OPTION('bins.equal')], ['edges', OPTION('bins.edges')]] },
      { key: 'count', labelKey: FIELD('howManyBins'), type: 'number', optional: true },
      { key: 'edges', labelKey: FIELD('edges'), type: 'edges', optional: true, placeholder: '0, 100, 500, 1000' },
      { key: 'name', labelKey: FIELD('newColumn'), type: 'text', optional: true },
    ],
    defaults: { method: 'equal', count: 5 },
  },
  { op: 'date_parts', labelKey: KIND('dateParts'), group: 'numbers', keywords: 'year month quarter week day', fields: [{ key: 'column', labelKey: FIELD('dateColumn'), type: 'column' }, { key: 'parts', labelKey: FIELD('parts'), type: 'parts' }], defaults: { parts: ['year', 'month_name'] } },
  {
    op: 'date_table',
    labelKey: KIND('dateTable'),
    group: 'numbers',
    keywords: 'calendar fiscal time intelligence',
    fields: [
      { key: 'column', labelKey: FIELD('fromDatesIn'), type: 'column' },
      { key: 'fiscal_start', labelKey: FIELD('fiscalStart'), type: 'number' },
    ],
    defaults: { fiscal_start: 1 },
  },
  {
    op: 'group_by',
    labelKey: KIND('groupBy'),
    group: 'shape',
    keywords: 'aggregate summarize total sum count',
    fields: [
      { key: 'by', labelKey: FIELD('groupBy'), type: 'columns' },
      { key: 'aggregations', labelKey: FIELD('calculate'), type: 'aggregations' },
    ],
    defaults: { aggregations: [{ column: '', agg: 'sum', name: '' }] },
  },
  {
    op: 'pivot',
    labelKey: KIND('pivot'),
    group: 'shape',
    keywords: 'cross tab wide',
    fields: [
      { key: 'index', labelKey: FIELD('keepAsRows'), type: 'columns' },
      { key: 'columns', labelKey: FIELD('valuesBecomeColumns'), type: 'column' },
      { key: 'values', labelKey: FIELD('fillWith'), type: 'column' },
      { key: 'agg', labelKey: FIELD('aggregation'), type: 'select', options: AGGREGATIONS.filter(([value]) => ['sum', 'avg', 'count', 'min', 'max'].includes(value)) },
    ],
    defaults: { agg: 'sum' },
  },
  {
    op: 'unpivot',
    labelKey: KIND('unpivot'),
    group: 'shape',
    keywords: 'melt long',
    fields: [
      { key: 'keep', labelKey: FIELD('keepTheseColumns'), type: 'columns' },
      { key: 'name', labelKey: FIELD('nameColumn'), type: 'text' },
      { key: 'value', labelKey: FIELD('valueColumn'), type: 'text' },
    ],
    defaults: { name: 'attribute', value: 'value' },
  },
  {
    op: 'merge',
    labelKey: KIND('merge'),
    group: 'combine',
    keywords: 'join lookup vlookup',
    fields: [
      { key: 'dataset', labelKey: FIELD('dataset'), type: 'dataset' },
      { key: 'left_on', labelKey: FIELD('keyHere'), type: 'column' },
      { key: 'right_on', labelKey: FIELD('keyOther'), type: 'text' },
      { key: 'how', labelKey: FIELD('keep'), type: 'select', options: [['left', OPTION('mergeHow.left')], ['inner', OPTION('mergeHow.inner')], ['outer', OPTION('mergeHow.outer')]] },
    ],
    defaults: { how: 'left' },
  },
  { op: 'append', labelKey: KIND('append'), group: 'combine', keywords: 'union stack add rows', fields: [{ key: 'dataset', labelKey: FIELD('dataset'), type: 'dataset' }] },
];

export const KIND_BY_OP = Object.fromEntries(STEP_KINDS.map((kind) => [kind.op, kind])) as Record<string, StepKind>;

/** A step kind's name in the chosen language ('' for an unknown op). */
export function kindLabel(op: string): string {
  const kind = KIND_BY_OP[op];
  return kind ? i18n.t(kind.labelKey) : '';
}

/** A new step of a kind, with sensible defaults and the column the user was looking at. */
export function newStep(op: string, column?: string): VizPipelineStep {
  const kind = KIND_BY_OP[op]!;
  const step: VizPipelineStep = { op, enabled: true, ...structuredClone(kind.defaults ?? {}) };
  if (column) {
    for (const field of kind.fields) {
      if (field.type === 'column' && !step[field.key]) step[field.key] = column;
      if (field.type === 'columns' && !field.optional && !step[field.key]) step[field.key] = [column];
    }
  }
  return step;
}

function textOf(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? `${value}` : '';
}

/** One line describing what a step does (the Applied steps list), in the chosen language. */
export function stepSummary(step: VizPipelineStep): string {
  const kind = KIND_BY_OP[step.op];
  const list = (value: unknown) => (Array.isArray(value) ? value.filter(Boolean).join(', ') : '');
  const column = typeof step.column === 'string' ? step.column : '';
  switch (step.op) {
    case 'remove_columns':
    case 'keep_columns':
      return list(step.columns);
    case 'rename':
      return `${column} → ${textOf(step.name)}`;
    case 'change_type': {
      const type = textOf(step.type);
      return `${column} → ${TYPES.some(([value]) => value === type) ? i18n.t(`visualize.steps.summary.types.${type}`) : type}`;
    }
    case 'filter_rows': {
      const count = (step.conditions as unknown[] | undefined)?.length ?? 0;
      return step.mode === 'remove' ? i18n.t('visualize.steps.summary.removeConditions', { count }) : i18n.t('visualize.steps.summary.keepConditions', { count });
    }
    case 'calculated_column':
    case 'conditional_column':
      return textOf(step.name);
    case 'group_by':
      return i18n.t('visualize.steps.summary.by', { columns: list(step.by) });
    case 'merge':
    case 'append':
      return i18n.t('visualize.steps.summary.anotherDataset');
    default:
      return column || list(step.columns) || (kind ? i18n.t(groupKey(kind.group)) : '');
  }
}

const FIX = (key: string, options?: Record<string, string>) => i18n.t(`visualize.steps.fixes.${key}`, options);

/** One-click fixes for quality issues (each adds a step; nothing changes until it is saved).
 *  The label is in the chosen language. */
export function fixFor(issue: VizIssue): { label: string; steps: VizPipelineStep[] } | null {
  const column = issue.column ?? undefined;
  switch (issue.type) {
    case 'duplicate_row':
      return { label: FIX('removeDuplicates'), steps: [newStep('remove_duplicates')] };
    case 'near_duplicate_row':
      return { label: FIX('trimThenRemoveRepeats'), steps: [newStep('trim'), newStep('remove_duplicates')] };
    case 'mixed_date_format':
      return column ? { label: FIX('toDate'), steps: [{ ...newStep('change_type', column), type: 'date' }] } : null;
    case 'duplicate_id':
      return column ? { label: FIX('keepOnePerId'), steps: [{ ...newStep('remove_duplicates'), columns: [column] }] } : null;
    case 'missing_id':
      return column ? { label: FIX('removeMissingId'), steps: [{ ...newStep('remove_blank_rows'), columns: [column] }] } : null;
    case 'missing_value':
      return column ? { label: FIX('fillBlanks'), steps: [newStep('fill_blanks', column)] } : null;
    case 'placeholder':
      return column && issue.examples[0] ? { label: FIX('blankOut', { value: issue.examples[0] }), steps: [{ ...newStep('replace_values', column), find: issue.examples[0], replace: '' }] } : null;
    case 'whitespace':
      return { label: FIX('trimSpaces'), steps: [column ? { ...newStep('trim'), columns: [column] } : newStep('trim')] };
    case 'type_mismatch':
      return column ? { label: FIX('toNumber'), steps: [{ ...newStep('change_type', column), type: 'number' }] } : null;
    case 'invalid_date':
      return column ? { label: FIX('toDate'), steps: [{ ...newStep('change_type', column), type: 'date' }] } : null;
    case 'inconsistent_category':
      return column ? { label: FIX('consistentSpelling'), steps: [{ ...newStep('trim'), columns: [column] }, newStep('text_case', column)] } : null;
    case 'outlier':
      return column ? { label: FIX('capOutliers'), steps: [newStep('outliers', column)] } : null;
    case 'constant_column':
      return column ? { label: FIX('removeColumn'), steps: [{ ...newStep('remove_columns'), columns: [column] }] } : null;
    default:
      return null;
  }
}
