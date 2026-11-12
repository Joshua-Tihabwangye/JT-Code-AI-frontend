import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  useForm,
  type Resolver,
  type SubmitHandler,
} from 'react-hook-form';
import { signupSchema, type SignupSchema } from '../schema';
import { getCountryMetadata, getDefaultCountry } from '../../lib/countryMetadata';
import type { SignupPayload } from '../types';

const defaultCountry = getDefaultCountry();

interface UseSignupFormResult {
  form: ReturnType<typeof useForm<SignupSchema>>;
  submit: SubmitHandler<SignupSchema>;
}

export function useSignupForm(
  onSubmit: (payload: SignupPayload) => Promise<void>,
): UseSignupFormResult {
  const form = useForm<SignupSchema>({
    resolver: zodResolver(signupSchema) as Resolver<SignupSchema>,
    mode: 'onBlur',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      countryCode: defaultCountry.code,
      dialCode: defaultCountry.dialCode,
      contact: '',
      timezone: defaultCountry.timezones[0] ?? '',
      acceptedTerms: false,
    },
  });

  const countryCode = form.watch('countryCode');

  useEffect(() => {
    const country = getCountryMetadata(countryCode ?? '');
    if (!country) return;

    const currentTimezone = form.getValues('timezone');
    if (!country.timezones.includes(currentTimezone)) {
      form.setValue('timezone', country.timezones[0] ?? '', {
        shouldValidate: true,
      });
    }

    const currentDialCode = form.getValues('dialCode');
    if (currentDialCode !== country.dialCode) {
      form.setValue('dialCode', country.dialCode, { shouldValidate: true });
    }

    // Reset phone because its format belongs to the previously selected country.
    form.setValue('contact', '');
  }, [countryCode, form]);

  const submit: SubmitHandler<SignupSchema> = async (values) => {
    const country = getCountryMetadata(values.countryCode);
    if (!country) {
      form.setError('countryCode', { message: 'authErrors.invalidCountry' });
      return;
    }

    const payload: SignupPayload = {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      password: values.password,
      confirmPassword: values.confirmPassword,
      countryCode: country.code,
      countryName: country.name,
      dialCode: country.dialCode,
      contact: values.contact,
      timezone: values.timezone,
      acceptedTerms: values.acceptedTerms,
    };

    await onSubmit(payload);
  };

  return { form, submit };
}
