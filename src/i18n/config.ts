import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { LANGUAGES, isRtl } from './languages';

import { loadLanguageResources, resources } from './resources';

export const STORAGE_KEY = 'jt-code-lang';


void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // Only English is bundled; other languages are added by ensureLanguage() when chosen.
    partialBundledLanguages: true,
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

const loading = new Map<string, Promise<void>>();

/** Downloads a language's translations once (English is always there). */
export function ensureLanguage(lng: string): Promise<void> {
  const lang = lng.split('-')[0] ?? lng;
  if (lang === 'en' || i18n.hasResourceBundle(lang, 'translation')) return Promise.resolve();
  let pending = loading.get(lang);
  if (!pending) {
    pending = loadLanguageResources(lang).then((tree) => {
      if (tree) i18n.addResourceBundle(lang, 'translation', tree, true, true);
    });
    loading.set(lang, pending);
  }
  return pending;
}

/** Switches the app's language after its translations are loaded (no flash of English). */
export async function setAppLanguage(lng: string): Promise<void> {
  await ensureLanguage(lng);
  await i18n.changeLanguage(lng);
}

/** Resolves when the saved/detected language is ready; the app renders after it. */
export const i18nReady: Promise<void> = ensureLanguage(i18n.language || 'en')
  .then(() => i18n.changeLanguage(i18n.language))
  .then(() => undefined)
  .catch(() => undefined);

export default i18n;
