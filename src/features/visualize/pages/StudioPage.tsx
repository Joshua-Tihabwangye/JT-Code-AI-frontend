import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Code2,
  Copy,
  Eye,
  EyeOff,
  FileImage,
  FileSpreadsheet,
  ImageDown,
  LayoutGrid,
  Palette,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Sparkles,
  SquarePlus,
  Table2,
  Wand2,
  X,
} from 'lucide-react';
import { useRepository, type VizFields, type VizOptions, type VizRenderResult, type VizStyle } from '@/lib/data';
import { useTheme } from '@/lib/theme';
import { Switch } from '@/shared/components';
import { eligibleColumns, mergeFields, missingSlots, OptionControl, SlotControl, useDebounced } from '../controls';
import { useVisualize } from '../context';
import { EChart } from '../EChart';
import { downloadChart, saveBlob, safeName } from '../echarts';
import { Ribbon, RibbonField, RibbonGroup } from '../Ribbon';
import { CategoryBadge, colorVar, DataTableModal, ErrorNote, Explanation, formatValue, humanize, PaletteSwatch, SkeletonBlock, StatChips } from '../ui';

interface Panel {
  id: string;
  /** Each chart can use its own dataset ('' = the dataset selected for the page). */
  datasetId: string;
  palette: string;
  /** Custom colours chosen by the user; they override the palette. */
  colors: string[];
  chartType: string;
  fields: VizFields;
  options: VizOptions;
  title: string;
  xTitle: string;
  yTitle: string;
  /** Fill the columns from the server's suggestion when the chart or dataset changes. */
  autofill: boolean;
}

const HEIGHTS = { S: 300, M: 400, L: 540 } as const;
const FALLBACK_CHARTS = ['line', 'bar', 'donut', 'histogram', 'scatter', 'box', 'correlation_heatmap', 'treemap', 'area', 'violin', 'pareto', 'pca_2d'];
let counter = 0;
const newPanel = (
  chartType: string,
  fields: VizFields = {},
  options: VizOptions = {},
  title = '',
  extra: Partial<Pick<Panel, 'datasetId' | 'palette' | 'colors'>> = {},
): Panel => ({
  id: `panel-${(counter += 1)}`,
  datasetId: extra.datasetId ?? '',
  palette: extra.palette ?? 'vivid',
  colors: extra.colors ?? [],
  chartType,
  fields,
  options,
  title,
  xTitle: '',
  yTitle: '',
  autofill: Object.keys(fields).length === 0,
});

