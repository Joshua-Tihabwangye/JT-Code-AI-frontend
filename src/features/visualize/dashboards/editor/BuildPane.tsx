import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { inlineLabel } from '@/i18n/format';
import { ArrowLeftRight, Calendar, FunctionSquare, Hash, Search, Sparkles, Type, X } from 'lucide-react';
import type { ColumnProfile, DashboardCalculation, DashboardFieldRef, DashboardSpec, DashboardVisual, DashboardWell } from '@/lib/data';
import { useCatalogText } from '../../catalogText';
import { OptionControl, SlotControl } from '../../controls';
import { useVisualize } from '../../context';
import { humanize } from '../../ui';
import { CalculationsSection } from './CalcPanel';
import { AGGREGATIONS, fieldKind, GRAINS, SHOW_VALUE_AS, suggestType, VISUAL_BY_TYPE, wellFor, wellItem, type WellSpec } from './catalog';

const KIND_ICON = { numeric: Hash, datetime: Calendar, category: Type, any: Type } as const;

/** Fields → wells, aggregations, “show value as”, and the visual's dataset (Power BI's Build pane). */
export function BuildPane({
  visual,
  update,
  onCreate,
  spec: dashboard,
  onSpec,
}: {
  visual: DashboardVisual | undefined;
  update: (mutate: (visual: DashboardVisual) => DashboardVisual, merge?: string) => void;
  onCreate: (field: string, datasetId: string) => void;
  spec: DashboardSpec;
  onSpec: (mutate: (spec: DashboardSpec) => DashboardSpec) => void;
}) {
  const { t } = useTranslation();
  const { datasets, datasetId: pageDataset, catalog } = useVisualize();
  const [search, setSearch] = useState('');
  const datasetId = visual?.data.datasetId || pageDataset;
  const dataset = datasets.find((item) => item.id === datasetId);
  const profiles = useMemo(() => dataset?.profile.columnProfiles ?? [], [dataset]);
  const kinds = useMemo(() => Object.fromEntries(profiles.map((p) => [p.name, p.kind])), [profiles]);
  const shown = profiles.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || humanize(p.name).toLowerCase().includes(search.toLowerCase()));
  const spec = visual ? VISUAL_BY_TYPE[visual.type] : undefined;

  const setWell = (key: DashboardWell, items: DashboardFieldRef[]) =>
    update((v) => {
      const wells = { ...v.data.wells };
      if (items.length) wells[key] = items;
      else delete wells[key];
      return { ...v, data: { ...v.data, wells } };
    });

  const addField = (field: string, target?: WellSpec) => {
    if (!visual) {
      onCreate(field, datasetId);
      return;
    }
    const kind = fieldKind(profiles.find((p) => p.name === field));
    const well = target ?? wellFor(visual, kind);
    if (!well) return;
    const current = visual.data.wells[well.key] ?? [];
    if (current.length >= well.max) setWell(well.key, [...current.slice(0, well.max - 1), wellItem(field, kind, well)]);
    else setWell(well.key, [...current, wellItem(field, kind, well)]);
  };

  const suggestion = visual && spec?.wells.length ? suggestType(visual, kinds) : null;
  const measureWell = spec?.wells.find((well) => well.measure);
  /** A calculation or field parameter into the selected visual's values (or axis, for dimensions). */
  const bind = (ref: DashboardFieldRef, measure: boolean) => {
    if (!visual || !spec) return;
    const well = measure ? measureWell : spec.wells.find((item) => !item.measure);
    if (!well) return;
    const current = visual.data.wells[well.key] ?? [];
    setWell(well.key, current.length >= well.max ? [...current.slice(0, well.max - 1), ref] : [...current, ref]);
  };
  const useCalc = (calc: DashboardCalculation) => bind({ field: calc.name, calc: calc.id }, true);
  const fieldParameters = (dashboard.parameters ?? []).filter((parameter) => parameter.kind === 'fields');

  return (
    <div className="space-y-3" data-testid="build-pane">
      {visual && (
        <label className="block text-xs">
          <span className="viz-label">{t('visualize.editor.build.dataset')}</span>
          <select
            className="viz-field"
            value={datasetId}
            onChange={(event) => update((v) => ({ ...v, data: { ...v.data, datasetId: event.target.value, wells: {} } }))}
            aria-label={t('visualize.editor.build.datasetForVisual')}
          >
            {datasets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {visual?.type === 'chart' && <GalleryChartFields visual={visual} profiles={profiles} update={update} catalogCharts={catalog?.charts ?? []} />}
      {visual && spec && spec.wells.length > 0 && (
        <div className="space-y-2">
          {suggestion && suggestion !== visual.type && (
            <button type="button" className="viz-chip w-full justify-center" onClick={() => update((v) => ({ ...v, type: suggestion }))} data-testid="suggested-type">
              <Sparkles size={12} aria-hidden /> {t('visualize.editor.build.betterAs', { type: inlineLabel(VISUAL_BY_TYPE[suggestion]?.label ?? suggestion) })}
            </button>
          )}
          {spec.wells.map((well) => (
            <Well
              key={well.key}
              well={well}
              items={visual.data.wells[well.key] ?? []}
              profiles={profiles}
              onChange={(items) => setWell(well.key, items)}
              onDropField={(field) => addField(field, well)}
            />
          ))}
        </div>
      )}
      {visual && spec && spec.wells.length > 0 && fieldParameters.length > 0 && (
        <div className="space-y-1">
          <span className="viz-label m-0">{t('visualize.editor.build.fieldParameters')}</span>
          <div className="flex flex-wrap gap-1">
            {fieldParameters.map((parameter) =>
              parameter.kind === 'fields' && parameter.options[0] ? (
                <button key={parameter.id} type="button" className="viz-chip" onClick={() => bind({ ...parameter.options[0]!, param: parameter.id }, parameter.role === 'measure')} data-testid={`bind-param-${parameter.id}`}>
                  <ArrowLeftRight size={12} aria-hidden /> {parameter.name}
                </button>
              ) : null,
            )}
          </div>
        </div>
      )}
      {datasetId && <CalculationsSection spec={dashboard} datasetId={datasetId} profiles={profiles} onSpec={onSpec} onUse={visual && measureWell ? useCalc : undefined} />}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="viz-label m-0">{visual ? t('visualize.editor.build.fieldsIntoWell') : t('visualize.editor.build.fieldsStart')}</span>
        </div>
        <label className="dash-pane-search">
          <Search size={12} aria-hidden />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('visualize.editor.build.searchFields')} aria-label={t('visualize.editor.build.searchFields')} />
        </label>
        <ul className="dash-fields" data-testid="field-list">
          {shown.map((profile) => {
            const kind = fieldKind(profile);
            const Icon = KIND_ICON[kind];
            return (
              <li key={profile.name}>
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData('text/x-field', profile.name)}
                  onClick={() => addField(profile.name)}
                  title={profile.name}
                  data-testid={`field-${profile.name}`}
                >
                  <Icon size={12} aria-hidden className={`dash-kind ${kind}`} />
                  <span className="truncate">{humanize(profile.name)}</span>
                </button>
              </li>
            );
          })}
          {!profiles.length && <li className="text-xs text-muted-foreground">{t('visualize.editor.build.noProfile')}</li>}
        </ul>
      </div>
    </div>
  );
}

