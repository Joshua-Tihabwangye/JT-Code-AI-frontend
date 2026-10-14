import { useMemo, useState } from 'react';
import { Calendar, Hash, Search, Sparkles, Type, X } from 'lucide-react';
import type { ColumnProfile, DashboardFieldRef, DashboardVisual, DashboardWell } from '@/lib/data';
import { OptionControl, SlotControl } from '../../controls';
import { useVisualize } from '../../context';
import { humanize } from '../../ui';
import { AGGREGATIONS, fieldKind, GRAINS, SHOW_VALUE_AS, suggestType, VISUAL_BY_TYPE, wellFor, wellItem, type WellSpec } from './catalog';

const KIND_ICON = { numeric: Hash, datetime: Calendar, category: Type, any: Type } as const;

/** Fields → wells, aggregations, “show value as”, and the visual's dataset (Power BI's Build pane). */
export function BuildPane({
  visual,
  update,
  onCreate,
}: {
  visual: DashboardVisual | undefined;
  update: (mutate: (visual: DashboardVisual) => DashboardVisual, merge?: string) => void;
  onCreate: (field: string, datasetId: string) => void;
}) {
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

  return (
    <div className="space-y-3" data-testid="build-pane">
      {visual && (
        <label className="block text-xs">
          <span className="viz-label">Dataset</span>
          <select
            className="viz-field"
            value={datasetId}
            onChange={(event) => update((v) => ({ ...v, data: { ...v.data, datasetId: event.target.value, wells: {} } }))}
            aria-label="Dataset for this visual"
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
              <Sparkles size={12} aria-hidden /> Better as {VISUAL_BY_TYPE[suggestion]?.label.toLowerCase()}
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
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="viz-label m-0">{visual ? 'Fields — click or drag into a well' : 'Fields — click one to start a visual'}</span>
        </div>
        <label className="dash-pane-search">
          <Search size={12} aria-hidden />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search fields" aria-label="Search fields" />
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
          {!profiles.length && <li className="text-xs text-muted-foreground">This dataset has no profile yet.</li>}
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
        {well.max > 1 && <span className="opacity-60"> · up to {well.max}</span>}
      </div>
      {items.map((item, index) => {
        const kind = fieldKind(profiles.find((p) => p.name === item.field));
        return (
          <div key={`${item.field}-${index}`} className="dash-well-item">
            <span className="truncate font-medium" title={item.field}>
              {item.field === '*' ? 'Rows' : humanize(item.field)}
            </span>
            {well.measure && (
              <select value={item.agg ?? 'sum'} onChange={(event) => patch(index, { agg: event.target.value })} aria-label={`Aggregation for ${item.field}`}>
                {AGGREGATIONS.filter(([value]) => kind === 'numeric' || ['count', 'distinct', 'min', 'max', 'first', 'last'].includes(value)).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            {!well.measure && kind === 'datetime' && (
              <select value={item.grain ?? ''} onChange={(event) => patch(index, { grain: (event.target.value || undefined) as DashboardFieldRef['grain'] })} aria-label={`Date level for ${item.field}`}>
                <option value="">Exact date</option>
                {GRAINS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            {well.measure && (
              <select value={item.showValueAs ?? 'none'} onChange={(event) => patch(index, { showValueAs: event.target.value === 'none' ? undefined : event.target.value })} aria-label={`Show ${item.field} as`} title="Show value as">
                {SHOW_VALUE_AS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label={`Remove ${item.field}`}>
              <X size={12} />
            </button>
          </div>
        );
      })}
      {items.length < well.max && (
        <select className="dash-well-add" value="" onChange={(event) => event.target.value && onDropField(event.target.value)} aria-label={`Add a field to ${well.label}`}>
          <option value="">+ Add field</option>
          {well.measure && <option value="*">Count of rows</option>}
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
  const chartFormat = (visual.format?.chart ?? {}) as { chartType?: string; fields?: Record<string, string | string[]>; options?: Record<string, unknown> };
  const chart = catalogCharts.find((entry) => entry.id === chartFormat.chartType);
  const setChart = (patch: Partial<typeof chartFormat>) => update((v) => ({ ...v, format: { ...(v.format ?? {}), chart: { ...chartFormat, ...patch } } }));
  return (
    <div className="space-y-2" data-testid="gallery-chart-fields">
      <label className="block text-xs">
        <span className="viz-label">Gallery chart</span>
        <select className="viz-field" value={chartFormat.chartType ?? ''} onChange={(event) => setChart({ chartType: event.target.value, fields: {}, options: {} })} aria-label="Gallery chart" data-testid="gallery-chart-type">
          <option value="">Choose a chart…</option>
          {catalogCharts.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </label>
      {chart?.slots.map((slot) => (
        <SlotControl
          key={slot.key}
          slot={slot}
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
          value={chartFormat.options?.[option.key]}
          positiveClasses={[]}
          onChange={(value) => setChart({ options: { ...(chartFormat.options ?? {}), [option.key]: value } })}
        />
      ))}
    </div>
  );
}
