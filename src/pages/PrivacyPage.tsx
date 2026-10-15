import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <main className="auth-page legal-page">
      <section className="auth-card legal-card">
        <p className="legal-eyebrow">{t('legal.privacy.eyebrow')}</p>
        <h1>{t('legal.privacy.title')}</h1>
        <p>
          {t('legal.privacy.p1')}
        </p>
        <p>
          {t('legal.privacy.p2')}
        </p>
        <div className="legal-actions">
          <Link to="/sign-in" className="primary-button primary-button--link">{t('legal.privacy.signIn')}</Link>
          <Link to="/terms" className="secondary-button">{t('legal.privacy.readTerms')}</Link>
        </div>
      </section>
    </main>
  );
}
