import type { VizIssue, VizPipelineStep } from '@/lib/data';

/** How a step's settings are edited (one generic form renders every step). */
export type FieldType = 'column' | 'columns' | 'text' | 'number' | 'select' | 'conditions' | 'rules' | 'aggregations' | 'sortBy' | 'dataset' | 'parts' | 'edges' | 'names';

export interface StepField {
  key: string;
  label: string;
  type: FieldType;
  options?: [string, string][];
  optional?: boolean;
  placeholder?: string;
}

export interface StepKind {
  op: string;
  label: string;
  group: 'Clean' | 'Rows' | 'Columns' | 'Text' | 'Numbers and dates' | 'Shape' | 'Combine';
  keywords: string;
  fields: StepField[];
  defaults?: Record<string, unknown>;
}

export const CONDITION_OPS: [string, string][] = [
  ['eq', 'equals'],
  ['ne', 'does not equal'],
  ['in', 'is one of'],
  ['not_in', 'is not one of'],
  ['gt', '>'],
  ['gte', '≥'],
  ['lt', '<'],
  ['lte', '≤'],
  ['between', 'between'],
  ['contains', 'contains'],
  ['starts_with', 'starts with'],
  ['ends_with', 'ends with'],
  ['blank', 'is blank'],
  ['not_blank', 'is not blank'],
];

