import { useState, type ReactNode } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import type { ColumnProfile, DashboardPage, DashboardSpec, DashboardVisual, DashboardVisualType, VisualOutput } from '@/lib/data';
import { humanize } from '../../ui';
import { CANVAS_PRESETS, setFormat, syncGroupOf, syncSlicer } from './actions';
import { AnalyticsSection, ButtonSection, ConditionalSection, NavigatorSection, ParameterSection, PythonSection } from './FormatExtras';

type Update = (mutate: (visual: DashboardVisual) => DashboardVisual, merge?: string) => void;

const CHARTS: DashboardVisualType[] = ['bar', 'column', 'line', 'area', 'combo', 'donut', 'pie', 'treemap', 'funnel', 'waterfall', 'scatter', 'map', 'chart', 'gauge'];
const SERIES: DashboardVisualType[] = ['bar', 'column', 'line', 'area', 'combo', 'scatter', 'waterfall', 'chart', 'gauge', 'donut', 'pie', 'treemap', 'funnel', 'map'];

interface Section {
  key: string;
  title: string;
  types: DashboardVisualType[] | 'all';
  /** The format sections this pane section edits (reset clears them). */
  formats: string[];
  render: (visual: DashboardVisual, update: Update, context: Context) => ReactNode;
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

const SECTIONS: Section[] = [
  {
    key: 'python',
    title: 'Python script',
    types: ['python'],
    formats: ['python'],
    render: (visual, update, context) => <PythonSection visual={visual} update={update} output={context.output} />,
  },
  {
    key: 'parameter',
    title: 'Parameter',
    types: ['parameter'],
    formats: ['parameter'],
    render: (visual, update, context) => <ParameterSection visual={visual} update={update} context={context} />,
  },
  {
    key: 'button',
    title: 'Button',
    types: ['button'],
    formats: ['button'],
    render: (visual, update, context) => <ButtonSection visual={visual} update={update} context={context} />,
  },
  {
    key: 'navigator',
    title: 'Navigator',
    types: ['navigator'],
    formats: ['navigator'],
    render: (visual, update) => <NavigatorSection visual={visual} update={update} />,
  },
  {
    key: 'general',
    title: 'Title and position',
    types: 'all',
    formats: ['title'],
    render: (visual, update) => (
      <>
        <Row label="Title">
          <input className="viz-field" value={value(visual, 'title', 'text', '')} placeholder="Automatic" onChange={(event) => set(update, 'title', 'text', true)(event.target.value || undefined)} data-testid="format-title" />
        </Row>
        <Toggle label="Show title" checked={value(visual, 'title', 'show', true)} onChange={(show) => set(update, 'title', 'show')(show ? undefined : false)} />
        <div className="grid grid-cols-4 gap-1">
          {(['x', 'y', 'w', 'h'] as const).map((key) => (
            <label key={key} className="text-[10px] uppercase text-muted-foreground">
              {key}
              <input
                type="number"
                step={0.25}
                min={key === 'w' || key === 'h' ? 0.5 : 0}
                className="viz-field"
                value={visual.layout[key]}
                onChange={(event) => update((v) => ({ ...v, layout: { ...v.layout, [key]: Number(event.target.value) } }), `layout.${key}`)}
                aria-label={`Layout ${key}`}
              />
            </label>
          ))}
        </div>
        <Row label="Alt text">
          <input className="viz-field" value={visual.altText ?? ''} onChange={(event) => update((v) => ({ ...v, altText: event.target.value }), 'alt')} placeholder="For screen readers" />
        </Row>
      </>
    ),
  },
  {
    key: 'tile',
    title: 'Tile',
    types: 'all',
    formats: ['tile'],
    render: (visual, update) => (
      <>
        <Row label="Background">
          <input type="color" className="viz-color-input" value={value(visual, 'tile', 'background', '#ffffff')} onChange={(event) => set(update, 'tile', 'background', true)(event.target.value)} />
        </Row>
        <Row label="Border">
          <input type="color" className="viz-color-input" value={value(visual, 'tile', 'border', '#e5e7eb')} onChange={(event) => set(update, 'tile', 'border', true)(event.target.value)} />
        </Row>
        <Row label="Corner radius">
          <input type="range" min={0} max={24} value={value(visual, 'tile', 'radius', 12)} onChange={(event) => set(update, 'tile', 'radius', true)(Number(event.target.value))} />
        </Row>
        <Toggle label="Shadow" checked={value(visual, 'tile', 'shadow', true)} onChange={(shadow) => set(update, 'tile', 'shadow')(shadow ? undefined : false)} />
      </>
    ),
  },
  {
    key: 'colors',
    title: 'Colours',
    types: SERIES,
    formats: ['colors'],
    render: (visual, update) => {
      const colors = value<string[]>(visual, 'colors', 'series', []);
      return (
        <div className="flex flex-wrap items-center gap-1">
          {Array.from({ length: 6 }, (_, index) => (
            <input
              key={index}
              type="color"
              className="viz-color-input"
              value={colors[index] ?? '#94a3b8'}
              aria-label={`Series colour ${index + 1}`}
              onChange={(event) => {
                const next = [...colors];
                next[index] = event.target.value;
                set(update, 'colors', 'series', true)(next.map((c) => c ?? '#94a3b8'));
              }}
            />
          ))}
          <span className="text-[11px] text-muted-foreground">{colors.length ? 'Custom' : 'From the theme'}</span>
        </div>
      );
    },
  },
  {
    key: 'labels',
    title: 'Data labels',
    types: CHARTS,
    formats: ['labels'],
    render: (visual, update) => (
      <Row label="Show values">
        <select className="viz-field" value={String(value(visual, 'labels', 'show', 'auto'))} onChange={(event) => set(update, 'labels', 'show')(event.target.value === 'auto' ? undefined : event.target.value === 'true')}>
          <option value="auto">Automatic</option>
          <option value="true">On</option>
          <option value="false">Off</option>
        </select>
      </Row>
    ),
  },
  {
    key: 'legend',
    title: 'Legend',
    types: CHARTS,
    formats: ['legend'],
    render: (visual, update) => (
      <>
        <Toggle label="Show legend" checked={value(visual, 'legend', 'show', true)} onChange={(show) => set(update, 'legend', 'show')(show ? undefined : false)} />
        <Row label="Position">
          <select className="viz-field" value={value(visual, 'legend', 'position', 'top')} onChange={(event) => set(update, 'legend', 'position')(event.target.value === 'top' ? undefined : event.target.value)}>
            {['top', 'bottom', 'left', 'right'].map((position) => (
              <option key={position} value={position}>
                {position[0]!.toUpperCase() + position.slice(1)}
              </option>
            ))}
          </select>
        </Row>
      </>
    ),
  },
  {
    key: 'sort',
    title: 'Sort and Top N',
    types: ['bar', 'column', 'donut', 'pie', 'treemap', 'funnel', 'table', 'line', 'area', 'combo'],
    formats: ['sort', 'topN'],
    render: (visual, update) => (
      <>
        <Row label="Sort by">
          <select className="viz-field" value={value(visual, 'sort', 'by', 'value')} onChange={(event) => set(update, 'sort', 'by')(event.target.value === 'value' ? undefined : event.target.value)}>
            <option value="value">Value</option>
            <option value="category">Name</option>
          </select>
        </Row>
        <Row label="Direction">
          <select className="viz-field" value={value(visual, 'sort', 'dir', 'desc')} onChange={(event) => set(update, 'sort', 'dir')(event.target.value)}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </Row>
        <Toggle label="Top N" checked={value(visual, 'topN', 'enabled', true)} onChange={(enabled) => set(update, 'topN', 'enabled')(enabled ? undefined : false)} />
        <Row label="Show top">
          <input type="number" min={1} max={100} className="viz-field" value={value(visual, 'topN', 'n', 12)} onChange={(event) => set(update, 'topN', 'n', true)(Number(event.target.value))} />
        </Row>
        <Toggle label="Group the rest as “Others”" checked={value(visual, 'topN', 'others', true)} onChange={(others) => set(update, 'topN', 'others')(others ? undefined : false)} />
      </>
    ),
  },
  {
    key: 'bars',
    title: 'Bars and lines',
    types: ['bar', 'column', 'line', 'area', 'combo'],
    formats: ['bar', 'line'],
    render: (visual, update) => (
      <>
        <Row label="Stacking">
          <select className="viz-field" value={value(visual, 'bar', 'stack', 'none')} onChange={(event) => set(update, 'bar', 'stack')(event.target.value === 'none' ? undefined : event.target.value)}>
            <option value="none">Side by side</option>
            <option value="stacked">Stacked</option>
            <option value="percent">100% stacked</option>
          </select>
        </Row>
        <Toggle label="Smooth lines" checked={value(visual, 'line', 'smooth', false)} onChange={(smooth) => set(update, 'line', 'smooth')(smooth || undefined)} />
      </>
    ),
  },
  {
    key: 'donut',
    title: 'Slices',
    types: ['donut', 'pie'],
    formats: ['donut'],
    render: (visual, update) => (
      <Row label="Max slices (rest → Others)">
        <input type="number" min={2} max={12} className="viz-field" value={value(visual, 'donut', 'maxSlices', 6)} onChange={(event) => set(update, 'donut', 'maxSlices', true)(Number(event.target.value))} />
      </Row>
    ),
  },
  {
    key: 'kpi',
    title: 'KPI',
    types: ['kpi'],
    formats: ['kpi'],
    render: (visual, update) => (
      <>
        <Row label="Compare by">
          <select className="viz-field" value={value(visual, 'kpi', 'grain', 'month')} onChange={(event) => set(update, 'kpi', 'grain')(event.target.value)}>
            {['day', 'week', 'month', 'quarter', 'year'].map((grain) => (
              <option key={grain} value={grain}>
                {grain[0]!.toUpperCase() + grain.slice(1)}
              </option>
            ))}
          </select>
        </Row>
        <Toggle label="Up is good" checked={value(visual, 'kpi', 'upIsGood', true)} onChange={(good) => set(update, 'kpi', 'upIsGood')(good ? undefined : false)} />
      </>
    ),
  },
  {
    key: 'gauge',
    title: 'Gauge range',
    types: ['gauge'],
    formats: ['gauge'],
    render: (visual, update) => (
      <div className="grid grid-cols-2 gap-1">
        <Row label="Min">
          <input type="number" className="viz-field" value={value(visual, 'gauge', 'min', 0)} onChange={(event) => set(update, 'gauge', 'min', true)(Number(event.target.value))} />
        </Row>
        <Row label="Max">
          <input type="number" className="viz-field" value={value<number | string>(visual, 'gauge', 'max', '')} placeholder="Auto" onChange={(event) => set(update, 'gauge', 'max', true)(event.target.value ? Number(event.target.value) : undefined)} />
        </Row>
      </div>
    ),
  },
  {
    key: 'table',
    title: 'Table',
    types: ['table'],
    formats: ['table'],
    render: (visual, update) => <Toggle label="Data bars" checked={value(visual, 'table', 'dataBars', true)} onChange={(bars) => set(update, 'table', 'dataBars')(bars ? undefined : false)} />,
  },
  {
    key: 'slicer',
    title: 'Slicer',
    types: ['slicer'],
    formats: ['slicer'],
    render: (visual, update, context) => {
      const group = syncGroupOf(visual);
      const pages = context.spec.pages.filter((p) => (p.type ?? 'page') !== 'tooltip');
      return (
        <>
          <Row label="Style">
            <select className="viz-field" value={value(visual, 'slicer', 'style', '')} onChange={(event) => set(update, 'slicer', 'style')(event.target.value || undefined)} data-testid="format-slicer-style">
              <option value="">Automatic</option>
              <option value="dropdown">Dropdown</option>
              <option value="list">List</option>
              <option value="tiles">Buttons</option>
              <option value="between">Number range</option>
              <option value="date_range">Date range</option>
              <option value="relative">Relative date</option>
              <option value="input">Type a value</option>
              <option value="hierarchy">Hierarchy (add more fields)</option>
            </select>
          </Row>
          <Toggle label="Single choice" checked={value(visual, 'slicer', 'single', false)} onChange={(single) => set(update, 'slicer', 'single')(single || undefined)} />
          <p className="viz-label mt-2">Sync across pages</p>
          <table className="dash-sync-table" data-testid="sync-slicers">
            <thead>
              <tr>
                <th>Page</th>
                <th>Sync</th>
                <th>Visible</th>
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
                        aria-label={`Sync to ${p.name}`}
                        data-testid={`sync-${p.id}`}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={synced && !copy.hidden}
                        disabled={!synced}
                        onChange={(event) => context.onSpec((spec) => syncSlicer(spec, context.pageId, visual.id, p.id, true, event.target.checked))}
                        aria-label={`Visible on ${p.name}`}
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
    title: 'Tooltip',
    types: ['bar', 'column', 'line', 'area', 'combo', 'donut', 'pie', 'treemap', 'funnel', 'waterfall', 'scatter', 'map', 'table', 'matrix'],
    formats: ['tooltip'],
    render: (visual, update, context) => {
      const pages = context.spec.pages.filter((p) => p.type === 'tooltip');
      return (
        <Row label="Tooltip page">
          <select className="viz-field" value={value(visual, 'tooltip', 'page', '')} onChange={(event) => set(update, 'tooltip', 'page')(event.target.value || undefined)} data-testid="format-tooltip-page">
            <option value="">{pages.length ? 'Default tooltip' : 'Make a page a tooltip page first'}</option>
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
    title: 'Conditional formatting',
    types: ['table', 'matrix', 'bar', 'column', 'card', 'kpi', 'multi_card'],
    formats: ['conditional'],
    render: (visual, update) => <ConditionalSection visual={visual} update={update} />,
  },
  {
    key: 'analytics',
    title: 'Analytics (reference lines, trend, forecast)',
    types: ['bar', 'column', 'line', 'area', 'combo', 'scatter'],
    formats: ['analytics'],
    render: (visual, update) => <AnalyticsSection visual={visual} update={update} />,
  },
  {
    key: 'map',
    title: 'Map',
    types: ['map'],
    formats: ['map'],
    render: (visual, update) => (
      <Row label="Zoom to">
        <select className="viz-field" value={value(visual, 'map', 'scope', '')} onChange={(event) => set(update, 'map', 'scope')(event.target.value || undefined)}>
          <option value="">Automatic</option>
          {['world', 'africa', 'europe', 'asia', 'north america', 'south america'].map((scope) => (
            <option key={scope} value={scope}>
              {scope[0]!.toUpperCase() + scope.slice(1)}
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
  const [search, setSearch] = useState('');
  if (!visual) {
    if (!page) return null;
    const preset = page.canvas?.preset ?? '16:9';
    return (
      <div className="space-y-2" data-testid="format-page">
        <p className="viz-label">Page</p>
        <Row label="Name">
          <input className="viz-field" value={page.name} onChange={(event) => updatePage({ name: event.target.value })} />
        </Row>
        <Row label="Canvas size">
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
                {size.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Background">
          <input type="color" className="viz-color-input" value={page.canvas?.background || '#f4f6fa'} onChange={(event) => updatePage({ canvas: { ...page.canvas, background: event.target.value } })} />
        </Row>
        {page.canvas?.background && (
          <button type="button" className="viz-chip" onClick={() => updatePage({ canvas: { ...page.canvas, background: '' } })}>
            <RotateCcw size={12} aria-hidden /> Theme background
          </button>
        )}
        <Row label="Page type">
          <select
            className="viz-field"
            value={page.type ?? 'page'}
            onChange={(event) => {
              const type = event.target.value as NonNullable<DashboardPage['type']>;
              updatePage(type === 'tooltip' ? { type, canvas: { ...page.canvas, preset: 'custom', width: 1280, height: 960 } } : { type });
            }}
            data-testid="format-page-type"
          >
            <option value="page">Page</option>
            <option value="drillthrough">Drill-through (detail)</option>
            <option value="tooltip">Tooltip</option>
          </select>
        </Row>
        {page.type === 'tooltip' && <p className="text-[11px] text-muted-foreground">Shown small when hovering points of visuals that pick it under Format → Tooltip.</p>}
        {page.type === 'drillthrough' && (
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">Right-click a member of one of these fields on another page → “Drill through”.</p>
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
        <p className="viz-label mt-3">Dashboard</p>
        <Row label="Slicers apply">
          <select
            className="viz-field"
            value={context.spec.settings?.applyMode ?? 'instant'}
            onChange={(event) => context.onSpec((spec) => ({ ...spec, settings: { ...spec.settings, applyMode: event.target.value as 'instant' | 'button' } }))}
            data-testid="format-apply-mode"
          >
            <option value="instant">Immediately</option>
            <option value="button">With an Apply button</option>
          </select>
        </Row>
        <Toggle label="Filters pane for viewers" checked={context.spec.settings?.showFiltersPane !== false} onChange={(show) => context.onSpec((spec) => ({ ...spec, settings: { ...spec.settings, showFiltersPane: show } }))} />
        <Toggle label="Viewers may personalize" checked={context.spec.settings?.allowPersonalize !== false} onChange={(allow) => context.onSpec((spec) => ({ ...spec, settings: { ...spec.settings, allowPersonalize: allow } }))} />
      </div>
    );
  }
  const sections = SECTIONS.filter((section) => (section.types === 'all' || section.types.includes(visual.type)) && (!search || section.title.toLowerCase().includes(search.toLowerCase())));
  return (
    <div className="space-y-2" data-testid="format-pane">
      <label className="dash-pane-search">
        <Search size={12} aria-hidden />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search format options" aria-label="Search format options" />
      </label>
      {sections.map((section) => (
        <details key={section.key} className="dash-format-section" open={['general', 'colors', 'labels', 'slicer', 'kpi', 'python', 'parameter', 'button', 'navigator'].includes(section.key) || !!search} data-testid={`section-${section.key}`}>
          <summary>
            {section.title}
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
                Reset to theme default
              </button>
            )}
          </summary>
          <div className="space-y-1.5 pt-1">{section.render(visual, update, context)}</div>
        </details>
      ))}
    </div>
  );
}
