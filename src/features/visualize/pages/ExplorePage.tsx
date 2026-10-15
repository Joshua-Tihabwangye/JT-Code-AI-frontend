import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Download, FileSpreadsheet, Info, Pin, Plus, Save, Trash2 } from 'lucide-react';
import { useRepository, type ChartOption, type DashboardSpec, type DashboardVisual, type DashboardVisualType, type VisualOutput } from '@/lib/data';
import { useTheme } from '@/lib/theme';
import { useDebounced } from '../controls';
import { useVisualize } from '../context';
import { renderContext, resolveVisual } from '../dashboards/customize';
import { BuildPane } from '../dashboards/editor/BuildPane';
import { newId, VISUAL_BY_TYPE } from '../dashboards/editor/catalog';
import { FormatPane } from '../dashboards/editor/FormatPane';
import { PinDialog } from '../dashboards/PinDialog';
import { kpiIndexes, Tile } from '../dashboards/runtime';
import { themeStyle, useBuiltInThemes } from '../dashboards/theme';
import { DataTable, dataCsv } from '../dashboards/visuals';
import { saveBlob, safeName } from '../echarts';
import { ChartThumb } from '../thumbs';
import { ErrorNote, humanize } from '../ui';

/** The chart types Explore offers first (any of the 85 gallery charts is one “Gallery chart” away). */
const TYPES: DashboardVisualType[] = ['column', 'bar', 'line', 'area', 'combo', 'donut', 'treemap', 'scatter', 'table', 'matrix', 'card', 'kpi', 'map', 'waterfall', 'funnel', 'chart'];
const MAX_CHARTS = 12;
const STORE = 'jt-explore:';

function load(datasetId: string): DashboardVisual[] {
  try {
    const raw = sessionStorage.getItem(STORE + datasetId);
    return raw ? (JSON.parse(raw) as DashboardVisual[]) : [];
  } catch {
    return [];
  }
}

function keep(datasetId: string, visuals: DashboardVisual[]) {
  try {
    sessionStorage.setItem(STORE + datasetId, JSON.stringify(visuals));
  } catch {
    // Storage may be unavailable (private mode); Explore still works for this visit.
  }
}

/** A sensible first chart: the first category by the first number (or a count). */
function starter(datasetId: string, profiles: { name: string; kind: string }[]): DashboardVisual {
  const category = profiles.find((p) => p.kind === 'categorical') ?? profiles.find((p) => p.kind === 'datetime');
  const value = profiles.find((p) => p.kind === 'numeric');
  return {
    id: newId('explore'),
    type: category?.kind === 'datetime' ? 'line' : 'column',
    layout: { x: 0, y: 0, w: 12, h: 10 },
    data: {
      datasetId,
      wells: {
        ...(category ? { category: [category.kind === 'datetime' ? { field: category.name, grain: 'month' as const } : { field: category.name }] } : {}),
        values: [value ? { field: value.name, agg: 'sum' } : { field: '*', agg: 'count' }],
      },
    },
  };
}

/** Explore: build charts from fields with the dashboard's Build/Format panes, see the data behind
 *  them, and pin the good ones to a dashboard. Python draws every chart. */
