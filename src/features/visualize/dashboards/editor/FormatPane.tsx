import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { RotateCcw, Search } from 'lucide-react';
import type { ColumnProfile, DashboardPage, DashboardSpec, DashboardVisual, DashboardVisualType, VisualOutput } from '@/lib/data';
import { humanize } from '../../ui';
import { CANVAS_PRESETS, setFormat, syncGroupOf, syncSlicer } from './actions';
import { RelationshipsSection } from './Relationships';
import { AnalyticsSection, ButtonSection, ConditionalSection, NavigatorSection, ParameterSection, PythonSection } from './FormatExtras';

type Update = (mutate: (visual: DashboardVisual) => DashboardVisual, merge?: string) => void;

const CHARTS: DashboardVisualType[] = ['bar', 'column', 'line', 'area', 'combo', 'donut', 'pie', 'treemap', 'funnel', 'waterfall', 'scatter', 'map', 'chart', 'gauge'];
const SERIES: DashboardVisualType[] = ['bar', 'column', 'line', 'area', 'combo', 'scatter', 'waterfall', 'chart', 'gauge', 'donut', 'pie', 'treemap', 'funnel', 'map'];

interface Section {
  key: string;
  titleKey: string;
  types: DashboardVisualType[] | 'all';
  /** The format sections this pane section edits (reset clears them). */
  formats: string[];
  render: (visual: DashboardVisual, update: Update, context: Context, t: TFunction) => ReactNode;
}

/** The rest of the dashboard, for sections that reach beyond one visual (sync, tooltip pages). */
interface Context {
  spec: DashboardSpec;
  pageId: string;
  onSpec: (mutate: (spec: DashboardSpec) => DashboardSpec) => void;
  /** What Python drew for the selected visual (the Python console, errors). */
  output?: VisualOutput;
  profiles?: ColumnProfile[];
}

function value<T>(visual: DashboardVisual, section: string, key: string, fallback: T): T {
  const found = visual.format?.[section]?.[key];
  return (found ?? fallback) as T;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="dash-format-row">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <Row label={label}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </Row>
  );
}

const set = (update: Update, section: string, key: string, merge = false) => (next: unknown) =>
  update((v) => setFormat(v, section, key, next), merge ? `${section}.${key}` : undefined);

const F = 'visualize.format';

const LEGEND_POSITIONS = ['top', 'bottom', 'left', 'right'] as const;
const KPI_GRAINS = ['day', 'week', 'month', 'quarter', 'year'] as const;
const MAP_SCOPES: [string, string][] = [
  ['world', 'world'],
  ['africa', 'africa'],
  ['europe', 'europe'],
  ['asia', 'asia'],
  ['north america', 'northAmerica'],
  ['south america', 'southAmerica'],
];
/** Canvas preset ids (actions.ts) to their label keys. */
const CANVAS_PRESET_KEYS: Record<string, string> = { '16:9': 'wide', '4:3': 'standard', letter: 'letter', 'fit-width': 'fitWidth' };

