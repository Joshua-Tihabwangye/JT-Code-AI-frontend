import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from './languages';
import { setAppLanguage } from './config';

export function useLanguage() {
  const { i18n } = useTranslation();
  const currentLanguage = i18n.resolvedLanguage || i18n.language;

  const setLanguage = useCallback(
    (code: string) => {
      // i18next's language detector persists the choice (localStorage "jt-code-lang"); the
      // config's languageChanged handler updates the page's dir and lang.
      void setAppLanguage(code);
    },
    [],
  );

  return { currentLanguage, setLanguage, languages: LANGUAGES };
}
