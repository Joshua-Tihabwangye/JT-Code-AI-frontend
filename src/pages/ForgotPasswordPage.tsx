import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle2, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '@/auth/AuthLayout';
import { Input } from '@/shared/components/Input';
import { requestPasswordReset, resetPasswordWithCode } from '@/lib/supabase';

type Stage = 'email' | 'sent' | 'reset' | 'complete';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const sendResetLink = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);
    try {
      const result = await requestPasswordReset(email);
      if (result.error) {
        setErrorMsg(result.error || t('forgot.errors.sendFailed'));
        return;
      }
      // Only the offline demo (mock mode) knows the code; real resets email it.
      setResetCode(result.demoCode ?? '');
      setCode(result.demoCode ?? '');
      setStage('sent');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('forgot.errors.unexpected'));
    } finally {
      setIsLoading(false);
    }
  };

  const completeReset = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    if (newPassword !== confirmPassword) {
      setErrorMsg(t('forgot.errors.mismatch'));
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await resetPasswordWithCode(email, code.trim(), newPassword);
      if (error) {
        setErrorMsg(error || t('forgot.errors.resetFailed'));
        return;
      }
      setSuccessMsg(t('forgot.updatedMessage'));
      setStage('complete');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('forgot.errors.unexpected'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <section className="auth-card auth-card--forgot">
        {stage === 'email' && (
          <>
            <div className="auth-card__heading auth-card__heading--forgot">
              <div className="auth-card__icon">
                <ShieldCheck size={18} />
              </div>
              <h2>{t('forgot.resetTitle')}</h2>
              <p>{t('forgot.resetDesc')}</p>
            </div>

            <form onSubmit={(event) => void sendResetLink(event)} className="auth-form auth-form--forgot">
              <Input
                id="reset-email"
                label={t('forgot.emailLabel')}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                leftIcon={<Mail size={16} aria-hidden />}
                error={errorMsg}
              />

              <button type="submit" className="primary-button" disabled={isLoading}>
                {isLoading ? t('forgot.sending') : t('forgot.sendCode')}
              </button>

              <Link to="/sign-in" className="back-link">
                <ArrowLeft size={17} /> {t('forgot.backToSignIn')}
              </Link>
            </form>
          </>
        )}

        {stage === 'sent' && (
          <>
            <div className="auth-card__heading auth-card__heading--forgot">
              <div className="auth-card__icon">
                <KeyRound size={18} />
              </div>
              <h2>{t('forgot.checkTitle')}</h2>
              <p>
                {t('forgot.checkDescPlain', { email })}
              </p>
            </div>

            {resetCode ? (
              <div className="reset-code-card">
                <span>{t('forgot.mockResetCode')}</span>
                <strong>{resetCode}</strong>
                <button type="button" className="secondary-button" onClick={() => setStage('reset')}>
                  {t('forgot.useCodeNow')}
                </button>
              </div>
            ) : (
              <button type="button" className="secondary-button" onClick={() => setStage('reset')}>
                {t('forgot.enterEmailedCode')}
              </button>
            )}

            <button type="button" className="text-link" onClick={() => setStage('reset')}>
              {t('forgot.haveCode')}
            </button>

            <Link to="/sign-in" className="back-link">
              <ArrowLeft size={17} /> {t('forgot.backToSignIn')}
            </Link>
          </>
        )}

        {stage === 'reset' && (
          <>
            <div className="auth-card__heading auth-card__heading--forgot">
              <div className="auth-card__icon">
                <ShieldCheck size={18} />
              </div>
              <h2>{t('forgot.newPasswordTitle')}</h2>
              <p>{t('forgot.newPasswordDesc', { email })}</p>
            </div>

            <form onSubmit={(event) => void completeReset(event)} className="auth-form auth-form--forgot">
              <Input
                id="reset-code"
                label={t('forgot.codeLabel')}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="000000"
                leftIcon={<KeyRound size={16} aria-hidden />}
              />
              <Input
                id="new-password"
                label={t('forgot.newPasswordLabel')}
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder={t('signup.passwordPlaceholder')}
                autoComplete="new-password"
              />
              <Input
                id="confirm-password"
                label={t('forgot.confirmPasswordLabel')}
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder={t('signup.confirmPasswordPlaceholder')}
                autoComplete="new-password"
              />

              {errorMsg && <div className="form-error">{errorMsg}</div>}

              <button type="submit" className="primary-button" disabled={isLoading}>
                {isLoading ? t('forgot.updating') : t('forgot.resetButton')}
              </button>

              <button type="button" className="text-link" onClick={() => setStage('sent')}>
                {t('forgot.backToCode')}
              </button>
            </form>
          </>
        )}

        {stage === 'complete' && (
          <>
            <div className="auth-card__heading auth-card__heading--forgot">
              <div className="auth-card__icon auth-card__icon--success">
                <CheckCircle2 size={18} />
              </div>
              <h2>{t('forgot.updatedTitle')}</h2>
              <p>{successMsg}</p>
            </div>

            <button
              type="button"
              className="primary-button"
              onClick={() => void navigate('/sign-in', { replace: true })}
            >
              {t('forgot.returnToSignIn')}
            </button>
          </>
        )}
      </section>
    </AuthLayout>
  );
}
