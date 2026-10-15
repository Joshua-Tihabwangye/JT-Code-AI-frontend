// Apache ECharts is loaded on demand (code-split): the core when the first chart is shown,
// echarts-gl only for 3D charts, and the world map only for map charts.
import type * as EChartsModule from 'echarts';
import type { ChartOption } from '@/lib/data';
import { hydrate, optionNeeds } from './hydrate';

type ECharts = typeof EChartsModule;

let core: Promise<ECharts> | null = null;
let gl: Promise<unknown> | null = null;
let world: Promise<void> | null = null;

export function loadECharts(): Promise<ECharts> {
  core ??= import('echarts');
  return core;
}

export async function prepare(option: ChartOption, loadWorld: () => Promise<Record<string, unknown>>): Promise<ECharts> {
  const echarts = await loadECharts();
  const needs = optionNeeds(option);
  if (needs.gl) {
    gl ??= import('echarts-gl');
    await gl;
  }
  if (needs.map && !echarts.getMap('world')) {
    world ??= loadWorld().then((geo) => echarts.registerMap('world', geo as never));
    await world;
  }
  return echarts;
}

export function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'chart';
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function saveDataUrl(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Download a chart as PNG (2× resolution) or SVG; SVG renders off-screen with the SVG renderer. */
export async function downloadChart(
  option: ChartOption,
  format: 'png' | 'svg',
  filename: string,
  loadWorld: () => Promise<Record<string, unknown>>,
  size = { width: 1200, height: 700 },
): Promise<void> {
  const echarts = await prepare(option, loadWorld);
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${size.width}px;height:${size.height}px`;
  document.body.appendChild(host);
  const chart = echarts.init(host, null, { renderer: format === 'svg' ? 'svg' : 'canvas', width: size.width, height: size.height });
  try {
    chart.setOption({ ...hydrate(option), animation: false });
    const url = chart.getDataURL({ type: format, pixelRatio: 2, backgroundColor: (option.backgroundColor as string) ?? '#fff' });
    saveDataUrl(url, `${safeName(filename)}.${format}`);
  } finally {
    chart.dispose();
    host.remove();
  }
}