export const STEP_KINDS: StepKind[] = [
  { op: 'remove_duplicates', label: 'Remove duplicate rows', group: 'Clean', keywords: 'dedupe unique', fields: [{ key: 'columns', label: 'Compare only these columns', type: 'columns', optional: true }] },
  { op: 'trim', label: 'Trim extra spaces', group: 'Clean', keywords: 'whitespace clean', fields: [{ key: 'columns', label: 'Columns (all text when empty)', type: 'columns', optional: true }] },
  {
    op: 'remove_blank_rows',
    label: 'Remove blank rows',
    group: 'Clean',
    keywords: 'empty missing drop',
    fields: [
      { key: 'columns', label: 'Blank in', type: 'columns', optional: true },
      { key: 'how', label: 'Remove when', type: 'select', options: [['any', 'any of them is blank'], ['all', 'all of them are blank']] },
    ],
    defaults: { how: 'any' },
  },
  {
    op: 'fill_blanks',
    label: 'Fill blanks',
    group: 'Clean',
    keywords: 'missing impute empty',
    fields: [
      { key: 'column', label: 'Column', type: 'column' },
      { key: 'strategy', label: 'With', type: 'select', options: [['mean', 'Average'], ['median', 'Median'], ['mode', 'Most common value'], ['zero', 'Zero'], ['down', 'Value above (fill down)'], ['up', 'Value below (fill up)'], ['value', 'My own value']] },
      { key: 'value', label: 'Value', type: 'text', optional: true },
    ],
    defaults: { strategy: 'median' },
  },
  {
    op: 'replace_values',
    label: 'Replace values',
    group: 'Clean',
    keywords: 'find substitute',
    fields: [
      { key: 'column', label: 'Column', type: 'column' },
      { key: 'find', label: 'Find', type: 'text' },
      { key: 'replace', label: 'Replace with', type: 'text', optional: true },
      { key: 'match', label: 'Match', type: 'select', options: [['exact', 'Whole value'], ['contains', 'Part of the text']] },
    ],
    defaults: { match: 'exact' },
  },
  { op: 'change_type', label: 'Change type', group: 'Clean', keywords: 'cast number date text', fields: [{ key: 'column', label: 'Column', type: 'column' }, { key: 'type', label: 'To', type: 'select', options: [['number', 'Number'], ['date', 'Date'], ['text', 'Text']] }], defaults: { type: 'number' } },
  {
    op: 'outliers',
    label: 'Handle outliers',
    group: 'Clean',
    keywords: 'extreme cap remove flag iqr',
    fields: [
      { key: 'column', label: 'Column', type: 'column' },
      { key: 'action', label: 'Action', type: 'select', options: [['cap', 'Cap at the limits'], ['remove', 'Remove those rows'], ['flag', 'Flag in a new column']] },
    ],
    defaults: { action: 'cap' },
  },
  {
    op: 'filter_rows',
    label: 'Filter rows',
    group: 'Rows',
    keywords: 'where keep only exclude condition',
    fields: [
      { key: 'mode', label: 'Rows that match', type: 'select', options: [['keep', 'Keep'], ['remove', 'Remove']] },
      { key: 'combine', label: 'Match', type: 'select', options: [['and', 'all conditions'], ['or', 'any condition']] },
      { key: 'conditions', label: 'Conditions', type: 'conditions' },
    ],
    defaults: { mode: 'keep', combine: 'and', conditions: [{ field: '', op: 'eq', value: '' }] },
  },
  { op: 'sort', label: 'Sort rows', group: 'Rows', keywords: 'order ascending descending', fields: [{ key: 'by', label: 'Sort by', type: 'sortBy' }], defaults: { by: [{ column: '', dir: 'asc' }] } },
  {
    op: 'keep_rows',
    label: 'Keep top or bottom rows',
    group: 'Rows',
    keywords: 'head tail first last limit',
    fields: [
      { key: 'mode', label: 'Keep', type: 'select', options: [['top', 'First rows'], ['bottom', 'Last rows']] },
      { key: 'n', label: 'How many', type: 'number' },
    ],
    defaults: { mode: 'top', n: 100 },
  },
  { op: 'remove_columns', label: 'Remove columns', group: 'Columns', keywords: 'drop delete', fields: [{ key: 'columns', label: 'Columns', type: 'columns' }] },
  { op: 'keep_columns', label: 'Keep only these columns', group: 'Columns', keywords: 'select choose', fields: [{ key: 'columns', label: 'Columns', type: 'columns' }] },
  { op: 'rename', label: 'Rename a column', group: 'Columns', keywords: 'name', fields: [{ key: 'column', label: 'Column', type: 'column' }, { key: 'name', label: 'New name', type: 'text' }] },
  {
    op: 'calculated_column',
    label: 'Calculated column',
    group: 'Columns',
    keywords: 'formula compute expression new column',
    fields: [
      { key: 'name', label: 'New column', type: 'text' },
      { key: 'expression', label: 'Formula', type: 'text', placeholder: '[revenue] - [cost]' },
    ],
  },
  {
    op: 'conditional_column',
    label: 'Conditional column',
    group: 'Columns',
    keywords: 'if then else rule category',
    fields: [
      { key: 'name', label: 'New column', type: 'text' },
      { key: 'rules', label: 'If … then', type: 'rules' },
      { key: 'else', label: 'Otherwise', type: 'text', optional: true },
    ],
    defaults: { rules: [{ field: '', op: 'gte', value: '', then: '' }], else: '' },
  },
  {
    op: 'split_column',
    label: 'Split a column',
    group: 'Text',
    keywords: 'delimiter separate',
    fields: [
      { key: 'column', label: 'Column', type: 'column' },
      { key: 'delimiter', label: 'At', type: 'text', placeholder: ',' },
      { key: 'into', label: 'Into (parts)', type: 'number' },
      { key: 'names', label: 'New names (optional)', type: 'names', optional: true },
    ],
    defaults: { delimiter: ',', into: 2 },
  },
  { op: 'merge_columns', label: 'Merge columns', group: 'Text', keywords: 'join concatenate combine text', fields: [{ key: 'columns', label: 'Columns', type: 'columns' }, { key: 'separator', label: 'Separator', type: 'text', optional: true }, { key: 'name', label: 'New column', type: 'text' }], defaults: { separator: ' ' } },
  { op: 'text_case', label: 'Change text case', group: 'Text', keywords: 'upper lower title capital', fields: [{ key: 'column', label: 'Column', type: 'column' }, { key: 'case', label: 'Case', type: 'select', options: [['title', 'Title Case'], ['upper', 'UPPER'], ['lower', 'lower']] }], defaults: { case: 'title' } },
  {
    op: 'bins',
    label: 'Group numbers into bins',
    group: 'Numbers and dates',
    keywords: 'bucket range band histogram',
    fields: [
      { key: 'column', label: 'Column', type: 'column' },
      { key: 'method', label: 'Bins', type: 'select', options: [['equal', 'Equal width'], ['edges', 'My own edges']] },
      { key: 'count', label: 'How many bins', type: 'number', optional: true },
      { key: 'edges', label: 'Edges', type: 'edges', optional: true, placeholder: '0, 100, 500, 1000' },
      { key: 'name', label: 'New column', type: 'text', optional: true },
    ],
    defaults: { method: 'equal', count: 5 },
  },
  { op: 'date_parts', label: 'Extract date parts', group: 'Numbers and dates', keywords: 'year month quarter week day', fields: [{ key: 'column', label: 'Date column', type: 'column' }, { key: 'parts', label: 'Parts', type: 'parts' }], defaults: { parts: ['year', 'month_name'] } },
  {
    op: 'date_table',
    label: 'Make a date table (calendar)',
    group: 'Numbers and dates',
    keywords: 'calendar fiscal time intelligence',
    fields: [
      { key: 'column', label: 'From the dates in', type: 'column' },
      { key: 'fiscal_start', label: 'Fiscal year starts in month', type: 'number' },
    ],
    defaults: { fiscal_start: 1 },
  },
  {
    op: 'group_by',
    label: 'Group by',
    group: 'Shape',
    keywords: 'aggregate summarize total sum count',
    fields: [
      { key: 'by', label: 'Group by', type: 'columns' },
      { key: 'aggregations', label: 'Calculate', type: 'aggregations' },
    ],
    defaults: { aggregations: [{ column: '', agg: 'sum', name: '' }] },
  },
  {
    op: 'pivot',
    label: 'Pivot (rows → columns)',
    group: 'Shape',
    keywords: 'cross tab wide',
    fields: [
      { key: 'index', label: 'Keep as rows', type: 'columns' },
      { key: 'columns', label: 'Values become columns', type: 'column' },
      { key: 'values', label: 'Fill with', type: 'column' },
      { key: 'agg', label: 'Aggregation', type: 'select', options: [['sum', 'Sum'], ['avg', 'Average'], ['count', 'Count'], ['min', 'Min'], ['max', 'Max']] },
    ],
    defaults: { agg: 'sum' },
  },
  {
    op: 'unpivot',
    label: 'Unpivot (columns → rows)',
    group: 'Shape',
    keywords: 'melt long',
    fields: [
      { key: 'keep', label: 'Keep these columns', type: 'columns' },
      { key: 'name', label: 'Name column', type: 'text' },
      { key: 'value', label: 'Value column', type: 'text' },
    ],
    defaults: { name: 'attribute', value: 'value' },
  },
  {
    op: 'merge',
    label: 'Merge with another dataset',
    group: 'Combine',
    keywords: 'join lookup vlookup',
    fields: [
      { key: 'dataset', label: 'Dataset', type: 'dataset' },
      { key: 'left_on', label: 'Key in this data', type: 'column' },
      { key: 'right_on', label: 'Key in the other', type: 'text' },
      { key: 'how', label: 'Keep', type: 'select', options: [['left', 'All rows of this data'], ['inner', 'Only matching rows'], ['outer', 'All rows of both']] },
    ],
    defaults: { how: 'left' },
  },
  { op: 'append', label: 'Append another dataset', group: 'Combine', keywords: 'union stack add rows', fields: [{ key: 'dataset', label: 'Dataset', type: 'dataset' }] },
];

