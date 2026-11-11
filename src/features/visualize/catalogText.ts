import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n/config';
import type { VizCategory, VizChartType, VizOption, VizPalette, VizPredictionTask, VizSample, VizSlot } from '@/lib/data';

const C = 'visualize.charts.';

/** Who a slot or option belongs to: some charts and tasks word a shared slot their own way. */
export type CatalogOwner = { kind: 'chart' | 'task'; id: string };

/** Choice ids as safe key segments (dots, colons and spaces become `_`; an empty id is `_none`). */
const segment = (id: string) => (id === '' ? '_none' : id.replace(/[.: ]/g, '_'));

/**
 * The catalog text in the chosen language. The catalog comes from the server in English; a
 * translation is used only while the English locale file still matches what the server sent, so a
 * changed or new server text shows as sent rather than a stale translation.
 */
function text(key: string, server: string): string {
  if (!i18n.exists(key)) return server;
  const english = i18n.getFixedT('en')(key);
  return english === server ? i18n.t(key) : server;
}

function ownerKey(owner: CatalogOwner | undefined): string | null {
  if (!owner) return null;
  return owner.kind === 'chart' ? `${C}types.${owner.id}` : `${C}tasks.${owner.id}`;
}

/** Owner-specific wording first, then the shared one. */
function owned(owner: CatalogOwner | undefined, suffix: string, server: string): string {
  const base = ownerKey(owner);
  if (base && i18n.exists(`${base}.${suffix}`) && i18n.getFixedT('en')(`${base}.${suffix}`) === server) return i18n.t(`${base}.${suffix}`);
  return text(`${C}${suffix}`, server);
}

export function catalogText() {
  return {
    categoryName: (category: Pick<VizCategory, 'id' | 'name'>) => text(`${C}categories.${category.id}.name`, category.name),
    categoryDescription: (category: Pick<VizCategory, 'id' | 'description'>) => text(`${C}categories.${category.id}.description`, category.description),
    chartName: (chart: Pick<VizChartType, 'id' | 'name'>) => text(`${C}types.${chart.id}.name`, chart.name),
    chartDescription: (chart: Pick<VizChartType, 'id' | 'description'>) => text(`${C}types.${chart.id}.description`, chart.description),
    chartHowToRead: (chart: Pick<VizChartType, 'id' | 'howToRead'>) => text(`${C}types.${chart.id}.howToRead`, chart.howToRead),
    slotLabel: (slot: Pick<VizSlot, 'key' | 'label'>, owner?: CatalogOwner) => owned(owner, `slots.${slot.key}.label`, slot.label),
    slotHelp: (slot: Pick<VizSlot, 'key' | 'help'>, owner?: CatalogOwner) => (slot.help ? owned(owner, `slots.${slot.key}.help`, slot.help) : ''),
    optionLabel: (option: Pick<VizOption, 'key' | 'label'>, owner?: CatalogOwner) => owned(owner, `options.${option.key}`, option.label),
    choiceLabel: (optionKey: string, [value, label]: [string, string]) => text(`${C}choices.${optionKey}.${segment(value)}`, label),
    taskName: (task: Pick<VizPredictionTask, 'id' | 'name'>) => text(`${C}tasks.${task.id}.name`, task.name),
    taskDescription: (task: Pick<VizPredictionTask, 'id' | 'description'>) => text(`${C}tasks.${task.id}.description`, task.description),
    modelName: (taskId: string, [id, name]: [string, string]) => text(`${C}tasks.${taskId}.models.${segment(id)}`, name),
    taskOutput: (taskId: string, index: number, output: string) => text(`${C}tasks.${taskId}.outputs.${index}`, output),
    paletteName: (palette: Pick<VizPalette, 'id' | 'name'>) => text(`${C}palettes.${palette.id}`, palette.name),
    sampleName: (sample: Pick<VizSample, 'id' | 'name'>) => text(`${C}samples.${sample.id}.name`, sample.name),
    sampleDescription: (sample: Pick<VizSample, 'id' | 'description'>) => text(`${C}samples.${sample.id}.description`, sample.description),
    sampleAudience: (sample: Pick<VizSample, 'id' | 'audience'>) => text(`${C}samples.${sample.id}.audience`, sample.audience),
    importFormatName: (format: { id: string; name: string }) => text(`${C}importFormats.${format.id}`, format.name),
    exportFormatName: (format: { id: string; name: string }) => text(`${C}exportFormats.${format.id}`, format.name),
  };
}

export type CatalogText = ReturnType<typeof catalogText>;

/** Catalog text that re-renders when the language changes. */
export function useCatalogText(): CatalogText {
  const { i18n: instance } = useTranslation();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the language is the dependency
  return useMemo(() => catalogText(), [instance.language]);
}
