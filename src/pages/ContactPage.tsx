import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function ContactPage() {
  const { t } = useTranslation();
  return (
    <main className="auth-page legal-page">
      <section className="auth-card legal-card">
        <p className="legal-eyebrow">{t('legal.contact.eyebrow')}</p>
        <h1>{t('legal.contact.title')}</h1>
        <p>
          {t('legal.contact.p1')}
        </p>
        <p>
          {t('legal.contact.p2')}
        </p>
        <div className="legal-actions">
          <Link to="/sign-in" className="primary-button primary-button--link">{t('legal.contact.backToSignIn')}</Link>
          <Link to="/sign-up" className="secondary-button">{t('legal.contact.createAccount')}</Link>
        </div>
      </section>
    </main>
  );
}
