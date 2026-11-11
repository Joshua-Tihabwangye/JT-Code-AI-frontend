import { ArrowLeft, Bookmark, ExternalLink, Eye, FilterX, Check, Sparkles, RotateCcw, type LucideIcon, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDate, formatNumber } from '@/i18n/format';
import type { DashboardBookmark, DashboardParameter, DashboardSpec, DashboardVisual } from '@/lib/data';
import { EChart } from '../EChart';
import { parameterValue, type ParameterValues } from './customize';

/** What a button does when clicked (``format.button.action``). */
export type ButtonAction =
  | { kind: 'page'; pageId?: string }
  | { kind: 'bookmark'; bookmarkId?: string }
  | { kind: 'back' }
  | { kind: 'clear_slicers' }
  | { kind: 'apply_slicers' }
  | { kind: 'url'; url?: string }
  | { kind: 'toggle'; visualId?: string }
  | { kind: 'ask_ai' }
  | { kind: 'reset' };

/** Button actions and the i18n key of each one's default button text. */
export const BUTTON_ACTIONS: [ButtonAction['kind'], string][] = [
  ['page', 'visualize.format.button.actions.page'],
  ['bookmark', 'visualize.format.button.actions.bookmark'],
  ['back', 'visualize.format.button.actions.back'],
  ['clear_slicers', 'visualize.format.button.actions.clearSlicers'],
  ['apply_slicers', 'visualize.format.button.actions.applySlicers'],
  ['toggle', 'visualize.format.button.actions.toggle'],
  ['url', 'visualize.format.button.actions.url'],
  ['ask_ai', 'visualize.format.button.actions.askAi'],
  ['reset', 'visualize.format.button.actions.reset'],
];

const ICONS: Partial<Record<ButtonAction['kind'], LucideIcon>> = {
  page: ChevronRight,
  bookmark: Bookmark,
  back: ArrowLeft,
  clear_slicers: FilterX,
  apply_slicers: Check,
  url: ExternalLink,
  toggle: Eye,
  ask_ai: Sparkles,
  reset: RotateCcw,
};

/** Everything a browser-drawn visual needs from the page around it. */
export interface LocalContext {
  spec: DashboardSpec;
  pageId: string;
  parameters: ParameterValues;
  setParameter: (id: string, value: number) => void;
  bookmarks: DashboardBookmark[];
  activeBookmark?: string;
  onAction: (action: ButtonAction) => void;
}

/** Only http(s) links open, in a new tab without access to this page. */
export function safeUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** A parameter's value as shown on its control, in the chosen language. */
function formatParameterValue(value: number, format: string | undefined): string {
  if (format === 'percent') return formatNumber(value, { style: 'percent', maximumFractionDigits: Math.abs(value) < 0.1 ? 1 : 0 });
  const text = formatNumber(value, { maximumFractionDigits: 2 });
  return format === 'currency' ? `$${text}` : text;
}