/** One chart on the canvas: renders itself (debounced) and reports the result upward. */
function ChartPanel({
  panel,
  index,
  selected,
  onSelect,
  onRemove,
  onChange,
  onResult,
  style,
  height,
}: {
  panel: Panel;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  onChange: (id: string, patch: Partial<Panel>) => void;
  onResult: (id: string, result: VizRenderResult | undefined) => void;
  style: VizStyle & { maxSeries: number };
  height: number;
}) {
  const visualize = useRepository('visualize');
  const { catalog, datasets, datasetId: pageDataset } = useVisualize();
  const datasetId = panel.datasetId || pageDataset;
  const dataset = datasets.find((item) => item.id === datasetId);
  const [showData, setShowData] = useState(false);
  const chart = catalog?.charts.find((entry) => entry.id === panel.chartType);
  const category = catalog?.categories.find((entry) => entry.id === chart?.category);
  const profiles = useMemo(() => dataset?.profile.columnProfiles ?? [], [dataset]);

  const unfilled = missingSlots(chart, panel.fields);
  const suggestion = useQuery({
    queryKey: ['visualize', 'suggest', datasetId, panel.chartType],
    queryFn: () => visualize.suggestFields(datasetId, panel.chartType),
    enabled: !!datasetId && !!chart && (panel.autofill || unfilled.length > 0),
    staleTime: 60_000,
  });
  useEffect(() => {
    if (!suggestion.data || !chart || !profiles.length) return;
    if (panel.autofill) {
      onChange(panel.id, { fields: mergeFields(chart, {}, suggestion.data, profiles), autofill: false });
      return;
    }
    // A chart that arrived with some columns (a suggestion, the assistant) gets its missing ones filled too.
    const filled = mergeFields(chart, panel.fields, suggestion.data, profiles);
    const added = missingSlots(chart, panel.fields).filter((slot) => filled[slot.key] !== undefined);
    if (added.length) onChange(panel.id, { fields: { ...panel.fields, ...Object.fromEntries(added.map((slot) => [slot.key, filled[slot.key]!])) } });
  }, [panel.autofill, panel.id, panel.fields, suggestion.data, chart, profiles, onChange]);

  const request = useMemo(
    () => ({
      datasetId,
      chartType: panel.chartType,
      fields: panel.fields,
      options: panel.options,
      style: { ...style, palette: panel.palette, colors: panel.colors.length ? panel.colors : undefined, title: panel.title, xTitle: panel.xTitle, yTitle: panel.yTitle },
    }),
    [datasetId, panel, style],
  );
  const debounced = useDebounced(request, 450);
  const missing = missingSlots(chart, debounced.fields);
  const render = useQuery({
    queryKey: ['visualize', 'render', debounced],
    queryFn: () => visualize.render(debounced),
    enabled: !!debounced.datasetId && !!chart && missing.length === 0 && !panel.autofill,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    onResult(panel.id, render.data);
  }, [panel.id, render.data, onResult]);

  return (
    <article className="viz-panel-card space-y-2" aria-selected={selected} onClick={onSelect} data-testid={`chart-panel-${index}`}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="viz-badge" style={colorVar('#6366f1')}>
              #{index + 1}
            </span>
            <CategoryBadge category={category} />
            <span className="text-muted-foreground">{chart?.name}</span>
            {render.isFetching && <RefreshCw size={12} className="animate-spin text-muted-foreground" aria-label="Rendering" />}
          </div>
          <h2 className="truncate font-semibold" title={render.data?.title}>
            {render.data?.title ?? chart?.name}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="viz-chip"
            disabled={!render.data}
            onClick={(event) => {
              event.stopPropagation();
              setShowData(true);
            }}
            data-testid={`view-data-${index}`}
          >
            <Table2 size={12} aria-hidden /> View data
          </button>
        {onRemove && (
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            aria-label={`Remove chart ${index + 1}`}
          >
            <X size={15} />
          </button>
        )}
        </div>
      </header>
      {dataset && <p className="-mt-1 text-[11px] text-muted-foreground">Data: {dataset.name}</p>}
      {showData && render.data && <DataTableModal title={render.data.title} table={render.data.table} onClose={() => setShowData(false)} />}
      {missing.length > 0 && profiles.length > 0 && !panel.autofill && chart && (
        <div className="space-y-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" data-testid={`missing-columns-${index}`} onClick={(event) => event.stopPropagation()}>
          <p>
            A {chart.name.toLowerCase()} needs {missing.map((slot) => `“${slot.label}”`).join(' and ')}
            {missing.some((slot) => slot.key === 'color') ? ' — a second category that splits each bar or line into groups' : ''}. Pick it here:
          </p>
          <div className="flex flex-wrap items-end gap-2">
            {missing.map((slot) =>
              eligibleColumns(slot, profiles).length ? (
                <div key={slot.key} style={{ minWidth: 170 }}>
                  <SlotControl
                    slot={slot}
                    profiles={profiles}
                    value={panel.fields[slot.key]}
                    idPrefix={`panel-${index}-`}
                    onChange={(value) => onChange(panel.id, { fields: value === undefined ? panel.fields : { ...panel.fields, [slot.key]: value } })}
                  />
                </div>
              ) : (
                <span key={slot.key}>
                  {dataset?.name ?? 'This dataset'} has no column that fits “{slot.label}”.{' '}
                  <button type="button" className="font-semibold underline" onClick={() => onChange(panel.id, { chartType: 'bar', fields: {}, options: {}, autofill: true })}>
                    Use a bar chart instead
                  </button>
                </span>
              ),
            )}
          </div>
        </div>
      )}
      <ErrorNote error={render.error} />
      {render.data ? (
        <>
          <Explanation explanation={render.data.explanation} />
          <EChart option={render.data.option} height={height} testId={`studio-chart-${index}`} />
          <StatChips stats={render.data.stats} />
          {render.data.notes.map((note) => (
            <p key={note} className="text-[11px] text-muted-foreground">
              ℹ {note}
            </p>
          ))}
        </>
      ) : (
        <SkeletonBlock height={height} />
      )}
    </article>
  );
}

