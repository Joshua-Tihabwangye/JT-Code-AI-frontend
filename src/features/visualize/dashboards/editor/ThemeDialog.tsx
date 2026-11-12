import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, Plus, Save, Trash2, Upload, Wand2, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/http';
import i18n from '@/i18n/config';
import { formatNumber } from '@/i18n/format';
import { useRepository, type DashboardTheme, type DashboardThemeColors } from '@/lib/data';
import { saveBlob, safeName } from '../../echarts';
import { contrast, paletteFrom } from '../customize';

const FONTS = ['Inter', 'Segoe UI', 'Roboto', 'Poppins', 'system-ui'];
const T = 'visualize.format.theme';
/** The structural colour roles; their names are `visualize.format.theme.roles.<role>`. */
const STRUCTURAL: (keyof DashboardThemeColors)[] = ['canvas', 'tile', 'border', 'gridline', 'text', 'mutedText', 'accent'];
const HEX = /^#[0-9a-f]{6}$/i;

/** A theme read from JSON (Power BI-ish files too: ``dataColors``, ``background``, ``foreground``). */
export function themeFromJson(raw: unknown, base: DashboardTheme): DashboardTheme {
  if (!raw || typeof raw !== 'object') throw new Error(i18n.t(`${T}.errors.notTheme`));
  const input = raw as Record<string, unknown>;
  const colors = Array.isArray(input.dataColors) ? (input.dataColors as unknown[]).filter((c): c is string => typeof c === 'string' && HEX.test(c)).slice(0, 12) : [];
  if (colors.length < 3) throw new Error(i18n.t(`${T}.errors.needColours`));
  const pick = (value: unknown, fallback: string) => (typeof value === 'string' && HEX.test(value) ? value : fallback);
  const mode = (key: 'light' | 'dark'): DashboardThemeColors => {
    const source = (input[key] && typeof input[key] === 'object' ? input[key] : {}) as Record<string, unknown>;
    const fallback = base[key];
    return Object.fromEntries(STRUCTURAL.map((name) => [name, pick(source[name], key === 'light' && name === 'canvas' ? pick(input.background, fallback[name]) : key === 'light' && name === 'text' ? pick(input.foreground, fallback[name]) : fallback[name])])) as unknown as DashboardThemeColors;
  };
  return {
    ...base,
    id: 'custom',
    name: typeof input.name === 'string' ? input.name.slice(0, 80) : i18n.t(`${T}.importedName`),
    dataColors: colors,
    good: pick(input.good, base.good),
    neutral: pick(input.neutral, base.neutral),
    bad: pick(input.bad, base.bad),
    light: mode('light'),
    dark: mode('dark'),
    fontFamily: typeof input.fontFamily === 'string' && FONTS.includes(input.fontFamily) ? input.fontFamily : base.fontFamily,
    radius: typeof input.radius === 'number' ? Math.max(0, Math.min(24, input.radius)) : base.radius,
    shadow: input.shadow === 'none' || input.shadow === 'soft' || input.shadow === 'medium' ? input.shadow : base.shadow,
    kpiStyle: ['plain', 'solid', 'gradient', 'outlined', 'icon'].includes(input.kpiStyle as string) ? (input.kpiStyle as DashboardTheme['kpiStyle']) : base.kpiStyle,
    density: input.density === 'compact' ? 'compact' : base.density,
  };
}

