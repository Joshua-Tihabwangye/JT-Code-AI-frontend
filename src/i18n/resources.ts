/**
 * Translations live in one folder per language, one file per area:
 * `locales/<lang>/<key.path>.json`. A file's name is the key path its content fills, so
 * `locales/fr/visualize.editor.json` provides every `visualize.editor.*` key in French.
 * Areas can be edited (and translated) independently; they are merged into one namespace.
 */
type Tree = { [key: string]: string | Tree };

const files = import.meta.glob<Tree>('./locales/*/*.json', { eager: true, import: 'default' });

function merge(target: Tree, source: Tree): Tree {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key];
    if (typeof value === 'object' && value && typeof current === 'object' && current) merge(current, value);
    else target[key] = typeof value === 'object' ? merge({}, value) : value;
  }
  return target;
}

/** Every language's translations as one tree, from its area files. */
export function buildResources(entries: Record<string, Tree> = files): Record<string, { translation: Tree }> {
  const resources: Record<string, { translation: Tree }> = {};
  for (const [path, content] of Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) {
    const match = /locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
    if (!match) continue;
    const [, lang, keyPath] = match as unknown as [string, string, string];
    const root = (resources[lang] ??= { translation: {} }).translation;
    let node = root;
    for (const part of keyPath.split('.')) node = (node[part] ??= {}) as Tree;
    merge(node, content);
  }
  return resources;
}

export const resources = buildResources();