/** Up to six colour pickers; empty means “use the palette”. */
function ColourPickers({ colors, onChange, fallback }: { colors: string[]; onChange: (colors: string[]) => void; fallback: string[] }) {
  const shown = Array.from({ length: 6 }, (_, index) => colors[index] ?? fallback[index] ?? '#6366f1');
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1" data-testid="colour-pickers">
        {shown.map((colour, index) => (
          <input
            key={index}
            type="color"
            className="viz-color-input"
            value={colour}
            aria-label={`Colour ${index + 1}`}
            onChange={(event) => {
              const next = [...shown];
              next[index] = event.target.value;
              onChange(next);
            }}
          />
        ))}
      </div>
      <button type="button" className="text-left text-[11px] text-muted-foreground hover:underline" onClick={() => onChange([])} disabled={!colors.length}>
        {colors.length ? 'Reset to palette' : 'Click a swatch to customise'}
      </button>
    </div>
  );
}

export function StudioPage() {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const { catalog, dataset, datasets, datasetId, setDatasetId, studioDraft, clearStudioDraft, setAssistantContext } = useVisualize();
  const initial = useRef(studioDraft);
  const [panels, setPanels] = useState<Panel[]>(() => [
    newPanel(initial.current?.chartType ?? 'bar', initial.current?.fields, initial.current?.options, initial.current?.title),
  ]);
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState('chart');
  const [category, setCategory] = useState('all');
  const [columns, setColumns] = useState(2);
  const [size, setSize] = useState<keyof typeof HEIGHTS>('M');
  const [showData, setShowData] = useState(true);
  const [style, setStyle] = useState<VizStyle & { maxSeries: number }>({
    palette: 'vivid',
    theme: resolvedTheme === 'dark' ? 'dark' : 'light',
    showLegend: true,
    maxSeries: 8,
  });
  const [results, setResults] = useState<Record<string, VizRenderResult | undefined>>({});
  const [notice, setNotice] = useState('');
  const activeIndex = Math.min(active, panels.length - 1);
  const panel = panels[activeIndex] ?? panels[0]!;
  const chart = catalog?.charts.find((entry) => entry.id === panel.chartType);
  const panelDataset = datasets.find((item) => item.id === (panel.datasetId || datasetId));
  const profiles = useMemo(() => panelDataset?.profile.columnProfiles ?? [], [panelDataset]);
  const [insertType, setInsertType] = useState('line');
  const [insertDataset, setInsertDataset] = useState('');
  const [insertPalette, setInsertPalette] = useState('vivid');
  const [insertColors, setInsertColors] = useState<string[]>([]);
  const [insertSearch, setInsertSearch] = useState('');

  const insights = useQuery({
    queryKey: ['visualize', 'insights', datasetId],
    queryFn: () => visualize.insights(datasetId),
    enabled: !!datasetId,
    staleTime: 5 * 60_000,
  });
  const preview = useQuery({
    queryKey: ['visualize', 'preview', datasetId, dataset?.updatedAt, 0, false, ''],
    queryFn: () => visualize.preview(datasetId, 0, 8),
    enabled: !!datasetId && showData,
  });

  const updatePanel = useCallback((id: string, patch: Partial<Panel>) => {
    setPanels((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);
  const handleResult = useCallback((id: string, result: VizRenderResult | undefined) => {
    setResults((current) => (current[id] === result ? current : { ...current, [id]: result }));
  }, []);

  // Drafts from the gallery, insights, suggestions and the assistant fill the selected chart.
  useEffect(() => {
    if (!studioDraft) return;
    clearStudioDraft();
    if (studioDraft === initial.current) return;
    setPanels((current) =>
      current.map((item, index) =>
        index === Math.min(active, current.length - 1)
          ? { ...newPanel(studioDraft.chartType, studioDraft.fields, studioDraft.options, studioDraft.title), id: item.id }
          : item,
      ),
    );
  }, [studioDraft, clearStudioDraft, active]);
  // A new dataset re-fills every chart's columns.
  const lastDataset = useRef(datasetId);
  useEffect(() => {
    if (lastDataset.current === datasetId) return;
    lastDataset.current = datasetId;
    setPanels((current) => current.map((item) => (item.datasetId ? item : { ...item, fields: {}, autofill: true })));
  }, [datasetId]);
  useEffect(() => {
    setAssistantContext({ page: 'studio', chartType: panel.chartType, fields: panel.fields, options: panel.options, title: results[panel.id]?.title });
  }, [panel, results, setAssistantContext]);

  function setCount(count: number) {
    setPanels((current) => {
      if (count <= current.length) return current.slice(0, count);
      const used = new Set(current.map((item) => item.chartType));
      const ideas = (insights.data?.recommendations ?? []).filter((idea) => !used.has(idea.chartType));
      const next = [...current];
      while (next.length < count) {
        const idea = ideas.shift();
        if (idea) {
          next.push(newPanel(idea.chartType, idea.fields, idea.options ?? {}));
          used.add(idea.chartType);
        } else {
          const fallback = FALLBACK_CHARTS.find((id) => !used.has(id)) ?? 'bar';
          used.add(fallback);
          next.push(newPanel(fallback));
        }
      }
      return next;
    });
    setActive((current) => Math.min(current, count - 1));
  }

  const save = useMutation({
    mutationFn: (target: Panel) =>
      visualize.saveChart({
        datasetId: target.datasetId || datasetId,
        chartType: target.chartType,
        fields: target.fields,
        options: target.options,
        style: { ...style, palette: target.palette, colors: target.colors.length ? target.colors : undefined, title: target.title, xTitle: target.xTitle, yTitle: target.yTitle },
        title: target.title || results[target.id]?.title,
      }),
    onSuccess: (record) => {
      setNotice(`Saved “${record.title}”.`);
      void queryClient.invalidateQueries({ queryKey: ['visualize', 'charts'] });
    },
  });
  const download = useMutation({
    mutationFn: async (format: 'png' | 'svg' | 'html') => {
      const result = results[panel.id];
      if (!result) return;
      if (format === 'html') {
        const record = await save.mutateAsync(panel);
        saveBlob(await visualize.exportChart(record.id, 'html'), `${safeName(result.title)}.html`);
        return;
      }
      await downloadChart(result.option, format, result.title, () => visualize.worldMap());
    },
  });

  const ready = panels.filter((item) => results[item.id]);
  const excel = useMutation({
    mutationFn: async (graphs: boolean) => {
      const title = `${dataset?.name ?? 'Charts'} charts`;
      const blob = await visualize.workbook({
        title,
        graphs,
        charts: ready.map((item) => ({
          datasetId: item.datasetId || datasetId,
          chartType: item.chartType,
          fields: item.fields,
          options: item.options,
          style: { ...style, palette: item.palette, colors: item.colors.length ? item.colors : undefined, xTitle: item.xTitle, yTitle: item.yTitle },
          title: item.title || results[item.id]?.title,
        })),
      });
      saveBlob(blob, `${safeName(title)}${graphs ? '' : '-values'}.xlsx`);
    },
  });

  if (!catalog) return <SkeletonBlock height={520} />;
  const chartsInCategory = catalog.charts.filter((entry) => category === 'all' || entry.category === category);
  const positiveClasses = profiles.find((entry) => entry.name === panel.fields.actual)?.topValues?.map((value) => value.value) ?? [];
  const activeResult = results[panel.id];
  const setPanel = (patch: Partial<Panel>) => updatePanel(panel.id, patch);

  return (
    <div className="space-y-4" data-testid="visualize-studio">
      <Ribbon
        testId="studio-ribbon"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'insert', label: t('visualize.studio.insert', 'Insert chart'), icon: SquarePlus },
          { id: 'chart', label: t('visualize.studio.chartTab', 'Chart'), icon: BarChart3 },
          { id: 'options', label: t('visualize.studio.options', 'Options'), icon: SlidersHorizontal },
          { id: 'style', label: t('visualize.studio.style', 'Style'), icon: Palette },
          { id: 'layout', label: t('visualize.studio.layout', 'Layout'), icon: LayoutGrid },
          { id: 'export', label: t('visualize.studio.export', 'Export & share'), icon: Save },
          { id: 'suggest', label: t('visualize.studio.suggestTab', 'Suggestions'), icon: Sparkles },
        ]}
        aside={
          <span className="viz-badge" style={colorVar('#6366f1')} data-testid="editing-chart">
            Editing chart #{activeIndex + 1}
          </span>
        }
      >
        {tab === 'insert' && (
          <>
            <RibbonGroup title="1 · Choose the chart">
              <RibbonField label="Search" width={150}>
                <input className="viz-field" value={insertSearch} onChange={(event) => setInsertSearch(event.target.value)} placeholder="e.g. trend, share" aria-label="Search chart types" />
              </RibbonField>
              <RibbonField label="Chart type" width={230}>
                <select className="viz-field" value={insertType} onChange={(event) => setInsertType(event.target.value)} aria-label="Chart to insert" data-testid="insert-chart-type">
                  {catalog.categories.map((entry) => {
                    const matching = catalog.charts.filter(
                      (item) => item.category === entry.id && (!insertSearch.trim() || `${item.name} ${item.description} ${item.tags.join(' ')}`.toLowerCase().includes(insertSearch.trim().toLowerCase())),
                    );
                    return matching.length ? (
                      <optgroup key={entry.id} label={entry.name}>
                        {matching.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null;
                  })}
                </select>
              </RibbonField>
            </RibbonGroup>
            <RibbonGroup title="2 · Choose its data">
              <RibbonField label="Dataset" width={200}>
                <select className="viz-field" value={insertDataset || datasetId} onChange={(event) => setInsertDataset(event.target.value)} aria-label="Dataset for the new chart" data-testid="insert-dataset">
                  {datasets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </RibbonField>
            </RibbonGroup>
            <RibbonGroup title="3 · Choose its colours">
              <RibbonField label="Palette" width={190}>
                <select className="viz-field" value={insertPalette} onChange={(event) => setInsertPalette(event.target.value)} aria-label="Palette for the new chart" data-testid="insert-palette">
                  {catalog.palettes.map((palette) => (
                    <option key={palette.id} value={palette.id}>
                      {palette.name}
                    </option>
                  ))}
                </select>
              </RibbonField>
              <ColourPickers colors={insertColors} onChange={setInsertColors} fallback={catalog.palettes.find((palette) => palette.id === insertPalette)?.colors ?? []} />
            </RibbonGroup>
            <RibbonGroup title="4 · Add it">
              <button
                type="button"
                className="viz-tool"
                style={colorVar('#10b981')}
                disabled={panels.length >= 12 || !datasets.length}
                onClick={() => {
                  const chosen = insertDataset && insertDataset !== datasetId ? insertDataset : '';
                  setPanels([...panels, newPanel(insertType, {}, {}, '', { datasetId: chosen, palette: insertPalette, colors: insertColors })]);
                  setActive(panels.length);
                  setNotice(`Added chart #${panels.length + 1}. Pick its columns in the Chart tab if needed.`);
                }}
                data-testid="insert-chart"
              >
                <SquarePlus size={20} aria-hidden /> Insert chart
              </button>
              <span className="self-center text-[11px] text-muted-foreground">{panels.length}/12 charts</span>
            </RibbonGroup>
          </>
        )}
        {tab === 'chart' && (
          <>
            <RibbonGroup title={t('visualize.studio.data', 'Data')}>
              <RibbonField label={`Dataset for chart #${activeIndex + 1}`} width={210}>
                <select
                  className="viz-field"
                  value={panel.datasetId || datasetId}
                  onChange={(event) => (panels.length === 1 ? setDatasetId(event.target.value) : setPanel({ datasetId: event.target.value, fields: {}, autofill: true }))}
                  aria-label="Dataset"
                  data-testid="dataset-picker"
                >
                  {!datasets.length && <option value="">No datasets yet</option>}
                  {datasets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </RibbonField>
            </RibbonGroup>
            <RibbonGroup title={t('visualize.studio.type', 'Chart type')}>
              <RibbonField label="Family" width={160}>
                <select className="viz-field" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Chart family" data-testid="studio-category">
                  <option value="all">All families</option>
                  {catalog.categories.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </RibbonField>
              <RibbonField label="Chart" width={200}>
                <select
                  className="viz-field"
                  value={panel.chartType}
                  onChange={(event) => setPanel({ chartType: event.target.value, options: {}, autofill: true, fields: {} })}
                  aria-label="Chart type"
                  data-testid="studio-chart-type"
                >
                  {catalog.categories
                    .filter((entry) => category === 'all' || entry.id === category)
                    .map((entry) => (
                      <optgroup key={entry.id} label={entry.name}>
                        {chartsInCategory
                          .filter((item) => item.category === entry.id)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                </select>
              </RibbonField>
            </RibbonGroup>
            <RibbonGroup title={t('visualize.studio.columns', 'Columns')} grow>
              <div className="flex flex-wrap items-end gap-2" data-testid="studio-fields">
                {chart &&
                  profiles.length > 0 &&
                  chart.slots.map((slot) => (
                    <div key={`${panel.id}-${chart.id}-${slot.key}`} style={{ minWidth: slot.multiple ? 260 : 150, maxWidth: slot.multiple ? 420 : 200 }}>
                      <SlotControl
                        slot={slot}
                        profiles={profiles}
                        value={panel.fields[slot.key]}
                        onChange={(value) => {
                          const next = { ...panel.fields };
                          if (value === undefined || (Array.isArray(value) && !value.length)) delete next[slot.key];
                          else next[slot.key] = value;
                          setPanel({ fields: next });
                        }}
                      />
                    </div>
                  ))}
                {!profiles.length && <span className="text-sm text-muted-foreground">Pick a dataset to map its columns.</span>}
              </div>
            </RibbonGroup>
          </>
        )}
        {tab === 'options' && (
          <RibbonGroup title={`${chart?.name ?? ''} options`} grow>
            <div className="flex flex-wrap items-end gap-3">
              {chart?.options.map((option) => (
                <div key={`${panel.id}-${option.key}`} style={{ minWidth: 160 }}>
                  <OptionControl option={option} value={panel.options[option.key]} positiveClasses={positiveClasses} onChange={(value) => setPanel({ options: { ...panel.options, [option.key]: value } })} />
                </div>
              ))}
              {!chart?.options.length && <span className="text-sm text-muted-foreground">This chart has no extra options.</span>}
            </div>
          </RibbonGroup>
        )}
        {tab === 'style' && (
          <>
            <RibbonGroup title={`Colours for chart #${activeIndex + 1}`}>
              <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Palette">
                {catalog.palettes.map((palette) => (
                  <button
                    key={palette.id}
                    type="button"
                    role="radio"
                    aria-checked={panel.palette === palette.id && !panel.colors.length}
                    title={palette.name}
                    className={`flex flex-col items-start gap-1 rounded-lg border p-1.5 text-[11px] ${panel.palette === palette.id && !panel.colors.length ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-border'}`}
                    onClick={() => setPanel({ palette: palette.id, colors: [] })}
                  >
                    <PaletteSwatch palette={palette} />
                    <span className="max-w-[90px] truncate">{palette.name}</span>
                  </button>
                ))}
              </div>
            </RibbonGroup>
            <RibbonGroup title="Your own colours">
              <ColourPickers colors={panel.colors} onChange={(colors) => setPanel({ colors })} fallback={catalog.palettes.find((palette) => palette.id === panel.palette)?.colors ?? []} />
              <button
                type="button"
                className="viz-tool"
                onClick={() => setPanels(panels.map((item) => ({ ...item, palette: panel.palette, colors: panel.colors })))}
                disabled={panels.length < 2}
              >
                <Palette size={18} aria-hidden /> Apply to all
              </button>
            </RibbonGroup>
            <RibbonGroup title={t('visualize.studio.theme', 'Theme')}>
              {(['light', 'dark'] as const).map((theme) => (
                <button key={theme} type="button" className="viz-tool" aria-pressed={style.theme === theme} onClick={() => setStyle({ ...style, theme })}>
                  <Eye size={18} aria-hidden /> {theme === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
              <div className="flex flex-col items-center gap-1 px-1 text-[11px]">
                <Switch checked={style.showLegend !== false} onCheckedChange={(showLegend) => setStyle({ ...style, showLegend })} aria-label="Show legend" />
                Legend
              </div>
            </RibbonGroup>
            <RibbonGroup title={`Titles (chart #${activeIndex + 1})`} grow>
              <RibbonField label="Title" width={220}>
                <input className="viz-field" placeholder={activeResult?.title ?? 'Automatic'} value={panel.title} onChange={(event) => setPanel({ title: event.target.value })} aria-label="Chart title" />
              </RibbonField>
              <RibbonField label="X axis" width={150}>
                <input className="viz-field" value={panel.xTitle} onChange={(event) => setPanel({ xTitle: event.target.value })} aria-label="X axis title" />
              </RibbonField>
              <RibbonField label="Y axis" width={150}>
                <input className="viz-field" value={panel.yTitle} onChange={(event) => setPanel({ yTitle: event.target.value })} aria-label="Y axis title" />
              </RibbonField>
            </RibbonGroup>
          </>
        )}
        {tab === 'layout' && (
          <>
            <RibbonGroup title={t('visualize.studio.howMany', 'How many charts')}>
              <RibbonField label="Charts on the page" width={150}>
                <select className="viz-field" value={panels.length} onChange={(event) => setCount(Number(event.target.value))} aria-label="Number of charts" data-testid="chart-count">
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                    <option key={count} value={count}>
                      {count} chart{count > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </RibbonField>
              <RibbonField label="Charts per row" width={120}>
                <select className="viz-field" value={columns} onChange={(event) => setColumns(Number(event.target.value))} aria-label="Charts per row" data-testid="charts-per-row">
                  {[1, 2, 3, 4].map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </RibbonField>
            </RibbonGroup>
            <RibbonGroup title={t('visualize.studio.sizing', 'Size and lines')}>
              <RibbonField label="Chart height" width={120}>
                <select className="viz-field" value={size} onChange={(event) => setSize(event.target.value as keyof typeof HEIGHTS)} aria-label="Chart height">
                  <option value="S">Small</option>
                  <option value="M">Medium</option>
                  <option value="L">Large</option>
                </select>
              </RibbonField>
              <RibbonField label="Max lines / series per chart" width={190}>
                <select className="viz-field" value={style.maxSeries} onChange={(event) => setStyle({ ...style, maxSeries: Number(event.target.value) })} aria-label="Max lines per chart" data-testid="max-series">
                  {[2, 3, 5, 8, 12, 20, 30].map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </RibbonField>
            </RibbonGroup>
            <RibbonGroup title={t('visualize.studio.view', 'View')}>
              <button type="button" className="viz-tool" aria-pressed={showData} onClick={() => setShowData(!showData)}>
                {showData ? <Eye size={18} aria-hidden /> : <EyeOff size={18} aria-hidden />} Data strip
              </button>
              <button
                type="button"
                className="viz-tool"
                disabled={panels.length >= 12}
                onClick={() => {
                  setPanels([...panels, { ...panel, id: newPanel(panel.chartType).id }]);
                  setActive(panels.length);
                }}
              >
                <Copy size={18} aria-hidden /> Duplicate
              </button>
            </RibbonGroup>
          </>
        )}
        {tab === 'export' && (
          <>
            <RibbonGroup title={`Download chart #${activeIndex + 1}`}>
              <button type="button" className="viz-tool" disabled={!activeResult} onClick={() => download.mutate('png')}>
                <ImageDown size={18} aria-hidden /> PNG
              </button>
              <button type="button" className="viz-tool" disabled={!activeResult || activeResult.gl} onClick={() => download.mutate('svg')} title={activeResult?.gl ? '3D charts export as PNG' : undefined}>
                <FileImage size={18} aria-hidden /> SVG
              </button>
              <button type="button" className="viz-tool" disabled={!activeResult} onClick={() => download.mutate('html')} data-testid="download-html">
                <Code2 size={18} aria-hidden /> HTML
              </button>
            </RibbonGroup>
            <RibbonGroup title={`Excel — all ${ready.length} chart${ready.length === 1 ? '' : 's'}`}>
              <button
                type="button"
                className="viz-tool"
                style={colorVar('#10b981')}
                disabled={!ready.length || excel.isPending}
                onClick={() => excel.mutate(true)}
                title="One sheet per chart: its values with an editable Excel chart beside them, plus the data"
                data-testid="excel-with-charts"
              >
                {excel.isPending && excel.variables ? <RefreshCw size={18} className="animate-spin" aria-hidden /> : <FileSpreadsheet size={18} aria-hidden />} Excel + charts
              </button>
              <button type="button" className="viz-tool" disabled={!ready.length || excel.isPending} onClick={() => excel.mutate(false)} title="The same workbook with values only" data-testid="excel-values">
                <Table2 size={18} aria-hidden /> Excel values
              </button>
            </RibbonGroup>
            <RibbonGroup title={t('visualize.studio.saveGroup', 'Save')}>
              <button type="button" className="viz-tool" disabled={!activeResult || save.isPending} onClick={() => save.mutate(panel)} data-testid="save-chart">
                <Save size={18} aria-hidden /> This chart
              </button>
            </RibbonGroup>
          </>
        )}
        {tab === 'suggest' && (
          <RibbonGroup title={`Free, rule-based suggestions — click to use in chart #${activeIndex + 1}`} grow>
            <div className="flex flex-wrap gap-2">
              {insights.data?.recommendations.map((idea) => {
                const ideaCategory = catalog.categories.find((entry) => entry.id === idea.category);
                return (
                  <button
                    key={idea.chartType}
                    type="button"
                    className="viz-chip"
                    style={colorVar(ideaCategory?.color)}
                    title={idea.reason}
                    onClick={() => setPanel({ chartType: idea.chartType, fields: idea.fields, options: idea.options ?? {}, autofill: false })}
                  >
                    <Sparkles size={12} aria-hidden /> {idea.name}
                  </button>
                );
              })}
              {insights.isLoading && <span className="text-sm text-muted-foreground">Finding ideas…</span>}
            </div>
          </RibbonGroup>
        )}
      </Ribbon>
      <ErrorNote error={save.error ?? download.error ?? excel.error} />
      {notice && <p className="text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}

      {showData && dataset && (
        <section className="viz-card viz-card-pad" data-testid="studio-data-strip">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              <b className="text-foreground">{dataset.name}</b> · {(dataset.rowCount ?? 0).toLocaleString()} rows · first rows shown
            </span>
            <button type="button" className="hover:text-foreground" onClick={() => setShowData(false)} aria-label="Hide data strip">
              <X size={14} />
            </button>
          </div>
          <div className="viz-scroll" style={{ maxHeight: 190 }}>
            <table className="viz-table">
              <thead>
                <tr>
                  {(preview.data?.profile.columns ?? dataset.columns).map((column) => (
                    <th key={column} title={column}>
                      {humanize(column)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.data?.rows.map((row, index) => (
                  <tr key={index}>
                    {(preview.data?.profile.columns ?? dataset.columns).map((column) => (
                      <td key={column}>{formatValue(row[column])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!datasetId ? (
        <div className="viz-card viz-card-pad py-12 text-center text-sm text-muted-foreground">
          <Wand2 className="mx-auto mb-2" aria-hidden /> Pick or add a dataset to start charting.
        </div>
      ) : (
        <div className="viz-canvas-grid" style={{ gridTemplateColumns: `repeat(${Math.min(columns, panels.length)}, minmax(0, 1fr))` }} data-testid="chart-grid">
          {panels.map((item, index) => (
            <ChartPanel
              key={item.id}
              panel={item}
              index={index}
              selected={index === activeIndex}
              onSelect={() => setActive(index)}
              onRemove={panels.length > 1 ? () => setPanels(panels.filter((other) => other.id !== item.id)) : undefined}
              onChange={updatePanel}
              onResult={handleResult}
              style={style}
              height={HEIGHTS[size]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
