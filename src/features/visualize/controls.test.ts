import { describe, expect, it } from 'vitest';
import type { ColumnProfile, VizChartType } from '@/lib/data';
import { eligibleColumns, mergeFields, missingSlots } from './controls';
import { humanize } from './ui';

const column = (name: string, kind: ColumnProfile['kind']): ColumnProfile => ({ name, kind, dtype: '', nulls: 0, nullRatio: 0, distinct: 5 });
const profiles = [column('date', 'datetime'), column('region', 'categorical'), column('revenue', 'numeric'), column('year', 'numeric')];
const bar: VizChartType = {
  id: 'bar',
  name: 'Bar chart',
  category: 'comparison',
  description: '',
  tags: [],
  level: 'essential',
  howToRead: '',
  options: [],
  slots: [
    { key: 'x', label: 'Category', kind: 'dimension', required: true, multiple: false, help: '' },
    { key: 'y', label: 'Value', kind: 'numeric', required: false, multiple: false, help: '' },
  ],
};

describe('visualization field helpers', () => {
  it('offers only columns that fit a slot', () => {
    expect(eligibleColumns(bar.slots[1]!, profiles)).toEqual(['revenue', 'year']);
    expect(eligibleColumns({ ...bar.slots[0]!, kind: 'datetime' }, profiles)).toEqual(['date']);
    // Numbers can label categories (years, ratings).
    expect(eligibleColumns(bar.slots[0]!, profiles)).toContain('year');
  });

  it('keeps compatible picks and fills gaps from suggestions', () => {
    expect(mergeFields(bar, { x: 'region', y: 'date' }, { x: 'date', y: 'revenue' }, profiles)).toEqual({ x: 'region', y: 'revenue' });
    expect(mergeFields(bar, {}, { x: 'region' }, profiles)).toEqual({ x: 'region' });
  });

  it('reports required slots that are still empty', () => {
    expect(missingSlots(bar, {}).map((slot) => slot.key)).toEqual(['x']);
    expect(missingSlots(bar, { x: 'region' })).toEqual([]);
    expect(missingSlots(undefined, {})).toEqual([]);
  });
});

describe('humanize', () => {
  it('turns code-style names into words people read', () => {
    expect(humanize('unit_price')).toBe('Unit price');
    expect(humanize('orderId')).toBe('Order ID');
    expect(humanize('customer_id')).toBe('Customer ID');
    expect(humanize('weekday_name')).toBe('Weekday name');
    expect(humanize('Revenue')).toBe('Revenue');
  });
});