export function ExplorePage() {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const { resolvedTheme } = useTheme();
  const themes = useBuiltInThemes();
  const [params, setParams] = useSearchParams();
  const { dataset, datasetId, setAssistantContext, studioDraft, clearStudioDraft } = useVisualize();
  const profiles = useMemo(() => dataset?.profile.columnProfiles ?? [], [dataset]);
  const [visuals, setVisuals] = useState<DashboardVisual[]>([]);
  const [selected, setSelected] = useState('');
  const [pane, setPane] = useState<'build' | 'format'>('build');
  const [drawer, setDrawer] = useState<'' | 'data' | 'rows' | 'query'>('');
  const [pinning, setPinning] = useState<DashboardVisual | null>(null);
  const [calculations, setCalculations] = useState<DashboardSpec['calculations']>([]);
  const mode: 'light' | 'dark' = resolvedTheme === 'dark' ? 'dark' : 'light';
  const theme = themes.data?.themes.find((item) => item.id === themes.data?.default) ?? themes.data?.themes[0];

  useEffect(() => setAssistantContext({ page: 'explore' }), [setAssistantContext]);
  // Each dataset keeps its own Explore charts for the visit.
  useEffect(() => {
    if (!datasetId || !profiles.length) return;
    const saved = load(datasetId);
    const initial = saved.length ? saved : [starter(datasetId, profiles)];
    setVisuals(initial);
    setSelected(initial[0]!.id);
  }, [datasetId, profiles]);
  useEffect(() => {
    if (datasetId && visuals.length) keep(datasetId, visuals);
  }, [datasetId, visuals]);
  // A chart handed over by the gallery, insights or the assistant (``openStudio``).
  useEffect(() => {
    if (!studioDraft || !datasetId || !profiles.length) return;
    const visual: DashboardVisual = {
      id: newId('explore'),
      type: 'chart',
      layout: { x: 0, y: 0, w: 12, h: 10 },
      data: { datasetId: studioDraft.datasetId || datasetId, wells: {} },
      format: { chart: { chartType: studioDraft.chartType, fields: studioDraft.fields ?? {}, options: studioDraft.options ?? {} }, ...(studioDraft.title ? { title: { text: studioDraft.title } } : {}) },
    };
    clearStudioDraft();
    setVisuals((current) => [visual, ...current.filter((item) => item.id !== visual.id)].slice(0, MAX_CHARTS));
    setSelected(visual.id);
    // A chart picked without columns (gallery): fill in the best mapping for this dataset.
    if (!Object.keys(studioDraft.fields ?? {}).length) {
      void visualize.recommend(visual.data.datasetId, studioDraft.chartType).then((result) =>
        setVisuals((current) =>
          current.map((item) => (item.id === visual.id ? { ...item, format: { ...item.format, chart: { ...(item.format?.chart ?? {}), fields: result.fields ?? {} } } } : item)),
        ),
      );
    }
  }, [studioDraft, datasetId, profiles.length, clearStudioDraft, visualize]);
  // “Use in Explore” from the gallery: ?chart=<gallery chart id>.
  useEffect(() => {
    const chart = params.get('chart');
    if (!chart || !datasetId || !profiles.length) return;
    setParams({}, { replace: true });
    void visualize.recommend(datasetId, chart).then((result) => {
      const visual: DashboardVisual = {
        id: newId('explore'),
        type: 'chart',
        layout: { x: 0, y: 0, w: 12, h: 10 },
        data: { datasetId, wells: {} },
        format: { chart: { chartType: chart, fields: result.fields ?? {}, options: {} } },
      };
      setVisuals((current) => [visual, ...current].slice(0, MAX_CHARTS));
      setSelected(visual.id);
    });
  }, [params, datasetId, profiles.length, setParams, visualize]);

  const spec: DashboardSpec = useMemo(() => ({ theme: theme?.id ?? 'executive', mode: 'system', calculations, pages: [{ id: 'explore', name: 'Explore', visuals }] }), [theme, calculations, visuals]);
  const request = useDebounced(
    useMemo(() => (visuals.length ? { visuals: visuals.map((visual) => resolveVisual(visual, spec, {})), mode, theme: spec.theme, ...renderContext(spec, {}) } : null), [visuals, mode, spec]),
    150,
  );
  const rendered = useQuery({
    queryKey: ['visualize', 'explore', request],
    queryFn: ({ signal }) => visualize.renderVisuals(request!, signal),
    enabled: !!request,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const outputs = useMemo(() => Object.fromEntries((rendered.data?.visuals ?? []).map((output) => [output.id, output])), [rendered.data]) as Record<string, VisualOutput>;
  // Suggestions: the free rule-based recommendations, drawn small with the real data.
  const insights = useQuery({ queryKey: ['visualize', 'insights', datasetId], queryFn: () => visualize.insights(datasetId), enabled: !!datasetId, staleTime: 300_000 });
  const suggestions = useMemo(
    () =>
      (insights.data?.recommendations ?? []).slice(0, 6).map(
        (item, index): DashboardVisual => ({
          id: `suggestion-${index}`,
          type: 'chart',
          layout: { x: 0, y: 0, w: 6, h: 6 },
          data: { datasetId, wells: {} },
          format: { chart: { chartType: item.chartType, fields: item.fields, options: item.options ?? {} }, title: { text: item.name } },
        }),
      ),
    [insights.data, datasetId],
  );
  const previews = useQuery({
    queryKey: ['visualize', 'explore-suggestions', suggestions, mode],
    queryFn: ({ signal }) => visualize.renderVisuals({ visuals: suggestions, mode }, signal),
    enabled: suggestions.length > 0,
    staleTime: 300_000,
  });
  const rows = useQuery({ queryKey: ['visualize', 'preview', datasetId, 'explore'], queryFn: () => visualize.preview(datasetId, 0, 50), enabled: drawer === 'rows' && !!datasetId });
  const save = useMutation({ mutationFn: (visual: DashboardVisual) => visualize.saveChart({ visual, title: outputs[visual.id]?.title }) });

  const current = visuals.find((visual) => visual.id === selected);
  const output = current ? outputs[current.id] : undefined;
  const update = (mutate: (visual: DashboardVisual) => DashboardVisual) => setVisuals((list) => list.map((visual) => (visual.id === selected ? mutate(visual) : visual)));
  const add = (visual?: DashboardVisual) => {
    if (!datasetId || visuals.length >= MAX_CHARTS) return;
    const next = visual ? { ...visual, id: newId('explore') } : starter(datasetId, profiles);
    setVisuals((list) => [...list, next]);
    setSelected(next.id);
  };
  const exportPng = () => {
    const canvas = document.querySelector<HTMLCanvasElement>(`[data-testid="tile-${selected}"] canvas`);
    canvas?.toBlob((blob) => blob && saveBlob(blob, `${safeName(output?.title ?? 'chart')}.png`));
  };
  const kpis = kpiIndexes(visuals);
  const querySummary = current ? describeQuery(current) : '';

  if (!dataset) {
    return <p className="viz-card viz-card-pad text-sm text-muted-foreground">{t('visualize.explore.pick', 'Choose a dataset in the bar above, or add one on the Data page.')}</p>;
  }
  return (
    <div className="explore" data-testid="explore">
      <div className="explore-types" role="toolbar" aria-label="Chart type">
        {TYPES.map((type) => (
          <button
            key={type}
            type="button"
            title={VISUAL_BY_TYPE[type]?.label ?? humanize(type)}
            aria-pressed={current?.type === type}
            disabled={!current}
            onClick={() => update((visual) => ({ ...visual, type, ...(type === 'chart' && visual.type !== 'chart' ? { format: { ...visual.format, chart: { chartType: 'histogram', fields: {} } } } : {}) }))}
            data-testid={`explore-type-${type}`}
          >
            <ChartThumb id={type === 'chart' ? 'sunburst' : type} />
          </button>
        ))}
        <span className="flex-1" />
        <button type="button" className="viz-chip" disabled={visuals.length >= MAX_CHARTS} onClick={() => add()} data-testid="explore-add">
          <Plus size={13} aria-hidden /> {t('visualize.explore.add', 'New chart')}
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="explore-suggestions" aria-label="Suggestions" data-testid="explore-suggestions">
          {suggestions.map((suggestion, index) => {
            const preview = previews.data?.visuals.find((item) => item.id === suggestion.id);
            return (
              <button key={suggestion.id} type="button" className="explore-suggestion" onClick={() => add(suggestion)} title={insights.data?.recommendations[index]?.reason} data-testid={`explore-suggestion-${index}`}>
                <span className="explore-suggestion-chart">
                  {preview?.status === 'ok' && preview.option ? (
                    <Tile visual={suggestion} output={{ ...preview, title: '', notes: [], option: miniOption(preview.option) }} theme={theme} kpiIndex={-1} style={{ position: 'absolute', inset: 0 }} onSelect={() => undefined} />
                  ) : (
                    <ChartThumb id={String((suggestion.format?.chart as { chartType?: string })?.chartType)} />
                  )}
                </span>
                <span className="truncate text-[11px]">{insights.data?.recommendations[index]?.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="explore-body">
        <section className={`dash-canvas ${mode} explore-grid`} style={themeStyle(theme, mode, 'comfortable')} data-mode={mode} aria-label="Charts">
          {visuals.map((visual, index) => (
            <div
              key={visual.id}
              className={`explore-card${visual.id === selected ? ' selected' : ''}`}
              onClick={() => setSelected(visual.id)}
              onKeyDown={(event) => event.key === 'Enter' && setSelected(visual.id)}
              role="button"
              tabIndex={0}
              aria-pressed={visual.id === selected}
              data-testid={`explore-card-${index}`}
            >
              <span className="explore-card-number">#{index + 1}</span>
              <Tile visual={visual} output={outputs[visual.id]} theme={theme} kpiIndex={kpis[visual.id] ?? -1} style={{ position: 'relative', height: '100%' }} onSelect={() => undefined} />
              {visual.id === selected && outputs[visual.id]?.insight && (
                <p className="explore-insight" data-testid="explore-insight">
                  <Info size={12} aria-hidden /> {outputs[visual.id]!.insight}
                </p>
              )}
            </div>
          ))}
        </section>

        <aside className="dash-pane explore-pane" aria-label="Build and format">
          <div className="dash-pane-tabs" role="tablist">
            {(['build', 'format'] as const).map((tab) => (
              <button key={tab} type="button" role="tab" aria-selected={pane === tab} onClick={() => setPane(tab)} data-testid={`explore-pane-${tab}`}>
                {tab === 'build' ? 'Build' : 'Format'}
              </button>
            ))}
          </div>
          <div className="dash-pane-body">
            {current && pane === 'build' && (
              <BuildPane
                visual={current}
                update={update}
                onCreate={() => undefined}
                spec={spec}
                onSpec={(mutate) => setCalculations(mutate(spec).calculations ?? [])}
              />
            )}
            {current && pane === 'format' && (
              <FormatPane visual={current} update={update} page={spec.pages[0]} updatePage={() => undefined} context={{ spec, pageId: 'explore', onSpec: () => undefined, output, profiles }} fields={profiles.map((p) => p.name)} />
            )}
          </div>
        </aside>
      </div>

      <div className="explore-actions">
        <button type="button" className="viz-chip primary" disabled={!current} onClick={() => current && setPinning(current)} data-testid="explore-pin">
          <Pin size={13} aria-hidden /> {t('visualize.explore.pin', 'Pin to dashboard')}
        </button>
        <button type="button" className="viz-chip" disabled={!current || save.isPending} onClick={() => current && save.mutate(current)} data-testid="explore-save">
          <Save size={13} aria-hidden /> {save.isSuccess ? t('visualize.explore.saved', 'Saved to My visuals') : t('visualize.explore.save', 'Save to My visuals')}
        </button>
        <button type="button" className="viz-chip" disabled={!output?.option} onClick={exportPng}>
          <Download size={13} aria-hidden /> PNG
        </button>
        <button type="button" className="viz-chip" disabled={!output?.data} onClick={() => output?.data && saveBlob(new Blob([dataCsv(output.data)], { type: 'text/csv' }), `${safeName(output.title ?? 'data')}.csv`)}>
          <FileSpreadsheet size={13} aria-hidden /> CSV
        </button>
        <button type="button" className="viz-chip" disabled={!current || visuals.length < 2} onClick={() => (setVisuals((list) => list.filter((visual) => visual.id !== selected)), setSelected(visuals.find((visual) => visual.id !== selected)?.id ?? ''))} aria-label="Remove this chart">
          <Trash2 size={13} aria-hidden />
        </button>
        <span className="flex-1" />
        <button type="button" className="viz-chip" aria-expanded={!!drawer} onClick={() => setDrawer(drawer ? '' : 'data')} data-testid="explore-view-data">
          {drawer ? <ChevronDown size={13} aria-hidden /> : <ChevronUp size={13} aria-hidden />} {t('visualize.explore.viewData', 'View data')}
        </button>
      </div>
      <ErrorNote error={rendered.error ?? save.error} />

      {drawer && (
        <section className="explore-drawer" data-testid="explore-drawer">
          <div className="viz-segment">
            {(
              [
                ['data', 'Data behind the chart'],
                ['rows', 'Raw rows'],
                ['query', 'Query'],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={drawer === key} onClick={() => setDrawer(key)} data-testid={`explore-drawer-${key}`}>
                {label}
              </button>
            ))}
          </div>
          {drawer === 'data' && (output?.data ? <DataTable data={output.data} /> : <p className="text-sm text-muted-foreground">No data yet.</p>)}
          {drawer === 'rows' && rows.data && <RawRows rows={rows.data.rows} />}
          {drawer === 'query' && <p className="text-sm" data-testid="explore-query">{querySummary}</p>}
        </section>
      )}

      {pinning && <PinDialog visual={pinning} title={outputs[pinning.id]?.title} onClose={() => setPinning(null)} />}
    </div>
  );
}

/** The chart's query in plain words, e.g. “Sum of revenue by region (month), top 12”. */
function describeQuery(visual: DashboardVisual): string {
  const wells = visual.data.wells;
  if (visual.type === 'chart') {
    const chart = (visual.format?.chart ?? {}) as { chartType?: string; fields?: Record<string, unknown> };
    return `${humanize(chart.chartType ?? 'chart')} of ${Object.values(chart.fields ?? {}).flat().map(String).map(humanize).join(', ') || 'no fields yet'} (every row, sampled to 10,000 when larger).`;
  }
  const measures = [...(wells.values ?? []), ...(wells.secondaryValues ?? [])].map((ref) => (ref.field === '*' ? 'Count of rows' : ref.calc ? ref.field : `${humanize(ref.agg ?? 'sum')} of ${humanize(ref.field)}`));
  const groups = [...(wells.category ?? []), ...(wells.rows ?? []), ...(wells.legend ?? []), ...(wells.columns ?? [])].map((ref) => humanize(ref.field) + (ref.grain ? ` (${ref.grain})` : ''));
  return `${measures.join(', ') || 'Count of rows'}${groups.length ? ` by ${groups.join(', ')}` : ''} — computed in the database, then drawn in Python.`;
}

function RawRows({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = Object.keys(rows[0] ?? {});
  const cell = (value: unknown): string | number | boolean | null => (value === null || value === undefined ? null : typeof value === 'object' ? JSON.stringify(value) : (value as string | number | boolean));
  return <DataTable data={{ columns, rows: rows.map((row) => columns.map((column) => cell(row[column]))), truncated: false }} />;
}

/** A chart option reduced to its marks, for tiny previews (no toolbox, legend, labels or titles). */
function miniOption(option: ChartOption): ChartOption {
  const quietAxis = (axis: Record<string, unknown>) => ({ ...axis, name: '', axisLabel: { show: false }, axisTick: { show: false }, splitLine: { show: false } });
  const quiet = (axis: unknown): unknown => (Array.isArray(axis) ? axis.map((item) => quietAxis(item as Record<string, unknown>)) : axis && typeof axis === 'object' ? quietAxis(axis as Record<string, unknown>) : axis);
  const copy: Record<string, unknown> = { ...option };
  for (const key of ['toolbox', 'legend', 'title', 'dataZoom', 'timeline', 'graphic']) delete copy[key];
  copy.xAxis = quiet(option.xAxis);
  copy.yAxis = quiet(option.yAxis);
  if (option.visualMap) copy.visualMap = { ...(option.visualMap as Record<string, unknown>), show: false };
  copy.grid = { left: 2, right: 2, top: 4, bottom: 2, containLabel: false };
  copy.tooltip = { show: false };
  copy.animation = false;
  copy.series = (option.series ?? []).map((item) => ({ ...item, label: { show: false }, labelLine: { show: false }, markLine: undefined }));
  return copy;
}
