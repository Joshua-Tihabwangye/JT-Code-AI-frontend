import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

interface SocialAuthButtonsProps {
  onGoogle?: () => void;
  onApple?: () => void;
  disabled?: boolean;
  loadingProvider?: 'google' | 'apple' | null;
  /** Defaults to horizontal; authentication screens can request a vertical stack. */
  layout?: 'horizontal' | 'vertical';
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.227c0-.709-.064-1.391-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.996 3.018v2.509h3.227c1.89-1.741 2.987-4.305 2.987-7.35Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.964-.895 6.613-2.423l-3.227-2.509c-.895.6-2.041.955-3.386.955-2.605 0-4.809-1.759-5.596-4.123H3.068v2.591A9.997 9.997 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.404 13.9A6.01 6.01 0 0 1 6.09 12c0-.659.114-1.3.314-1.9V7.509H3.068A10.01 10.01 0 0 0 2 12c0 1.614.386 3.141 1.068 4.491L6.404 13.9Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.977c1.468 0 2.786.505 3.823 1.496l2.864-2.864C16.959 2.995 14.695 2 12 2a9.997 9.997 0 0 0-8.932 5.509L6.404 10.1C7.191 7.736 9.395 5.977 12 5.977Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.42 2.2-1.12 2.98-.79.86-2.07 1.52-3.18 1.44-.13-1.1.42-2.27 1.08-2.99.76-.84 2.07-1.46 3.22-1.43ZM20.96 17.02c-.55 1.27-.82 1.84-1.53 2.96-.99 1.57-2.39 3.52-4.12 3.53-1.54.02-1.97-1-4.07-1-2.09 0-2.55 1.01-4.08 1.02-1.73.02-3.05-1.71-4.04-3.27C.13 16.78-.27 11.6 1.6 8.75c1.08-1.73 2.81-2.82 4.51-2.82 1.69 0 2.75 1.16 4.14 1.16 1.36 0 2.18-1.16 4.13-1.16 1.48 0 3.05.81 4.17 2.2-3.66 2-3.07 7.27.01 8.89Z" />
    </svg>
  );
}

export function SocialAuthButtons({
  onGoogle,
  onApple,
  disabled,
  loadingProvider = null,
  layout = 'horizontal',
}: SocialAuthButtonsProps) {
  const { t } = useTranslation();
  return (
    <div className={clsx('social-auth-grid', layout === 'vertical' && 'social-auth-grid--vertical')}>
      <button
        type="button"
        className="social-auth-button"
        onClick={() => void onGoogle?.()}
        disabled={disabled}
      >
        <GoogleIcon />
        <span>{loadingProvider === 'google' ? t('signin.connecting') : t('signin.signInWithGoogle')}</span>
      </button>
      <button
        type="button"
        className="social-auth-button"
        onClick={() => void onApple?.()}
        disabled={disabled}
      >
        <AppleIcon />
        <span>{loadingProvider === 'apple' ? t('signin.connecting') : t('signin.signInWithApple')}</span>
      </button>
    </div>
  );
}
