import type { DashboardBookmark, DashboardCalculation, DashboardFieldRef, DashboardPage, DashboardParameter, DashboardSpec, DashboardVisual, DashboardWell } from '@/lib/data';

/** Visuals the browser draws itself (no query): text, parameter controls, buttons, navigators. */
export const LOCAL_TYPES = new Set<DashboardVisual['type']>(['text', 'parameter', 'button', 'navigator', 'snapshot']);
/** Local visuals that are controls (no title or tile chrome unless the author adds it). */
export const CONTROL_TYPES = new Set<DashboardVisual['type']>(['text', 'parameter', 'button', 'navigator']);

/** Current parameter values by parameter id: a number for what-if, the option index for fields. */
export type ParameterValues = Record<string, number>;

export function parameterValue(parameter: DashboardParameter, values: ParameterValues): number {
  const value = values[parameter.id];
  if (parameter.kind === 'fields') {
    const index = value ?? parameter.default ?? 0;
    return Math.max(0, Math.min(Math.round(index), parameter.options.length - 1));
  }
  return value ?? parameter.default;
}

/** A well item as rendered: a field parameter's chosen option, a calculation's expression. */
export function resolveRef(ref: DashboardFieldRef, spec: DashboardSpec | undefined, values: ParameterValues): DashboardFieldRef {
  let next = ref;
  if (ref.param) {
    const parameter = spec?.parameters?.find((item) => item.id === ref.param);
    if (parameter?.kind === 'fields') {
      const option = parameter.options[parameterValue(parameter, values)];
      // The option decides the field (and its aggregation); the visual keeps grain and "show value as".
      if (option) next = { ...ref, ...option, param: ref.param, grain: option.grain ?? ref.grain, label: option.label };
    }
  }
  if (next.calc) {
    const calc = spec?.calculations?.find((item) => item.id === next.calc);
    if (calc) next = { ...next, field: calc.name, expr: calc.expression, format: next.format ?? calc.format, label: next.label ?? calc.name };
  }
  return next;
}

function mergeFormat(base: DashboardVisual['format'], extra: DashboardVisual['format']): DashboardVisual['format'] {
  if (!extra) return base;
  const out: NonNullable<DashboardVisual['format']> = { ...(base ?? {}) };
  for (const [section, value] of Object.entries(extra)) out[section] = { ...(base?.[section] ?? {}), ...(value ?? {}) };
  return out;
}

/** The visual as the viewer sees it: personal changes merged, parameters and calculations applied. */
export function resolveVisual(visual: DashboardVisual, spec: DashboardSpec | undefined, values: ParameterValues, personal?: Partial<DashboardVisual>): DashboardVisual {
  let next = visual;
  if (personal) {
    next = {
      ...visual,
      ...(personal.type ? { type: personal.type } : {}),
      ...(personal.data?.wells ? { data: { ...visual.data, wells: personal.data.wells } } : {}),
      format: mergeFormat(visual.format, personal.format),
    };
  }
  const wells = Object.fromEntries(
    Object.entries(next.data.wells).map(([key, refs]) => [key, (refs ?? []).map((ref) => resolveRef(ref, spec, values))]),
  ) as Partial<Record<DashboardWell, DashboardFieldRef[]>>;
  return { ...next, data: { ...next.data, wells } };
}

/** What calculated measures may reference, sent with every render. */
export function renderContext(
  spec: DashboardSpec | undefined,
  values: ParameterValues,
): { parameters: Record<string, number>; calculations: { name: string; expression: string }[]; relationships: NonNullable<DashboardSpec['relationships']> } {
  const parameters: Record<string, number> = {};
  for (const parameter of spec?.parameters ?? []) if (parameter.kind === 'whatif') parameters[parameter.name] = parameterValue(parameter, values);
  return { parameters, calculations: (spec?.calculations ?? []).map((calc) => ({ name: calc.name, expression: calc.expression })), relationships: spec?.relationships ?? [] };
}

/** Personal overrides for visuals that still exist (the author may have deleted some). */
export function pruneOverrides(overrides: Record<string, Partial<DashboardVisual>> | undefined, spec: DashboardSpec | undefined): Record<string, Partial<DashboardVisual>> {
  const ids = new Set((spec?.pages ?? []).flatMap((page) => page.visuals.map((visual) => visual.id)));
  return Object.fromEntries(Object.entries(overrides ?? {}).filter(([id]) => ids.has(id)));
}

/** Phone layout: the visuals in the page's mobile order with their heights; all visuals in reading order otherwise. */
export function mobileVisuals(page: DashboardPage, visuals: DashboardVisual[]): { visual: DashboardVisual; h: number }[] {
  const byId = new Map(visuals.map((visual) => [visual.id, visual]));
  if (page.mobileLayout?.length) {
    return [...page.mobileLayout]
      .sort((a, b) => a.y - b.y)
      .map((item) => ({ visual: byId.get(item.visualId), h: item.h }))
      .filter((item): item is { visual: DashboardVisual; h: number } => !!item.visual);
  }
  return [...visuals].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x).map((visual) => ({ visual, h: visual.layout.h }));
}

