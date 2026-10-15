import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Eye, EyeOff, ListOrdered, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useRepository, type Dataset, type VizPipelineStep } from '@/lib/data';
import { useDebounced } from '../../controls';
import { useVisualize } from '../../context';
import { ErrorNote, humanize } from '../../ui';
import { CONDITION_OPS, KIND_BY_OP, newStep, STEP_KINDS, stepSummary, type StepField } from './steps';

const AGGS: [string, string][] = [
  ['sum', 'Sum'],
  ['avg', 'Average'],
  ['count', 'Count'],
  ['distinct', 'Distinct count'],
  ['min', 'Min'],
  ['max', 'Max'],
  ['median', 'Median'],
];
/** A setting or cell as text (numbers and text as they are; anything else as JSON). */
function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : `${value as string | number | boolean}`;
}

const PARTS = ['year', 'quarter', 'month', 'month_name', 'week', 'weekday', 'weekday_name', 'day', 'hour'];

/** Applied steps, Power Query style: a catalogue of transforms, the ordered steps, and a live
 *  preview after any step. Python runs every step; the original dataset never changes. */
export function TransformWorkspace({
  dataset,
  pipeline,
  setPipeline,
  selected,
  setSelected,
}: {
  dataset: Dataset;
  pipeline: VizPipelineStep[];
  setPipeline: (steps: VizPipelineStep[]) => void;
  selected: number;
  setSelected: (index: number) => void;
}) {
  const visualize = useRepository('visualize');
  const { datasets, refreshDatasets, setDatasetId } = useVisualize();
  const [search, setSearch] = useState('');
  const [name, setName] = useState(`${dataset.name} (transformed)`);
  useEffect(() => setName(`${dataset.name} (transformed)`), [dataset.name]);
  const original = useMemo(() => (dataset.profile.columnProfiles ?? []).map((profile) => profile.name), [dataset]);
  const index = Math.min(selected, pipeline.length - 1);
  const debounced = useDebounced(pipeline, 400);
  // The preview after the selected step, and the columns the selected step can use (before it).
  const preview = useQuery({
    queryKey: ['visualize', 'steps-preview', dataset.id, debounced, index],
    queryFn: () => visualize.organizePreview(dataset.id, { pipeline: debounced, upto: index }),
    enabled: debounced.length > 0 && index >= 0,
    retry: false,
  });
  const before = useQuery({
    queryKey: ['visualize', 'steps-preview', dataset.id, debounced.slice(0, index), index - 1],
    queryFn: () => visualize.organizePreview(dataset.id, { pipeline: debounced.slice(0, index), upto: index - 1 }),
    enabled: index > 0,
    retry: false,
  });
  const columns = index > 0 ? (before.data?.profile.columns ?? Object.keys(before.data?.preview[0] ?? {})) : original;
  const save = useMutation({
    mutationFn: () => visualize.organizeSave(dataset.id, { pipeline }, name.trim() || `${dataset.name} (transformed)`),
    onSuccess: async (created) => {
      await refreshDatasets();
      setDatasetId(created.id);
      setPipeline([]);
    },
  });

  const add = (op: string) => {
    setPipeline([...pipeline, newStep(op)]);
    setSelected(pipeline.length);
  };
  const patch = (position: number, change: Record<string, unknown>) => setPipeline(pipeline.map((step, i) => (i === position ? { ...step, ...change } : step)));
  const move = (position: number, by: number) => {
    const next = [...pipeline];
    const [item] = next.splice(position, 1);
    next.splice(Math.max(0, Math.min(next.length, position + by)), 0, item!);
    setPipeline(next);
    setSelected(Math.max(0, Math.min(next.length - 1, position + by)));
  };
  const needle = search.trim().toLowerCase();
  const kinds = STEP_KINDS.filter((kind) => !needle || `${kind.label} ${kind.keywords} ${kind.group}`.toLowerCase().includes(needle));
  const groups = [...new Set(kinds.map((kind) => kind.group))];
  const current = pipeline[index];
  const rows = preview.data?.preview ?? [];
  const header = rows[0] ? Object.keys(rows[0]) : (preview.data?.profile.columns ?? []);

  return (
    <div className="viz-transform" data-testid="transform">
      <aside className="viz-transform-catalogue" aria-label="Transforms">
        <label className="dash-pane-search">
          <Search size={12} aria-hidden />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="What do you want to do?" aria-label="Search transforms" data-testid="transform-search" />
        </label>
        {groups.map((group) => (
          <div key={group}>
            <p className="viz-label mt-2">{group}</p>
            {kinds
              .filter((kind) => kind.group === group)
              .map((kind) => (
                <button key={kind.op} type="button" className="viz-transform-kind" onClick={() => add(kind.op)} data-testid={`add-step-${kind.op}`}>
                  <Plus size={12} aria-hidden /> {kind.label}
                </button>
              ))}
          </div>
        ))}
      </aside>

      <section className="viz-transform-preview" aria-label="Preview">
        {pipeline.length === 0 ? (
          <div className="viz-transform-empty">
            <ListOrdered size={22} aria-hidden />
            <p>Pick a transform on the left. Every step is applied in order and previewed here; the original dataset stays as it is.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground" data-testid="transform-preview-label">
              After step {index + 1} · {preview.data?.profile.rows?.toLocaleString() ?? '…'} rows × {header.length} columns
            </p>
            <ErrorNote error={preview.error} />
            <div className="dash-table-wrap viz-transform-table">
              <table className="dash-table" data-testid="transform-preview">
                <thead>
                  <tr>
                    {header.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((row, i) => (
                    <tr key={i}>
                      {header.map((column) => (
                        <td key={column} className={typeof row[column] === 'number' ? 'num' : ''}>
                          {row[column] === null || row[column] === undefined ? '—' : text(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <aside className="viz-transform-steps" aria-label="Applied steps">
        <p className="viz-label">Applied steps</p>
        <ol className="space-y-1" data-testid="applied-steps">
          {pipeline.map((step, position) => (
            <li key={position} className={`viz-step${position === index ? ' selected' : ''}${step.enabled === false ? ' off' : ''}`} data-testid={`step-${position}`}>
              <button type="button" className="flex-1 truncate text-left" onClick={() => setSelected(position)} title="Preview the data after this step">
                <b>{position + 1}.</b> {step.label ?? KIND_BY_OP[step.op]?.label} <span className="text-muted-foreground">{stepSummary(step)}</span>
              </button>
              <button type="button" title={step.enabled === false ? 'Turn on' : 'Turn off'} onClick={() => patch(position, { enabled: step.enabled === false })}>
                {step.enabled === false ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
              <button type="button" title="Move up" disabled={position === 0} onClick={() => move(position, -1)}>
                <ArrowUp size={12} />
              </button>
              <button type="button" title="Move down" disabled={position === pipeline.length - 1} onClick={() => move(position, 1)}>
                <ArrowDown size={12} />
              </button>
              <button
                type="button"
                title="Delete"
                onClick={() => {
                  setPipeline(pipeline.filter((_, i) => i !== position));
                  setSelected(Math.max(0, position - 1));
                }}
                data-testid={`delete-step-${position}`}
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ol>
        {current && (
          <div className="viz-step-editor" data-testid="step-editor">
            <input className="viz-field h-7 text-xs" value={current.label ?? ''} placeholder={KIND_BY_OP[current.op]?.label} onChange={(event) => patch(index, { label: event.target.value || undefined })} aria-label="Step name" />
            {KIND_BY_OP[current.op]?.fields.map((field) => (
              <FieldEditor key={field.key} field={field} value={current[field.key]} columns={columns} datasets={datasets.filter((item) => item.id !== dataset.id)} onChange={(value) => patch(index, { [field.key]: value })} />
            ))}
          </div>
        )}
        {pipeline.length > 0 && (
          <div className="viz-step-save">
            <input className="viz-field h-8 text-xs" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} aria-label="New dataset name" data-testid="transform-name" />
            <button type="button" className="viz-chip primary" disabled={save.isPending} onClick={() => save.mutate()} data-testid="transform-save">
              <Save size={12} aria-hidden /> {save.isPending ? 'Saving…' : 'Save as new dataset'}
            </button>
            <ErrorNote error={save.error} />
          </div>
        )}
      </aside>
    </div>
  );
}

function ColumnSelect({ value, columns, onChange, testId }: { value: unknown; columns: string[]; onChange: (value: string) => void; testId?: string }) {
  const current = typeof value === 'string' ? value : '';
  return (
    <select className="viz-field h-7 text-xs" value={current} onChange={(event) => onChange(event.target.value)} data-testid={testId}>
      <option value="">Choose a column…</option>
      {current && !columns.includes(current) && <option value={current}>{current}</option>}
      {columns.map((column) => (
        <option key={column} value={column}>
          {column}
        </option>
      ))}
    </select>
  );
}

function FieldEditor({ field, value, columns, datasets, onChange }: { field: StepField; value: unknown; columns: string[]; datasets: Dataset[]; onChange: (value: unknown) => void }) {
  const label = <span className="viz-label m-0">{field.label}</span>;
  const testId = `step-field-${field.key}`;
  switch (field.type) {
    case 'column':
      return (
        <label className="block space-y-0.5">
          {label}
          <ColumnSelect value={value} columns={columns} onChange={onChange} testId={testId} />
        </label>
      );
    case 'columns': {
      const chosen = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-0.5">
          {label}
          <div className="flex max-h-28 flex-wrap gap-1 overflow-auto" data-testid={testId}>
            {columns.map((column) => (
              <button key={column} type="button" className="viz-chip" aria-pressed={chosen.includes(column)} onClick={() => onChange(chosen.includes(column) ? chosen.filter((c) => c !== column) : [...chosen, column])}>
                {column}
              </button>
            ))}
          </div>
        </div>
      );
    }
    case 'select':
      return (
        <label className="block space-y-0.5">
          {label}
          <select className="viz-field h-7 text-xs" value={text(value ?? field.options?.[0]?.[0] ?? '')} onChange={(event) => onChange(event.target.value)} data-testid={testId}>
            {field.options?.map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </select>
        </label>
      );
    case 'number':
      return (
        <label className="block space-y-0.5">
          {label}
          <input type="number" className="viz-field h-7 text-xs" value={value === undefined ? '' : text(value)} onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))} data-testid={testId} />
        </label>
      );
    case 'edges':
    case 'names':
      return (
        <label className="block space-y-0.5">
          {label}
          <input
            className="viz-field h-7 text-xs"
            placeholder={field.placeholder ?? 'a, b, c'}
            defaultValue={Array.isArray(value) ? value.join(', ') : ''}
            onBlur={(event) => {
              const parts = event.target.value.split(',').map((part) => part.trim()).filter(Boolean);
              onChange(field.type === 'edges' ? parts.map(Number).filter((n) => !Number.isNaN(n)) : parts);
            }}
            data-testid={testId}
          />
        </label>
      );
    case 'dataset':
      return (
        <label className="block space-y-0.5">
          {label}
          <select className="viz-field h-7 text-xs" value={text(value ?? '')} onChange={(event) => onChange(event.target.value)} data-testid={testId}>
            <option value="">Choose a dataset…</option>
            {datasets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      );
    case 'parts': {
      const chosen = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-0.5">
          {label}
          <div className="flex flex-wrap gap-1">
            {PARTS.map((part) => (
              <button key={part} type="button" className="viz-chip" aria-pressed={chosen.includes(part)} onClick={() => onChange(chosen.includes(part) ? chosen.filter((p) => p !== part) : [...chosen, part])}>
                {humanize(part)}
              </button>
            ))}
          </div>
        </div>
      );
    }
    case 'conditions':
    case 'rules': {
      const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      const set = (position: number, change: Record<string, unknown>) => onChange(items.map((item, i) => (i === position ? { ...item, ...change } : item)));
      return (
        <div className="space-y-1">
          {label}
          {items.map((item, position) => {
            const op = text(item.op ?? 'eq');
            return (
              <div key={position} className="dash-rule">
                <div className="flex gap-1">
                  <ColumnSelect value={item.field} columns={columns} onChange={(field) => set(position, { field })} testId={`${testId}-${position}-field`} />
                  <select className="viz-field h-7 w-28 text-xs" value={op} onChange={(event) => set(position, { op: event.target.value })} aria-label="Operator">
                    {CONDITION_OPS.map(([key, text]) => (
                      <option key={key} value={key}>
                        {text}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="viz-icon-button" onClick={() => onChange(items.filter((_, i) => i !== position))} aria-label="Remove condition">
                    <X size={12} />
                  </button>
                </div>
                {op !== 'blank' && op !== 'not_blank' && (
                  <input
                    className="viz-field h-7 text-xs"
                    placeholder={op === 'in' || op === 'not_in' ? 'a, b, c' : op === 'between' ? 'from, to' : 'value'}
                    defaultValue={Array.isArray(item.value) ? (item.value as unknown[]).join(', ') : text(item.value ?? '')}
                    onBlur={(event) => {
                      const text = event.target.value;
                      const many = op === 'in' || op === 'not_in' || op === 'between';
                      set(position, { value: many ? text.split(',').map((part) => part.trim()) : text });
                    }}
                    data-testid={`${testId}-${position}-value`}
                  />
                )}
                {field.type === 'rules' && <input className="viz-field h-7 text-xs" placeholder="then" value={text(item.then ?? '')} onChange={(event) => set(position, { then: event.target.value })} data-testid={`${testId}-${position}-then`} />}
              </div>
            );
          })}
          <button type="button" className="viz-chip" onClick={() => onChange([...items, { field: '', op: 'eq', value: '', ...(field.type === 'rules' ? { then: '' } : {}) }])}>
            <Plus size={12} /> Condition
          </button>
        </div>
      );
    }
    case 'aggregations': {
      const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      const set = (position: number, change: Record<string, unknown>) => onChange(items.map((item, i) => (i === position ? { ...item, ...change } : item)));
      return (
        <div className="space-y-1">
          {label}
          {items.map((item, position) => (
            <div key={position} className="flex gap-1">
              <select className="viz-field h-7 w-24 text-xs" value={text(item.agg ?? 'sum')} onChange={(event) => set(position, { agg: event.target.value })} aria-label="Aggregation">
                {AGGS.map(([key, text]) => (
                  <option key={key} value={key}>
                    {text}
                  </option>
                ))}
              </select>
              <ColumnSelect value={item.column} columns={columns} onChange={(column) => set(position, { column, name: item.name || `${text(item.agg ?? 'sum')}_${column}` })} testId={`${testId}-${position}-column`} />
              <button type="button" className="viz-icon-button" onClick={() => onChange(items.filter((_, i) => i !== position))} aria-label="Remove">
                <X size={12} />
              </button>
            </div>
          ))}
          <button type="button" className="viz-chip" onClick={() => onChange([...items, { column: '', agg: 'sum', name: '' }])}>
            <Plus size={12} /> Calculation
          </button>
        </div>
      );
    }
    case 'sortBy': {
      const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      const set = (position: number, change: Record<string, unknown>) => onChange(items.map((item, i) => (i === position ? { ...item, ...change } : item)));
      return (
        <div className="space-y-1">
          {label}
          {items.map((item, position) => (
            <div key={position} className="flex gap-1">
              <ColumnSelect value={item.column} columns={columns} onChange={(column) => set(position, { column })} testId={`${testId}-${position}-column`} />
              <select className="viz-field h-7 w-24 text-xs" value={text(item.dir ?? 'asc')} onChange={(event) => set(position, { dir: event.target.value })} aria-label="Direction">
                <option value="asc">A → Z / low → high</option>
                <option value="desc">Z → A / high → low</option>
              </select>
            </div>
          ))}
          <button type="button" className="viz-chip" onClick={() => onChange([...items, { column: '', dir: 'asc' }])}>
            <Plus size={12} /> Sort level
          </button>
        </div>
      );
    }
    default:
      return (
        <label className="block space-y-0.5">
          {label}
          <input className="viz-field h-7 text-xs" value={text(value ?? '')} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} data-testid={testId} />
        </label>
      );
  }
}
