import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function TermsPage() {
  const { t } = useTranslation();
  return (
    <main className="auth-page legal-page">
      <section className="auth-card legal-card">
        <p className="legal-eyebrow">{t('legal.terms.eyebrow')}</p>
        <h1>{t('legal.terms.title')}</h1>
        <p>
          {t('legal.terms.p1')}
        </p>
        <p>
          {t('legal.terms.p2')}
        </p>
        <div className="legal-actions">
          <Link to="/sign-up" className="primary-button primary-button--link">{t('legal.terms.createAccount')}</Link>
          <Link to="/contact" className="secondary-button">{t('legal.terms.contactSupport')}</Link>
        </div>
      </section>
    </main>
  );
}
