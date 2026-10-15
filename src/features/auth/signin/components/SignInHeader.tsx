import { useTranslation } from 'react-i18next';

export function SignInHeader() {
  const { t } = useTranslation();
  return (
    <header className="signup-header">
      <h1>{t('signin.title')}</h1>
    </header>
  );
}
