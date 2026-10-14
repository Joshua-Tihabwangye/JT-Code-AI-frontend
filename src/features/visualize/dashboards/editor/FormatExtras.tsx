import { Plus, Trash2 } from 'lucide-react';
import type { ColumnProfile, DashboardParameter, DashboardSpec, DashboardVisual, VisualOutput } from '@/lib/data';
import { humanize } from '../../ui';
import { BUTTON_ACTIONS, type ButtonAction } from '../local';
import { newId } from './catalog';
import { ParameterEditor } from './CalcPanel';

type Update = (mutate: (visual: DashboardVisual) => DashboardVisual, merge?: string) => void;

export interface ExtrasContext {
  spec: DashboardSpec;
  pageId: string;
  onSpec: (mutate: (spec: DashboardSpec) => DashboardSpec) => void;
  output?: VisualOutput;
  profiles?: ColumnProfile[];
}

function section<T>(visual: DashboardVisual, key: string): T {
  return (visual.format?.[key] ?? {}) as T;
}

const setSection = (update: Update, key: string, value: Record<string, unknown> | undefined, merge?: string) =>
  update((v) => {
    const format = { ...(v.format ?? {}) };
    if (value) format[key] = value;
    else delete format[key];
    return { ...v, format };
  }, merge);

// --- Conditional formatting ---------------------------------------------------------------------

interface Rule {
  measure?: string;
  kind: 'scale' | 'rules' | 'bars' | 'icons';
  target?: 'background' | 'font';
  min?: string;
  mid?: string;
  max?: string;
  color?: string;
  rules?: { op: string; value: number; value2?: number; color: string }[];
  thresholds?: number[];
}

const OPS: [string, string][] = [
  ['gt', '>'],
  ['gte', '≥'],
  ['lt', '<'],
  ['lte', '≤'],
  ['eq', '='],
  ['ne', '≠'],
  ['between', 'between'],
];

