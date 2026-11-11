import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ColumnProfile, DashboardParameter, DashboardSpec, DashboardVisual, VisualOutput } from '@/lib/data';
import { humanize } from '../../ui';
import { BUTTON_ACTIONS, type ButtonAction } from '../local';
import { newId } from './catalog';
import { ParameterEditor } from './CalcPanel';

const F = 'visualize.format';

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

/** Button action kinds (local.tsx) to their label keys. */
const BUTTON_ACTION_KEYS: Record<ButtonAction['kind'], string> = {
  page: 'page',
  bookmark: 'bookmark',
  back: 'back',
  clear_slicers: 'clearSlicers',
  apply_slicers: 'applySlicers',
  toggle: 'toggle',
  url: 'url',
  ask_ai: 'askAi',
  reset: 'reset',
};

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
  ['between', `${F}.conditional.between`],
];

export function ConditionalSection({ visual, update }: { visual: DashboardVisual; update: Update }) {
  const rules = section<{ rules?: Rule[] }>(visual, 'conditional').rules ?? [];
  const values = visual.type === 'matrix' ? (visual.data.wells.values ?? []).slice(0, 1) : (visual.data.wells.values ?? []);
  const save = (next: Rule[]) => setSection(update, 'conditional', next.length ? { rules: next } : undefined, 'conditional');
  const patch = (index: number, change: Partial<Rule>) => save(rules.map((rule, i) => (i === index ? { ...rule, ...change } : rule)));
  const { t } = useTranslation();
  const kinds: Rule['kind'][] = visual.type === 'table' || visual.type === 'matrix' ? ['scale', 'rules', 'bars', 'icons'] : ['rules', 'scale'];
  return (
    <div className="space-y-2" data-testid="format-conditional">
      {rules.map((rule, index) => (
        <div key={index} className="dash-rule">
          <div className="flex items-center gap-1">
            <select className="viz-field h-7 text-xs" value={rule.kind} onChange={(event) => patch(index, { kind: event.target.value as Rule['kind'] })} aria-label={t(`${F}.conditional.ruleType`)}>
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`${F}.conditional.kinds.${kind}`)}
                </option>
              ))}
            </select>
            {values.length > 1 && (
              <select className="viz-field h-7 text-xs" value={rule.measure ?? 'm0'} onChange={(event) => patch(index, { measure: event.target.value })} aria-label={t(`${F}.conditional.value`)}>
                {values.map((ref, i) => (
                  <option key={i} value={`m${i}`}>
                    {ref.label ?? humanize(ref.field)}
                  </option>
                ))}
              </select>
            )}
            {(rule.kind === 'scale' || rule.kind === 'rules') && (visual.type === 'table' || visual.type === 'matrix' || visual.type === 'card' || visual.type === 'kpi' || visual.type === 'multi_card') && (
              <select className="viz-field h-7 text-xs" value={rule.target ?? (visual.type === 'card' || visual.type === 'kpi' || visual.type === 'multi_card' ? 'font' : 'background')} onChange={(event) => patch(index, { target: event.target.value as Rule['target'] })} aria-label={t(`${F}.conditional.colour`)}>
                <option value="background">{t(`${F}.conditional.background`)}</option>
                <option value="font">{t(`${F}.conditional.text`)}</option>
              </select>
            )}
            <button type="button" className="viz-icon-button ml-auto" onClick={() => save(rules.filter((_, i) => i !== index))} aria-label={t(`${F}.conditional.removeRule`)}>
              <Trash2 size={12} />
            </button>
          </div>
          {rule.kind === 'scale' && (
            <div className="flex items-center gap-1 text-[11px]">
              {t(`${F}.conditional.lowest`)} <input type="color" className="viz-color-input" value={rule.min ?? '#fee2e2'} onChange={(event) => patch(index, { min: event.target.value })} aria-label={t(`${F}.conditional.lowestColour`)} />
              {t(`${F}.conditional.middle`)} <input type="color" className="viz-color-input" value={rule.mid ?? '#fef9c3'} onChange={(event) => patch(index, { mid: event.target.value })} aria-label={t(`${F}.conditional.middleColour`)} />
              {t(`${F}.conditional.highest`)} <input type="color" className="viz-color-input" value={rule.max ?? '#dcfce7'} onChange={(event) => patch(index, { max: event.target.value })} aria-label={t(`${F}.conditional.highestColour`)} />
            </div>
          )}
          {rule.kind === 'rules' && (
            <>
              {(rule.rules ?? []).map((item, i) => (
                <div key={i} className="flex items-center gap-1">
                  <select className="viz-field h-7 w-20 text-xs" value={item.op} onChange={(event) => patch(index, { rules: (rule.rules ?? []).map((r, j) => (j === i ? { ...r, op: event.target.value } : r)) })} aria-label={t(`${F}.conditional.ifValueIs`)}>
                    {OPS.map(([op, label]) => (
                      <option key={op} value={op}>
                        {op === 'between' ? t(label) : label}
                      </option>
                    ))}
                  </select>
                  <input type="number" className="viz-field h-7 w-20 text-xs" value={item.value} onChange={(event) => patch(index, { rules: (rule.rules ?? []).map((r, j) => (j === i ? { ...r, value: Number(event.target.value) } : r)) })} aria-label={t(`${F}.conditional.value`)} data-testid={`rule-value-${index}-${i}`} />
                  {item.op === 'between' && <input type="number" className="viz-field h-7 w-20 text-xs" value={item.value2 ?? 0} onChange={(event) => patch(index, { rules: (rule.rules ?? []).map((r, j) => (j === i ? { ...r, value2: Number(event.target.value) } : r)) })} aria-label={t(`${F}.conditional.and`)} />}
                  <input type="color" className="viz-color-input" value={item.color} onChange={(event) => patch(index, { rules: (rule.rules ?? []).map((r, j) => (j === i ? { ...r, color: event.target.value } : r)) })} aria-label={t(`${F}.conditional.colour`)} />
                  <button type="button" className="viz-icon-button" onClick={() => patch(index, { rules: (rule.rules ?? []).filter((_, j) => j !== i) })} aria-label={t(`${F}.conditional.removeCondition`)}>
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              <button type="button" className="viz-chip" onClick={() => patch(index, { rules: [...(rule.rules ?? []), { op: 'gt', value: 0, color: '#16a34a' }] })} data-testid={`add-condition-${index}`}>
                <Plus size={12} /> {t(`${F}.conditional.addCondition`)}
              </button>
            </>
          )}
          {rule.kind === 'bars' && (
            <label className="dash-format-row">
              <span>{t(`${F}.conditional.barColour`)}</span>
              <input type="color" className="viz-color-input" value={rule.color ?? '#4f46e5'} onChange={(event) => patch(index, { color: event.target.value })} />
            </label>
          )}
          {rule.kind === 'icons' && <p className="text-[11px] text-muted-foreground">{t(`${F}.conditional.iconsHint`)}</p>}
        </div>
      ))}
      <button
        type="button"
        className="viz-chip"
        onClick={() => save([...rules, kinds[0]![0] === 'scale' ? { kind: 'scale', min: '#fee2e2', max: '#dcfce7' } : { kind: 'rules', rules: [{ op: 'gt', value: 0, color: '#16a34a' }] }])}
        data-testid="add-conditional"
      >
        <Plus size={12} /> {t(`${F}.conditional.addRule`)}
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

