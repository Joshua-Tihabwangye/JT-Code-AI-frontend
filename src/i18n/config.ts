import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { LANGUAGES, isRtl } from './languages';

import { resources } from './resources';

export const STORAGE_KEY = 'jt-code-lang';


void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: LANGUAGES.map((l) => l.code),
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: STORAGE_KEY,
    },
  });

/** The page follows the chosen language: text direction, and `lang` for screen readers,
 *  fonts and hyphenation. */
function applyDirection(lng: string) {
  if (typeof document === 'undefined') return; // Node (integration tests, tooling)
  document.documentElement.dir = isRtl(lng) ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
}

applyDirection(i18n.language);
i18n.on('languageChanged', applyDirection);

export default i18n;
