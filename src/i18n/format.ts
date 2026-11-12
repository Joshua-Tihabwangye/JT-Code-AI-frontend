import i18n from './config';

/** The chosen app language, as an Intl locale (dates, numbers, lists follow it, not the browser). */
export function currentLocale(): string {
  return i18n.resolvedLanguage || i18n.language || 'en';
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(currentLocale(), options).format(value);
}

export function formatDate(value: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(currentLocale(), options ?? { dateStyle: 'medium' }).format(new Date(value));
}

export function formatDateTime(value: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(currentLocale(), options ?? { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

/** "a, b and c" in the chosen language. */
export function formatList(items: string[], type: Intl.ListFormatType = 'conjunction'): string {
  return new Intl.ListFormat(currentLocale(), { style: 'long', type }).format(items);
}

/** Languages whose nouns keep their capital letter inside a sentence. */
const KEEPS_NOUN_CASE = new Set(['de', 'lb']);

/** A label placed inside a sentence ("Showing 3 numeric rows"): lowercased where the language does
 *  that (with its own casing rules, e.g. Turkish dotted i), kept as is where nouns stay capitalized. */
export function inlineLabel(label: string): string {
  const locale = currentLocale();
  return KEEPS_NOUN_CASE.has(locale.split('-')[0] ?? locale) ? label : label.toLocaleLowerCase(locale);
}
