import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SignupHeader } from './SignupHeader';
import { SocialAuthButtons } from '../../components/SocialAuthButtons';
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
import { signInWithProvider } from '@/lib/supabase';
import '../styles/signup.css';

interface Props {
  onSignedUp: () => void;
}

export function SignupForm({ onSignedUp }: Props) {
  const { t } = useTranslation();
  const [submitError, setSubmitError] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'apple' | null>(null);

  const handleSignup = async (payload: SignupPayload) => {
    setSubmitError('');
    const result = await signup(payload);
    if (result.error) {
      setSubmitError(result.error);
      return;
    }
    if (result.needsConfirmation) {
      setConfirmEmail(payload.email);
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
      const { error, redirected } = await signInWithProvider(provider);
      if (error) {
        setSubmitError(error);
        return;
      }
      // Real providers redirect the browser; the session arrives on /sso-callback.
      if (!redirected) onSignedUp();
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <section className="signup-card auth-card">
      <SignupHeader />

      <SocialAuthButtons
          onGoogle={() => void handleOAuth('google')}
          onApple={() => void handleOAuth('apple')}
          disabled={isSubmitting}
          loadingProvider={loadingProvider}
        />

      <div className="signup-divider">
        <span />
        <span>{t('common.or')}</span>
        <span />
      </div>

      <form
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
        noValidate
        className="signup-form"
      >
        <div className="signup-section">
          <h2 className="signup-section__title">{t('signup.section.profile')}</h2>
          <NameFields form={form} />
        </div>

        <div className="signup-section">
          <h2 className="signup-section__title">{t('signup.section.account')}</h2>
          <EmailField form={form} />

          <PasswordField
            form={form}
            field="password"
            label={t('signup.passwordLabel')}
            placeholder={t('signup.passwordPlaceholder')}
            autoComplete="new-password"
            helper={
              <p className="password-requirement">
                {t('signup.requirements.singleRule')}
              </p>
            }
          />

          <PasswordField
            form={form}
            field="confirmPassword"
            label={t('signup.confirmPasswordLabel')}
            placeholder={t('signup.confirmPasswordPlaceholder')}
            autoComplete="new-password"
            helper={(
              <div className={`password-match ${confirmPassword ? (confirmPassword === password ? 'is-ok' : 'is-error') : ''}`}>
                {confirmPassword && confirmPassword === password
                  ? t('signup.matchOk')
                  : confirmPassword
                    ? t('signup.matchError')
                    : t('signup.matchHint')}
              </div>
            )}
          />
        </div>

        <div className="signup-section">
          <h2 className="signup-section__title">{t('signup.section.region')}</h2>
          <div className="signup-grid signup-grid--two">
            <DialCodeField form={form} />
            <PhoneField form={form} />
          </div>
          <TimezoneField form={form} />
        </div>

        <TermsField form={form} />

        {submitError && <div className="form-error">{submitError}</div>}
        {confirmEmail && <div className="form-success" role="status">{t('signup.confirmEmail', { email: confirmEmail })}</div>}

        <SubmitButton isSubmitting={isSubmitting} label={t('signup.submit')} />
      </form>

      <footer className="signup-footer">
        <span>{t('signup.haveAccountQuestion')}</span>
        <Link to="/sign-in">{t('landing.signIn')}</Link>
      </footer>
    </section>
  );
}
