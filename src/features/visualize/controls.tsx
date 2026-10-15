import { useEffect, useState } from 'react';
import type { ColumnProfile, VizChartType, VizFields, VizOption, VizSlot } from '@/lib/data';
import { Switch } from '@/shared/components';
import { humanize } from './ui';

/** Columns that fit a slot (numbers are also accepted as labels, e.g. years or ratings). */
export function eligibleColumns(slot: VizSlot, profiles: ColumnProfile[]): string[] {
  return profiles
    .filter((profile) => {
      switch (slot.kind) {
        case 'numeric':
          return profile.kind === 'numeric';
        case 'datetime':
          return profile.kind === 'datetime';
        case 'categorical':
          return profile.kind === 'categorical' || profile.kind === 'boolean' || profile.kind === 'numeric';
        case 'dimension':
          return profile.kind !== 'text';
        default:
          return true;
      }
    })
    .map((profile) => profile.name);
}

export function missingSlots(chart: { slots: VizSlot[] } | undefined, fields: VizFields): VizSlot[] {
  if (!chart) return [];
  return chart.slots.filter((slot) => {
    const value = fields[slot.key];
    return slot.required && (!value || (Array.isArray(value) && value.length === 0));
  });
}

/** Keeps the fields that still fit the new chart, then fills gaps from the server's suggestion. */
export function mergeFields(chart: VizChartType, current: VizFields, suggested: VizFields, profiles: ColumnProfile[]): VizFields {
  const next: VizFields = {};
  for (const slot of chart.slots) {
    const allowed = new Set(eligibleColumns(slot, profiles));
    const value = current[slot.key];
    const values = Array.isArray(value) ? value : value ? [value] : [];
    const suggestion = suggested[slot.key];
    if (values.length && values.every((column) => allowed.has(column))) {
      next[slot.key] = slot.multiple ? values : (values[0] as string);
    } else if (suggestion) {
      next[slot.key] = suggestion;
    }
  }
  return next;
}

export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function SlotControl({
  slot,
  profiles,
  value,
  onChange,
  idPrefix = '',
}: {
  slot: VizSlot;
  profiles: ColumnProfile[];
  value: string | string[] | undefined;
  onChange: (value: string | string[] | undefined) => void;
  idPrefix?: string;
}) {
  const columns = eligibleColumns(slot, profiles);
  const id = `${idPrefix}slot-${slot.key}`;
  if (slot.multiple) {
    const selected = Array.isArray(value) ? value : value ? [value] : [];
    return (
      <div>
        <span className="viz-label">
          {slot.label} {slot.required && <span className="text-pink-500">*</span>}
        </span>
        <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto" role="group" aria-label={slot.label}>
          {columns.map((column) => (
            <button
              key={column}
              type="button"
              className="viz-chip"
              aria-pressed={selected.includes(column)}
              title={column}
              onClick={() => onChange(selected.includes(column) ? selected.filter((c) => c !== column) : [...selected, column])}
            >
              {humanize(column)}
            </button>
          ))}
          {!columns.length && <span className="text-xs text-muted-foreground">No {slot.kind} columns</span>}
        </div>
        {slot.help && <p className="mt-1 text-[11px] text-muted-foreground">{slot.help}</p>}
      </div>
    );
  }
  return (
    <label className="block" htmlFor={id}>
      <span className="viz-label">
        {slot.label} {slot.required && <span className="text-pink-500">*</span>}
      </span>
      <select id={id} className="viz-field" value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value || undefined)} aria-label={slot.label} data-testid={id}>
        <option value="">{slot.required ? 'Choose a column…' : 'None'}</option>
        {columns.map((column) => (
          <option key={column} value={column}>
            {humanize(column)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function OptionControl({ option, value, onChange, positiveClasses }: { option: VizOption; value: unknown; onChange: (value: string | number | boolean) => void; positiveClasses: string[] }) {
  const current = (value ?? option.default) as string | number | boolean;
  if (option.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">{option.label}</span>
        <Switch checked={Boolean(current)} onCheckedChange={onChange} aria-label={option.label} />
      </div>
    );
  }
  if (option.type === 'number') {
    return (
      <label className="block">
        <span className="viz-label">{option.label}</span>
        <input
          type="number"
          className="viz-field"
          value={String(current)}
          min={option.minimum ?? undefined}
          max={option.maximum ?? undefined}
          onChange={(event) => onChange(event.target.value === '' ? option.default : Number(event.target.value))}
          aria-label={option.label}
        />
      </label>
    );
  }
  const choices = option.choices.length
    ? option.choices.map(([key, label]) => [key, label === key && /[_A-Z]/.test(key) ? humanize(key) : label] as [string, string])
    : [['', 'Automatic'] as [string, string], ...positiveClasses.map((c) => [c, c] as [string, string])];
  return (
    <label className="block">
      <span className="viz-label">{option.label}</span>
      <select className="viz-field" value={String(current)} onChange={(event) => onChange(event.target.value)} aria-label={option.label}>
        {choices.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

