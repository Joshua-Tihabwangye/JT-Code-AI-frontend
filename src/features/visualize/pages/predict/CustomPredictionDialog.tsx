import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Cpu, Play, Save } from 'lucide-react';
import { formatNumber } from '@/i18n/format';
import { apiErrorMessage } from '@/lib/api/http';
import { useRepository, type PredictionPreset, type VizDateRange, type VizFields, type VizGoalReason, type VizPredictionOptions } from '@/lib/data';
import { Alert, Button, Input, Modal, Spinner } from '@/shared/components';
import { useVisualize } from '../../context';

/** What the user wants the prediction to do; the method follows from it. */
type Goal = keyof VizPredictionOptions['columns'][number]['goals'];
const GOALS: Goal[] = ['forecast', 'estimate', 'classify', 'drivers', 'anomaly', 'segments'];
const TASK_FOR: Record<Goal, string> = {
  forecast: 'forecast',
  estimate: 'regression',
  classify: 'classification',
  drivers: 'drivers',
  anomaly: 'anomaly',
  segments: 'clustering',
};

/**
 * "Create your own prediction". The layout never changes; every choice in it (columns, what each
 * column can be predicted with, sensible inputs, date columns and their first/last dates) is read
 * from the selected dataset by Python (pandas) on the server.
 */
