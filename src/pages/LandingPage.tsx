import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, Code2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/supabase';

export function LandingPage() {
  const { isSignedIn } = useAuth();
  const { t } = useTranslation();

  const features = [
    { title: t('landing.feature1Title'), desc: t('landing.feature1Desc'), Icon: Sparkles },
    { title: t('landing.feature2Title'), desc: t('landing.feature2Desc'), Icon: Code2 },
    { title: t('landing.feature3Title'), desc: t('landing.feature3Desc'), Icon: ShieldCheck },
  ];

  return (
    <main className="landing">
      {/* Purely decorative — floating bubble orbs behind the hero, no data or logic */}
      <div className="landing-bubbles" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <header className="landing-header">
        <div className="brand"><span className="brand-mark">JT</span><span>JT-Code</span></div>
        <div className="header-actions">
          {isSignedIn ? (
            <Link className="button primary" to="/app/chat">{t('landing.openApp')}</Link>
          ) : (
            <>
              <Link className="button ghost" to="/sign-in">{t('landing.signIn')}</Link>
              <Link className="button primary" to="/sign-up">{t('landing.createAccount')}</Link>
            </>
          )}
        </div>
      </header>
      <section className="hero">
        <p className="eyebrow">{t('landing.eyebrow')}</p>
        <h1>{t('landing.headline')}</h1>
        <p className="hero-copy">{t('landing.copy')}</p>
        {isSignedIn ? (
          <Link className="button primary large" to="/app/chat">{t('landing.continueToWorkspace')}</Link>
        ) : (
          <Link className="button primary large" to="/sign-up">{t('landing.startWith')}</Link>
        )}
      </section>
      <section className="feature-grid" aria-label={t('landing.foundationsLabel')}>
        {features.map(({ title, desc, Icon }) => (
          <article key={title}>
            <div className="feature-icon" aria-hidden="true">
              <Icon size={20} />
            </div>
            <h2>{title}</h2>
            <p>{desc}</p>
          </article>
        ))}
      </section>
    </main>
  );
}