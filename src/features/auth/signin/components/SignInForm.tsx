import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SignInHeader } from './SignInHeader';
import { SocialAuthButtons } from '../../components/SocialAuthButtons';
import { EmailField } from './EmailField';
import { PasswordField } from './PasswordField';
import { SubmitButton } from './SubmitButton';
import { useSignInForm } from '../hooks/useSignInForm';
import { signin } from '../services/signin.service';
import type { SignInPayload } from '../types';
import { signInWithProvider } from '@/lib/supabase';
import '../styles/signin.css';

interface Props {
  onSignedIn: () => void;
}

export function SignInForm({ onSignedIn }: Props) {
  const { t } = useTranslation();
  const [submitError, setSubmitError] = useState('');
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'apple' | null>(null);

  const handleSignin = async (payload: SignInPayload) => {
    setSubmitError('');
    const result = await signin(payload);
    if (result.error) {
      setSubmitError(result.error);
      return;
    }
    onSignedIn();
  };

  const { form, submit } = useSignInForm(handleSignin);

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
      if (!redirected) onSignedIn();
    } finally {
      setLoadingProvider(null);
    }
  };

  const isSubmitting = form.formState.isSubmitting || !!loadingProvider;

  return (
    <section className="signup-card auth-card">
      <SignInHeader />

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

      <form onSubmit={(event) => { void form.handleSubmit(submit)(event); }} noValidate className="signup-form">
        <EmailField form={form} />
        <PasswordField form={form} />

        <div className="form-options">
          <Link to="/forgot-password">{t('signin.forgotPassword')}</Link>
        </div>

        {submitError && <div className="form-error">{submitError}</div>}

        <SubmitButton isSubmitting={isSubmitting} label={t('signin.submit')} />
      </form>

      <footer className="signup-footer">
        <span>{t('signin.noAccount')}</span>
        <Link to="/sign-up">{t('signin.createAccount')}</Link>
      </footer>
    </section>
  );
}
