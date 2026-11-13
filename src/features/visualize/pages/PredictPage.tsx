import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, BrainCircuit, Check, Database, Download, FileSpreadsheet, Layers, LineChart, PanelLeftClose, PanelLeftOpen, Pin, Play, Plus, RefreshCw, Save, Shapes, Sparkles, Table2, Target, Trash2, TrendingUp, X } from 'lucide-react';
import { formatNumber } from '@/i18n/format';
import { useRepository, type PredictionPreset, type VizDateRange, type VizFields, type VizOptions, type VizPrediction } from '@/lib/data';
import { useTheme } from '@/lib/theme';
import { Button } from '@/shared/components';
import { missingSlots, OptionControl, SlotControl } from '../controls';
import { useCatalogText } from '../catalogText';
import { useVisualize } from '../context';
import { EChart } from '../EChart';
import { saveBlob, safeName } from '../echarts';
import { PinDialog, type PinnableVisual } from '../dashboards/PinDialog';
import { colorVar, DataTableModal, ErrorNote, formatValue, QualityBadge, SectionTitle } from '../ui';
import { HowCalculated, MetricFormula } from './predict/HowCalculated';
import { DateRangePicker, ForecastUntilPicker } from './predict/DateControls';
import { CustomPredictionDialog } from './predict/CustomPredictionDialog';

const STEPS_HIDDEN_KEY = 'jt-predict-steps-hidden';

const TASK_STYLE: Record<string, { icon: typeof TrendingUp; color: string }> = {
  forecast: { icon: TrendingUp, color: '#0ea5e9' },
  regression: { icon: Activity, color: '#6366f1' },
  classification: { icon: Shapes, color: '#ec4899' },
  clustering: { icon: Layers, color: '#10b981' },
  anomaly: { icon: AlertTriangle, color: '#f59e0b' },
  trend: { icon: LineChart, color: '#14b8a6' },
  drivers: { icon: Target, color: '#8b5cf6' },
};