function Well({
  well,
  items,
  profiles,
  onChange,
  onDropField,
}: {
  well: WellSpec;
  items: DashboardFieldRef[];
  profiles: ColumnProfile[];
  onChange: (items: DashboardFieldRef[]) => void;
  onDropField: (field: string) => void;
}) {
  const { t } = useTranslation();
  const [over, setOver] = useState(false);
  const patch = (index: number, change: Partial<DashboardFieldRef>) => onChange(items.map((item, i) => (i === index ? { ...item, ...change } : item)));
  return (
    <div
      className={`dash-well${over ? ' over' : ''}`}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('text/x-field')) {
          event.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        const field = event.dataTransfer.getData('text/x-field');
        if (field) onDropField(field);
      }}
      data-testid={`well-${well.key}`}
    >
      <div className="dash-well-label">
        {well.label}
        {well.max > 1 && <span className="opacity-60"> · {t('visualize.editor.build.upTo', { max: well.max })}</span>}
      </div>
      {items.map((item, index) => {
        const kind = fieldKind(profiles.find((p) => p.name === item.field));
        return (
          <div key={`${item.field}-${index}`} className="dash-well-item">
            <span className="truncate font-medium" title={item.calc ? t('visualize.editor.build.calculation') : item.field}>
              {item.calc && <FunctionSquare size={11} aria-hidden className="mr-1 inline" />}
              {item.param && <ArrowLeftRight size={11} aria-label={t('visualize.editor.build.boundToParameter')} className="mr-1 inline" />}
              {item.field === '*' ? t('visualize.editor.build.rows') : item.calc ? item.field : humanize(item.field)}
            </span>
            {well.measure && !item.calc && !item.param && (
              <select value={item.agg ?? 'sum'} onChange={(event) => patch(index, { agg: event.target.value })} aria-label={t('visualize.editor.build.aggregationFor', { field: item.field })}>
                {AGGREGATIONS.filter(([value]) => kind === 'numeric' || ['count', 'distinct', 'min', 'max', 'first', 'last'].includes(value)).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            {!well.measure && kind === 'datetime' && (
              <select value={item.grain ?? ''} onChange={(event) => patch(index, { grain: (event.target.value || undefined) as DashboardFieldRef['grain'] })} aria-label={t('visualize.editor.build.dateLevelFor', { field: item.field })}>
                <option value="">{t('visualize.editor.build.exactDate')}</option>
                {GRAINS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            {well.measure && item.showValueAs === 'moving_avg' && (
              <input type="number" min={2} max={60} value={item.window ?? 3} onChange={(event) => patch(index, { window: Number(event.target.value) })} aria-label={t('visualize.editor.build.movingAverageWindow')} className="w-12" title={t('visualize.editor.build.periods')} />
            )}
            {well.measure && (
              <select value={item.showValueAs ?? 'none'} onChange={(event) => patch(index, { showValueAs: event.target.value === 'none' ? undefined : event.target.value })} aria-label={t('visualize.editor.build.showFieldAs', { field: item.field })} title={t('visualize.editor.build.showValueAs')}>
                {SHOW_VALUE_AS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label={t('visualize.editor.build.removeField', { field: item.field })}>
              <X size={12} />
            </button>
          </div>
        );
      })}
      {items.length < well.max && (
        <select className="dash-well-add" value="" onChange={(event) => event.target.value && onDropField(event.target.value)} aria-label={t('visualize.editor.build.addFieldTo', { well: well.label })}>
          <option value="">{t('visualize.editor.build.addField')}</option>
          {well.measure && <option value="*">{t('visualize.editor.build.countOfRows')}</option>}
          {profiles.map((p) => (
            <option key={p.name} value={p.name}>
              {humanize(p.name)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function GalleryChartFields({
  visual,
  profiles,
  update,
  catalogCharts,
}: {
  visual: DashboardVisual;
  profiles: ColumnProfile[];
  update: (mutate: (visual: DashboardVisual) => DashboardVisual) => void;
  catalogCharts: NonNullable<ReturnType<typeof useVisualize>['catalog']>['charts'];
}) {
  const { t } = useTranslation();
  const text = useCatalogText();
  const chartFormat = (visual.format?.chart ?? {}) as { chartType?: string; fields?: Record<string, string | string[]>; options?: Record<string, unknown> };
  const chart = catalogCharts.find((entry) => entry.id === chartFormat.chartType);
  const setChart = (patch: Partial<typeof chartFormat>) => update((v) => ({ ...v, format: { ...(v.format ?? {}), chart: { ...chartFormat, ...patch } } }));
  return (
    <div className="space-y-2" data-testid="gallery-chart-fields">
      <label className="block text-xs">
        <span className="viz-label">{t('visualize.editor.build.galleryChart')}</span>
        <select className="viz-field" value={chartFormat.chartType ?? ''} onChange={(event) => setChart({ chartType: event.target.value, fields: {}, options: {} })} aria-label={t('visualize.editor.build.galleryChart')} data-testid="gallery-chart-type">
          <option value="">{t('visualize.editor.build.chooseChart')}</option>
          {catalogCharts.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {text.chartName(entry)}
            </option>
          ))}
        </select>
      </label>
      {chart?.slots.map((slot) => (
        <SlotControl
          key={slot.key}
          slot={slot}
          owner={{ kind: 'chart', id: chart.id }}
          profiles={profiles}
          value={chartFormat.fields?.[slot.key]}
          idPrefix={`build-${visual.id}-`}
          onChange={(value) => {
            const fields = { ...(chartFormat.fields ?? {}) };
            if (value === undefined || (Array.isArray(value) && !value.length)) delete fields[slot.key];
            else fields[slot.key] = value;
            setChart({ fields });
          }}
        />
      ))}
      {chart?.options.map((option) => (
        <OptionControl
          key={option.key}
          option={option}
          owner={{ kind: 'chart', id: chart.id }}
          value={chartFormat.options?.[option.key]}
          positiveClasses={[]}
          onChange={(value) => setChart({ options: { ...(chartFormat.options ?? {}), [option.key]: value } })}
        />
      ))}
    </div>
  );
}
