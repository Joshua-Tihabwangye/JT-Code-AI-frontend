/**
 * Localization coverage: every language has every English text, every key the code uses exists,
 * and no user-visible English is hard-coded in components (it would not change with the language).
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { buildResources } from './resources';
import { LANGUAGES } from './languages';

type Tree = { [key: string]: string | string[] | Tree };

const ROOT = path.resolve(__dirname, '..');
const LOCALES = path.join(__dirname, 'locales');
const PLURAL = /_(zero|one|two|few|many|other)$/;

function readLanguage(lang: string): Record<string, Tree> {
  const entries: Record<string, Tree> = {};
  for (const file of fs.readdirSync(path.join(LOCALES, lang))) {
    entries[`./locales/${lang}/${file}`] = JSON.parse(fs.readFileSync(path.join(LOCALES, lang, file), 'utf8')) as Tree;
  }
  return entries;
}

function flatten(tree: Tree, prefix = '', out: Record<string, string | string[]> = {}): Record<string, string | string[]> {
  for (const [key, value] of Object.entries(tree)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string' || Array.isArray(value)) out[full] = value;
    else flatten(value, full, out);
  }
  return out;
}

const translations = (lang: string) => flatten(buildResources(readLanguage(lang))[lang]!.translation);
const english = translations('en');
const placeholders = (text: string) => [...text.matchAll(/{{\s*[\w.]+\s*}}/g)].map((match) => match[0].replace(/\s/g, '')).sort();

describe('locale files', () => {
  it('has a folder for every language in the menu, and nothing else', () => {
    expect(fs.readdirSync(LOCALES).sort()).toEqual(LANGUAGES.map((language) => language.code).sort());
  });

  for (const { code } of LANGUAGES.filter((language) => language.code !== 'en')) {
    it(`${code} translates every English text, with the same placeholders`, () => {
      const target = translations(code);
      const problems: string[] = [];
      for (const [key, value] of Object.entries(english)) {
        if (PLURAL.test(key)) {
          // Languages use their own plural categories; each needs at least the "other" form.
          if (!(`${key.replace(PLURAL, '')}_other` in target)) problems.push(`missing ${key.replace(PLURAL, '_other')}`);
          continue;
        }
        const translated = target[key];
        if (translated === undefined) problems.push(`missing ${key}`);
        else if (Array.isArray(value)) {
          if (!Array.isArray(translated) || translated.length !== value.length) problems.push(`${key} should be a list of ${value.length}`);
        } else if (typeof translated !== 'string' || (!translated.trim() && value.trim())) problems.push(`${key} is empty`);
        else if (placeholders(translated).join() !== placeholders(value).join()) problems.push(`${key} placeholders differ`);
      }
      for (const key of Object.keys(target)) {
        const known = key in english || (PLURAL.test(key) && Object.keys(english).some((k) => PLURAL.test(k) && k.replace(PLURAL, '') === key.replace(PLURAL, '')));
        if (!known) problems.push(`unknown key ${key}`);
      }
      expect(problems).toEqual([]);
    });
  }
});

/** Source files the app ships (tests and type declarations excluded). */
function sourceFiles(dir = path.join(ROOT)): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['locales', 'test', '__tests__'].includes(entry.name)) files.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$|\.d\.ts$/.test(entry.name)) files.push(full);
  }
  return files;
}

describe('keys used in code', () => {
  it('exist in English (literal keys passed to t() or stored for t())', () => {
    const groups = new Set(Object.keys(english).map((key) => key.split('.')[0]));
    const exists = (key: string) => key in english || `${key}_other` in english || Object.keys(english).some((k) => k.startsWith(`${key}.`));
    const missing: string[] = [];
    for (const file of sourceFiles()) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/\bt\(\s*['"]([a-zA-Z][\w-]*(?:\.[\w-]+)+)['"]/g)) {
        const key = match[1]!;
        if (groups.has(key.split('.')[0]) && !exists(key)) missing.push(`${path.relative(ROOT, file)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

/** Text that may stay as it is: brand names, code, developer-only errors. */
const ALLOWED = [
  /^JT-Code(, Inc\.)?$/,
  /^JT-Code (Pro|Mini)$/,
  /^(Stable Diffusion|Imagen|DALL·E 3)$/,
  /must be used (inside|within)/,
  /^Root element not found$/,
  /^IndexedDB (open|request) failed$/,
  /^JT-Code web configuration is invalid/,
  /^DIVIDE\(SUM/,
  /^\[revenue\]/,
  /^region,product,revenue/,
];
const ATTRIBUTES = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label', 'description', 'confirmLabel', 'cancelLabel', 'subtitle', 'heading']);
const PROPERTIES = new Set(['label', 'title', 'description', 'placeholder', 'hint', 'help', 'message', 'subtitle', 'heading', 'caption']);
// Seed data for the offline (mock) mode stands in for the user's own records, like server data.
const SKIP_FILES = [/lib\/data\/mock\/seed\.ts$/];

function looksLikeText(value: string): boolean {
  const text = value.trim();
  if (!/[A-Za-z]{2,}/.test(text) || !/[a-z]/.test(text)) return false;
  if (/^[\w.:/#-]+$/.test(text) && !/^[A-Z][a-z]+$/.test(text)) return false;
  if (/^(https?:|mailto:)/.test(text) || /[{};]|\b(var|calc|translate|rgba?)\(/.test(text)) return false;
  // CSS class lists ("text-right tabular-nums", "block min-w-[220px]").
  const tokens = text.split(/\s+/);
  if (tokens.every((token) => /^[a-z0-9:[\]./%-]+$/.test(token)) && tokens.some((token) => /[-[:]/.test(token))) return false;
  return /\s/.test(text) || /^[A-Z][a-z]+[.…!?]?$/.test(text);
}

function hardCoded(file: string): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const report = (node: ts.Node, text: string) => {
    if (!ALLOWED.some((pattern) => pattern.test(text.trim()))) found.push(`${path.relative(ROOT, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${text.trim().slice(0, 60)}`);
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && looksLikeText(node.getText(source))) report(node, node.getText(source));
    else if (ts.isJsxAttribute(node) && node.initializer && ATTRIBUTES.has(node.name.getText(source))) {
      const init = node.initializer;
      const literal = ts.isStringLiteral(init) ? init : ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression) ? init.expression : null;
      if (literal && looksLikeText(literal.text)) report(node, literal.text);
    } else if (ts.isStringLiteral(node) && looksLikeText(node.text)) {
      const parent = node.parent;
      if (ts.isPropertyAssignment(parent) && parent.initializer === node && PROPERTIES.has(parent.name.getText(source))) report(node, node.text);
      else if (ts.isJsxExpression(parent)) report(node, node.text);
      else if (ts.isNewExpression(parent) && /Error$/.test(parent.expression.getText(source))) report(node, node.text);
      else if (ts.isConditionalExpression(parent) && ts.isJsxExpression(parent.parent)) report(node, node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('components', () => {
  it('have no hard-coded user-visible English (it would not follow the chosen language)', () => {
    const found = sourceFiles()
      .filter((file) => !SKIP_FILES.some((pattern) => pattern.test(file)))
      .flatMap(hardCoded);
    expect(found).toEqual([]);
  }, 30_000); // parses every source file; slow when the whole suite runs in parallel
});
