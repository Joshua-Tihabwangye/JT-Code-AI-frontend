import { useTranslation } from 'react-i18next';
import { CalendarRange, X } from 'lucide-react';
import type { ColumnProfile, VizDateRange } from '@/lib/data';

const day = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined);

/** The dataset's date columns (for the date pickers). */
export function dateColumns(profiles: ColumnProfile[]): ColumnProfile[] {
  return profiles.filter((profile) => profile.kind === 'datetime');
}

/** "Use data from … to …": calendar pickers limited to the column's first and last date. */
export function DateRangePicker({ profiles, column, value, onChange }: { profiles: ColumnProfile[]; column?: string; value: VizDateRange; onChange: (value: VizDateRange) => void }) {
  const { t } = useTranslation();
  const columns = dateColumns(profiles);
  if (!columns.length) return null;
  const active = column && columns.some((profile) => profile.name === column) ? column : value.column ?? columns[0]!.name;
  const profile = columns.find((entry) => entry.name === active);
  const min = day(profile?.min);
  const max = day(profile?.max);
  const set = (patch: Partial<VizDateRange>) => onChange({ ...value, column: active, ...patch });
  return (
    <fieldset className="predict-dates" data-testid="date-range">
      <legend className="viz-label flex items-center gap-1">
        <CalendarRange size={12} aria-hidden /> {t('visualize.predict.dateRange')}
      </legend>
      {!column && columns.length > 1 && (
        <select className="viz-field" value={active} onChange={(event) => onChange({ column: event.target.value })} aria-label={t('visualize.predict.dateRangeColumn')}>
          {columns.map((entry) => (
            <option key={entry.name} value={entry.name}>
              {entry.name}
            </option>
          ))}
        </select>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <label className="block text-xs">
          <span className="text-muted-foreground">{t('visualize.predict.from')}</span>
          <input type="date" className="viz-field" min={min} max={value.to ?? max} value={value.from ?? ''} onChange={(event) => set({ from: event.target.value || undefined })} data-testid="date-from" />
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">{t('visualize.predict.to')}</span>
          <input type="date" className="viz-field" min={value.from ?? min} max={max} value={value.to ?? ''} onChange={(event) => set({ to: event.target.value || undefined })} data-testid="date-to" />
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {min && max ? t('visualize.predict.dateRangeHint', { min, max }) : t('visualize.predict.dateRangeAll')}
        {(value.from || value.to) && (
          <button type="button" className="ml-1.5 inline-flex items-center gap-0.5 font-semibold text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => onChange({})}>
            <X size={11} aria-hidden /> {t('visualize.predict.allDates')}
          </button>
        )}
      </p>
    </fieldset>
  );
}

/** Forecasts: "Forecast until <date>", after the last date in the data. */
export function ForecastUntilPicker({ profile, value, onChange }: { profile?: ColumnProfile; value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const last = day(profile?.max);
  return (
    <label className="block text-xs" data-testid="forecast-until">
      <span className="viz-label flex items-center gap-1">
        <CalendarRange size={12} aria-hidden /> {t('visualize.predict.forecastUntil')}
      </span>
      <input type="date" className="viz-field" min={last} value={value} onChange={(event) => onChange(event.target.value)} />
      <span className="text-[11px] text-muted-foreground">{value ? t('visualize.predict.forecastUntilSet') : t('visualize.predict.forecastUntilHint', { last: last ?? '' })}</span>
    </label>
  );
}