/** A starting phone layout: every visible visual stacked in reading order (KPIs shorter). */
export function autoMobileLayout(page: DashboardPage): NonNullable<DashboardPage['mobileLayout']> {
  return [...page.visuals]
    .filter((visual) => !visual.hidden)
    .sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x)
    .map((visual, index) => ({ visualId: visual.id, y: index, h: visual.type === 'kpi' || visual.type === 'card' || visual.type === 'slicer' ? 4 : 9 }));
}

/** Sections that describe what a visual shows (not how it looks): the format painter leaves them alone. */
const BINDING_SECTIONS = new Set(['chart', 'slicer', 'parameter', 'button', 'navigator', 'python', 'tooltip', 'conditional', 'analytics']);

/** Format painter: the source's look on the target (data bindings and the title text stay). */
export function paintFormat(source: DashboardVisual, target: DashboardVisual): DashboardVisual {
  const format: NonNullable<DashboardVisual['format']> = {};
  for (const [section, value] of Object.entries(target.format ?? {})) if (BINDING_SECTIONS.has(section)) format[section] = value;
  for (const [section, value] of Object.entries(source.format ?? {})) {
    if (BINDING_SECTIONS.has(section)) continue;
    format[section] = section === 'title' ? { ...value, text: (target.format?.title as { text?: string } | undefined)?.text } : value;
  }
  return { ...target, format };
}

/** Quick measures: a pattern plus fields → a calculation, no formula knowledge needed. */
export interface QuickMeasure {
  id: string;
  label: string;
  fields: { key: string; label: string }[];
  format: DashboardCalculation['format'];
  build: (fields: Record<string, string>) => { name: string; expression: string };
}

const nice = (field: string) => field.replace(/[_-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());

export const QUICK_MEASURES: QuickMeasure[] = [
  {
    id: 'ratio',
    label: 'Ratio (A ÷ B), e.g. profit margin',
    fields: [
      { key: 'a', label: 'Numerator' },
      { key: 'b', label: 'Denominator' },
    ],
    format: 'percent',
    build: ({ a, b }) => ({ name: `${nice(a!)} / ${nice(b!)}`, expression: `DIVIDE(SUM([${a}]), SUM([${b}]))` }),
  },
  {
    id: 'average-per-row',
    label: 'Average per row (e.g. average order value)',
    fields: [{ key: 'a', label: 'Value' }],
    format: 'number',
    build: ({ a }) => ({ name: `${nice(a!)} per row`, expression: `DIVIDE(SUM([${a}]), COUNTROWS())` }),
  },
  {
    id: 'vs-target',
    label: 'Versus target (%)',
    fields: [
      { key: 'a', label: 'Actual' },
      { key: 'b', label: 'Target' },
    ],
    format: 'percent',
    build: ({ a, b }) => ({ name: `${nice(a!)} vs target`, expression: `DIVIDE(SUM([${a}]), SUM([${b}])) - 1` }),
  },
  {
    id: 'difference',
    label: 'Difference (A − B)',
    fields: [
      { key: 'a', label: 'Value' },
      { key: 'b', label: 'Minus' },
    ],
    format: 'number',
    build: ({ a, b }) => ({ name: `${nice(a!)} − ${nice(b!)}`, expression: `SUM([${a}]) - SUM([${b}])` }),
  },
  {
    id: 'per-distinct',
    label: 'Value per distinct item (e.g. revenue per customer)',
    fields: [
      { key: 'a', label: 'Value' },
      { key: 'b', label: 'Distinct item' },
    ],
    format: 'number',
    build: ({ a, b }) => ({ name: `${nice(a!)} per ${nice(b!).toLowerCase()}`, expression: `DIVIDE(SUM([${a}]), DISTINCTCOUNT([${b}]))` }),
  },
];

/** A bookmark's page state, applied over the author's defaults. */
export function bookmarkHidden(bookmark: DashboardBookmark | undefined, page: DashboardPage | undefined): Record<string, boolean> | null {
  if (!bookmark || !page || !bookmark.state.hidden) return null;
  const hidden = new Set(bookmark.state.hidden);
  return Object.fromEntries(page.visuals.map((visual) => [visual.id, hidden.has(visual.id)]));
}

/** Brand colour → a palette of 10 evenly spaced hues with the brand's saturation and lightness. */
export function paletteFrom(hex: string, count = 10): string[] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [];
  const value = parseInt(match[1]!, 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const delta = max - min;
  const sat = delta === 0 ? 0.6 : delta / (1 - Math.abs(2 * light - 1));
  let hue = 0;
  if (delta) hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  const s = Math.min(Math.max(sat, 0.45), 0.85);
  const l = Math.min(Math.max(light, 0.38), 0.58);
  return Array.from({ length: count }, (_, index) => hsl((hue + index * (360 / count) * 0.99) % 360, s, l));
}

function hsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** WCAG contrast ratio of two #RRGGBB colours (≥ 4.5 is readable body text). */
export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const value = parseInt(hex.replace('#', ''), 16);
    const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}
