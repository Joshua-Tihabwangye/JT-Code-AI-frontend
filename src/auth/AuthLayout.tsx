import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className="auth-page auth-page--centered">
      <header className="auth-topbar">
        <div className="auth-topbar__actions">
          <button
            type="button"
            className="auth-back-button"
            onClick={() => { void navigate('/'); }}
            aria-label={t('authLayout.back')}
          >
            <ArrowLeft size={16} aria-hidden />
            <span>{t('common.back')}</span>
          </button>

          <button
            type="button"
            className="auth-theme-toggle"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={isDark ? t('authLayout.switchToLight') : t('authLayout.switchToDark')}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
            {isDark ? t('authLayout.light') : t('authLayout.dark')}
          </button>
        </div>
      </header>

      <main className="auth-shell">
        {/* Purely decorative — floating bubble orbs behind the card, no data or logic */}
        <div className="auth-bubbles" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="auth-shell__panel">{children}</div>
      </main>

      <footer className="auth-footer">
        <span>© {new Date().getFullYear()} JT-Code, Inc.</span>
        <nav>
          <Link to="/privacy">{t('legal.privacy.eyebrow')}</Link>
          <Link to="/terms">{t('legal.terms.eyebrow')}</Link>
          <Link to="/contact">{t('legal.contact.eyebrow')}</Link>
        </nav>
      </footer>
    </div>
  );
}