const SECTIONS: Section[] = [
  {
    key: 'python',
    titleKey: `${F}.sections.python`,
    types: ['python'],
    formats: ['python'],
    render: (visual, update, context) => <PythonSection visual={visual} update={update} output={context.output} />,
  },
  {
    key: 'parameter',
    titleKey: `${F}.sections.parameter`,
    types: ['parameter'],
    formats: ['parameter'],
    render: (visual, update, context) => <ParameterSection visual={visual} update={update} context={context} />,
  },
  {
    key: 'button',
    titleKey: `${F}.sections.button`,
    types: ['button'],
    formats: ['button'],
    render: (visual, update, context) => <ButtonSection visual={visual} update={update} context={context} />,
  },
  {
    key: 'navigator',
    titleKey: `${F}.sections.navigator`,
    types: ['navigator'],
    formats: ['navigator'],
    render: (visual, update) => <NavigatorSection visual={visual} update={update} />,
  },
  {
    key: 'general',
    titleKey: `${F}.sections.general`,
    types: 'all',
    formats: ['title'],
    render: (visual, update, _context, t) => (
      <>
        <Row label={t(`${F}.general.title`)}>
          <input className="viz-field" value={value(visual, 'title', 'text', '')} placeholder={t(`${F}.automatic`)} onChange={(event) => set(update, 'title', 'text', true)(event.target.value || undefined)} data-testid="format-title" />
        </Row>
        <Toggle label={t(`${F}.general.showTitle`)} checked={value(visual, 'title', 'show', true)} onChange={(show) => set(update, 'title', 'show')(show ? undefined : false)} />
        <div className="grid grid-cols-4 gap-1">
          {(['x', 'y', 'w', 'h'] as const).map((key) => (
            <label key={key} className="text-[10px] uppercase text-muted-foreground">
              {t(`${F}.general.axes.${key}`)}
              <input
                type="number"
                step={0.25}
                min={key === 'w' || key === 'h' ? 0.5 : 0}
                className="viz-field"
                value={visual.layout[key]}
                onChange={(event) => update((v) => ({ ...v, layout: { ...v.layout, [key]: Number(event.target.value) } }), `layout.${key}`)}
                aria-label={t(`${F}.general.layoutAria`, { axis: t(`${F}.general.axes.${key}`) })}
              />
            </label>
          ))}
        </div>
        <Row label={t(`${F}.general.altText`)}>
          <input className="viz-field" value={visual.altText ?? ''} onChange={(event) => update((v) => ({ ...v, altText: event.target.value }), 'alt')} placeholder={t(`${F}.general.altPlaceholder`)} />
        </Row>
      </>
    ),
  },
  {
    key: 'tile',
    titleKey: `${F}.sections.tile`,
    types: 'all',
    formats: ['tile'],
    render: (visual, update, _context, t) => (
      <>
        <Row label={t(`${F}.tile.background`)}>
          <input type="color" className="viz-color-input" value={value(visual, 'tile', 'background', '#ffffff')} onChange={(event) => set(update, 'tile', 'background', true)(event.target.value)} />
        </Row>
        <Row label={t(`${F}.tile.border`)}>
          <input type="color" className="viz-color-input" value={value(visual, 'tile', 'border', '#e5e7eb')} onChange={(event) => set(update, 'tile', 'border', true)(event.target.value)} />
        </Row>
        <Row label={t(`${F}.tile.radius`)}>
          <input type="range" min={0} max={24} value={value(visual, 'tile', 'radius', 12)} onChange={(event) => set(update, 'tile', 'radius', true)(Number(event.target.value))} />
        </Row>
        <Toggle label={t(`${F}.tile.shadow`)} checked={value(visual, 'tile', 'shadow', true)} onChange={(shadow) => set(update, 'tile', 'shadow')(shadow ? undefined : false)} />
      </>
    ),
  },
  {
    key: 'colors',
    titleKey: `${F}.sections.colors`,
    types: SERIES,
    formats: ['colors'],
    render: (visual, update, _context, t) => {
      const colors = value<string[]>(visual, 'colors', 'series', []);
      return (
        <div className="flex flex-wrap items-center gap-1">
          {Array.from({ length: 6 }, (_, index) => (
            <input
              key={index}
              type="color"
              className="viz-color-input"
              value={colors[index] ?? '#94a3b8'}
              aria-label={t(`${F}.colors.seriesAria`, { index: index + 1 })}
              onChange={(event) => {
                const next = [...colors];
                next[index] = event.target.value;
                set(update, 'colors', 'series', true)(next.map((c) => c ?? '#94a3b8'));
              }}
            />
          ))}
          <span className="text-[11px] text-muted-foreground">{colors.length ? t(`${F}.colors.custom`) : t(`${F}.colors.fromTheme`)}</span>
        </div>
      );
    },
  },
  {
    key: 'labels',
    titleKey: `${F}.sections.labels`,
    types: CHARTS,
    formats: ['labels'],
    render: (visual, update, _context, t) => (
      <Row label={t(`${F}.labels.showValues`)}>
        <select className="viz-field" value={String(value(visual, 'labels', 'show', 'auto'))} onChange={(event) => set(update, 'labels', 'show')(event.target.value === 'auto' ? undefined : event.target.value === 'true')}>
          <option value="auto">{t(`${F}.automatic`)}</option>
          <option value="true">{t(`${F}.on`)}</option>
          <option value="false">{t(`${F}.off`)}</option>
        </select>
      </Row>
    ),
  },
  {
    key: 'legend',
    titleKey: `${F}.sections.legend`,
    types: CHARTS,
    formats: ['legend'],
    render: (visual, update, _context, t) => (
      <>
        <Toggle label={t(`${F}.legend.show`)} checked={value(visual, 'legend', 'show', true)} onChange={(show) => set(update, 'legend', 'show')(show ? undefined : false)} />
        <Row label={t(`${F}.legend.position`)}>
          <select className="viz-field" value={value(visual, 'legend', 'position', 'top')} onChange={(event) => set(update, 'legend', 'position')(event.target.value === 'top' ? undefined : event.target.value)}>
            {LEGEND_POSITIONS.map((position) => (
              <option key={position} value={position}>
                {t(`${F}.legend.positions.${position}`)}
              </option>
            ))}
          </select>
        </Row>
      </>
    ),
  },
  {
    key: 'sort',
    titleKey: `${F}.sections.sort`,
    types: ['bar', 'column', 'donut', 'pie', 'treemap', 'funnel', 'table', 'line', 'area', 'combo'],
    formats: ['sort', 'topN'],
    render: (visual, update, _context, t) => (
      <>
        <Row label={t(`${F}.sort.by`)}>
          <select className="viz-field" value={value(visual, 'sort', 'by', 'value')} onChange={(event) => set(update, 'sort', 'by')(event.target.value === 'value' ? undefined : event.target.value)}>
            <option value="value">{t(`${F}.sort.value`)}</option>
            <option value="category">{t(`${F}.sort.name`)}</option>
          </select>
        </Row>
        <Row label={t(`${F}.sort.direction`)}>
          <select className="viz-field" value={value(visual, 'sort', 'dir', 'desc')} onChange={(event) => set(update, 'sort', 'dir')(event.target.value)}>
            <option value="desc">{t(`${F}.sort.desc`)}</option>
            <option value="asc">{t(`${F}.sort.asc`)}</option>
          </select>
        </Row>
        <Toggle label={t(`${F}.sort.topN`)} checked={value(visual, 'topN', 'enabled', true)} onChange={(enabled) => set(update, 'topN', 'enabled')(enabled ? undefined : false)} />
        <Row label={t(`${F}.sort.showTop`)}>
          <input type="number" min={1} max={100} className="viz-field" value={value(visual, 'topN', 'n', 12)} onChange={(event) => set(update, 'topN', 'n', true)(Number(event.target.value))} />
        </Row>
        <Toggle label={t(`${F}.sort.others`)} checked={value(visual, 'topN', 'others', true)} onChange={(others) => set(update, 'topN', 'others')(others ? undefined : false)} />
      </>
    ),
  },
  {
    key: 'bars',
    titleKey: `${F}.sections.bars`,
    types: ['bar', 'column', 'line', 'area', 'combo'],
    formats: ['bar', 'line'],
    render: (visual, update, _context, t) => (
      <>
        <Row label={t(`${F}.bars.stacking`)}>
          <select className="viz-field" value={value(visual, 'bar', 'stack', 'none')} onChange={(event) => set(update, 'bar', 'stack')(event.target.value === 'none' ? undefined : event.target.value)}>
            <option value="none">{t(`${F}.bars.none`)}</option>
            <option value="stacked">{t(`${F}.bars.stacked`)}</option>
            <option value="percent">{t(`${F}.bars.percent`)}</option>
          </select>
        </Row>
        <Toggle label={t(`${F}.bars.smooth`)} checked={value(visual, 'line', 'smooth', false)} onChange={(smooth) => set(update, 'line', 'smooth')(smooth || undefined)} />
      </>
    ),
  },
  {
    key: 'donut',
    titleKey: `${F}.sections.donut`,
    types: ['donut', 'pie'],
    formats: ['donut'],
    render: (visual, update, _context, t) => (
      <Row label={t(`${F}.donut.maxSlices`)}>
        <input type="number" min={2} max={12} className="viz-field" value={value(visual, 'donut', 'maxSlices', 6)} onChange={(event) => set(update, 'donut', 'maxSlices', true)(Number(event.target.value))} />
      </Row>
    ),
  },
  {
    key: 'kpi',
    titleKey: `${F}.sections.kpi`,
    types: ['kpi'],
    formats: ['kpi'],
    render: (visual, update, _context, t) => (
      <>
        <Row label={t(`${F}.kpi.compareBy`)}>
          <select className="viz-field" value={value(visual, 'kpi', 'grain', 'month')} onChange={(event) => set(update, 'kpi', 'grain')(event.target.value)}>
            {KPI_GRAINS.map((grain) => (
              <option key={grain} value={grain}>
                {t(`${F}.kpi.grains.${grain}`)}
              </option>
            ))}
          </select>
        </Row>
        <Toggle label={t(`${F}.kpi.upIsGood`)} checked={value(visual, 'kpi', 'upIsGood', true)} onChange={(good) => set(update, 'kpi', 'upIsGood')(good ? undefined : false)} />
      </>
    ),
  },
  {
    key: 'gauge',
    titleKey: `${F}.sections.gauge`,
    types: ['gauge'],
    formats: ['gauge'],
    render: (visual, update, _context, t) => (
      <div className="grid grid-cols-2 gap-1">
        <Row label={t(`${F}.gauge.min`)}>
          <input type="number" className="viz-field" value={value(visual, 'gauge', 'min', 0)} onChange={(event) => set(update, 'gauge', 'min', true)(Number(event.target.value))} />
        </Row>
        <Row label={t(`${F}.gauge.max`)}>
          <input type="number" className="viz-field" value={value<number | string>(visual, 'gauge', 'max', '')} placeholder={t(`${F}.gauge.auto`)} onChange={(event) => set(update, 'gauge', 'max', true)(event.target.value ? Number(event.target.value) : undefined)} />
        </Row>
      </div>
    ),
  },
  {
    key: 'table',
    titleKey: `${F}.sections.table`,
    types: ['table'],
    formats: ['table'],
    render: (visual, update, _context, t) => <Toggle label={t(`${F}.table.dataBars`)} checked={value(visual, 'table', 'dataBars', true)} onChange={(bars) => set(update, 'table', 'dataBars')(bars ? undefined : false)} />,
  },
  {
    key: 'slicer',
    titleKey: `${F}.sections.slicer`,
    types: ['slicer'],
    formats: ['slicer'],
    render: (visual, update, context, t) => {
      const group = syncGroupOf(visual);
      const pages = context.spec.pages.filter((p) => (p.type ?? 'page') !== 'tooltip');
      return (
        <>
          <Row label={t(`${F}.slicer.style`)}>
            <select className="viz-field" value={value(visual, 'slicer', 'style', '')} onChange={(event) => set(update, 'slicer', 'style')(event.target.value || undefined)} data-testid="format-slicer-style">
              <option value="">{t(`${F}.automatic`)}</option>
              <option value="dropdown">{t(`${F}.slicer.styles.dropdown`)}</option>
              <option value="list">{t(`${F}.slicer.styles.list`)}</option>
              <option value="tiles">{t(`${F}.slicer.styles.tiles`)}</option>
              <option value="between">{t(`${F}.slicer.styles.between`)}</option>
              <option value="date_range">{t(`${F}.slicer.styles.dateRange`)}</option>
              <option value="relative">{t(`${F}.slicer.styles.relative`)}</option>
              <option value="input">{t(`${F}.slicer.styles.input`)}</option>
              <option value="hierarchy">{t(`${F}.slicer.styles.hierarchy`)}</option>
            </select>
          </Row>
          <Toggle label={t(`${F}.slicer.single`)} checked={value(visual, 'slicer', 'single', false)} onChange={(single) => set(update, 'slicer', 'single')(single || undefined)} />
          <p className="viz-label mt-2">{t(`${F}.slicer.sync`)}</p>
          <table className="dash-sync-table" data-testid="sync-slicers">
            <thead>
              <tr>
                <th>{t(`${F}.slicer.page`)}</th>
                <th>{t(`${F}.slicer.syncColumn`)}</th>
                <th>{t(`${F}.slicer.visible`)}</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => {
                const copy = p.id === context.pageId ? visual : p.visuals.find((v) => v.type === 'slicer' && group && syncGroupOf(v) === group);
                const synced = !!copy;
                return (
                  <tr key={p.id}>
                    <td className="truncate">{p.name}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={synced}
                        disabled={p.id === context.pageId}
                        onChange={(event) => context.onSpec((spec) => syncSlicer(spec, context.pageId, visual.id, p.id, event.target.checked, true))}
                        aria-label={t(`${F}.slicer.syncTo`, { page: p.name })}
                        data-testid={`sync-${p.id}`}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={synced && !copy.hidden}
                        disabled={!synced}
                        onChange={(event) => context.onSpec((spec) => syncSlicer(spec, context.pageId, visual.id, p.id, true, event.target.checked))}
                        aria-label={t(`${F}.slicer.visibleOn`, { page: p.name })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      );
    },
  },
  {
    key: 'tooltip',
    titleKey: `${F}.sections.tooltip`,
    types: ['bar', 'column', 'line', 'area', 'combo', 'donut', 'pie', 'treemap', 'funnel', 'waterfall', 'scatter', 'map', 'table', 'matrix'],
    formats: ['tooltip'],
    render: (visual, update, context, t) => {
      const pages = context.spec.pages.filter((p) => p.type === 'tooltip');
      return (
        <Row label={t(`${F}.tooltip.page`)}>
          <select className="viz-field" value={value(visual, 'tooltip', 'page', '')} onChange={(event) => set(update, 'tooltip', 'page')(event.target.value || undefined)} data-testid="format-tooltip-page">
            <option value="">{pages.length ? t(`${F}.tooltip.default`) : t(`${F}.tooltip.noPages`)}</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Row>
      );
    },
  },
  {
    key: 'conditional',
    titleKey: `${F}.sections.conditional`,
    types: ['table', 'matrix', 'bar', 'column', 'card', 'kpi', 'multi_card'],
    formats: ['conditional'],
    render: (visual, update) => <ConditionalSection visual={visual} update={update} />,
  },
  {
    key: 'analytics',
    titleKey: `${F}.sections.analytics`,
    types: ['bar', 'column', 'line', 'area', 'combo', 'scatter'],
    formats: ['analytics'],
    render: (visual, update) => <AnalyticsSection visual={visual} update={update} />,
  },
  {
    key: 'map',
    titleKey: `${F}.sections.map`,
    types: ['map'],
    formats: ['map'],
    render: (visual, update, _context, t) => (
      <Row label={t(`${F}.map.zoomTo`)}>
        <select className="viz-field" value={value(visual, 'map', 'scope', '')} onChange={(event) => set(update, 'map', 'scope')(event.target.value || undefined)}>
          <option value="">{t(`${F}.automatic`)}</option>
          {MAP_SCOPES.map(([scope, key]) => (
            <option key={scope} value={scope}>
              {t(`${F}.map.scopes.${key}`)}
            </option>
          ))}
        </select>
      </Row>
    ),
  },
];

/** Per-visual formatting (theme defaults until changed), or the page's canvas when nothing is selected. */
export function FormatPane({
  visual,
  update,
  page,
  updatePage,
  context,
  fields,
}: {
  visual: DashboardVisual | undefined;
  update: Update;
  page: DashboardPage | undefined;
  updatePage: (patch: Partial<DashboardPage>) => void;
  context: Context;
  /** Fields of the page's datasets (drill-through fields). */
  fields: string[];
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  if (!visual) {
    if (!page) return null;
    const preset = page.canvas?.preset ?? '16:9';
    return (
      <div className="space-y-2" data-testid="format-page">
        <p className="viz-label">{t(`${F}.page.label`)}</p>
        <Row label={t(`${F}.page.name`)}>
          <input className="viz-field" value={page.name} onChange={(event) => updatePage({ name: event.target.value })} />
        </Row>
        <Row label={t(`${F}.page.canvasSize`)}>
          <select
            className="viz-field"
            value={preset}
            onChange={(event) => {
              const size = CANVAS_PRESETS[event.target.value] ?? CANVAS_PRESETS['16:9']!;
              updatePage({ canvas: { ...page.canvas, preset: event.target.value, width: size.width, height: size.height } });
            }}
          >
            {Object.entries(CANVAS_PRESETS).map(([key, size]) => (
              <option key={key} value={key}>
                {CANVAS_PRESET_KEYS[key] ? t(`${F}.page.canvasPresets.${CANVAS_PRESET_KEYS[key]}`) : size.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t(`${F}.page.background`)}>
          <input type="color" className="viz-color-input" value={page.canvas?.background || '#f4f6fa'} onChange={(event) => updatePage({ canvas: { ...page.canvas, background: event.target.value } })} />
        </Row>
        {page.canvas?.background && (
          <button type="button" className="viz-chip" onClick={() => updatePage({ canvas: { ...page.canvas, background: '' } })}>
            <RotateCcw size={12} aria-hidden /> {t(`${F}.page.themeBackground`)}
          </button>
        )}
        <Row label={t(`${F}.page.type`)}>
          <select
            className="viz-field"
            value={page.type ?? 'page'}
            onChange={(event) => {
              const type = event.target.value as NonNullable<DashboardPage['type']>;
              updatePage(type === 'tooltip' ? { type, canvas: { ...page.canvas, preset: 'custom', width: 1280, height: 960 } } : { type });
            }}
            data-testid="format-page-type"
          >
            <option value="page">{t(`${F}.page.types.page`)}</option>
            <option value="drillthrough">{t(`${F}.page.types.drillthrough`)}</option>
            <option value="tooltip">{t(`${F}.page.types.tooltip`)}</option>
          </select>
        </Row>
        {page.type === 'tooltip' && <p className="text-[11px] text-muted-foreground">{t(`${F}.page.tooltipHint`)}</p>}
        {page.type === 'drillthrough' && (
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">{t(`${F}.page.drillthroughHint`)}</p>
            <div className="flex flex-wrap gap-1" data-testid="drillthrough-fields">
              {fields.map((field) => {
                const on = (page.drillthroughFields ?? []).includes(field);
                return (
                  <button
                    key={field}
                    type="button"
                    className="viz-chip"
                    aria-pressed={on}
                    onClick={() => updatePage({ drillthroughFields: on ? (page.drillthroughFields ?? []).filter((f) => f !== field) : [...(page.drillthroughFields ?? []), field].slice(0, 5) })}
                  >
                    {humanize(field)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <p className="viz-label mt-3">{t(`${F}.dashboard.label`)}</p>
        <Row label={t(`${F}.dashboard.slicersApply`)}>
          <select
            className="viz-field"
            value={context.spec.settings?.applyMode ?? 'instant'}
            onChange={(event) => context.onSpec((spec) => ({ ...spec, settings: { ...spec.settings, applyMode: event.target.value as 'instant' | 'button' } }))}
            data-testid="format-apply-mode"
          >
            <option value="instant">{t(`${F}.dashboard.instant`)}</option>
            <option value="button">{t(`${F}.dashboard.button`)}</option>
          </select>
        </Row>
        <Toggle label={t(`${F}.dashboard.filtersPane`)} checked={context.spec.settings?.showFiltersPane !== false} onChange={(show) => context.onSpec((spec) => ({ ...spec, settings: { ...spec.settings, showFiltersPane: show } }))} />
        <Toggle label={t(`${F}.dashboard.personalize`)} checked={context.spec.settings?.allowPersonalize !== false} onChange={(allow) => context.onSpec((spec) => ({ ...spec, settings: { ...spec.settings, allowPersonalize: allow } }))} />
        <RelationshipsSection spec={context.spec} onSpec={context.onSpec} />
      </div>
    );
  }
  const sections = SECTIONS.filter((section) => (section.types === 'all' || section.types.includes(visual.type)) && (!search || t(section.titleKey).toLowerCase().includes(search.toLowerCase())));
  return (
    <div className="space-y-2" data-testid="format-pane">
      <label className="dash-pane-search">
        <Search size={12} aria-hidden />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t(`${F}.search`)} aria-label={t(`${F}.search`)} />
      </label>
      {sections.map((section) => (
        <details key={section.key} className="dash-format-section" open={['general', 'colors', 'labels', 'slicer', 'kpi', 'python', 'parameter', 'button', 'navigator'].includes(section.key) || !!search} data-testid={`section-${section.key}`}>
          <summary>
            {t(section.titleKey)}
            {section.formats.some((key) => visual.format?.[key]) && (
              <button
                type="button"
                className="ml-auto text-[10px] font-normal text-muted-foreground hover:text-foreground"
                onClick={(event) => {
                  event.preventDefault();
                  update((v) => {
                    const format = { ...(v.format ?? {}) };
                    for (const key of section.formats) delete format[key];
                    return { ...v, format };
                  });
                }}
              >
                {t(`${F}.resetSection`)}
              </button>
            )}
          </summary>
          <div className="space-y-1.5 pt-1">{section.render(visual, update, context, t)}</div>
        </details>
      ))}
    </div>
  );
}