/** Customize the theme with a live preview: palette, structural colours, font, shape, import/export. */
export function ThemeDialog({ theme, mode, onChange, onClose }: { theme: DashboardTheme; mode: 'light' | 'dark'; onChange: (theme: DashboardTheme) => void; onClose: (keep: boolean) => void }) {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const saved = useQuery({ queryKey: ['visualize', 'themes', 'mine'], queryFn: () => visualize.listThemes() });
  const [brand, setBrand] = useState('#4f46e5');
  const [message, setMessage] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<'light' | 'dark'>(mode);
  const set = (patch: Partial<DashboardTheme>) => onChange({ ...theme, id: theme.id.startsWith('custom') || theme.id.length > 30 ? theme.id : 'custom', ...patch });
  const colors = theme[editing];
  const ratio = contrast(colors.text, colors.tile);
  const muted = contrast(colors.mutedText, colors.tile);
  return (
    <div className="dash-dialog-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && onClose(true)}>
      <div className="dash-dialog" role="dialog" aria-label={t(`${T}.title`)} data-testid="theme-dialog">
        <header className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{t(`${T}.title`)}</h2>
          <input className="viz-field h-7 flex-1 text-xs" value={theme.name} maxLength={80} onChange={(event) => set({ name: event.target.value })} aria-label={t(`${T}.name`)} data-testid="theme-name" />
          <button type="button" className="viz-icon-button" onClick={() => onClose(true)} aria-label={t(`${T}.close`)}>
            <X size={14} />
          </button>
        </header>
        <div className="dash-dialog-body">
          <section>
            <p className="viz-label">{t(`${T}.dataColours`)}</p>
            <div className="flex flex-wrap items-center gap-1" data-testid="theme-palette">
              {theme.dataColors.map((color, index) => (
                <span key={index} className="dash-swatch-edit">
                  <input type="color" className="viz-color-input" value={color} aria-label={t(`${T}.colour`, { index: index + 1 })} onChange={(event) => set({ dataColors: theme.dataColors.map((c, i) => (i === index ? event.target.value : c)) })} />
                  {theme.dataColors.length > 3 && (
                    <button type="button" onClick={() => set({ dataColors: theme.dataColors.filter((_, i) => i !== index) })} aria-label={t(`${T}.removeColour`, { index: index + 1 })}>
                      ×
                    </button>
                  )}
                </span>
              ))}
              {theme.dataColors.length < 12 && (
                <button type="button" className="viz-icon-button" onClick={() => set({ dataColors: [...theme.dataColors, '#94a3b8'] })} aria-label={t(`${T}.addColour`)}>
                  <Plus size={12} />
                </button>
              )}
            </div>
            <div className="mt-1 flex items-center gap-1">
              <input type="color" className="viz-color-input" value={brand} onChange={(event) => setBrand(event.target.value)} aria-label={t(`${T}.brandColour`)} />
              <button type="button" className="viz-chip" onClick={() => set({ dataColors: paletteFrom(brand, 10) })} data-testid="theme-generate">
                <Wand2 size={12} /> {t(`${T}.generate`)}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px]">
              {(['good', 'neutral', 'bad'] as const).map((key) => (
                <label key={key} className="flex items-center gap-1">
                  <input type="color" className="viz-color-input" value={theme[key]} onChange={(event) => set({ [key]: event.target.value })} /> {t(`${T}.sentiment.${key}`)}
                </label>
              ))}
            </div>
          </section>
          <section>
            <div className="flex items-center justify-between">
              <p className="viz-label m-0">{t(`${T}.pageAndTiles`)}</p>
              <div className="viz-segment">
                {(['light', 'dark'] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={editing === value} onClick={() => setEditing(value)}>
                    {value === 'light' ? t(`${T}.light`) : t(`${T}.dark`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {STRUCTURAL.map((key) => (
                <label key={key} className="dash-format-row">
                  <span>{t(`${T}.roles.${key}`)}</span>
                  <input type="color" className="viz-color-input" value={colors[key]} onChange={(event) => set({ [editing]: { ...colors, [key]: event.target.value } })} data-testid={`theme-${editing}-${key}`} />
                </label>
              ))}
            </div>
            {(ratio < 4.5 || muted < 3) && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-600" data-testid="theme-contrast">
                <AlertTriangle size={12} /> {t(`${T}.contrast`, { ratio: formatNumber(ratio, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}
              </p>
            )}
          </section>
          <section className="grid grid-cols-2 gap-x-3 gap-y-1">
            <label className="dash-format-row">
              <span>{t(`${T}.font`)}</span>
              <select className="viz-field" value={theme.fontFamily} onChange={(event) => set({ fontFamily: event.target.value })}>
                {FONTS.map((font) => (
                  <option key={font} value={font}>
                    {font === 'system-ui' ? t(`${T}.systemFont`) : font}
                  </option>
                ))}
              </select>
            </label>
            <label className="dash-format-row">
              <span>{t(`${T}.corners`)}</span>
              <input type="range" min={0} max={24} value={theme.radius} onChange={(event) => set({ radius: Number(event.target.value) })} />
            </label>
            <label className="dash-format-row">
              <span>{t(`${T}.shadow`)}</span>
              <select className="viz-field" value={theme.shadow} onChange={(event) => set({ shadow: event.target.value as DashboardTheme['shadow'] })}>
                <option value="none">{t(`${T}.shadows.none`)}</option>
                <option value="soft">{t(`${T}.shadows.soft`)}</option>
                <option value="medium">{t(`${T}.shadows.medium`)}</option>
              </select>
            </label>
            <label className="dash-format-row">
              <span>{t(`${T}.kpiTiles`)}</span>
              <select className="viz-field" value={theme.kpiStyle} onChange={(event) => set({ kpiStyle: event.target.value as DashboardTheme['kpiStyle'] })} data-testid="theme-kpi-style">
                <option value="plain">{t(`${T}.kpiStyles.plain`)}</option>
                <option value="solid">{t(`${T}.kpiStyles.solid`)}</option>
                <option value="gradient">{t(`${T}.kpiStyles.gradient`)}</option>
                <option value="outlined">{t(`${T}.kpiStyles.outlined`)}</option>
                <option value="icon">{t(`${T}.kpiStyles.icon`)}</option>
              </select>
            </label>
          </section>
          {(saved.data?.length ?? 0) > 0 && (
            <section>
              <p className="viz-label">{t(`${T}.orgThemes`)}</p>
              <ul className="space-y-1">
                {saved.data!.map((item) => (
                  <li key={item.id} className="flex items-center gap-1 text-xs">
                    <span className="dash-theme-swatch small">
                      {item.spec.dataColors.slice(0, 5).map((color, index) => (
                        <i key={index} style={{ background: color }} />
                      ))}
                    </span>
                    <button type="button" className="flex-1 truncate text-left hover:underline" onClick={() => onChange({ ...item.spec, id: item.id })}>
                      {item.name}
                    </button>
                    <button
                      type="button"
                      className="viz-icon-button"
                      onClick={() => void visualize.deleteTheme(item.id).then(() => queryClient.invalidateQueries({ queryKey: ['visualize', 'themes', 'mine'] }))}
                      aria-label={t(`${T}.deleteTheme`, { name: item.name })}
                    >
                      <Trash2 size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <footer className="flex flex-wrap items-center gap-1">
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              event.target.value = '';
              if (!chosen) return;
              void chosen.text().then((text) => {
                try {
                  onChange(themeFromJson(JSON.parse(text), theme));
                  setMessage(t(`${T}.imported`));
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : t(`${T}.errors.notTheme`));
                }
              });
            }}
            data-testid="theme-import-file"
          />
          <button type="button" className="viz-chip" onClick={() => file.current?.click()}>
            <Upload size={12} /> {t(`${T}.importJson`)}
          </button>
          <button type="button" className="viz-chip" onClick={() => saveBlob(new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' }), `${safeName(theme.name || 'theme')}.json`)} data-testid="theme-export">
            <Download size={12} /> {t(`${T}.exportJson`)}
          </button>
          <button
            type="button"
            className="viz-chip"
            onClick={() =>
              void visualize
                .saveTheme({ name: theme.name || t(`${T}.defaultName`), spec: theme, isShared: true })
                .then((item) => {
                  setMessage(t(`${T}.saved`, { name: item.name }));
                  onChange({ ...theme, id: item.id });
                  return queryClient.invalidateQueries({ queryKey: ['visualize', 'themes', 'mine'] });
                })
                .catch((error: unknown) => setMessage(apiErrorMessage(error)))
            }
            data-testid="theme-save"
          >
            <Save size={12} /> {t(`${T}.saveAs`)}
          </button>
          <span className="flex-1 text-[11px] text-muted-foreground" role="status">
            {message}
          </span>
          <button type="button" className="viz-chip" onClick={() => onClose(false)} data-testid="theme-cancel">
            {t(`${T}.cancel`)}
          </button>
          <button type="button" className="viz-chip primary" onClick={() => onClose(true)} data-testid="theme-apply">
            {t(`${T}.done`)}
          </button>
        </footer>
      </div>
    </div>
  );
}