const LINE_KINDS: Line['kind'][] = ['constant', 'average', 'median', 'min', 'max', 'percentile', 'trend', 'forecast'];

export function AnalyticsSection({ visual, update }: { visual: DashboardVisual; update: Update }) {
  const { t } = useTranslation();
  const lines = section<{ lines?: Line[] }>(visual, 'analytics').lines ?? [];
  const save = (next: Line[]) => setSection(update, 'analytics', next.length ? { lines: next } : undefined, 'analytics');
  const patch = (index: number, change: Partial<Line>) => save(lines.map((line, i) => (i === index ? { ...line, ...change } : line)));
  const dated = (visual.data.wells.category ?? [])[0]?.grain;
  const kinds = LINE_KINDS.filter((kind) => (kind === 'forecast' ? !!dated && visual.type !== 'bar' && visual.type !== 'scatter' : true));
  return (
    <div className="space-y-2" data-testid="format-analytics">
      {lines.map((line, index) => (
        <div key={index} className="dash-rule">
          <div className="flex items-center gap-1">
            <select className="viz-field h-7 text-xs" value={line.kind} onChange={(event) => patch(index, { kind: event.target.value as Line['kind'] })} aria-label={t(`${F}.analytics.line`)} data-testid={`analytics-kind-${index}`}>
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`${F}.analytics.kinds.${kind}`)}
                </option>
              ))}
            </select>
            {line.kind === 'constant' && <input type="number" className="viz-field h-7 w-24 text-xs" value={line.value ?? 0} onChange={(event) => patch(index, { value: Number(event.target.value) })} aria-label={t(`${F}.analytics.value`)} data-testid={`analytics-value-${index}`} />}
            {line.kind === 'percentile' && <input type="number" min={1} max={99} className="viz-field h-7 w-16 text-xs" value={line.percentile ?? 90} onChange={(event) => patch(index, { percentile: Number(event.target.value) })} aria-label={t(`${F}.analytics.percentile`)} />}
            {line.kind === 'forecast' && (
              <label className="text-[11px]">
                {t(`${F}.analytics.periods`)} <input type="number" min={1} max={24} className="viz-field h-7 w-14 text-xs" value={line.horizon ?? 3} onChange={(event) => patch(index, { horizon: Number(event.target.value) })} />
              </label>
            )}
            <input type="color" className="viz-color-input" value={line.color ?? '#64748b'} onChange={(event) => patch(index, { color: event.target.value })} aria-label={t(`${F}.analytics.colour`)} />
            <button type="button" className="viz-icon-button ml-auto" onClick={() => save(lines.filter((_, i) => i !== index))} aria-label={t(`${F}.analytics.removeLine`)}>
              <Trash2 size={12} />
            </button>
          </div>
          <input className="viz-field h-7 text-xs" value={line.label ?? ''} maxLength={40} placeholder={t(`${F}.analytics.labelPlaceholder`)} onChange={(event) => patch(index, { label: event.target.value || undefined })} />
        </div>
      ))}
      <button type="button" className="viz-chip" onClick={() => save([...lines, { kind: 'average' }])} data-testid="add-analytics">
        <Plus size={12} /> {t(`${F}.analytics.addLine`)}
      </button>
      {!dated && <p className="text-[11px] text-muted-foreground">{t(`${F}.analytics.forecastHint`)}</p>}
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
  const { t } = useTranslation();
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
          {t(`${F}.python.starter`)}
        </button>
      )}
      <p className="text-[11px] text-muted-foreground">
        {t(`${F}.python.sandbox`)}
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
  const { t } = useTranslation();
  const settings = section<{ text?: string; action?: ButtonAction; fill?: string }>(visual, 'button');
  const action = settings.action ?? { kind: 'clear_slicers' };
  const save = (change: Record<string, unknown>) => setSection(update, 'button', { ...settings, ...change }, 'button');
  const page = context.spec.pages.find((p) => p.id === context.pageId);
  return (
    <div className="space-y-1.5" data-testid="format-button">
      <label className="dash-format-row">
        <span>{t(`${F}.button.text`)}</span>
        <input className="viz-field" value={settings.text ?? ''} maxLength={40} placeholder={t(`${F}.automatic`)} onChange={(event) => save({ text: event.target.value || undefined })} data-testid="button-text" />
      </label>
      <label className="dash-format-row">
        <span>{t(`${F}.button.action`)}</span>
        <select className="viz-field" value={action.kind} onChange={(event) => save({ action: { kind: event.target.value } })} data-testid="button-action">
          {BUTTON_ACTIONS.map(([kind]) => (
            <option key={kind} value={kind}>
              {t(`${F}.button.actions.${BUTTON_ACTION_KEYS[kind]}`)}
            </option>
          ))}
        </select>
      </label>
      {action.kind === 'page' && (
        <label className="dash-format-row">
          <span>{t(`${F}.button.page`)}</span>
          <select className="viz-field" value={action.pageId ?? ''} onChange={(event) => save({ action: { kind: 'page', pageId: event.target.value } })} data-testid="button-target">
            <option value="">{t(`${F}.button.choose`)}</option>
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
          <span>{t(`${F}.button.view`)}</span>
          <select className="viz-field" value={action.bookmarkId ?? ''} onChange={(event) => save({ action: { kind: 'bookmark', bookmarkId: event.target.value } })}>
            <option value="">{context.spec.bookmarks?.length ? t(`${F}.button.choose`) : t(`${F}.button.addViewsFirst`)}</option>
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
          <span>{t(`${F}.button.visual`)}</span>
          <select className="viz-field" value={action.visualId ?? ''} onChange={(event) => save({ action: { kind: 'toggle', visualId: event.target.value } })}>
            <option value="">{t(`${F}.button.choose`)}</option>
            {(page?.visuals ?? [])
              .filter((v) => v.id !== visual.id)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title || (v.format?.title as { text?: string } | undefined)?.text || t(`${F}.button.visualFallback`, { type: humanize(v.type), id: v.id })}
                </option>
              ))}
          </select>
        </label>
      )}
      {action.kind === 'url' && (
        <label className="dash-format-row">
          <span>{t(`${F}.button.link`)}</span>
          <input className="viz-field" value={action.url ?? ''} placeholder="https://…" onChange={(event) => save({ action: { kind: 'url', url: event.target.value } })} />
        </label>
      )}
      <label className="dash-format-row">
        <span>{t(`${F}.button.style`)}</span>
        <select className="viz-field" value={settings.fill ?? 'primary'} onChange={(event) => save({ fill: event.target.value })}>
          <option value="primary">{t(`${F}.button.fills.primary`)}</option>
          <option value="outline">{t(`${F}.button.fills.outline`)}</option>
          <option value="ghost">{t(`${F}.button.fills.ghost`)}</option>
        </select>
      </label>
    </div>
  );
}

