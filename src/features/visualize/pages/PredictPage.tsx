import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, BrainCircuit, Database, Download, FileSpreadsheet, Layers, LineChart, Play, RefreshCw, Save, Shapes, SlidersHorizontal, Table2, Target, TrendingUp, X } from 'lucide-react';
import { useRepository, type VizFields, type VizOptions, type VizPrediction } from '@/lib/data';
import { useTheme } from '@/lib/theme';
import { Button } from '@/shared/components';
import { missingSlots, OptionControl, SlotControl } from '../controls';
import { useVisualize } from '../context';
import { EChart } from '../EChart';
import { saveBlob, safeName } from '../echarts';
import { Ribbon, RibbonField, RibbonGroup } from '../Ribbon';
import { colorVar, DataTableModal, ErrorNote, Explanation, formatValue, humanize, QualityBadge, SectionTitle } from '../ui';

const TASK_STYLE: Record<string, { icon: typeof TrendingUp; color: string }> = {
  forecast: { icon: TrendingUp, color: '#0ea5e9' },
  regression: { icon: Activity, color: '#6366f1' },
  classification: { icon: Shapes, color: '#ec4899' },
  clustering: { icon: Layers, color: '#10b981' },
  anomaly: { icon: AlertTriangle, color: '#f59e0b' },
  trend: { icon: LineChart, color: '#14b8a6' },
  drivers: { icon: Target, color: '#8b5cf6' },
};

