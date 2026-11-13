// Fills the keys other languages are missing (compared with English) by machine translation, keeping
// every existing translation and dropping keys English no longer has. Placeholders ({{name}}) and
// tags (<b>) are protected; a value that comes back damaged stays English. Only English UI text is sent
// to the translation service. Usage: node scripts/i18n-fill.mjs [lang ...]   (default: all languages)
import fs from 'node:fs';
import path from 'node:path';

const LOCALES = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/i18n/locales');
const CODES = { zh: 'zh-CN' };
const PLURAL = /_(zero|one|two|few|many|other)$/;
const TOKEN = /{{\s*[\w.]+\s*}}|<\/?[a-z0-9]+>/gi;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const flatten = (tree, prefix = '', out = {}) => {
  for (const [key, value] of Object.entries(tree)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, full, out);
    else out[full] = value;
  }
  return out;
};
const nest = (flat) => {
  const tree = {};
  for (const [keyPath, value] of Object.entries(flat)) {
    const parts = keyPath.split('.');
    let node = tree;
    for (const part of parts.slice(0, -1)) node = node[part] ??= {};
    node[parts.at(-1)] = value;
  }
  return tree;
};

function protect(text) {
  const parts = [];
  const masked = text.replace(TOKEN, (match) => {
    parts.push(match);
    const i = parts.length - 1;
    return match.startsWith('</') ? ` __T${i}__` : match.startsWith('<') ? `__T${i}__ ` : `__T${i}__`;
  });
  return { masked, parts };
}
function restore(text, parts, english) {
  let out = String(text ?? '').replace(/\s*__\s*T\s*(\d+)\s*__\s*/gi, (match, i) => {
    const part = parts[Number(i)];
    if (part === undefined) return match;
    const lead = /^\s/.test(match) && !part.startsWith('</') ? ' ' : '';
    const trail = /\s$/.test(match) && !(part.startsWith('<') && !part.startsWith('</')) ? ' ' : '';
    return lead + part + trail;
  });
  if (!/[.。!?！？]$/.test(english.trim())) out = out.replace(/[.。]$/, '');
  const same = (s) => (s.match(TOKEN) ?? []).sort().join();
  return out.trim() && same(out) === same(english) && !/__T\d+__/.test(out) ? out.trim() : english;
}
async function translate(texts, target) {
  const body = new URLSearchParams();
  for (const text of texts) body.append('q', text);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(`https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=${target}`, { method: 'POST', body });
      if (response.ok) {
        const list = (await response.json()).map((item) => (Array.isArray(item) ? item[0] : item));
        if (list.length === texts.length) return list;
      }
    } catch {
      // retried below
    }
    await sleep(2000 * (attempt + 1));
  }
  return null;
}

const langs = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(LOCALES).filter((lang) => lang !== 'en');
for (const lang of langs) {
  const categories = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
  let filled = 0;
  let kept = 0;
  for (const file of fs.readdirSync(path.join(LOCALES, 'en'))) {
    const english = flatten(JSON.parse(fs.readFileSync(path.join(LOCALES, 'en', file), 'utf8')));
    const target = path.join(LOCALES, lang, file);
    const existing = fs.existsSync(target) ? flatten(JSON.parse(fs.readFileSync(target, 'utf8'))) : {};
    const pluralBases = new Set(Object.keys(english).filter((key) => PLURAL.test(key)).map((key) => key.replace(PLURAL, '')));
    const out = Object.fromEntries(Object.entries(existing).filter(([key]) => key in english || (PLURAL.test(key) && pluralBases.has(key.replace(PLURAL, '')))));
    const jobs = [];
    for (const [key, value] of Object.entries(english)) {
      if (key in out) continue;
      if (Array.isArray(value)) value.forEach((text, i) => jobs.push({ key, i, english: text }));
      else if (!String(value).trim()) out[key] = value;
      else jobs.push({ key, english: value });
    }
    for (let start = 0; start < jobs.length; start += 40) {
      const batch = jobs.slice(start, start + 40);
      const masked = batch.map((job) => protect(job.english));
      const result = await translate(masked.map((item) => item.masked), CODES[lang] ?? lang);
      batch.forEach((job, n) => {
        const text = result ? restore(result[n], masked[n].parts, job.english) : job.english;
        if (text === job.english) kept += 1;
        if (job.i === undefined) out[job.key] = text;
        else (out[job.key] ??= [...english[job.key]])[job.i] = text;
      });
      filled += batch.length;
      await sleep(300);
    }
    // Plural categories this language uses, copied from its "other" form.
    for (const base of pluralBases) for (const category of categories) out[`${base}_${category}`] ??= out[`${base}_other`];
    if (jobs.length || Object.keys(out).length !== Object.keys(existing).length) fs.writeFileSync(target, `${JSON.stringify(nest(out), null, 2)}\n`);
  }
  console.log(`${lang}: ${filled} strings filled, ${kept} left in English`);
}