export function CustomPredictionDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (preset: PredictionPreset, run: boolean, forecastUntil: string) => void }) {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const { datasets, datasetId: currentDataset, setDatasetId, catalog } = useVisualize();
  const [datasetId, setFormDataset] = useState(currentDataset);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [goal, setGoal] = useState<Goal | ''>('');
  const [inputs, setInputs] = useState<string[] | null>(null);
  const [dateColumn, setDateColumn] = useState('');
  const [range, setRange] = useState<VizDateRange>({});
  const [until, setUntil] = useState('');

  useEffect(() => {
    if (open) setFormDataset(currentDataset);
  }, [open, currentDataset]);
  // Another dataset means other columns: start the choices again.
  useEffect(() => {
    setTarget('');
    setGoal('');
    setInputs(null);
    setDateColumn('');
    setRange({});
    setUntil('');
  }, [datasetId]);

  const options = useQuery({
    queryKey: ['visualize', 'prediction-options', datasetId],
    queryFn: () => visualize.predictionOptions(datasetId),
    enabled: open && !!datasetId,
  });
  const columns = options.data?.columns ?? [];
  const dates = options.data?.dateColumns ?? [];
  const column = columns.find((entry) => entry.name === target);
  const possible = (entry: Goal): boolean => column?.goals[entry] === '';
  const chosenGoal: Goal | '' = goal && possible(goal) ? goal : (GOALS.find(possible) ?? '');
  const inputColumns = columns.filter((entry) => entry.name !== target && entry.kind !== 'datetime');
  const learnFrom = inputs ?? inputColumns.filter((entry) => entry.input).map((entry) => entry.name);
  const date = dateColumn || dates[0]?.name || '';
  const dateInfo = dates.find((entry) => entry.name === date);
  const rangeColumn = chosenGoal === 'forecast' ? dateInfo : (dates.find((entry) => entry.name === range.column) ?? dates[0]);
  const horizon = Number(catalog?.predictionTasks.find((task) => task.id === 'forecast')?.options.find((option) => option.key === 'horizon')?.default ?? 12);

  const fields = useMemo((): VizFields => {
    if (!target || !chosenGoal) return {};
    if (chosenGoal === 'forecast') return { date, target };
    if (chosenGoal === 'anomaly' || chosenGoal === 'segments') return { features: [target, ...learnFrom.filter((entry) => entry !== target)] };
    return { target, features: learnFrom };
  }, [target, chosenGoal, date, learnFrom]);

  const save = useMutation({
    mutationFn: (run: boolean) =>
      visualize
        .savePredictionPreset({
          name: name.trim() || t('visualize.predict.custom.defaultName', { target }),
          description: chosenGoal ? t(`visualize.predict.custom.goals.${chosenGoal}`) : '',
          task: TASK_FOR[chosenGoal as Goal],
          fields,
          dateRange: range.from || range.to ? { ...range, column: rangeColumn?.name } : {},
          datasetId,
        })
        .then((preset) => ({ preset, run })),
    onSuccess: ({ preset, run }) => {
      void queryClient.invalidateQueries({ queryKey: ['visualize', 'prediction-presets'] });
      if (datasetId !== currentDataset) setDatasetId(datasetId);
      onCreated(preset, run, chosenGoal === 'forecast' ? until : '');
      onClose();
    },
  });

  const reason = (why: VizGoalReason) => t(`visualize.predict.custom.reasons.${why || 'none'}`);
  const kindWord = (kind: string) => t(`visualize.predict.custom.kinds.${kind}`, { defaultValue: kind });
  const ready = !!target && !!chosenGoal && (chosenGoal !== 'forecast' || !!date);

  return (
    <Modal isOpen={open} onClose={onClose} title={t('visualize.predict.custom.title')} description={t('visualize.predict.custom.description')} size="lg">
      <form className="space-y-4" data-testid="custom-prediction-form" autoComplete="off" onSubmit={(event) => event.preventDefault()}>
        {save.error && <Alert variant="destructive">{apiErrorMessage(save.error)}</Alert>}
        <Input label={t('visualize.predict.custom.name')} name="prediction-name" autoComplete="off" value={name} placeholder={t('visualize.predict.custom.namePlaceholder')} onChange={(event) => setName(event.target.value)} data-testid="custom-name" />

        <label className="block text-sm">
          <span className="viz-label">{t('visualize.predict.dataset')}</span>
          <select className="viz-field" value={datasetId} onChange={(event) => setFormDataset(event.target.value)} data-testid="custom-dataset">
            {datasets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        {options.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size="sm" /> {t('visualize.predict.custom.reading')}
          </div>
        )}
        {options.error && <Alert variant="destructive">{apiErrorMessage(options.error)}</Alert>}

        {options.data && (
          <>
            <p className="predict-read-note">
              <Cpu size={12} aria-hidden /> {t('visualize.predict.custom.readBy', { rows: formatNumber(options.data.rows), columns: formatNumber(columns.length) })}
            </p>
            <label className="block text-sm">
              <span className="viz-label">{t('visualize.predict.custom.target')}</span>
              <select className="viz-field" value={target} onChange={(event) => { setTarget(event.target.value); setGoal(''); setInputs(null); }} data-testid="custom-target">
                <option value="">{t('visualize.predict.custom.chooseColumn')}</option>
                {columns.map((entry) => {
                  const usable = GOALS.some((item) => entry.goals[item] === '');
                  return (
                    <option key={entry.name} value={entry.name} disabled={!usable}>
                      {entry.name} — {kindWord(entry.kind)}
                      {usable ? ` · ${t('visualize.predict.custom.distinct', { count: entry.distinct, n: formatNumber(entry.distinct) })}` : ` · ${reason(entry.goals.estimate)}`}
                    </option>
                  );
                })}
              </select>
            </label>

            <fieldset className="space-y-1.5">
              <legend className="viz-label">{t('visualize.predict.custom.goal')}</legend>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {GOALS.map((entry) => {
                  const available = !!column && possible(entry);
                  return (
                    <label key={entry} className={`predict-goal${chosenGoal === entry && available ? ' active' : ''}${available ? '' : ' disabled'}`}>
                      <input type="radio" name="goal" checked={available && chosenGoal === entry} disabled={!available} onChange={() => setGoal(entry)} data-testid={`custom-goal-${entry}`} />
                      <span>
                        <b className="block text-sm">{t(`visualize.predict.custom.goals.${entry}`)}</b>
                        <span className="text-xs text-muted-foreground">
                          {!column ? t('visualize.predict.custom.pickColumnFirst') : available ? t(`visualize.predict.custom.goalHints.${entry}`, { target }) : reason(column.goals[entry])}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {chosenGoal === 'forecast' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="viz-label">{t('visualize.predict.custom.dateColumn')}</span>
                  <select className="viz-field" value={date} onChange={(event) => setDateColumn(event.target.value)} data-testid="custom-date-column">
                    {dates.map((entry) => (
                      <option key={entry.name} value={entry.name}>
                        {entry.name} — {t('visualize.predict.custom.dateSpan', { first: entry.first, last: entry.last, periods: formatNumber(entry.periods), grain: t(`visualize.predict.custom.grains.${entry.grain}`) })}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="viz-label">
                    <CalendarRange size={12} aria-hidden className="mr-1 inline align-[-2px]" />
                    {t('visualize.predict.forecastUntil')}
                  </span>
                  <input type="date" className="viz-field" min={dateInfo?.last} value={until} onChange={(event) => setUntil(event.target.value)} data-testid="custom-until" />
                  <span className="text-[11px] text-muted-foreground">
                    {until ? t('visualize.predict.forecastUntilSet') : t('visualize.predict.custom.untilHint', { last: dateInfo?.last ?? '', periods: horizon, grain: t(`visualize.predict.custom.grainsPlural.${dateInfo?.grain ?? 'month'}`) })}
                  </span>
                </label>
              </div>
            )}

            {column && chosenGoal && chosenGoal !== 'forecast' && inputColumns.length > 0 && (
              <fieldset>
                <legend className="viz-label">{chosenGoal === 'anomaly' || chosenGoal === 'segments' ? t('visualize.predict.custom.alsoUse') : t('visualize.predict.custom.learnFrom')}</legend>
                <div className="predict-columns">
                  {inputColumns.map((entry) => (
                    <label key={entry.name} className="flex items-start gap-1.5 text-sm" title={entry.input ? '' : reason(entry.identifier ? 'identifier' : entry.constant ? 'constant' : entry.missing > 0.6 ? 'mostly_empty' : 'too_many_values')}>
                      <input type="checkbox" className="mt-1" checked={learnFrom.includes(entry.name)} onChange={(event) => setInputs(event.target.checked ? [...learnFrom, entry.name] : learnFrom.filter((item) => item !== entry.name))} />
                      <span className="min-w-0">
                        <span className="block truncate">{entry.name}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {kindWord(entry.kind)}
                          {entry.input ? '' : ` · ${t('visualize.predict.custom.notRecommended')}`}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {column && dates.length > 0 && rangeColumn && (
              <fieldset className="predict-dates" data-testid="custom-date-range">
                <legend className="viz-label">
                  <CalendarRange size={12} aria-hidden className="mr-1 inline align-[-2px]" />
                  {t('visualize.predict.dateRange')}
                </legend>
                {chosenGoal !== 'forecast' && dates.length > 1 && (
                  <select className="viz-field" value={rangeColumn.name} onChange={(event) => setRange({ column: event.target.value })} aria-label={t('visualize.predict.dateRangeColumn')}>
                    {dates.map((entry) => (
                      <option key={entry.name} value={entry.name}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="block text-xs">
                    <span className="text-muted-foreground">{t('visualize.predict.from')}</span>
                    <input type="date" className="viz-field" min={rangeColumn.first} max={range.to ?? rangeColumn.last} value={range.from ?? ''} onChange={(event) => setRange({ ...range, column: rangeColumn.name, from: event.target.value || undefined })} />
                  </label>
                  <label className="block text-xs">
                    <span className="text-muted-foreground">{t('visualize.predict.to')}</span>
                    <input type="date" className="viz-field" min={range.from ?? rangeColumn.first} max={rangeColumn.last} value={range.to ?? ''} onChange={(event) => setRange({ ...range, column: rangeColumn.name, to: event.target.value || undefined })} />
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground">{t('visualize.predict.dateRangeHint', { min: rangeColumn.first, max: rangeColumn.last })}</p>
              </fieldset>
            )}
          </>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" variant="outline" className="gap-1.5" disabled={!ready || save.isPending} onClick={() => save.mutate(false)} data-testid="custom-save">
            <Save size={14} aria-hidden /> {t('visualize.predict.custom.save')}
          </Button>
          <Button type="button" className="viz-primary gap-1.5" disabled={!ready || save.isPending} onClick={() => save.mutate(true)} data-testid="custom-save-run">
            <Play size={14} aria-hidden /> {t('visualize.predict.custom.saveRun')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
