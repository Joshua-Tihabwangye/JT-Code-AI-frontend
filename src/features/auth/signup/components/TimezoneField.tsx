import { useTranslation } from 'react-i18next';
import type { UseFormReturn } from 'react-hook-form';
import type { SignupSchema } from '../schema';
import { getCountryMetadata } from '../../lib/countryMetadata';

interface Props {
  form: UseFormReturn<SignupSchema>;
}

export function TimezoneField({ form }: Props) {
  const { t } = useTranslation();
  const countryCode = form.watch('countryCode');
  const country = getCountryMetadata(countryCode);
  const timezones = country?.timezones ?? [];

  return (
    <div className="form-field">
      <label htmlFor="timezone">{t('signup.timezone.label')}</label>
      <select
        id="timezone"
        disabled={!timezones.length}
        {...form.register('timezone')}
      >
        {!timezones.length && <option value="">{t('signup.timezone.empty')}</option>}
        {timezones.map((timezone) => (
          <option key={timezone} value={timezone}>
            {timezone}
          </option>
        ))}
      </select>
      {form.formState.errors.timezone?.message && (
        <p className="field-error">{t(form.formState.errors.timezone.message)}</p>
      )}
    </div>
  );
}
