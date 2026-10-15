import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CountryCode } from 'libphonenumber-js';
import type { UseFormReturn } from 'react-hook-form';
import type { SignupSchema } from '../schema';
import { formatPhoneNumberForCountry } from '../../lib/phone';
import { getCountryMetadata } from '../../lib/countryMetadata';
import { PhoneNumberInput } from '@/shared/components';

interface Props {
  form: UseFormReturn<SignupSchema>;
}

export function PhoneField({ form }: Props) {
  const { t } = useTranslation();
  const countryCode = form.watch('countryCode');
  const country = getCountryMetadata(countryCode);
  const placeholder = useMemo(
    () => country?.phonePlaceholder ?? t('signup.phone.defaultPlaceholder'),
    [country, t],
  );
  const contactField = form.register('contact');
  const errorMessage = form.formState.errors.contact?.message;

  return (
    <div className="form-field">
      <PhoneNumberInput
        id="contact"
        label={t('signup.phone.label')}
        dialCode={country?.dialCode}
        placeholder={placeholder}
        {...contactField}
        onBlur={(event) => {
          void contactField.onBlur(event);
          const formatted = formatPhoneNumberForCountry(event.currentTarget.value, countryCode as CountryCode);
          if (formatted && formatted !== event.currentTarget.value) {
            void form.setValue('contact', formatted, { shouldDirty: true, shouldValidate: true });
          }
        }}
        error={errorMessage ? t(errorMessage) : undefined}
      />
    </div>
  );
}
