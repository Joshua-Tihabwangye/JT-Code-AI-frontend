import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { isRtl, LANGUAGES } from './languages';

export function useLanguage() {
  const { i18n } = useTranslation();
  const currentLanguage = i18n.resolvedLanguage || i18n.language;

  const setLanguage = useCallback(
    (code: string) => {
      // i18next's language detector persists the choice (localStorage "jt-code-lang");
      // chat requests send the browser locale to the API with each message.
      void i18n.changeLanguage(code);
      document.documentElement.dir = isRtl(code) ? 'rtl' : 'ltr';
    },
    [i18n],
  );

  return { currentLanguage, setLanguage, languages: LANGUAGES };
}