function Results({ result, datasetName, pinFor }: { result: VizPrediction; datasetName: string; pinFor: (index: number) => PinnableVisual }) {
  const [pinning, setPinning] = useState<number | null>(null);
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const { refreshDatasets, setDatasetId } = useVisualize();
  const [notice, setNotice] = useState('');
  const download = useMutation({
    mutationFn: async ({ type, graphs = true }: { type: 'csv' | 'xlsx'; graphs?: boolean }) =>
      saveBlob(await visualize.downloadPrediction(result.resultId, type, { graphs }), `${safeName(datasetName)}-${result.task}${type === 'xlsx' && !graphs ? '-values' : ''}.${type}`),
  });
  const saveDataset = useMutation({
    mutationFn: () => visualize.savePrediction(result.resultId),
    onSuccess: async (dataset) => {
      await refreshDatasets();
      setDatasetId(dataset.id);
      setNotice(t('visualize.predict.savedDataset', { name: dataset.name }));
    },
  });
  const saveChart = useMutation({
    mutationFn: (index: number) => visualize.saveChart({ resultId: result.resultId, chartIndex: index }),
    onSuccess: (chart) => {
      setNotice(t('visualize.predict.savedChart', { title: chart.title }));
      void queryClient.invalidateQueries({ queryKey: ['visualize', 'charts'] });
    },
  });
  const [tableIndex, setTableIndex] = useState<number | null>(null);
  const openChart = tableIndex === null ? undefined : result.charts[tableIndex];

  return (
    <div className="space-y-4" data-testid="prediction-results">
      {openChart && <DataTableModal title={openChart.title} table={openChart.table} onClose={() => setTableIndex(null)} />}
      <div className="viz-card viz-card-pad space-y-2" style={{ borderLeft: '4px solid #8b5cf6' }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            {result.modelName} <span className="text-sm font-normal text-muted-foreground">· {t('visualize.predict.rowsScored', { count: result.resultRows, rows: formatNumber(result.resultRows) })}</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => download.mutate({ type: 'csv' })} isLoading={download.isPending && download.variables?.type === 'csv'}>
              <Download size={14} aria-hidden /> CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-emerald-500/60 text-emerald-700 dark:text-emerald-300"
              onClick={() => download.mutate({ type: 'xlsx', graphs: true })}
              isLoading={download.isPending && download.variables?.type === 'xlsx' && download.variables.graphs}
              title={t('visualize.predict.excelChartsTitle')}
              data-testid="prediction-excel"
            >
              <FileSpreadsheet size={14} aria-hidden /> {t('visualize.predict.excelCharts')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => download.mutate({ type: 'xlsx', graphs: false })}
              isLoading={download.isPending && download.variables?.type === 'xlsx' && !download.variables.graphs}
              title={t('visualize.predict.excelValuesTitle')}
            >
              <FileSpreadsheet size={14} aria-hidden /> {t('visualize.predict.excelValues')}
            </Button>
            <Button size="sm" className="viz-primary gap-1.5" onClick={() => saveDataset.mutate()} isLoading={saveDataset.isPending}>
              <Database size={14} aria-hidden /> {t('visualize.predict.saveDataset')}
            </Button>
          </div>
        </div>
        {result.summary[0] && <p className="text-sm">{result.summary[0]}</p>}
        {result.method && (
          <p className="text-xs text-muted-foreground" data-testid="prediction-method">
            <b>{t('visualize.predict.methodUsed')}</b> {result.method}
          </p>
        )}
        <ErrorNote error={download.error ?? saveDataset.error ?? saveChart.error} />
        {notice && <p className="text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="prediction-metrics">
        {result.metrics.map((metric) => (
          <div key={metric.key} className="viz-card viz-card-pad" title={metric.help}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{metric.label}</span>
              <QualityBadge quality={metric.quality} />
            </div>
            <p className="viz-gradient-text mt-1 text-2xl font-bold">{formatValue(metric.value, metric.format)}</p>
            {metric.help && <p className="text-[11px] text-muted-foreground">{metric.help}</p>}
            <MetricFormula metric={metric} />
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {result.charts.map((chart, index) => (
          <div key={chart.id} className="viz-card viz-card-pad space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{chart.title}</h3>
              <div className="flex flex-wrap gap-1 whitespace-nowrap">
                <button type="button" className="viz-chip" onClick={() => setTableIndex(index)} data-testid={`prediction-data-${chart.id}`}>
                  <Table2 size={12} aria-hidden /> {t('visualize.predict.viewData')}
                </button>
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => saveChart.mutate(index)} isLoading={saveChart.isPending && saveChart.variables === index}>
                  <Save size={14} aria-hidden /> {t('visualize.predict.saveChart')}
                </Button>
                <button type="button" className="viz-chip primary" onClick={() => setPinning(index)} data-testid={`prediction-pin-${chart.id}`}>
                  <Pin size={12} aria-hidden /> {t('visualize.predict.pin')}
                </button>
              </div>
            </div>
            <EChart option={chart.option} height={380} testId={`prediction-chart-${chart.id}`} />
            {chart.explanation.insight && <p className="text-sm">{chart.explanation.insight}</p>}
            <HowCalculated explanation={chart.explanation} />
          </div>
        ))}
      </div>

      <details className="viz-card viz-card-pad viz-how" data-testid="prediction-how">
        <summary className="cursor-pointer text-sm font-semibold">{t('visualize.predict.how')}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {result.summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {result.notes.map((note) => (
          <p key={note} className="text-xs text-muted-foreground">
            ℹ {note}
          </p>
        ))}
        {result.comparison.length > 1 && (
          <div className="mt-3">
            <SectionTitle title={t('visualize.predict.comparison')} subtitle={t('visualize.predict.comparisonHint')} />
            <ul className="space-y-1.5">
              {[...result.comparison]
                .sort((a, b) => b.score - a.score)
                .map((item) => (
                  <li key={item.model} className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-sm">
                    <span className={item.model === result.model ? 'font-semibold' : ''}>{item.name}</span>
                    <span className="font-mono text-xs">{formatNumber(item.score, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </details>
      {pinning !== null && result.charts[pinning] && <PinDialog visual={pinFor(pinning)} title={result.charts[pinning].title} onClose={() => setPinning(null)} />}
    </div>
  );
}

export function PredictPage() {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const { catalog, dataset, datasets, datasetId, setDatasetId, predictDraft, clearPredictDraft, setAssistantContext } = useVisualize();
  const initial = useRef(predictDraft);
  const [tab, setTab] = useState('task');
  const [taskId, setTaskId] = useState(initial.current?.task ?? 'forecast');
  const [model, setModel] = useState(initial.current?.model ?? '');
  const [fields, setFields] = useState<VizFields>(initial.current?.fields ?? {});
  const [options, setOptions] = useState<VizOptions>(initial.current?.options ?? {});
  const [palette, setPalette] = useState('vivid');
  const [dateRange, setDateRange] = useState<VizDateRange>({});
  const [forecastUntil, setForecastUntil] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [presetId, setPresetId] = useState('');
  // The steps panel can be hidden so the results get the whole width (remembered per browser).
  const [stepsHidden, setStepsHidden] = useState(() => {
    try {
      return localStorage.getItem(STEPS_HIDDEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleSteps = () =>
    setStepsHidden((hidden) => {
      try {
        localStorage.setItem(STEPS_HIDDEN_KEY, hidden ? '0' : '1');
      } catch {
        // storage unavailable: the choice lasts for this visit
      }
      return !hidden;
    });
  const presets = useQuery({
    queryKey: ['visualize', 'prediction-presets', datasetId],
    queryFn: () => visualize.listPredictionPresets(datasetId),
    enabled: !!datasetId,
  });
  const deletePreset = useMutation({
    mutationFn: (id: string) => visualize.deletePredictionPreset(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['visualize', 'prediction-presets'] }),
  });
  const profiles = useMemo(() => dataset?.profile.columnProfiles ?? [], [dataset]);
  const task = catalog?.predictionTasks.find((entry) => entry.id === taskId);
  const text = useCatalogText();
  const taskName = task ? text.taskName(task) : undefined;

  useEffect(() => {
    if (!predictDraft) return;
    clearPredictDraft();
    if (predictDraft === initial.current) return;
    setTaskId(predictDraft.task);
    setModel(predictDraft.model ?? '');
    setFields(predictDraft.fields ?? {});
    setOptions(predictDraft.options ?? {});
  }, [predictDraft, clearPredictDraft]);
  useEffect(() => {
    setAssistantContext({ page: 'predict', fields, options, title: taskName });
  }, [fields, options, taskName, setAssistantContext]);

  type RunInput = { task: string; model: string; fields: VizFields; options: VizOptions; dateRange: VizDateRange; forecastUntil: string };
  const run = useMutation({
    mutationFn: (input?: RunInput) => {
      const chosen = input ?? { task: taskId, model, fields, options, dateRange, forecastUntil };
      const entry = catalog?.predictionTasks.find((item) => item.id === chosen.task);
      return visualize.predict({
        datasetId,
        task: chosen.task,
        model: chosen.model || entry?.models[0]?.[0],
        fields: chosen.fields,
        options: chosen.options,
        style: { palette, theme: resolvedTheme === 'dark' ? 'dark' : 'light' },
        ...(chosen.dateRange.from || chosen.dateRange.to ? { dateRange: chosen.dateRange } : {}),
        ...(chosen.task === 'forecast' && chosen.forecastUntil ? { forecastUntil: chosen.forecastUntil } : {}),
      });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['billing'] }),
  });

  if (!catalog) return null;
  const missing = missingSlots(task, fields);
  /** What a result chart pins as: a forecast stays live (a line with a forecast line, it follows
   *  slicers); other results are dated snapshots of the chart. */
  const pinFor = (index: number): PinnableVisual => {
    const chart = run.data!.charts[index]!;
    if (run.data!.task === 'forecast' && index === 0 && typeof fields.date === 'string' && typeof fields.target === 'string') {
      const grain = typeof options.time_grain === 'string' && options.time_grain !== 'auto' ? options.time_grain : 'month';
      return {
        type: 'line',
        data: { datasetId, wells: { category: [{ field: fields.date, grain: grain as 'month' }], values: [{ field: fields.target, agg: typeof options.aggregation === 'string' ? options.aggregation : 'sum' }] } },
        format: { analytics: { lines: [{ kind: 'forecast', horizon: Math.min(Number(options.horizon ?? 6) || 6, 24) }] } },
        layout: { w: 12, h: 10 },
      };
    }
    return { type: 'snapshot', data: { datasetId, wells: {} }, format: { snapshot: { option: chart.option, takenAt: new Date().toISOString(), source: `${taskName ?? t('visualize.predict.prediction')} · ${dataset?.name ?? ''}` } }, layout: { w: 12, h: 10 } };
  };
  const positiveChoices = profiles.find((entry) => entry.name === fields.target)?.topValues?.map((value) => value.value) ?? [];

  function chooseTask(id: string) {
    setTaskId(id);
    setModel('');
    setFields({});
    setOptions({});
    setDateRange({});
    setForecastUntil('');
    setPresetId('');
    run.reset();
    setTab('data');
  }

  /** A saved custom prediction: fills every step, and runs it when asked. */
  function applyPreset(preset: PredictionPreset, runNow: boolean, until = '') {
    const input = { task: preset.task, model: preset.model, fields: preset.fields, options: preset.options ?? {}, dateRange: preset.dateRange ?? {}, forecastUntil: until };
    setTaskId(input.task);
    setModel(input.model);
    setFields(input.fields);
    setOptions(input.options);
    setDateRange(input.dateRange);
    setForecastUntil(until);
    setPresetId(preset.id);
    run.reset();
    if (runNow) run.mutate(input);
    else setTab('run');
  }
  const hasDateSlot = !!task?.slots.some((slot) => slot.kind === 'datetime');
  const dateProfile = profiles.find((profile) => profile.name === fields.date);

  return (
    <div className="space-y-4" data-testid="visualize-predict">
      <div className={`predict-layout${stepsHidden ? ' steps-hidden' : ''}`}>
        <aside className="predict-wizard" aria-label={t('visualize.predict.steps')} data-testid="predict-ribbon" hidden={stepsHidden}>
          <button type="button" className="viz-chip self-end" onClick={toggleSteps} data-testid="hide-steps">
            <PanelLeftClose size={13} aria-hidden /> {t('visualize.predict.hideSteps')}
          </button>
          <WizardStep number={1} title={t('visualize.predict.taskTab')} summary={taskName} open={tab === 'task'} done={!!task} onOpen={() => setTab('task')} testId="step-task">
            <p className="viz-label m-0">{t('visualize.predict.suggestions')}</p>
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={t('visualize.predict.task')}>
              {catalog.predictionTasks.map((entry) => {
                const style = TASK_STYLE[entry.id] ?? { icon: BrainCircuit, color: '#6366f1' };
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="radio"
                    aria-checked={entry.id === taskId}
                    aria-pressed={entry.id === taskId}
                    className="predict-task"
                    style={colorVar(style.color)}
                    title={text.taskDescription(entry)}
                    onClick={() => chooseTask(entry.id)}
                    data-testid={`task-${entry.id}`}
                  >
                    <style.icon size={18} aria-hidden />
                    <span>{text.taskName(entry)}</span>
                  </button>
                );
              })}
            </div>
            <div className="predict-custom" data-testid="custom-predictions">
              <p className="viz-label m-0">{t('visualize.predict.custom.yours')}</p>
              {(presets.data ?? []).map((preset) => (
                <div key={preset.id} className={`predict-preset${preset.id === presetId ? ' active' : ''}`}>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => applyPreset(preset, false)} title={preset.description} data-testid={`preset-${preset.id}`}>
                    <Sparkles size={13} aria-hidden className="mr-1 inline text-violet-500" />
                    <span className="truncate">{preset.name}</span>
                  </button>
                  <button type="button" className="predict-preset-remove" onClick={() => deletePreset.mutate(preset.id)} aria-label={t('visualize.predict.custom.remove', { name: preset.name })}>
                    <Trash2 size={12} aria-hidden />
                  </button>
                </div>
              ))}
              {!presets.data?.length && <p className="text-[11px] text-muted-foreground">{t('visualize.predict.custom.none')}</p>}
              <button type="button" className="viz-chip primary w-full justify-center" onClick={() => setCustomOpen(true)} disabled={!profiles.length} data-testid="custom-create">
                <Plus size={13} aria-hidden /> {t('visualize.predict.custom.create')}
              </button>
            </div>
          </WizardStep>
          <WizardStep number={2} title={t('visualize.predict.dataTab')} summary={missing.length ? t('visualize.predict.toChoose', { count: missing.length }) : dataset?.name} open={tab === 'data'} done={!missing.length} onOpen={() => setTab('data')} testId="step-data">
            {task && (
              <div className="space-y-2">
                <label className="block text-xs">
                  <span className="viz-label">{t('visualize.predict.dataset')}</span>
                  <select className="viz-field" value={datasetId} onChange={(event) => setDatasetId(event.target.value)} aria-label={t('visualize.predict.dataset')} data-testid="dataset-picker">
                    {datasets.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                {task.slots.map((slot) => (
                  <SlotControl
                    key={`${task.id}-${slot.key}`}
                    slot={slot}
                    owner={{ kind: 'task', id: task.id }}
                    profiles={profiles}
                    value={fields[slot.key]}
                    onChange={(value) =>
                      setFields((current) => {
                        const next = { ...current };
                        if (value === undefined || (Array.isArray(value) && !value.length)) delete next[slot.key];
                        else next[slot.key] = value;
                        return next;
                      })
                    }
                  />
                ))}
                <DateRangePicker profiles={profiles} column={hasDateSlot && typeof fields.date === 'string' ? fields.date : undefined} value={dateRange} onChange={setDateRange} />
              </div>
            )}
          </WizardStep>
          <WizardStep number={3} title={t('visualize.predict.settingsTab')} summary={(() => {
              const chosen = task?.models.find(([id]) => id === (model || task.models[0]?.[0]));
              return task && chosen ? text.modelName(task.id, chosen) : undefined;
            })()} open={tab === 'settings'} done={!missing.length} onOpen={() => setTab('settings')} testId="step-settings">
            {task && (
              <div className="space-y-2">
                <label className="block text-xs">
                  <span className="viz-label">{t('visualize.predict.model')}</span>
                  <select className="viz-field" value={model || task.models[0]?.[0]} onChange={(event) => setModel(event.target.value)} aria-label={t('visualize.predict.model')} data-testid="predict-model">
                    {task.models.map(([id, name]) => (
                      <option key={id} value={id}>
                        {text.modelName(task.id, [id, name])}
                      </option>
                    ))}
                  </select>
                </label>
                {task.id === 'forecast' && <ForecastUntilPicker profile={dateProfile} value={forecastUntil} onChange={setForecastUntil} />}
                {task.options.map((option) => (
                  <OptionControl key={`${task.id}-${option.key}`} option={option} owner={{ kind: 'task', id: task.id }} value={options[option.key]} positiveClasses={positiveChoices} onChange={(value) => setOptions((current) => ({ ...current, [option.key]: value }))} />
                ))}
                <label className="block text-xs">
                  <span className="viz-label">{t('visualize.predict.chartColours')}</span>
                  <select className="viz-field" value={palette} onChange={(event) => setPalette(event.target.value)} aria-label={t('visualize.predict.palette')}>
                    {catalog.palettes.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {text.paletteName(entry)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </WizardStep>
          <WizardStep number={4} title={t('visualize.predict.runTab')} open={tab === 'run' || (!missing.length && tab !== 'task' && tab !== 'data' && tab !== 'settings')} done={!!run.data} onOpen={() => setTab('run')} testId="step-run">
            {task && (
              <div className="space-y-2">
                <ul className="flex flex-wrap gap-1 text-xs">
                  {task.outputs.map((output, index) => (
                    <li key={output} className="viz-badge" style={colorVar(TASK_STYLE[task.id]?.color)}>
                      {text.taskOutput(task.id, index, output)}
                    </li>
                  ))}
                </ul>
                {missing.length > 0 && <p className="text-xs text-amber-600">{t('visualize.predict.chooseInStep2', { fields: missing.map((slot) => text.slotLabel(slot, { kind: 'task', id: task.id })).join(', ') })}</p>}
                <Button className="viz-primary w-full gap-1.5" disabled={!datasetId || missing.length > 0 || run.isPending} onClick={() => run.mutate(undefined)} data-testid="run-prediction">
                  {run.isPending ? <RefreshCw size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />} {t('visualize.predict.run')}
                </Button>
                <p className="text-[11px] text-muted-foreground">{t('visualize.predict.creditsNote')}</p>
              </div>
            )}
          </WizardStep>
        </aside>
        <section className="min-w-0 space-y-4">
          {stepsHidden && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="viz-chip" onClick={toggleSteps} data-testid="show-steps">
                <PanelLeftOpen size={13} aria-hidden /> {t('visualize.predict.showSteps')}
              </button>
              <span className="text-xs text-muted-foreground">
                {taskName}
                {dataset ? ` · ${dataset.name}` : ''}
              </span>
              {(dateRange.from || dateRange.to) && (
                <span className="viz-badge">
                  {dateRange.from ?? '…'} → {dateRange.to ?? '…'}
                  <button type="button" className="ml-1" onClick={() => setDateRange({})} aria-label={t('visualize.predict.allDates')}>
                    <X size={10} aria-hidden />
                  </button>
                </span>
              )}
            </div>
          )}
          {!run.data && !run.isPending && (
            <div className="viz-card viz-card-pad flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground" data-testid="predict-empty">
              <BrainCircuit size={26} aria-hidden />
              {missing.length
                ? t('visualize.predict.empty')
                : t('visualize.predict.ready', { task: taskName ?? '', name: dataset?.name ?? '' })}
              {!missing.length && (
                <Button size="sm" className="viz-primary gap-1.5" onClick={() => run.mutate(undefined)} disabled={!datasetId} data-testid="run-prediction-inline">
                  <Play size={14} aria-hidden /> {t('visualize.predict.runNow')}
                </Button>
              )}
            </div>
          )}
      <ErrorNote error={run.error} />
      {run.isPending && (
        <div className="viz-card viz-card-pad flex items-center gap-3 text-sm text-muted-foreground">
          <BrainCircuit className="animate-pulse text-violet-500" aria-hidden />
          {t('visualize.predict.training')}
        </div>
      )}
          {run.data && <Results result={run.data} datasetName={dataset?.name ?? t('visualize.predict.datasetWord')} pinFor={pinFor} />}
          <CustomPredictionDialog open={customOpen} onClose={() => setCustomOpen(false)} profiles={profiles} datasetId={datasetId} onCreated={(preset, runNow, until) => applyPreset(preset, runNow, until)} />
        </section>
      </div>
    </div>
  );
}

function WizardStep({ number, title, summary, open, done, onOpen, testId, children }: { number: number; title: string; summary?: string; open: boolean; done: boolean; onOpen: () => void; testId: string; children: ReactNode }) {
  return (
    <section className={`predict-step${open ? ' open' : ''}${done ? ' done' : ''}`} data-testid={testId}>
      <button type="button" className="predict-step-head" aria-expanded={open} onClick={onOpen} data-testid={`ribbon-${testId.replace('step-', '')}`}>
        <span className="predict-step-number">{done && !open ? <Check size={12} aria-hidden /> : number}</span>
        <span className="flex-1 text-left">{title}</span>
        {!open && summary && <span className="truncate text-xs text-muted-foreground">{summary}</span>}
      </button>
      {open && <div className="predict-step-body">{children}</div>}
    </section>
  );
}
