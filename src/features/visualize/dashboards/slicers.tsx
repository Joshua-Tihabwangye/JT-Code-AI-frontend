import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Minus, Search, X } from 'lucide-react';
import type { DashboardFilter, DashboardVisual, SlicerData, SlicerNode } from '@/lib/data';

type Primitive = string | number | boolean | null;

/** What a person chose in a slicer. Every style stores its own part. */
export type SlicerValue =
  | {
      values?: Primitive[];
      from?: string;
      to?: string;
      relative?: { mode: 'last' | 'this' | 'next'; n: number; unit: 'day' | 'week' | 'month' | 'quarter' | 'year'; complete?: boolean };
      input?: { op: 'contains' | 'starts_with' | 'eq' | 'gt' | 'gte' | 'lt' | 'lte'; text: string };
      /** Hierarchy slicers: chosen members as paths from the top level. */
      paths?: Primitive[][];
    }
  | undefined;

export function slicerStyle(visual: DashboardVisual): string | undefined {
  return (visual.format?.slicer as { style?: string } | undefined)?.style;
}

/** The filter a slicer's value implies (``null`` when it filters nothing). */
export function slicerFilter(visual: DashboardVisual, slicer: SlicerData | undefined, value: SlicerValue): DashboardFilter | null {
  const field = slicer?.field ?? visual.data.wells.category?.[0]?.field;
  if (!field || !value) return null;
  const datasetId = visual.data.datasetId;
  if (value.paths?.length) {
    const fields = slicer?.fields ?? visual.data.wells.category?.map((ref) => ref.field) ?? [field];
    // Group chosen members by depth: “East (all)” filters region, “Kenya” filters country; any of them matches.
    const byLevel = new Map<number, Primitive[]>();
    for (const path of value.paths) byLevel.set(path.length - 1, [...(byLevel.get(path.length - 1) ?? []), path[path.length - 1]!]);
    const parts = [...byLevel.entries()].map(([depth, values]) => ({ field: fields[depth] ?? field, op: 'in', value: values }));
    return parts.length === 1 ? { ...parts[0]!, datasetId } : { field: parts[0]!.field, op: 'or', value: parts, datasetId };
  }
  if (value.values?.length) return { field, op: 'in', value: value.values, datasetId };
  if (value.relative) return { field, op: 'relative', value: value.relative, datasetId };
  if (value.input?.text.trim()) {
    const text = value.input.text.trim();
    const numeric = ['gt', 'gte', 'lt', 'lte'].includes(value.input.op) || (value.input.op === 'eq' && text !== '' && !Number.isNaN(Number(text)) && typeof slicer?.range?.min === 'number');
    return { field, op: value.input.op, value: numeric ? Number(text) : text, datasetId };
  }
  if (value.from || value.to) {
    const isDate = typeof slicer?.range?.min === 'string';
    const low = value.from || String(slicer?.range?.min ?? '');
    const high = value.to || String(slicer?.range?.max ?? '');
    return { field, op: 'between', value: isDate ? [low.slice(0, 10), `${high.slice(0, 10)}T23:59:59`] : [Number(low), Number(high)], datasetId };
  }
  return null;
}

function useOutside(open: boolean, close: () => void) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (event: MouseEvent) => !box.current?.contains(event.target as Node) && close();
    const key = (event: KeyboardEvent) => event.key === 'Escape' && close();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open, close]);
  return box;
}

function RangeSlicer({ slicer, value, onChange }: { slicer: SlicerData; value: SlicerValue; onChange: (value: SlicerValue) => void }) {
  const isDate = typeof slicer.range?.min === 'string';
  const min = isDate ? String(slicer.range?.min ?? '').slice(0, 10) : String(slicer.range?.min ?? '');
  const max = isDate ? String(slicer.range?.max ?? '').slice(0, 10) : String(slicer.range?.max ?? '');
  const low = Number(value?.from ?? min);
  const high = Number(value?.to ?? max);
  const span = Number(max) - Number(min);
  const step = span > 0 ? Math.max(span / 200, Number.isInteger(Number(min)) && Number.isInteger(Number(max)) ? 1 : 0.01) : 1;
  return (
    <div className="dash-slicer-rangebox" data-testid="slicer-range">
      <div className="dash-slicer-range">
        <input type={isDate ? 'date' : 'number'} value={value?.from ?? min} min={min} max={max} onChange={(event) => onChange({ ...value, from: event.target.value })} aria-label={`${slicer.label} from`} />
        <span aria-hidden>–</span>
        <input type={isDate ? 'date' : 'number'} value={value?.to ?? max} min={min} max={max} onChange={(event) => onChange({ ...value, to: event.target.value })} aria-label={`${slicer.label} to`} />
        {(value?.from || value?.to) && (
          <button type="button" className="dash-icon" onClick={() => onChange(undefined)} aria-label="Clear">
            <X size={13} />
          </button>
        )}
      </div>
      {!isDate && span > 0 && (
        <div className="dash-dual-range">
          <input type="range" min={min} max={max} step={step} value={low} onChange={(event) => onChange({ ...value, from: String(Math.min(Number(event.target.value), high)) })} aria-label={`${slicer.label} minimum`} />
          <input type="range" min={min} max={max} step={step} value={high} onChange={(event) => onChange({ ...value, to: String(Math.max(Number(event.target.value), low)) })} aria-label={`${slicer.label} maximum`} />
        </div>
      )}
    </div>
  );
}

