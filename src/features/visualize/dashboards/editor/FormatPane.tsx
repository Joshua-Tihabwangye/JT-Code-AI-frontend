import { useState, type ReactNode } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import type { DashboardPage, DashboardVisual, DashboardVisualType } from '@/lib/data';
import { CANVAS_PRESETS, setFormat } from './actions';

type Update = (mutate: (visual: DashboardVisual) => DashboardVisual, merge?: string) => void;

const CHARTS: DashboardVisualType[] = ['bar', 'column', 'line', 'area', 'combo', 'donut', 'pie', 'treemap', 'funnel', 'waterfall', 'scatter', 'map', 'chart', 'gauge'];
const SERIES: DashboardVisualType[] = ['bar', 'column', 'line', 'area', 'combo', 'scatter', 'waterfall', 'chart', 'gauge', 'donut', 'pie', 'treemap', 'funnel', 'map'];

interface Section {
  key: string;
  title: string;
  types: DashboardVisualType[] | 'all';
  /** The format sections this pane section edits (reset clears them). */
  formats: string[];
  render: (visual: DashboardVisual, update: Update) => ReactNode;
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
    render: (visual, update) => (
      <Row label="Style">
        <select className="viz-field" value={value(visual, 'slicer', 'style', '')} onChange={(event) => set(update, 'slicer', 'style')(event.target.value || undefined)} data-testid="format-slicer-style">
          <option value="">Automatic</option>
          <option value="dropdown">Dropdown</option>
          <option value="list">List</option>
          <option value="tiles">Buttons</option>
          <option value="between">Number range</option>
          <option value="date_range">Date range</option>
        </select>
      </Row>
    ),
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
export function FormatPane({ visual, update, page, updatePage }: { visual: DashboardVisual | undefined; update: Update; page: DashboardPage | undefined; updatePage: (patch: Partial<DashboardPage>) => void }) {
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
        <details key={section.key} className="dash-format-section" open={['general', 'colors', 'labels', 'slicer', 'kpi'].includes(section.key) || !!search}>
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
          <div className="space-y-1.5 pt-1">{section.render(visual, update)}</div>
        </details>
      ))}
    </div>
  );
}
