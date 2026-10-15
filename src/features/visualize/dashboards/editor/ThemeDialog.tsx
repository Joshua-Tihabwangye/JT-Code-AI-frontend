import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, Plus, Save, Trash2, Upload, Wand2, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/http';
import { useRepository, type DashboardTheme, type DashboardThemeColors } from '@/lib/data';
import { saveBlob, safeName } from '../../echarts';
import { contrast, paletteFrom } from '../customize';

const FONTS = ['Inter', 'Segoe UI', 'Roboto', 'Poppins', 'system-ui'];
const STRUCTURAL: [keyof DashboardThemeColors, string][] = [
  ['canvas', 'Canvas'],
  ['tile', 'Tiles'],
  ['border', 'Borders'],
  ['gridline', 'Gridlines'],
  ['text', 'Text'],
  ['mutedText', 'Muted text'],
  ['accent', 'Accent'],
];
const HEX = /^#[0-9a-f]{6}$/i;

/** A theme read from JSON (Power BI-ish files too: ``dataColors``, ``background``, ``foreground``). */
export function themeFromJson(raw: unknown, base: DashboardTheme): DashboardTheme {
  if (!raw || typeof raw !== 'object') throw new Error('The file is not a theme.');
  const input = raw as Record<string, unknown>;
  const colors = Array.isArray(input.dataColors) ? (input.dataColors as unknown[]).filter((c): c is string => typeof c === 'string' && HEX.test(c)).slice(0, 12) : [];
  if (colors.length < 3) throw new Error('A theme needs at least 3 data colours (dataColors).');
  const pick = (value: unknown, fallback: string) => (typeof value === 'string' && HEX.test(value) ? value : fallback);
  const mode = (key: 'light' | 'dark'): DashboardThemeColors => {
    const source = (input[key] && typeof input[key] === 'object' ? input[key] : {}) as Record<string, unknown>;
    const fallback = base[key];
    return Object.fromEntries(STRUCTURAL.map(([name]) => [name, pick(source[name], key === 'light' && name === 'canvas' ? pick(input.background, fallback[name]) : key === 'light' && name === 'text' ? pick(input.foreground, fallback[name]) : fallback[name])])) as unknown as DashboardThemeColors;
  };
  return {
    ...base,
    id: 'custom',
    name: typeof input.name === 'string' ? input.name.slice(0, 80) : 'Imported theme',
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
      <div className="dash-dialog" role="dialog" aria-label="Customize theme" data-testid="theme-dialog">
        <header className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Customize theme</h2>
          <input className="viz-field h-7 flex-1 text-xs" value={theme.name} maxLength={80} onChange={(event) => set({ name: event.target.value })} aria-label="Theme name" data-testid="theme-name" />
          <button type="button" className="viz-icon-button" onClick={() => onClose(true)} aria-label="Close">
            <X size={14} />
          </button>
        </header>
        <div className="dash-dialog-body">
          <section>
            <p className="viz-label">Data colours</p>
            <div className="flex flex-wrap items-center gap-1" data-testid="theme-palette">
              {theme.dataColors.map((color, index) => (
                <span key={index} className="dash-swatch-edit">
                  <input type="color" className="viz-color-input" value={color} aria-label={`Colour ${index + 1}`} onChange={(event) => set({ dataColors: theme.dataColors.map((c, i) => (i === index ? event.target.value : c)) })} />
                  {theme.dataColors.length > 3 && (
                    <button type="button" onClick={() => set({ dataColors: theme.dataColors.filter((_, i) => i !== index) })} aria-label={`Remove colour ${index + 1}`}>
                      ×
                    </button>
                  )}
                </span>
              ))}
              {theme.dataColors.length < 12 && (
                <button type="button" className="viz-icon-button" onClick={() => set({ dataColors: [...theme.dataColors, '#94a3b8'] })} aria-label="Add a colour">
                  <Plus size={12} />
                </button>
              )}
            </div>
            <div className="mt-1 flex items-center gap-1">
              <input type="color" className="viz-color-input" value={brand} onChange={(event) => setBrand(event.target.value)} aria-label="Brand colour" />
              <button type="button" className="viz-chip" onClick={() => set({ dataColors: paletteFrom(brand, 10) })} data-testid="theme-generate">
                <Wand2 size={12} /> Palette from my brand colour
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px]">
              {(['good', 'neutral', 'bad'] as const).map((key) => (
                <label key={key} className="flex items-center gap-1">
                  <input type="color" className="viz-color-input" value={theme[key]} onChange={(event) => set({ [key]: event.target.value })} /> {key[0]!.toUpperCase() + key.slice(1)}
                </label>
              ))}
            </div>
          </section>
          <section>
            <div className="flex items-center justify-between">
              <p className="viz-label m-0">Page and tiles</p>
              <div className="viz-segment">
                {(['light', 'dark'] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={editing === value} onClick={() => setEditing(value)}>
                    {value === 'light' ? 'Light' : 'Dark'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {STRUCTURAL.map(([key, label]) => (
                <label key={key} className="dash-format-row">
                  <span>{label}</span>
                  <input type="color" className="viz-color-input" value={colors[key]} onChange={(event) => set({ [editing]: { ...colors, [key]: event.target.value } })} data-testid={`theme-${editing}-${key}`} />
                </label>
              ))}
            </div>
            {(ratio < 4.5 || muted < 3) && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-600" data-testid="theme-contrast">
                <AlertTriangle size={12} /> Text is hard to read on tiles ({ratio.toFixed(1)}:1 — aim for 4.5:1 or more).
              </p>
            )}
          </section>
          <section className="grid grid-cols-2 gap-x-3 gap-y-1">
            <label className="dash-format-row">
              <span>Font</span>
              <select className="viz-field" value={theme.fontFamily} onChange={(event) => set({ fontFamily: event.target.value })}>
                {FONTS.map((font) => (
                  <option key={font} value={font}>
                    {font === 'system-ui' ? 'System' : font}
                  </option>
                ))}
              </select>
            </label>
            <label className="dash-format-row">
              <span>Corners</span>
              <input type="range" min={0} max={24} value={theme.radius} onChange={(event) => set({ radius: Number(event.target.value) })} />
            </label>
            <label className="dash-format-row">
              <span>Shadow</span>
              <select className="viz-field" value={theme.shadow} onChange={(event) => set({ shadow: event.target.value as DashboardTheme['shadow'] })}>
                <option value="none">None</option>
                <option value="soft">Soft</option>
                <option value="medium">Medium</option>
              </select>
            </label>
            <label className="dash-format-row">
              <span>KPI tiles</span>
              <select className="viz-field" value={theme.kpiStyle} onChange={(event) => set({ kpiStyle: event.target.value as DashboardTheme['kpiStyle'] })} data-testid="theme-kpi-style">
                <option value="plain">Plain</option>
                <option value="solid">Solid colour</option>
                <option value="gradient">Gradient</option>
                <option value="outlined">Outlined</option>
                <option value="icon">Accent bar</option>
              </select>
            </label>
          </section>
          {(saved.data?.length ?? 0) > 0 && (
            <section>
              <p className="viz-label">My organization's themes</p>
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
                      aria-label={`Delete ${item.name}`}
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
                  setMessage('Imported.');
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : 'The file is not a theme.');
                }
              });
            }}
            data-testid="theme-import-file"
          />
          <button type="button" className="viz-chip" onClick={() => file.current?.click()}>
            <Upload size={12} /> Import JSON
          </button>
          <button type="button" className="viz-chip" onClick={() => saveBlob(new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' }), `${safeName(theme.name || 'theme')}.json`)} data-testid="theme-export">
            <Download size={12} /> Export JSON
          </button>
          <button
            type="button"
            className="viz-chip"
            onClick={() =>
              void visualize
                .saveTheme({ name: theme.name || 'My theme', spec: theme, isShared: true })
                .then((item) => {
                  setMessage(`Saved “${item.name}” for your organization.`);
                  onChange({ ...theme, id: item.id });
                  return queryClient.invalidateQueries({ queryKey: ['visualize', 'themes', 'mine'] });
                })
                .catch((error: unknown) => setMessage(apiErrorMessage(error)))
            }
            data-testid="theme-save"
          >
            <Save size={12} /> Save as my theme
          </button>
          <span className="flex-1 text-[11px] text-muted-foreground" role="status">
            {message}
          </span>
          <button type="button" className="viz-chip" onClick={() => onClose(false)} data-testid="theme-cancel">
            Cancel
          </button>
          <button type="button" className="viz-chip primary" onClick={() => onClose(true)} data-testid="theme-apply">
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