function ParameterControl({ parameter, context, style }: { parameter: DashboardParameter; context: LocalContext; style?: string }) {
  const value = parameterValue(parameter, context.parameters);
  if (parameter.kind === 'whatif') {
    return (
      <div className="dash-param" data-testid={`param-${parameter.id}`}>
        <div className="dash-param-head">
          <span className="dash-kpi-label">{parameter.name}</span>
          <output className="dash-param-value">{formatParameterValue(value, parameter.format)}</output>
        </div>
        <input
          type="range"
          min={parameter.min}
          max={parameter.max}
          step={parameter.step}
          value={value}
          aria-label={parameter.name}
          onChange={(event) => context.setParameter(parameter.id, Number(event.target.value))}
          data-testid={`param-slider-${parameter.id}`}
        />
      </div>
    );
  }
  if (style === 'dropdown') {
    return (
      <label className="dash-param">
        <span className="dash-kpi-label">{parameter.name}</span>
        <select className="viz-field" value={value} onChange={(event) => context.setParameter(parameter.id, Number(event.target.value))} data-testid={`param-select-${parameter.id}`}>
          {parameter.options.map((option, index) => (
            <option key={index} value={index}>
              {option.label || option.field}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div className="dash-param" role="radiogroup" aria-label={parameter.name} data-testid={`param-${parameter.id}`}>
      <span className="dash-kpi-label">{parameter.name}</span>
      <div className="dash-param-tiles">
        {parameter.options.map((option, index) => (
          <button key={index} type="button" role="radio" aria-checked={index === value} onClick={() => context.setParameter(parameter.id, index)} data-testid={`param-option-${parameter.id}-${index}`}>
            {option.label || humanizeField(option.field)}
          </button>
        ))}
      </div>
    </div>
  );
}

function humanizeField(field: string): string {
  return field.replace(/[_-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** A frozen chart (pinned from Predict): drawn from its stored option, dated. */
function Snapshot({ visual }: { visual: DashboardVisual }) {
  const { t } = useTranslation();
  const snapshot = (visual.format?.snapshot ?? {}) as { option?: Record<string, unknown>; takenAt?: string; source?: string };
  if (!snapshot.option) return <p className="dash-message">{t('visualize.dashboards.local.snapshotEmpty')}</p>;
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <EChart option={snapshot.option} height="100%" testId={`visual-${visual.id}`} />
      </div>
      <p className="dash-snapshot-note" title={snapshot.source}>
        {snapshot.takenAt ? t('visualize.dashboards.local.snapshotOn', { date: formatDate(snapshot.takenAt) }) : t('visualize.dashboards.local.snapshot')}
      </p>
    </div>
  );
}

/** Parameter controls, buttons and page/bookmark navigators. */
export function LocalVisual({ visual, context }: { visual: DashboardVisual; context: LocalContext | undefined }) {
  const { t } = useTranslation();
  if (visual.type === 'snapshot') return <Snapshot visual={visual} />;
  if (!context) return null;
  if (visual.type === 'parameter') {
    const settings = (visual.format?.parameter ?? {}) as { id?: string; style?: string };
    const parameter = context.spec.parameters?.find((item) => item.id === settings.id);
    if (!parameter) return <p className="dash-message">{t('visualize.dashboards.local.chooseParameter')}</p>;
    return <ParameterControl parameter={parameter} context={context} style={settings.style} />;
  }
  if (visual.type === 'button') {
    const settings = (visual.format?.button ?? {}) as { text?: string; action?: ButtonAction; fill?: 'primary' | 'outline' | 'ghost' };
    const action = settings.action ?? { kind: 'clear_slicers' };
    const Icon = ICONS[action.kind];
    return (
      <button type="button" className={`dash-button ${settings.fill ?? 'primary'}`} onClick={() => context.onAction(action)} data-testid={`button-${visual.id}`}>
        {Icon && <Icon size={14} aria-hidden />}
        <span>{settings.text || t(BUTTON_ACTIONS.find(([kind]) => kind === action.kind)?.[1] ?? 'visualize.dashboards.local.button')}</span>
      </button>
    );
  }
  if (visual.type === 'navigator') {
    const settings = (visual.format?.navigator ?? {}) as { kind?: 'pages' | 'bookmarks' };
    if (settings.kind === 'bookmarks') {
      if (!context.bookmarks.length) return <p className="dash-message">{t('visualize.dashboards.local.noViews')}</p>;
      return (
        <nav className="dash-navigator" aria-label={t('visualize.dashboards.local.views')}>
          {context.bookmarks.map((bookmark) => (
            <button key={bookmark.id} type="button" aria-pressed={bookmark.id === context.activeBookmark} onClick={() => context.onAction({ kind: 'bookmark', bookmarkId: bookmark.id })}>
              {bookmark.name}
            </button>
          ))}
        </nav>
      );
    }
    const pages = context.spec.pages.filter((page) => (page.type ?? 'page') === 'page' && !page.hidden);
    return (
      <nav className="dash-navigator" aria-label={t('visualize.dashboards.local.pages')} data-testid={`navigator-${visual.id}`}>
        {pages.map((page) => (
          <button key={page.id} type="button" aria-pressed={page.id === context.pageId} onClick={() => context.onAction({ kind: 'page', pageId: page.id })}>
            {page.name}
          </button>
        ))}
      </nav>
    );
  }
  return null;
}