function RelativeSlicer({ value, onChange }: { value: SlicerValue; onChange: (value: SlicerValue) => void }) {
  const relative = value?.relative ?? { mode: 'last' as const, n: 3, unit: 'month' as const };
  const set = (patch: Partial<typeof relative>) => onChange({ relative: { ...relative, ...patch } });
  return (
    <div className="dash-slicer-relative" data-testid="slicer-relative">
      <select value={value?.relative ? relative.mode : ''} onChange={(event) => (event.target.value ? set({ mode: event.target.value as typeof relative.mode }) : onChange(undefined))} aria-label="Period">
        <option value="">All time</option>
        <option value="last">Last</option>
        <option value="this">This</option>
        <option value="next">Next</option>
      </select>
      {value?.relative && relative.mode !== 'this' && <input type="number" min={1} max={999} value={relative.n} onChange={(event) => set({ n: Math.max(1, Number(event.target.value) || 1) })} aria-label="How many" />}
      {value?.relative && (
        <select value={relative.unit} onChange={(event) => set({ unit: event.target.value as typeof relative.unit })} aria-label="Unit">
          {['day', 'week', 'month', 'quarter', 'year'].map((unit) => (
            <option key={unit} value={unit}>
              {relative.mode === 'this' ? unit : `${unit}s`}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function InputSlicer({ slicer, value, onChange }: { slicer: SlicerData; value: SlicerValue; onChange: (value: SlicerValue) => void }) {
  const input = value?.input ?? { op: 'contains' as const, text: '' };
  return (
    <div className="dash-slicer-relative" data-testid="slicer-input">
      <select value={input.op} onChange={(event) => onChange({ input: { ...input, op: event.target.value as typeof input.op } })} aria-label="Operator">
        <option value="contains">contains</option>
        <option value="starts_with">starts with</option>
        <option value="eq">is</option>
        <option value="gt">&gt;</option>
        <option value="gte">≥</option>
        <option value="lt">&lt;</option>
        <option value="lte">≤</option>
      </select>
      <input value={input.text} onChange={(event) => onChange(event.target.value ? { input: { ...input, text: event.target.value } } : undefined)} placeholder={`Type a ${slicer.label.toLowerCase()}`} aria-label={`${slicer.label} value`} />
    </div>
  );
}

function pathKey(path: Primitive[]): string {
  return JSON.stringify(path);
}

function HierarchySlicer({ tree, value, onChange }: { tree: SlicerNode[]; value: SlicerValue; onChange: (value: SlicerValue) => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const chosen = new Set((value?.paths ?? []).map(pathKey));
  const toggle = (path: Primitive[]) => {
    const key = pathKey(path);
    // Choosing a member replaces choices inside it (and its own ancestors' blanket choice).
    const kept = (value?.paths ?? []).filter((other) => {
      const otherKey = pathKey(other);
      if (otherKey === key) return false;
      const inside = other.length > path.length && pathKey(other.slice(0, path.length)) === key;
      const above = other.length < path.length && pathKey(path.slice(0, other.length)) === otherKey;
      return !inside && !above;
    });
    const next = chosen.has(key) ? kept : [...kept, path];
    onChange(next.length ? { paths: next } : undefined);
  };
  const render = (nodes: SlicerNode[], parent: Primitive[]) =>
    nodes.map((node) => {
      const path = [...parent, node.value];
      const key = pathKey(path);
      const partial = !chosen.has(key) && [...chosen].some((other) => other.startsWith(key.slice(0, -1) + ','));
      return (
        <li key={key}>
          <div className="dash-tree-row">
            {node.children.length ? (
              <button type="button" className="dash-icon" onClick={() => setOpen((current) => new Set(current.has(key) ? [...current].filter((k) => k !== key) : [...current, key]))} aria-label={open.has(key) ? 'Collapse' : 'Expand'}>
                {open.has(key) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            ) : (
              <span className="w-[18px]" />
            )}
            <button type="button" className="dash-slicer-option" role="treeitem" aria-selected={chosen.has(key)} onClick={() => toggle(path)}>
              <span className="dash-check">{chosen.has(key) ? <Check size={12} /> : partial ? <Minus size={12} /> : null}</span>
              <span className="truncate">{node.label}</span>
              <span className="ml-auto text-[10px] opacity-60">{node.count.toLocaleString()}</span>
            </button>
          </div>
          {open.has(key) && node.children.length > 0 && <ul className="dash-tree">{render(node.children, path)}</ul>}
        </li>
      );
    });
  return (
    <ul className="dash-tree root" role="tree" data-testid="slicer-tree">
      {render(tree, [])}
    </ul>
  );
}

/** A slicer in any style: dropdown, list, buttons, number/date range, relative date, input, hierarchy. */
export function SlicerVisual({ slicer, value, onChange, style, single }: { slicer: SlicerData; value: SlicerValue; onChange: (value: SlicerValue) => void; style?: string; single?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const box = useOutside(open, () => setOpen(false));
  if (slicer.tree) return <HierarchySlicer tree={slicer.tree} value={value} onChange={onChange} />;
  if (style === 'relative') return <RelativeSlicer value={value} onChange={onChange} />;
  if (style === 'input') return <InputSlicer slicer={slicer} value={value} onChange={onChange} />;
  if (slicer.range) return <RangeSlicer slicer={slicer} value={value} onChange={onChange} />;
  const options = slicer.options ?? [];
  const selected = new Set((value?.values ?? []).map((v) => String(v)));
  const toggle = (option: (typeof options)[number]) => {
    const key = String(option.value);
    if (single) return onChange(selected.has(key) ? undefined : { values: [option.value] });
    const next = selected.has(key) ? (value?.values ?? []).filter((v) => String(v) !== key) : [...(value?.values ?? []), option.value];
    onChange(next.length ? { values: next } : undefined);
  };
  /** Paste a list (one per line, or comma-separated) to select every matching value at once. */
  const paste = (text: string) => {
    const wanted = new Set(
      text
        .split(/[\n,;\t]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    );
    const matches = options.filter((option) => wanted.has(option.label.toLowerCase())).map((option) => option.value);
    if (matches.length) onChange({ values: matches });
    return matches.length;
  };
  if (style === 'tiles' || style === 'list') {
    return (
      <div className={style === 'tiles' ? 'dash-slicer-tiles' : 'dash-slicer-list'} role="group" aria-label={slicer.label}>
        {options.map((option) => (
          <button key={option.label} type="button" aria-pressed={selected.has(String(option.value))} onClick={() => toggle(option)}>
            {style === 'list' && <span className="dash-check">{selected.has(String(option.value)) && <Check size={11} />}</span>}
            {option.label}
          </button>
        ))}
      </div>
    );
  }
  const label = selected.size === 0 ? 'All' : selected.size === 1 ? (options.find((o) => selected.has(String(o.value)))?.label ?? '1 selected') : `${selected.size} selected`;
  const shown = options.filter((option) => !search || option.label.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="dash-slicer" ref={box}>
      <button type="button" className="dash-slicer-button" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="slicer-button">
        <span className="truncate">{label}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div className="dash-slicer-menu" role="listbox" aria-multiselectable={!single}>
          <label className="dash-slicer-search">
            <Search size={12} aria-hidden />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onPaste={(event) => {
                const text = event.clipboardData.getData('text');
                if (/[\n,;\t]/.test(text) && paste(text)) {
                  event.preventDefault();
                  setSearch('');
                }
              }}
              placeholder="Search, or paste a list"
              aria-label={`Search ${slicer.label}`}
              data-testid="slicer-search"
            />
          </label>
          {!single && (
            <button type="button" className="dash-slicer-option" onClick={() => onChange(undefined)}>
              <span className="dash-check">{selected.size === 0 && <Check size={12} />}</span> Select all
            </button>
          )}
          {shown.map((option) => (
            <button key={option.label} type="button" role="option" aria-selected={selected.has(String(option.value))} className="dash-slicer-option" onClick={() => toggle(option)}>
              <span className="dash-check">{selected.has(String(option.value)) && <Check size={12} />}</span>
              <span className="truncate">{option.label}</span>
              <span className="ml-auto text-[10px] opacity-60">{option.count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
