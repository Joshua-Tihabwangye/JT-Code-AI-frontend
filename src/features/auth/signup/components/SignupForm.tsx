import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SignupHeader } from './SignupHeader';
import { SocialAuthButtons } from '../../components/SocialAuthButtons';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { NameFields } from './NameFields';
import { EmailField } from './EmailField';
import { PasswordField } from './PasswordField';
import { DialCodeField } from './DialCodeField';
import { PhoneField } from './PhoneField';
import { TimezoneField } from './TimezoneField';
import { TermsField } from './TermsField';
import { SubmitButton } from './SubmitButton';
import { useSignupForm } from '../hooks/useSignupForm';
import { signup } from '../services/signup.service';
import type { SignupPayload } from '../types';
import { supabase } from '@/lib/supabase';
import '../styles/signup.css';

interface Props {
  onSignedUp: () => void;
}

export function SignupForm({ onSignedUp }: Props) {
  const { t } = useTranslation();
  const [submitError, setSubmitError] = useState('');
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'apple' | null>(null);

  const handleSignup = async (payload: SignupPayload) => {
    setSubmitError('');
    const result = await signup(payload);
    if (result.error) {
      setSubmitError(result.error);
      return;
    }
    onSignedUp();
  };

  const { form, submit } = useSignupForm(handleSignup);
  const password = form.watch('password');
  const confirmPassword = form.watch('confirmPassword');
  const isSubmitting = form.formState.isSubmitting || !!loadingProvider;

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setSubmitError('');
    setLoadingProvider(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider });
      if (error) {
        setSubmitError(error.message);
        return;
      }
      onSignedUp();
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <section className="signup-card auth-card">
      <SignupHeader />

      <form
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
        noValidate
        className="signup-form"
      >
        <NameFields form={form} />

        <DialCodeField form={form} />

        <EmailField form={form} />

        <div className="signup-grid signup-grid--two">
          <PhoneField form={form} />
          <TimezoneField form={form} />
        </div>

        <PasswordField
          form={form}
          field="password"
          label={t('signup.passwordLabel')}
          placeholder={t('signup.passwordPlaceholder')}
          autoComplete="new-password"
          helper={<PasswordStrengthMeter password={password ?? ''} />}
        />

        <PasswordField
          form={form}
          field="confirmPassword"
          label={t('signup.confirmPasswordLabel')}
          placeholder={t('signup.confirmPasswordPlaceholder')}
          autoComplete="new-password"
          helper={
            confirmPassword ? (
              <div className={`password-match ${confirmPassword === password ? 'is-ok' : 'is-error'}`}>
                {confirmPassword === password ? t('signup.matchOk') : t('signup.matchError')}
              </div>
            ) : null
          }
        />

        <TermsField form={form} />

        {submitError && <div className="form-error">{submitError}</div>}

        <SubmitButton isSubmitting={isSubmitting} label={t('signup.submit')} />
      </form>

      <div className="signup-divider">
        <span />
        <span>{t('common.or')}</span>
        <span />
      </div>

      <SocialAuthButtons
        onGoogle={() => void handleOAuth('google')}
        onApple={() => void handleOAuth('apple')}
        disabled={isSubmitting}
        loadingProvider={loadingProvider}
        layout="vertical"
      />

      <footer className="signup-footer">
        <span>{t('signup.haveAccountQuestion')}</span>
        <Link to="/sign-in">{t('landing.signIn')}</Link>
      </footer>
    </section>
  );
}