export function NavigatorSection({ visual, update }: { visual: DashboardVisual; update: Update }) {
  const { t } = useTranslation();
  const kind = section<{ kind?: string }>(visual, 'navigator').kind ?? 'pages';
  return (
    <label className="dash-format-row">
      <span>{t(`${F}.navigator.shows`)}</span>
      <select className="viz-field" value={kind} onChange={(event) => setSection(update, 'navigator', { kind: event.target.value })} data-testid="navigator-kind">
        <option value="pages">{t(`${F}.navigator.pages`)}</option>
        <option value="bookmarks">{t(`${F}.navigator.bookmarks`)}</option>
      </select>
    </label>
  );
}

export function ParameterSection({ visual, update, context }: { visual: DashboardVisual; update: Update; context: ExtrasContext }) {
  const { t } = useTranslation();
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
          <span>{t(`${F}.parameter.parameter`)}</span>
          <select className="viz-field" value={settings.id ?? ''} onChange={(event) => setSection(update, 'parameter', { ...settings, id: event.target.value || undefined })} data-testid="parameter-pick">
            <option value="">{t(`${F}.parameter.new`)}</option>
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
          <span>{t(`${F}.parameter.showAs`)}</span>
          <select className="viz-field" value={settings.style ?? 'tiles'} onChange={(event) => setSection(update, 'parameter', { ...settings, style: event.target.value })}>
            <option value="tiles">{t(`${F}.parameter.tiles`)}</option>
            <option value="dropdown">{t(`${F}.parameter.dropdown`)}</option>
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
          <Trash2 size={12} /> {t(`${F}.parameter.delete`)}
        </button>
      )}
    </div>
  );
}
