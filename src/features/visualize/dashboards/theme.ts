import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRepository, type DashboardSpec, type DashboardTheme } from '@/lib/data';

/** Built-in dashboard themes (served by the API so Python and the browser share one definition). */
export function useBuiltInThemes() {
  const visualize = useRepository('visualize');
  return useQuery({ queryKey: ['visualize', 'themes', 'builtin'], queryFn: () => visualize.builtInThemes(), staleTime: Infinity });
}

export function resolveTheme(value: DashboardSpec['theme'] | undefined, themes: DashboardTheme[] | undefined): DashboardTheme | undefined {
  if (value && typeof value === 'object') return value;
  return themes?.find((theme) => theme.id === value) ?? themes?.[0];
}

export function resolveMode(mode: DashboardSpec['mode'] | undefined, appTheme: 'light' | 'dark'): 'light' | 'dark' {
  return mode === 'light' || mode === 'dark' ? mode : appTheme;
}

const SHADOWS = { none: 'none', soft: '0 1px 2px rgb(15 23 42 / 0.06), 0 8px 24px -14px rgb(15 23 42 / 0.25)', medium: '0 4px 18px -6px rgb(15 23 42 / 0.35)' };

/** The theme as CSS variables for the canvas, tiles and KPI cards. */
export function themeStyle(theme: DashboardTheme | undefined, mode: 'light' | 'dark', density: 'compact' | 'comfortable' = 'comfortable'): CSSProperties {
  if (!theme) return {};
  const colors = theme[mode];
  return {
    '--dash-canvas': colors.canvas,
    '--dash-tile': colors.tile,
    '--dash-border': colors.border,
    '--dash-grid': colors.gridline,
    '--dash-text': colors.text,
    '--dash-muted': colors.mutedText,
    '--dash-accent': colors.accent,
    '--dash-good': theme.good,
    '--dash-bad': theme.bad,
    '--dash-radius': `${theme.radius}px`,
    '--dash-shadow': SHADOWS[theme.shadow] ?? SHADOWS.soft,
    '--dash-gap': density === 'compact' ? '6px' : '10px',
    fontFamily: `${theme.fontFamily}, ui-sans-serif, system-ui, sans-serif`,
  } as CSSProperties;
}

/** Background for a KPI tile in the theme's chosen style (solid and gradient tiles use white text). */
export function kpiTileStyle(theme: DashboardTheme | undefined, index: number): { style: CSSProperties; inverted: boolean } {
  if (!theme) return { style: {}, inverted: false };
  const color = theme.dataColors[index % theme.dataColors.length] ?? '#4F46E5';
  const next = theme.dataColors[(index + 1) % theme.dataColors.length] ?? color;
  switch (theme.kpiStyle) {
    case 'solid':
      return { style: { background: color, borderColor: color }, inverted: true };
    case 'gradient':
      return { style: { background: `linear-gradient(135deg, ${color}, ${next})`, borderColor: 'transparent' }, inverted: true };
    case 'outlined':
      return { style: { borderColor: color, borderWidth: 2 }, inverted: false };
    default:
      return { style: { '--kpi-accent': color } as CSSProperties, inverted: false };
  }
}