export const KIND_BY_OP = Object.fromEntries(STEP_KINDS.map((kind) => [kind.op, kind])) as Record<string, StepKind>;

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

/** One line describing what a step does (the Applied steps list). */
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
    case 'change_type':
      return `${column} → ${textOf(step.type)}`;
    case 'filter_rows':
      return `${step.mode === 'remove' ? 'remove' : 'keep'} ${(step.conditions as unknown[] | undefined)?.length ?? 0} condition(s)`;
    case 'calculated_column':
    case 'conditional_column':
      return textOf(step.name);
    case 'group_by':
      return `by ${list(step.by)}`;
    case 'merge':
    case 'append':
      return 'another dataset';
    default:
      return column || list(step.columns) || kind?.group || '';
  }
}

/** One-click fixes for quality issues (each adds a step; nothing changes until it is saved). */
export function fixFor(issue: VizIssue): { label: string; steps: VizPipelineStep[] } | null {
  const column = issue.column ?? undefined;
  switch (issue.type) {
    case 'duplicate_row':
      return { label: 'Remove duplicates', steps: [newStep('remove_duplicates')] };
    case 'duplicate_id':
      return column ? { label: 'Keep one row per ID', steps: [{ ...newStep('remove_duplicates'), columns: [column] }] } : null;
    case 'missing_id':
      return column ? { label: 'Remove rows without ID', steps: [{ ...newStep('remove_blank_rows'), columns: [column] }] } : null;
    case 'missing_value':
      return column ? { label: 'Fill blanks', steps: [newStep('fill_blanks', column)] } : null;
    case 'placeholder':
      return column && issue.examples[0] ? { label: `Blank out “${issue.examples[0]}”`, steps: [{ ...newStep('replace_values', column), find: issue.examples[0], replace: '' }] } : null;
    case 'whitespace':
      return { label: 'Trim spaces', steps: [column ? { ...newStep('trim'), columns: [column] } : newStep('trim')] };
    case 'type_mismatch':
      return column ? { label: 'Convert to number', steps: [{ ...newStep('change_type', column), type: 'number' }] } : null;
    case 'invalid_date':
      return column ? { label: 'Convert to date', steps: [{ ...newStep('change_type', column), type: 'date' }] } : null;
    case 'inconsistent_category':
      return column ? { label: 'Make spelling consistent', steps: [{ ...newStep('trim'), columns: [column] }, newStep('text_case', column)] } : null;
    case 'outlier':
      return column ? { label: 'Cap outliers', steps: [newStep('outliers', column)] } : null;
    case 'constant_column':
      return column ? { label: 'Remove column', steps: [{ ...newStep('remove_columns'), columns: [column] }] } : null;
    default:
      return null;
  }
}
