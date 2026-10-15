import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, BrainCircuit, Check, Database, Download, FileSpreadsheet, Layers, LineChart, Pin, Play, RefreshCw, Save, Shapes, Table2, Target, TrendingUp } from 'lucide-react';
import { useRepository, type VizFields, type VizOptions, type VizPrediction } from '@/lib/data';
import { useTheme } from '@/lib/theme';
import { Button } from '@/shared/components';
import { missingSlots, OptionControl, SlotControl } from '../controls';
import { useVisualize } from '../context';
import { EChart } from '../EChart';
import { saveBlob, safeName } from '../echarts';
import { PinDialog, type PinnableVisual } from '../dashboards/PinDialog';
import { colorVar, DataTableModal, ErrorNote, Explanation, formatValue, QualityBadge, SectionTitle } from '../ui';

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
      setNotice(t('visualize.predict.savedDataset', 'Saved as “{{name}}”.', { name: dataset.name }));
    },
  });
  const saveChart = useMutation({
    mutationFn: (index: number) => visualize.saveChart({ resultId: result.resultId, chartIndex: index }),
    onSuccess: (chart) => {
      setNotice(t('visualize.predict.savedChart', 'Saved chart “{{title}}”. Add it to a report from Reports.', { title: chart.title }));
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
            {result.modelName} <span className="text-sm font-normal text-muted-foreground">· {result.resultRows.toLocaleString()} rows scored</span>
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
              title="Predictions, findings and every chart drawn as an editable Excel chart beside its values"
              data-testid="prediction-excel"
            >
              <FileSpreadsheet size={14} aria-hidden /> Excel + charts
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => download.mutate({ type: 'xlsx', graphs: false })}
              isLoading={download.isPending && download.variables?.type === 'xlsx' && !download.variables.graphs}
              title="The same workbook with values only"
            >
              <FileSpreadsheet size={14} aria-hidden /> Excel values
            </Button>
            <Button size="sm" className="viz-primary gap-1.5" onClick={() => saveDataset.mutate()} isLoading={saveDataset.isPending}>
              <Database size={14} aria-hidden /> {t('visualize.predict.saveDataset', 'Save as dataset')}
            </Button>
          </div>
        </div>
        {result.summary[0] && <p className="text-sm">{result.summary[0]}</p>}
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
                  <Table2 size={12} aria-hidden /> View data
                </button>
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => saveChart.mutate(index)} isLoading={saveChart.isPending && saveChart.variables === index}>
                  <Save size={14} aria-hidden /> {t('visualize.predict.saveChart', 'Save')}
                </Button>
                <button type="button" className="viz-chip primary" onClick={() => setPinning(index)} data-testid={`prediction-pin-${chart.id}`}>
                  <Pin size={12} aria-hidden /> {t('visualize.predict.pin', 'Pin to dashboard')}
                </button>
              </div>
            </div>
            <EChart option={chart.option} height={380} testId={`prediction-chart-${chart.id}`} />
          </div>
        ))}
      </div>

      <details className="viz-card viz-card-pad viz-how" data-testid="prediction-how">
        <summary className="cursor-pointer text-sm font-semibold">{t('visualize.predict.how', 'How this was calculated')}</summary>
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
        {result.charts.map((chart) => (
          <div key={chart.id} className="mt-3">
            <p className="text-sm font-semibold">{chart.title}</p>
            <Explanation explanation={chart.explanation} compact />
          </div>
        ))}
        {result.comparison.length > 1 && (
          <div className="mt-3">
            <SectionTitle title={t('visualize.predict.comparison', 'Models compared')} subtitle={t('visualize.predict.comparisonHint', 'Cross-validated score; higher is better.')} />
            <ul className="space-y-1.5">
              {[...result.comparison]
                .sort((a, b) => b.score - a.score)
                .map((item) => (
                  <li key={item.model} className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-sm">
                    <span className={item.model === result.model ? 'font-semibold' : ''}>{item.name}</span>
                    <span className="font-mono text-xs">{item.score.toFixed(4)}</span>
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
  const profiles = useMemo(() => dataset?.profile.columnProfiles ?? [], [dataset]);
  const task = catalog?.predictionTasks.find((entry) => entry.id === taskId);

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
    setAssistantContext({ page: 'predict', fields, options, title: task?.name });
  }, [fields, options, task?.name, setAssistantContext]);

  const run = useMutation({
    mutationFn: () =>
      visualize.predict({
        datasetId,
        task: taskId,
        model: model || task?.models[0]?.[0],
        fields,
        options,
        style: { palette, theme: resolvedTheme === 'dark' ? 'dark' : 'light' },
      }),
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
    return { type: 'snapshot', data: { datasetId, wells: {} }, format: { snapshot: { option: chart.option, takenAt: new Date().toISOString(), source: `${task?.name ?? 'Prediction'} · ${dataset?.name ?? ''}` } }, layout: { w: 12, h: 10 } };
  };
  const positiveChoices = profiles.find((entry) => entry.name === fields.target)?.topValues?.map((value) => value.value) ?? [];

  function chooseTask(id: string) {
    setTaskId(id);
    setModel('');
    setFields({});
    setOptions({});
    run.reset();
    setTab('data');
  }

  return (
    <div className="space-y-4" data-testid="visualize-predict">
      <div className="predict-layout">
        <aside className="predict-wizard" aria-label="Prediction steps" data-testid="predict-ribbon">
          <WizardStep number={1} title={t('visualize.predict.taskTab', 'Prediction type')} summary={task?.name} open={tab === 'task'} done={!!task} onOpen={() => setTab('task')} testId="step-task">
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={t('visualize.predict.task', 'Prediction type')}>
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
                    title={entry.description}
                    onClick={() => chooseTask(entry.id)}
                    data-testid={`task-${entry.id}`}
                  >
                    <style.icon size={18} aria-hidden />
                    <span>{entry.name}</span>
                  </button>
                );
              })}
            </div>
          </WizardStep>
          <WizardStep number={2} title={t('visualize.predict.dataTab', 'Data and target')} summary={missing.length ? `${missing.length} to choose` : dataset?.name} open={tab === 'data'} done={!missing.length} onOpen={() => setTab('data')} testId="step-data">
            {task && (
              <div className="space-y-2">
                <label className="block text-xs">
                  <span className="viz-label">Dataset</span>
                  <select className="viz-field" value={datasetId} onChange={(event) => setDatasetId(event.target.value)} aria-label="Dataset" data-testid="dataset-picker">
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
              </div>
            )}
          </WizardStep>
          <WizardStep number={3} title={t('visualize.predict.settingsTab', 'Settings')} summary={task?.models.find(([id]) => id === (model || task.models[0]?.[0]))?.[1]} open={tab === 'settings'} done={!missing.length} onOpen={() => setTab('settings')} testId="step-settings">
            {task && (
              <div className="space-y-2">
                <label className="block text-xs">
                  <span className="viz-label">{t('visualize.predict.model', 'Model')}</span>
                  <select className="viz-field" value={model || task.models[0]?.[0]} onChange={(event) => setModel(event.target.value)} aria-label={t('visualize.predict.model', 'Model')} data-testid="predict-model">
                    {task.models.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                {task.options.map((option) => (
                  <OptionControl key={`${task.id}-${option.key}`} option={option} value={options[option.key]} positiveClasses={positiveChoices} onChange={(value) => setOptions((current) => ({ ...current, [option.key]: value }))} />
                ))}
                <label className="block text-xs">
                  <span className="viz-label">Chart colours</span>
                  <select className="viz-field" value={palette} onChange={(event) => setPalette(event.target.value)} aria-label="Palette">
                    {catalog.palettes.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </WizardStep>
          <WizardStep number={4} title={t('visualize.predict.runTab', 'Run')} open={tab === 'run' || (!missing.length && tab !== 'task' && tab !== 'data' && tab !== 'settings')} done={!!run.data} onOpen={() => setTab('run')} testId="step-run">
            {task && (
              <div className="space-y-2">
                <ul className="flex flex-wrap gap-1 text-xs">
                  {task.outputs.map((output) => (
                    <li key={output} className="viz-badge" style={colorVar(TASK_STYLE[task.id]?.color)}>
                      {output}
                    </li>
                  ))}
                </ul>
                {missing.length > 0 && <p className="text-xs text-amber-600">Choose {missing.map((slot) => slot.label).join(', ')} in step 2.</p>}
                <Button className="viz-primary w-full gap-1.5" disabled={!datasetId || missing.length > 0 || run.isPending} onClick={() => run.mutate()} data-testid="run-prediction">
                  {run.isPending ? <RefreshCw size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />} {t('visualize.predict.run', 'Run')}
                </Button>
                <p className="text-[11px] text-muted-foreground">Uses analysis credits; failed runs are free.</p>
              </div>
            )}
          </WizardStep>
        </aside>
        <section className="min-w-0 space-y-4">
          {!run.data && !run.isPending && (
            <div className="viz-card viz-card-pad flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground" data-testid="predict-empty">
              <BrainCircuit size={26} aria-hidden />
              {missing.length
                ? t('visualize.predict.empty', 'Choose what to predict and the columns on the left; results appear here.')
                : t('visualize.predict.ready', 'Ready: {{task}} on {{name}}. Press Run.', { task: task?.name ?? '', name: dataset?.name ?? '' })}
              {!missing.length && (
                <Button size="sm" className="viz-primary gap-1.5" onClick={() => run.mutate()} disabled={!datasetId} data-testid="run-prediction-inline">
                  <Play size={14} aria-hidden /> Run now
                </Button>
              )}
            </div>
          )}
      <ErrorNote error={run.error} />
      {run.isPending && (
        <div className="viz-card viz-card-pad flex items-center gap-3 text-sm text-muted-foreground">
          <BrainCircuit className="animate-pulse text-violet-500" aria-hidden />
          {t('visualize.predict.training', 'Training and validating models… this can take up to a minute for large data.')}
        </div>
      )}
          {run.data && <Results result={run.data} datasetName={dataset?.name ?? 'dataset'} pinFor={pinFor} />}
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
