import { useTranslation } from 'react-i18next';
import { Columns3, LayoutDashboard, MousePointerClick, Move } from 'lucide-react';
import type { DashboardVisualType } from '@/lib/data';
import { ChartThumb } from '../../thumbs';

const QUICK: { type: DashboardVisualType; color: string }[] = [
  { type: 'card', color: '#6366f1' },
  { type: 'column', color: '#0ea5e9' },
  { type: 'line', color: '#10b981' },
  { type: 'donut', color: '#ec4899' },
  { type: 'table', color: '#64748b' },
  { type: 'slicer', color: '#f59e0b' },
];

const STEPS = [
  { key: 'step1', icon: MousePointerClick },
  { key: 'step2', icon: Columns3 },
  { key: 'step3', icon: Move },
] as const;

/** The start screen of an empty dashboard page: how building by hand works, and the first visual. */
export function EmptyPageGuide({ onInsert }: { onInsert: (type: DashboardVisualType) => void }) {
  const { t } = useTranslation();
  return (
    <div className="dash-start" data-testid="empty-page-guide">
      <header className="dash-start-head">
        <span className="dash-start-badge">
          <LayoutDashboard size={22} aria-hidden />
        </span>
        <div>
          <h2>{t('visualize.editor.guide.title')}</h2>
          <p>{t('visualize.editor.guide.subtitle')}</p>
        </div>
      </header>

      <ol className="dash-start-steps">
        {STEPS.map(({ key, icon: Icon }, index) => (
          <li key={key}>
            <span className="dash-start-step-number">{index + 1}</span>
            <Icon size={16} aria-hidden />
            <span>{t(`visualize.editor.guide.${key}`)}</span>
          </li>
        ))}
      </ol>

      <p className="dash-start-label">{t('visualize.editor.guide.pick')}</p>
      <div className="dash-start-visuals">
        {QUICK.map(({ type, color }) => (
          <button key={type} type="button" className="dash-start-visual" style={{ '--c': color } as React.CSSProperties} onClick={() => onInsert(type)} data-testid={`guide-insert-${type}`}>
            <span className="dash-start-thumb">
              <ChartThumb id={type} color={color} />
            </span>
            <span className="dash-start-name">{t(`visualize.editor.guide.visuals.${type}`)}</span>
            <span className="dash-start-hint">{t(`visualize.editor.guide.hints.${type}`)}</span>
          </button>
        ))}
      </div>
      <p className="dash-start-more">{t('visualize.editor.guide.more')}</p>
    </div>
  );
}