function Results({ result, datasetName }: { result: VizPrediction; datasetName: string }) {
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
  const columns = result.table.columns;
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
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {result.summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {result.notes.map((note) => (
          <p key={note} className="text-xs text-muted-foreground">
            ℹ {note}
          </p>
        ))}
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
              <div className="flex gap-1">
                <button type="button" className="viz-chip" onClick={() => setTableIndex(index)} data-testid={`prediction-data-${chart.id}`}>
                  <Table2 size={12} aria-hidden /> View data
                </button>
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => saveChart.mutate(index)} isLoading={saveChart.isPending && saveChart.variables === index}>
                  <Save size={14} aria-hidden /> {t('visualize.predict.saveChart', 'Save')}
                </Button>
              </div>
            </div>
            <Explanation explanation={chart.explanation} compact />
            <EChart option={chart.option} height={420} testId={`prediction-chart-${chart.id}`} />
          </div>
        ))}
      </div>

      {result.comparison.length > 1 && (
        <div className="viz-card viz-card-pad">
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

      <div className="viz-card viz-card-pad">
        <SectionTitle title={t('visualize.predict.table', 'Results table')} subtitle={t('visualize.predict.tableHint', 'First rows; download the CSV for all of them.')} />
        <div className="viz-scroll">
          <table className="viz-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column} title={column}>
                    {humanize(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.table.rows.slice(0, 100).map((row, index) => (
                <tr key={index}>
                  {columns.map((column) => (
                    <td key={column}>{formatValue(row[column])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
  const [showData, setShowData] = useState(true);
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

  const preview = useQuery({
    queryKey: ['visualize', 'preview', datasetId, dataset?.updatedAt, 0, false, ''],
    queryFn: () => visualize.preview(datasetId, 0, 8),
    enabled: !!datasetId && showData,
  });
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
      <Ribbon
        testId="predict-ribbon"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'task', label: t('visualize.predict.taskTab', 'Prediction type'), icon: BrainCircuit },
          { id: 'data', label: t('visualize.predict.dataTab', 'Data & model'), icon: Database },
          { id: 'settings', label: t('visualize.predict.settingsTab', 'Settings'), icon: SlidersHorizontal },
          { id: 'run', label: t('visualize.predict.runTab', 'Run & export'), icon: Play },
        ]}
        aside={task ? <span className="viz-badge" style={colorVar(TASK_STYLE[task.id]?.color)}>{task.name}</span> : null}
      >
        {tab === 'task' && (
          <RibbonGroup title="What do you want to predict or understand?" grow>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('visualize.predict.task', 'Prediction type')}>
              {catalog.predictionTasks.map((entry) => {
                const style = TASK_STYLE[entry.id] ?? { icon: BrainCircuit, color: '#6366f1' };
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="radio"
                    aria-checked={entry.id === taskId}
                    aria-pressed={entry.id === taskId}
                    className="viz-tool w-[132px]"
                    style={colorVar(style.color)}
                    title={entry.description}
                    onClick={() => chooseTask(entry.id)}
                    data-testid={`task-${entry.id}`}
                  >
                    <style.icon size={20} aria-hidden />
                    <span className="text-center leading-tight">{entry.name}</span>
                  </button>
                );
              })}
            </div>
          </RibbonGroup>
        )}
        {tab === 'data' && task && (
          <>
            <RibbonGroup title="Data">
              <RibbonField label="Dataset" width={200}>
                <select className="viz-field" value={datasetId} onChange={(event) => setDatasetId(event.target.value)} aria-label="Dataset" data-testid="dataset-picker">
                  {datasets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </RibbonField>
            </RibbonGroup>
            <RibbonGroup title="Model">
              <RibbonField label="Method" width={240}>
                <select className="viz-field" value={model || task.models[0]?.[0]} onChange={(event) => setModel(event.target.value)} aria-label={t('visualize.predict.model', 'Model')} data-testid="predict-model">
                  {task.models.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </RibbonField>
            </RibbonGroup>
            <RibbonGroup title="Columns" grow>
              <div className="flex flex-wrap items-end gap-2">
                {task.slots.map((slot) => (
                  <div key={`${task.id}-${slot.key}`} style={{ minWidth: slot.multiple ? 260 : 170, maxWidth: slot.multiple ? 440 : 220 }}>
                    <SlotControl
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
                  </div>
                ))}
              </div>
            </RibbonGroup>
          </>
        )}
        {tab === 'settings' && task && (
          <>
            <RibbonGroup title={`${task.name} settings`} grow>
              <div className="flex flex-wrap items-end gap-3">
                {task.options.map((option) => (
                  <div key={`${task.id}-${option.key}`} style={{ minWidth: 170 }}>
                    <OptionControl option={option} value={options[option.key]} positiveClasses={positiveChoices} onChange={(value) => setOptions((current) => ({ ...current, [option.key]: value }))} />
                  </div>
                ))}
                {!task.options.length && <span className="text-sm text-muted-foreground">No extra settings.</span>}
              </div>
            </RibbonGroup>
            <RibbonGroup title="Chart colours">
              <RibbonField label="Palette" width={190}>
                <select className="viz-field" value={palette} onChange={(event) => setPalette(event.target.value)} aria-label="Palette">
                  {catalog.palettes.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </RibbonField>
            </RibbonGroup>
          </>
        )}
        {tab === 'run' && task && (
          <>
            <RibbonGroup title="Run">
              <button type="button" className="viz-tool" style={colorVar('#10b981')} disabled={!datasetId || missing.length > 0 || run.isPending} onClick={() => run.mutate()} data-testid="run-prediction">
                {run.isPending ? <RefreshCw size={20} className="animate-spin" aria-hidden /> : <Play size={20} aria-hidden />} Run
              </button>
            </RibbonGroup>
            <RibbonGroup title="You will get" grow>
              <ul className="flex flex-wrap gap-1.5 text-xs">
                {task.outputs.map((output) => (
                  <li key={output} className="viz-badge" style={colorVar(TASK_STYLE[task.id]?.color)}>
                    {output}
                  </li>
                ))}
              </ul>
              <span className="text-[11px] text-muted-foreground">Uses analysis credits; failed runs are free. Downloads and saving appear with the results.</span>
            </RibbonGroup>
          </>
        )}
      </Ribbon>

      {missing.length > 0 && (
        <p className="rounded-xl bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
          Choose in “Data & model”: {missing.map((slot) => slot.label).join(', ')} — then press Run in “Run & export”.
          <button type="button" className="ml-2 font-semibold underline" onClick={() => setTab('data')}>
            Go there
          </button>
        </p>
      )}
      {!missing.length && !run.data && !run.isPending && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-[var(--card)] px-4 py-3 text-sm">
          <span>Ready: {task?.name} on <b>{dataset?.name}</b>.</span>
          <Button size="sm" className="viz-primary gap-1.5" onClick={() => run.mutate()} disabled={!datasetId} data-testid="run-prediction-inline">
            <Play size={14} aria-hidden /> Run now
          </Button>
        </div>
      )}

      {showData && dataset && (
        <section className="viz-card viz-card-pad" data-testid="predict-data-strip">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              <b className="text-foreground">{dataset.name}</b> · {(dataset.rowCount ?? 0).toLocaleString()} rows · first rows shown
            </span>
            <button type="button" className="hover:text-foreground" onClick={() => setShowData(false)} aria-label="Hide data">
              <X size={14} />
            </button>
          </div>
          <div className="viz-scroll" style={{ maxHeight: 180 }}>
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

      <ErrorNote error={run.error} />
      {run.isPending && (
        <div className="viz-card viz-card-pad flex items-center gap-3 text-sm text-muted-foreground">
          <BrainCircuit className="animate-pulse text-violet-500" aria-hidden />
          {t('visualize.predict.training', 'Training and validating models… this can take up to a minute for large data.')}
        </div>
      )}
      {run.data && <Results result={run.data} datasetName={dataset?.name ?? 'dataset'} />}
    </div>
  );
}