export function ConditionalSection({ visual, update }: { visual: DashboardVisual; update: Update }) {
  const rules = section<{ rules?: Rule[] }>(visual, 'conditional').rules ?? [];
  const values = visual.type === 'matrix' ? (visual.data.wells.values ?? []).slice(0, 1) : (visual.data.wells.values ?? []);
  const save = (next: Rule[]) => setSection(update, 'conditional', next.length ? { rules: next } : undefined, 'conditional');
  const patch = (index: number, change: Partial<Rule>) => save(rules.map((rule, i) => (i === index ? { ...rule, ...change } : rule)));
  const kinds: [Rule['kind'], string][] = visual.type === 'table' || visual.type === 'matrix'
    ? [
        ['scale', 'Colour scale'],
        ['rules', 'Rules'],
        ['bars', 'Data bars'],
        ['icons', 'Icons ▲●▼'],
      ]
    : [
        ['rules', 'Rules'],
        ['scale', 'Colour scale'],
      ];
  return (
    <div className="space-y-2" data-testid="format-conditional">
      {rules.map((rule, index) => (
        <div key={index} className="dash-rule">
          <div className="flex items-center gap-1">
            <select className="viz-field h-7 text-xs" value={rule.kind} onChange={(event) => patch(index, { kind: event.target.value as Rule['kind'] })} aria-label="Rule type">
              {kinds.map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
            {values.length > 1 && (
              <select className="viz-field h-7 text-xs" value={rule.measure ?? 'm0'} onChange={(event) => patch(index, { measure: event.target.value })} aria-label="Value">
                {values.map((ref, i) => (
                  <option key={i} value={`m${i}`}>
                    {ref.label ?? humanize(ref.field)}
                  </option>
                ))}
              </select>
            )}
            {(rule.kind === 'scale' || rule.kind === 'rules') && (visual.type === 'table' || visual.type === 'matrix' || visual.type === 'card' || visual.type === 'kpi' || visual.type === 'multi_card') && (
              <select className="viz-field h-7 text-xs" value={rule.target ?? (visual.type === 'card' || visual.type === 'kpi' || visual.type === 'multi_card' ? 'font' : 'background')} onChange={(event) => patch(index, { target: event.target.value as Rule['target'] })} aria-label="Colour">
                <option value="background">Background</option>
                <option value="font">Text</option>
              </select>
            )}
            <button type="button" className="viz-icon-button ml-auto" onClick={() => save(rules.filter((_, i) => i !== index))} aria-label="Remove rule">
              <Trash2 size={12} />
            </button>
          </div>
          {rule.kind === 'scale' && (
            <div className="flex items-center gap-1 text-[11px]">
              Lowest <input type="color" className="viz-color-input" value={rule.min ?? '#fee2e2'} onChange={(event) => patch(index, { min: event.target.value })} aria-label="Lowest colour" />
              Middle <input type="color" className="viz-color-input" value={rule.mid ?? '#fef9c3'} onChange={(event) => patch(index, { mid: event.target.value })} aria-label="Middle colour" />
              Highest <input type="color" className="viz-color-input" value={rule.max ?? '#dcfce7'} onChange={(event) => patch(index, { max: event.target.value })} aria-label="Highest colour" />
            </div>
          )}
          {rule.kind === 'rules' && (
            <>
              {(rule.rules ?? []).map((item, i) => (
                <div key={i} className="flex items-center gap-1">
                  <select className="viz-field h-7 w-20 text-xs" value={item.op} onChange={(event) => patch(index, { rules: (rule.rules ?? []).map((r, j) => (j === i ? { ...r, op: event.target.value } : r)) })} aria-label="If value is">
                    {OPS.map(([op, label]) => (
                      <option key={op} value={op}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input type="number" className="viz-field h-7 w-20 text-xs" value={item.value} onChange={(event) => patch(index, { rules: (rule.rules ?? []).map((r, j) => (j === i ? { ...r, value: Number(event.target.value) } : r)) })} aria-label="Value" data-testid={`rule-value-${index}-${i}`} />
                  {item.op === 'between' && <input type="number" className="viz-field h-7 w-20 text-xs" value={item.value2 ?? 0} onChange={(event) => patch(index, { rules: (rule.rules ?? []).map((r, j) => (j === i ? { ...r, value2: Number(event.target.value) } : r)) })} aria-label="And" />}
                  <input type="color" className="viz-color-input" value={item.color} onChange={(event) => patch(index, { rules: (rule.rules ?? []).map((r, j) => (j === i ? { ...r, color: event.target.value } : r)) })} aria-label="Colour" />
                  <button type="button" className="viz-icon-button" onClick={() => patch(index, { rules: (rule.rules ?? []).filter((_, j) => j !== i) })} aria-label="Remove condition">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              <button type="button" className="viz-chip" onClick={() => patch(index, { rules: [...(rule.rules ?? []), { op: 'gt', value: 0, color: '#16a34a' }] })} data-testid={`add-condition-${index}`}>
                <Plus size={12} /> Condition (first match wins)
              </button>
            </>
          )}
          {rule.kind === 'bars' && (
            <label className="dash-format-row">
              <span>Bar colour</span>
              <input type="color" className="viz-color-input" value={rule.color ?? '#4f46e5'} onChange={(event) => patch(index, { color: event.target.value })} />
            </label>
          )}
          {rule.kind === 'icons' && <p className="text-[11px] text-muted-foreground">▲ top third, ● middle, ▼ bottom third of the values.</p>}
        </div>
      ))}
      <button
        type="button"
        className="viz-chip"
        onClick={() => save([...rules, kinds[0]![0] === 'scale' ? { kind: 'scale', min: '#fee2e2', max: '#dcfce7' } : { kind: 'rules', rules: [{ op: 'gt', value: 0, color: '#16a34a' }] }])}
        data-testid="add-conditional"
      >
        <Plus size={12} /> Add a rule
      </button>
    </div>
  );
}

// --- Analytics lines ------------------------------------------------------------------------------

interface Line {
  kind: 'constant' | 'average' | 'median' | 'min' | 'max' | 'percentile' | 'trend' | 'forecast';
  value?: number;
  percentile?: number;
  horizon?: number;
  label?: string;
  color?: string;
}

const LINE_KINDS: [Line['kind'], string][] = [
  ['constant', 'Constant (target)'],
  ['average', 'Average'],
  ['median', 'Median'],
  ['min', 'Minimum'],
  ['max', 'Maximum'],
  ['percentile', 'Percentile'],
  ['trend', 'Trend line'],
  ['forecast', 'Forecast'],
];

export function AnalyticsSection({ visual, update }: { visual: DashboardVisual; update: Update }) {
  const lines = section<{ lines?: Line[] }>(visual, 'analytics').lines ?? [];
  const save = (next: Line[]) => setSection(update, 'analytics', next.length ? { lines: next } : undefined, 'analytics');
  const patch = (index: number, change: Partial<Line>) => save(lines.map((line, i) => (i === index ? { ...line, ...change } : line)));
  const dated = (visual.data.wells.category ?? [])[0]?.grain;
  const kinds = LINE_KINDS.filter(([kind]) => (kind === 'forecast' ? !!dated && visual.type !== 'bar' && visual.type !== 'scatter' : true));
  return (
    <div className="space-y-2" data-testid="format-analytics">
      {lines.map((line, index) => (
        <div key={index} className="dash-rule">
          <div className="flex items-center gap-1">
            <select className="viz-field h-7 text-xs" value={line.kind} onChange={(event) => patch(index, { kind: event.target.value as Line['kind'] })} aria-label="Line" data-testid={`analytics-kind-${index}`}>
              {kinds.map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
            {line.kind === 'constant' && <input type="number" className="viz-field h-7 w-24 text-xs" value={line.value ?? 0} onChange={(event) => patch(index, { value: Number(event.target.value) })} aria-label="Value" data-testid={`analytics-value-${index}`} />}
            {line.kind === 'percentile' && <input type="number" min={1} max={99} className="viz-field h-7 w-16 text-xs" value={line.percentile ?? 90} onChange={(event) => patch(index, { percentile: Number(event.target.value) })} aria-label="Percentile" />}
            {line.kind === 'forecast' && (
              <label className="text-[11px]">
                Periods <input type="number" min={1} max={24} className="viz-field h-7 w-14 text-xs" value={line.horizon ?? 3} onChange={(event) => patch(index, { horizon: Number(event.target.value) })} />
              </label>
            )}
            <input type="color" className="viz-color-input" value={line.color ?? '#64748b'} onChange={(event) => patch(index, { color: event.target.value })} aria-label="Colour" />
            <button type="button" className="viz-icon-button ml-auto" onClick={() => save(lines.filter((_, i) => i !== index))} aria-label="Remove line">
              <Trash2 size={12} />
            </button>
          </div>
          <input className="viz-field h-7 text-xs" value={line.label ?? ''} maxLength={40} placeholder="Label (optional)" onChange={(event) => patch(index, { label: event.target.value || undefined })} />
        </div>
      ))}
      <button type="button" className="viz-chip" onClick={() => save([...lines, { kind: 'average' }])} data-testid="add-analytics">
        <Plus size={12} /> Add a line
      </button>
      {!dated && <p className="text-[11px] text-muted-foreground">Forecasts need a date axis (e.g. date by month).</p>}
    </div>
  );
}

// --- Python visual ----------------------------------------------------------------------------------

export const PYTHON_STARTER = `# \`dataset\` holds the fields in the Values well (filtered by slicers).
# Set \`result\` to an ECharts option (dict), a DataFrame (table) or a number.
numbers = list(dataset.select_dtypes("number").columns)
labels = [c for c in dataset.columns if c not in numbers]
if labels and numbers:
    totals = dataset.groupby(labels[0])[numbers[0]].sum().sort_values(ascending=False).head(10)
else:
    totals = dataset.iloc[:, 0].value_counts().head(10)
result = {
    "xAxis": {"type": "category", "data": [str(k) for k in totals.index]},
    "yAxis": {"type": "value"},
    "series": [{"type": "bar", "data": totals.round(2).tolist()}],
}
`;

export function PythonSection({ visual, update, output }: { visual: DashboardVisual; update: Update; output?: VisualOutput }) {
  const code = section<{ code?: string }>(visual, 'python').code ?? '';
  return (
    <div className="space-y-1" data-testid="format-python">
      <textarea
        className="viz-field dash-code"
        rows={12}
        value={code}
        spellCheck={false}
        maxLength={20000}
        placeholder={PYTHON_STARTER}
        onChange={(event) => setSection(update, 'python', { code: event.target.value }, 'python.code')}
        data-testid="python-code"
      />
      {!code && (
        <button type="button" className="viz-chip" onClick={() => setSection(update, 'python', { code: PYTHON_STARTER })} data-testid="python-starter">
          Start from an example
        </button>
      )}
      <p className="text-[11px] text-muted-foreground">
        Runs in a locked-down Python sandbox: pandas, numpy, scipy, statsmodels and scikit-learn; no files, network or system access.
      </p>
      {output?.status === 'error' && <p className="text-[11px] text-destructive">{output.message}</p>}
      {output?.console && (
        <pre className="dash-console" data-testid="python-console">
          {output.console}
        </pre>
      )}
    </div>
  );
}

// --- Buttons, navigators, parameters ----------------------------------------------------------------

export function ButtonSection({ visual, update, context }: { visual: DashboardVisual; update: Update; context: ExtrasContext }) {
  const settings = section<{ text?: string; action?: ButtonAction; fill?: string }>(visual, 'button');
  const action = settings.action ?? { kind: 'clear_slicers' };
  const save = (change: Record<string, unknown>) => setSection(update, 'button', { ...settings, ...change }, 'button');
  const page = context.spec.pages.find((p) => p.id === context.pageId);
  return (
    <div className="space-y-1.5" data-testid="format-button">
      <label className="dash-format-row">
        <span>Text</span>
        <input className="viz-field" value={settings.text ?? ''} maxLength={40} placeholder="Automatic" onChange={(event) => save({ text: event.target.value || undefined })} data-testid="button-text" />
      </label>
      <label className="dash-format-row">
        <span>Action</span>
        <select className="viz-field" value={action.kind} onChange={(event) => save({ action: { kind: event.target.value } })} data-testid="button-action">
          {BUTTON_ACTIONS.map(([kind, label]) => (
            <option key={kind} value={kind}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {action.kind === 'page' && (
        <label className="dash-format-row">
          <span>Page</span>
          <select className="viz-field" value={action.pageId ?? ''} onChange={(event) => save({ action: { kind: 'page', pageId: event.target.value } })} data-testid="button-target">
            <option value="">Choose…</option>
            {context.spec.pages
              .filter((p) => (p.type ?? 'page') === 'page')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {action.kind === 'bookmark' && (
        <label className="dash-format-row">
          <span>View</span>
          <select className="viz-field" value={action.bookmarkId ?? ''} onChange={(event) => save({ action: { kind: 'bookmark', bookmarkId: event.target.value } })}>
            <option value="">{context.spec.bookmarks?.length ? 'Choose…' : 'Add views first (Views tab)'}</option>
            {(context.spec.bookmarks ?? []).map((bookmark) => (
              <option key={bookmark.id} value={bookmark.id}>
                {bookmark.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {action.kind === 'toggle' && (
        <label className="dash-format-row">
          <span>Visual</span>
          <select className="viz-field" value={action.visualId ?? ''} onChange={(event) => save({ action: { kind: 'toggle', visualId: event.target.value } })}>
            <option value="">Choose…</option>
            {(page?.visuals ?? [])
              .filter((v) => v.id !== visual.id)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title || (v.format?.title as { text?: string } | undefined)?.text || `${humanize(v.type)} (${v.id})`}
                </option>
              ))}
          </select>
        </label>
      )}
      {action.kind === 'url' && (
        <label className="dash-format-row">
          <span>Link</span>
          <input className="viz-field" value={action.url ?? ''} placeholder="https://…" onChange={(event) => save({ action: { kind: 'url', url: event.target.value } })} />
        </label>
      )}
      <label className="dash-format-row">
        <span>Style</span>
        <select className="viz-field" value={settings.fill ?? 'primary'} onChange={(event) => save({ fill: event.target.value })}>
          <option value="primary">Filled</option>
          <option value="outline">Outline</option>
          <option value="ghost">Plain</option>
        </select>
      </label>
    </div>
  );
}

export function NavigatorSection({ visual, update }: { visual: DashboardVisual; update: Update }) {
  const kind = section<{ kind?: string }>(visual, 'navigator').kind ?? 'pages';
  return (
    <label className="dash-format-row">
      <span>Shows</span>
      <select className="viz-field" value={kind} onChange={(event) => setSection(update, 'navigator', { kind: event.target.value })} data-testid="navigator-kind">
        <option value="pages">Pages</option>
        <option value="bookmarks">Views (bookmarks)</option>
      </select>
    </label>
  );
}

export function ParameterSection({ visual, update, context }: { visual: DashboardVisual; update: Update; context: ExtrasContext }) {
  const settings = section<{ id?: string; style?: string }>(visual, 'parameter');
  const parameters = context.spec.parameters ?? [];
  const current = parameters.find((parameter) => parameter.id === settings.id);
  const saveParameter = (parameter: DashboardParameter) => {
    context.onSpec((spec) => {
      const list = spec.parameters ?? [];
      return { ...spec, parameters: list.some((p) => p.id === parameter.id) ? list.map((p) => (p.id === parameter.id ? parameter : p)) : [...list, parameter] };
    });
    setSection(update, 'parameter', { ...settings, id: parameter.id });
  };
  return (
    <div className="space-y-1.5" data-testid="format-parameter">
      {parameters.length > 0 && (
        <label className="dash-format-row">
          <span>Parameter</span>
          <select className="viz-field" value={settings.id ?? ''} onChange={(event) => setSection(update, 'parameter', { ...settings, id: event.target.value || undefined })} data-testid="parameter-pick">
            <option value="">New parameter…</option>
            {parameters.map((parameter) => (
              <option key={parameter.id} value={parameter.id}>
                {parameter.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {current?.kind === 'fields' && (
        <label className="dash-format-row">
          <span>Show as</span>
          <select className="viz-field" value={settings.style ?? 'tiles'} onChange={(event) => setSection(update, 'parameter', { ...settings, style: event.target.value })}>
            <option value="tiles">Buttons</option>
            <option value="dropdown">Dropdown</option>
          </select>
        </label>
      )}
      <ParameterEditor
        key={current?.id ?? 'new'}
        parameter={current ?? { id: newId('param'), name: '', kind: 'whatif', min: -0.5, max: 0.5, step: 0.05, default: 0, format: 'percent' }}
        profiles={context.profiles ?? []}
        onSave={saveParameter}
      />
      {current && (
        <button
          type="button"
          className="viz-chip"
          onClick={() => {
            context.onSpec((spec) => ({ ...spec, parameters: (spec.parameters ?? []).filter((p) => p.id !== current.id) }));
            setSection(update, 'parameter', undefined);
          }}
        >
          <Trash2 size={12} /> Delete this parameter
        </button>
      )}
    </div>
  );
}
