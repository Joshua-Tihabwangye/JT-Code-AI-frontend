import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, FunctionSquare, Library, Pencil, Plus, SlidersVertical, Sparkles, Trash2, X } from 'lucide-react';
import { useRepository, type ColumnProfile, type DashboardCalculation, type DashboardFieldRef, type DashboardParameter, type DashboardSpec } from '@/lib/data';
import { humanize } from '../../ui';
import { QUICK_MEASURES, renderContext } from '../customize';
import { newId } from './catalog';

const FUNCTIONS = ['SUM', 'AVG', 'COUNT', 'DISTINCTCOUNT', 'MIN', 'MAX', 'MEDIAN', 'COUNTROWS()', 'DIVIDE', 'IF', 'ROUND', 'ABS'];

/** Calculated measures (safe expressions evaluated by Python) and quick-measure templates. */
export function CalculationsSection({
  spec,
  datasetId,
  profiles,
  onSpec,
  onUse,
}: {
  spec: DashboardSpec;
  datasetId: string;
  profiles: ColumnProfile[];
  onSpec: (mutate: (spec: DashboardSpec) => DashboardSpec) => void;
  /** Put a calculation into the selected visual's values. */
  onUse?: (calc: DashboardCalculation) => void;
}) {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<DashboardCalculation | null>(null);
  const [quick, setQuick] = useState(false);
  const [library, setLibrary] = useState(false);
  const measures = useQuery({ queryKey: ['visualize', 'measures', datasetId], queryFn: () => visualize.listMeasures(datasetId), enabled: library });
  const toLibrary = useMutation({
    mutationFn: (calc: DashboardCalculation) => visualize.saveMeasure({ name: calc.name, expression: calc.expression, format: calc.format ?? 'number', datasetId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['visualize', 'measures'] }),
  });
  const taken = (name: string) => (spec.calculations ?? []).some((calc) => calc.name.toLowerCase() === name.toLowerCase());
  const calcs = (spec.calculations ?? []).filter((calc) => !calc.datasetId || calc.datasetId === datasetId);
  const save = (calc: DashboardCalculation) => {
    onSpec((current) => {
      const list = current.calculations ?? [];
      const exists = list.some((item) => item.id === calc.id);
      return { ...current, calculations: exists ? list.map((item) => (item.id === calc.id ? calc : item)) : [...list, calc] };
    });
    setEditing(null);
  };
  return (
    <div className="space-y-1" data-testid="calculations">
      <div className="flex items-center justify-between">
        <span className="viz-label m-0">{t('visualize.editor.calc.calculations')}</span>
        <span className="flex gap-1">
          <button type="button" className="viz-chip" aria-pressed={library} onClick={() => setLibrary(!library)} data-testid="measures-library" title={t('visualize.editor.calc.libraryHint')}>
            <Library size={12} aria-hidden /> {t('visualize.editor.calc.library')}
          </button>
          <button type="button" className="viz-chip" onClick={() => (setQuick(true), setEditing(null))} data-testid="quick-measure">
            <Sparkles size={12} aria-hidden /> {t('visualize.editor.calc.quickMeasure')}
          </button>
          <button type="button" className="viz-chip" onClick={() => (setEditing({ id: newId('calc'), name: '', expression: '', format: 'number', datasetId }), setQuick(false))} data-testid="new-calculation">
            <Plus size={12} aria-hidden /> {t('visualize.editor.calc.new')}
          </button>
        </span>
      </div>
      {quick && (
        <QuickMeasure
          profiles={profiles}
          onCancel={() => setQuick(false)}
          onPick={(draft) => {
            setQuick(false);
            setEditing({ id: newId('calc'), datasetId, ...draft });
          }}
        />
      )}
      {library && (
        <div className="dash-calc-editor" data-testid="library-panel">
          {measures.isLoading && <p className="text-[11px] text-muted-foreground">{t('visualize.editor.calc.loading')}</p>}
          {measures.data?.length === 0 && <p className="text-[11px] text-muted-foreground">{t('visualize.editor.calc.noMeasures')}</p>}
          {measures.data?.map((measure) => (
            <div key={measure.id} className="flex items-center gap-1 text-xs">
              <FunctionSquare size={12} aria-hidden className="dash-kind calc" />
              <span className="flex-1 truncate" title={measure.expression}>
                {measure.name}
              </span>
              <button
                type="button"
                className="viz-chip"
                disabled={taken(measure.name)}
                onClick={() => onSpec((current) => ({ ...current, calculations: [...(current.calculations ?? []), { id: newId('calc'), name: measure.name, expression: measure.expression, format: measure.format, datasetId }] }))}
                data-testid={`library-add-${measure.name}`}
              >
                {taken(measure.name) ? t('visualize.editor.calc.added') : t('visualize.editor.calc.add')}
              </button>
            </div>
          ))}
        </div>
      )}
      {editing && <CalcEditor calc={editing} spec={spec} datasetId={datasetId} profiles={profiles} onCancel={() => setEditing(null)} onSave={save} />}
      <ul className="dash-fields">
        {calcs.map((calc) => (
          <li key={calc.id} className="dash-calc-item">
            <button type="button" disabled={!onUse} onClick={() => onUse?.(calc)} title={onUse ? t('visualize.editor.calc.clickToAdd', { expression: calc.expression }) : calc.expression} data-testid={`calc-${calc.name}`}>
              <FunctionSquare size={12} aria-hidden className="dash-kind calc" />
              <span className="truncate">{calc.name}</span>
            </button>
            <button type="button" className="viz-icon-button" disabled={toLibrary.isPending} onClick={() => toLibrary.mutate(calc)} aria-label={t('visualize.editor.calc.saveToLibraryNamed', { name: calc.name })} title={t('visualize.editor.calc.saveToLibrary')} data-testid={`library-save-${calc.name}`}>
              <BookmarkPlus size={11} />
            </button>
            <button type="button" className="viz-icon-button" onClick={() => setEditing(calc)} aria-label={t('visualize.editor.calc.editNamed', { name: calc.name })}>
              <Pencil size={11} />
            </button>
            <button type="button" className="viz-icon-button" onClick={() => onSpec((current) => ({ ...current, calculations: (current.calculations ?? []).filter((item) => item.id !== calc.id) }))} aria-label={t('visualize.editor.calc.deleteNamed', { name: calc.name })}>
              <Trash2 size={11} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CalcEditor({
  calc,
  spec,
  datasetId,
  profiles,
  onCancel,
  onSave,
}: {
  calc: DashboardCalculation;
  spec: DashboardSpec;
  datasetId: string;
  profiles: ColumnProfile[];
  onCancel: () => void;
  onSave: (calc: DashboardCalculation) => void;
}) {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const [draft, setDraft] = useState(calc);
  const [preview, setPreview] = useState<{ ok: boolean; text: string } | null>(null);
  const insert = (text: string) => setDraft((current) => ({ ...current, expression: `${current.expression}${current.expression && !/[\s(,]$/.test(current.expression) ? ' ' : ''}${text}` }));
  const nameTaken = (spec.calculations ?? []).some((item) => item.id !== draft.id && item.name.toLowerCase() === draft.name.trim().toLowerCase());
  const check = async () => {
    // Python checks and evaluates it over the whole dataset (with the current parameter defaults).
    const others = (spec.calculations ?? []).filter((item) => item.id !== draft.id);
    const context = renderContext({ ...spec, calculations: [...others, draft] }, {});
    try {
      const result = await visualize.renderVisuals({
        visuals: [{ id: 'preview', type: 'card', layout: { x: 0, y: 0, w: 4, h: 4 }, data: { datasetId, wells: { values: [{ field: draft.name || t('visualize.editor.calc.preview'), expr: draft.expression, format: draft.format }] } } }],
        mode: 'light',
        ...context,
      });
      const output = result.visuals[0];
      setPreview(output?.status === 'ok' ? { ok: true, text: t('visualize.editor.calc.overAllRows', { value: output.kpi?.display ?? output.cards?.[0]?.display ?? '—' }) } : { ok: false, text: output?.message ?? t('visualize.editor.calc.notValid') });
    } catch (error) {
      setPreview({ ok: false, text: error instanceof Error ? error.message : t('visualize.editor.calc.notValid') });
    }
  };
  return (
    <div className="dash-calc-editor" data-testid="calc-editor">
      <input className="viz-field" value={draft.name} maxLength={60} placeholder={t('visualize.editor.calc.namePlaceholder')} onChange={(event) => setDraft({ ...draft, name: event.target.value })} data-testid="calc-name" />
      <textarea
        className="viz-field font-mono text-xs"
        rows={3}
        value={draft.expression}
        maxLength={1000}
        placeholder="DIVIDE(SUM([profit]), SUM([revenue]))"
        onChange={(event) => {
          setDraft({ ...draft, expression: event.target.value });
          setPreview(null);
        }}
        spellCheck={false}
        data-testid="calc-expression"
      />
      <div className="flex flex-wrap gap-1">
        {FUNCTIONS.map((fn) => (
          <button key={fn} type="button" className="dash-token" onClick={() => insert(fn.endsWith(')') ? fn : `${fn}(`)}>
            {fn}
          </button>
        ))}
      </div>
      <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
        {profiles.map((profile) => (
          <button key={profile.name} type="button" className="dash-token field" onClick={() => insert(profile.kind === 'numeric' ? `SUM([${profile.name}])` : `[${profile.name}]`)} title={profile.kind === 'numeric' ? t('visualize.editor.calc.inserts', { code: `SUM([${profile.name}])` }) : profile.name}>
            {humanize(profile.name)}
          </button>
        ))}
        {(spec.parameters ?? [])
          .filter((p) => p.kind === 'whatif')
          .map((parameter) => (
            <button key={parameter.id} type="button" className="dash-token param" onClick={() => insert(`[${parameter.name}]`)}>
              {parameter.name}
            </button>
          ))}
      </div>
      <div className="flex items-center gap-1">
        <select className="viz-field h-7 w-28 text-xs" value={draft.format ?? 'number'} onChange={(event) => setDraft({ ...draft, format: event.target.value as DashboardCalculation['format'] })} aria-label={t('visualize.editor.calc.format')}>
          <option value="number">{t('visualize.editor.calc.formats.number')}</option>
          <option value="percent">{t('visualize.editor.calc.formats.percent')}</option>
          <option value="currency">{t('visualize.editor.calc.formats.currency')}</option>
        </select>
        <button type="button" className="viz-chip" disabled={!draft.expression.trim()} onClick={() => void check()} data-testid="calc-check">
          {t('visualize.editor.calc.check')}
        </button>
        <span className="flex-1" />
        <button type="button" className="viz-chip" onClick={onCancel}>
          {t('visualize.editor.calc.cancel')}
        </button>
        <button type="button" className="viz-chip primary" disabled={!draft.name.trim() || !draft.expression.trim() || nameTaken} onClick={() => onSave({ ...draft, name: draft.name.trim() })} data-testid="calc-save">
          {t('visualize.editor.calc.save')}
        </button>
      </div>
      {nameTaken && <p className="text-[11px] text-destructive">{t('visualize.editor.calc.nameTaken')}</p>}
      {preview && (
        <p className={`text-[11px] ${preview.ok ? 'text-muted-foreground' : 'text-destructive'}`} data-testid="calc-preview">
          {preview.text}
        </p>
      )}
    </div>
  );
}

function QuickMeasure({ profiles, onPick, onCancel }: { profiles: ColumnProfile[]; onPick: (draft: Omit<DashboardCalculation, 'id' | 'datasetId'>) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [template, setTemplate] = useState(QUICK_MEASURES[0]!);
  const [fields, setFields] = useState<Record<string, string>>({});
  const numeric = profiles.filter((profile) => profile.kind === 'numeric');
  const ready = template.fields.every((slot) => fields[slot.key]);
  return (
    <div className="dash-calc-editor" data-testid="quick-measure-panel">
      <select className="viz-field" value={template.id} onChange={(event) => (setTemplate(QUICK_MEASURES.find((item) => item.id === event.target.value)!), setFields({}))} data-testid="quick-template">
        {QUICK_MEASURES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      {template.fields.map((slot) => (
        <label key={slot.key} className="dash-format-row">
          <span>{slot.label}</span>
          <select className="viz-field" value={fields[slot.key] ?? ''} onChange={(event) => setFields({ ...fields, [slot.key]: event.target.value })} data-testid={`quick-field-${slot.key}`}>
            <option value="">{t('visualize.editor.calc.choose')}</option>
            {(template.id === 'per-distinct' && slot.key === 'b' ? profiles : numeric).map((profile) => (
              <option key={profile.name} value={profile.name}>
                {humanize(profile.name)}
              </option>
            ))}
          </select>
        </label>
      ))}
      <div className="flex justify-end gap-1">
        <button type="button" className="viz-chip" onClick={onCancel}>
          {t('visualize.editor.calc.cancel')}
        </button>
        <button type="button" className="viz-chip primary" disabled={!ready} onClick={() => onPick({ ...template.build(fields), format: template.format })} data-testid="quick-create">
          {t('visualize.editor.calc.next')}
        </button>
      </div>
    </div>
  );
}

/** What-if parameters (a number on a slider) and field parameters (a metric/dimension switcher). */
export function ParameterEditor({
  parameter,
  profiles,
  onSave,
  onCancel,
}: {
  parameter: DashboardParameter;
  profiles: ColumnProfile[];
  onSave: (parameter: DashboardParameter) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DashboardParameter>(parameter);
  const setKind = (kind: DashboardParameter['kind']) =>
    setDraft(kind === 'whatif' ? { id: draft.id, name: draft.name, kind, min: -0.5, max: 0.5, step: 0.05, default: 0, format: 'percent' } : { id: draft.id, name: draft.name, kind, role: 'measure', options: [], default: 0 });
  const toggleOption = (field: string) => {
    if (draft.kind !== 'fields') return;
    const has = draft.options.some((option) => option.field === field);
    const options: DashboardFieldRef[] = has
      ? draft.options.filter((option) => option.field !== field)
      : [...draft.options, draft.role === 'measure' ? { field, agg: profiles.find((p) => p.name === field)?.kind === 'numeric' ? 'sum' : 'count' } : { field }].slice(0, 12);
    setDraft({ ...draft, options, default: Math.min(draft.default, Math.max(options.length - 1, 0)) });
  };
  const valid = draft.name.trim() && (draft.kind === 'fields' ? draft.options.length > 0 : draft.max > draft.min && draft.step > 0);
  return (
    <div className="dash-calc-editor" data-testid="parameter-editor">
      <div className="viz-segment">
        <button type="button" aria-pressed={draft.kind === 'whatif'} onClick={() => setKind('whatif')} data-testid="parameter-kind-whatif">
          {t('visualize.editor.parameter.whatIf')}
        </button>
        <button type="button" aria-pressed={draft.kind === 'fields'} onClick={() => setKind('fields')} data-testid="parameter-kind-fields">
          {t('visualize.editor.parameter.fieldSwitcher')}
        </button>
      </div>
      <input className="viz-field" value={draft.name} maxLength={60} placeholder={draft.kind === 'whatif' ? t('visualize.editor.parameter.whatIfPlaceholder') : t('visualize.editor.parameter.fieldsPlaceholder')} onChange={(event) => setDraft({ ...draft, name: event.target.value })} data-testid="parameter-name" />
      {draft.kind === 'whatif' ? (
        <div className="grid grid-cols-2 gap-1">
          {(['min', 'max', 'step', 'default'] as const).map((key) => (
            <label key={key} className="text-[10px] uppercase text-muted-foreground">
              {t(`visualize.editor.parameter.${key}`)}
              <input type="number" className="viz-field" value={draft[key]} step="any" onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })} data-testid={`parameter-${key}`} />
            </label>
          ))}
          <select className="viz-field col-span-2 h-7 text-xs" value={draft.format ?? 'number'} onChange={(event) => setDraft({ ...draft, format: event.target.value as 'number' })} aria-label={t('visualize.editor.calc.format')}>
            <option value="number">{t('visualize.editor.calc.formats.number')}</option>
            <option value="percent">{t('visualize.editor.parameter.percent')}</option>
            <option value="currency">{t('visualize.editor.calc.formats.currency')}</option>
          </select>
          <p className="col-span-2 text-[11px] text-muted-foreground">
            <Trans i18nKey="visualize.editor.parameter.useInCalc" values={{ name: draft.name || t('visualize.editor.parameter.name') }} components={{ code: <code /> }} />
          </p>
        </div>
      ) : (
        <>
          <div className="viz-segment">
            <button type="button" aria-pressed={draft.role === 'measure'} onClick={() => setDraft({ ...draft, role: 'measure', options: [] })}>
              {t('visualize.editor.parameter.switchMeasure')}
            </button>
            <button type="button" aria-pressed={draft.role === 'dimension'} onClick={() => setDraft({ ...draft, role: 'dimension', options: [] })}>
              {t('visualize.editor.parameter.switchDimension')}
            </button>
          </div>
          <div className="flex max-h-32 flex-wrap gap-1 overflow-auto">
            {profiles
              .filter((profile) => (draft.role === 'measure' ? profile.kind === 'numeric' : profile.kind !== 'numeric'))
              .map((profile) => (
                <button key={profile.name} type="button" className="viz-chip" aria-pressed={draft.options.some((option) => option.field === profile.name)} onClick={() => toggleOption(profile.name)} data-testid={`parameter-option-${profile.name}`}>
                  {humanize(profile.name)}
                </button>
              ))}
          </div>
        </>
      )}
      <div className="flex justify-end gap-1">
        {onCancel && (
          <button type="button" className="viz-chip" onClick={onCancel}>
            <X size={12} /> {t('visualize.editor.calc.cancel')}
          </button>
        )}
        <button type="button" className="viz-chip primary" disabled={!valid} onClick={() => onSave({ ...draft, name: draft.name.trim() })} data-testid="parameter-save">
          <SlidersVertical size={12} /> {t('visualize.editor.parameter.save')}
        </button>
      </div>
    </div>
  );
}
