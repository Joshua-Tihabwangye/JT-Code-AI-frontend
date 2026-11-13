import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Save } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/http';
import { useRepository, type ColumnProfile, type PredictionPreset, type VizDateRange, type VizFields } from '@/lib/data';
import { Alert, Button, Input, Modal } from '@/shared/components';
import { DateRangePicker, dateColumns, ForecastUntilPicker } from './DateControls';

/** What the user wants the prediction to do; the method follows from it and the column's type. */
type Goal = 'estimate' | 'forecast' | 'classify' | 'drivers' | 'anomaly' | 'segments';

const TASK_FOR: Record<Goal, string> = {
  estimate: 'regression',
  forecast: 'forecast',
  classify: 'classification',
  drivers: 'drivers',
  anomaly: 'anomaly',
  segments: 'clustering',
};

function goalsFor(kind: string | undefined, hasDates: boolean): Goal[] {
  if (kind === 'numeric') return [...(hasDates ? (['forecast'] as Goal[]) : []), 'estimate', 'drivers', 'anomaly', 'segments'];
  if (kind === 'datetime') return ['segments'];
  return ['classify', 'drivers', 'segments'];
}

export function CustomPredictionDialog({
  open,
  onClose,
  profiles,
  datasetId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  profiles: ColumnProfile[];
  datasetId: string;
  onCreated: (preset: PredictionPreset, run: boolean, forecastUntil: string) => void;
}) {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [goal, setGoal] = useState<Goal | ''>('');
  const [inputs, setInputs] = useState<string[] | null>(null);
  const [dateColumn, setDateColumn] = useState('');
  const [range, setRange] = useState<VizDateRange>({});
  const [until, setUntil] = useState('');
  const dates = dateColumns(profiles);
  const targetProfile = profiles.find((profile) => profile.name === target);
  const goals = goalsFor(targetProfile?.kind, dates.length > 0);
  const chosenGoal: Goal | '' = goal && goals.includes(goal) ? goal : (goals[0] ?? '');
  const others = profiles.filter((profile) => profile.name !== target && profile.kind !== 'datetime');
  const learnFrom = inputs ?? others.map((profile) => profile.name);
  const date = dateColumn || dates[0]?.name || '';

  const fields = useMemo((): VizFields => {
    if (!target || !chosenGoal) return {};
    if (chosenGoal === 'forecast') return { date, target };
    if (chosenGoal === 'anomaly' || chosenGoal === 'segments') return { features: [target, ...learnFrom.filter((column) => column !== target)] };
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
          dateRange: range.from || range.to ? range : {},
          datasetId,
        })
        .then((preset) => ({ preset, run })),
    onSuccess: ({ preset, run }) => {
      void queryClient.invalidateQueries({ queryKey: ['visualize', 'prediction-presets'] });
      onCreated(preset, run, chosenGoal === 'forecast' ? until : '');
      onClose();
    },
  });

  const ready = !!target && !!chosenGoal && (chosenGoal !== 'forecast' || !!date);
  return (
    <Modal isOpen={open} onClose={onClose} title={t('visualize.predict.custom.title')} description={t('visualize.predict.custom.description')} size="lg">
      <div className="space-y-4" data-testid="custom-prediction-form">
        {save.error && <Alert variant="destructive">{apiErrorMessage(save.error)}</Alert>}
        <Input label={t('visualize.predict.custom.name')} value={name} placeholder={t('visualize.predict.custom.namePlaceholder')} onChange={(event) => setName(event.target.value)} />

        <label className="block text-sm">
          <span className="viz-label">{t('visualize.predict.custom.target')}</span>
          <select className="viz-field" value={target} onChange={(event) => { setTarget(event.target.value); setGoal(''); setInputs(null); }} data-testid="custom-target">
            <option value="">{t('visualize.predict.custom.chooseColumn')}</option>
            {profiles.map((profile) => (
              <option key={profile.name} value={profile.name}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>

        {target && (
          <fieldset className="space-y-1.5">
            <legend className="viz-label">{t('visualize.predict.custom.goal')}</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {goals.map((entry) => (
                <label key={entry} className={`predict-goal${chosenGoal === entry ? ' active' : ''}`}>
                  <input type="radio" name="goal" checked={chosenGoal === entry} onChange={() => setGoal(entry)} data-testid={`custom-goal-${entry}`} />
                  <span>
                    <b className="block text-sm">{t(`visualize.predict.custom.goals.${entry}`)}</b>
                    <span className="text-xs text-muted-foreground">{t(`visualize.predict.custom.goalHints.${entry}`, { target })}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {target && chosenGoal === 'forecast' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="viz-label">{t('visualize.predict.custom.dateColumn')}</span>
              <select className="viz-field" value={date} onChange={(event) => setDateColumn(event.target.value)}>
                {dates.map((profile) => (
                  <option key={profile.name} value={profile.name}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
            <ForecastUntilPicker profile={dates.find((profile) => profile.name === date)} value={until} onChange={setUntil} />
          </div>
        )}

        {target && chosenGoal && chosenGoal !== 'forecast' && others.length > 0 && (
          <fieldset>
            <legend className="viz-label">{chosenGoal === 'anomaly' || chosenGoal === 'segments' ? t('visualize.predict.custom.alsoUse') : t('visualize.predict.custom.learnFrom')}</legend>
            <div className="predict-columns">
              {others.map((profile) => (
                <label key={profile.name} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={learnFrom.includes(profile.name)}
                    onChange={(event) => setInputs(event.target.checked ? [...learnFrom, profile.name] : learnFrom.filter((column) => column !== profile.name))}
                  />
                  <span className="truncate">{profile.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {target && dates.length > 0 && <DateRangePicker profiles={profiles} column={chosenGoal === 'forecast' ? date : undefined} value={range} onChange={setRange} />}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="outline" className="gap-1.5" disabled={!ready || save.isPending} onClick={() => save.mutate(false)} data-testid="custom-save">
            <Save size={14} aria-hidden /> {t('visualize.predict.custom.save')}
          </Button>
          <Button className="viz-primary gap-1.5" disabled={!ready || save.isPending} onClick={() => save.mutate(true)} data-testid="custom-save-run">
            <Play size={14} aria-hidden /> {t('visualize.predict.custom.saveRun')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
