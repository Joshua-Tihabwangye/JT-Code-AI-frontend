import { useTranslation } from 'react-i18next';

export function SignupHeader() {
  const { t } = useTranslation();
  return (
    <header className="signup-header">
      <h1>{t('signup.title')}</h1>
    </header>
  );
}
