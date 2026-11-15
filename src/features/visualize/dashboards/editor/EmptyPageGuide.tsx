import { useTranslation } from 'react-i18next';
import { BarChart3, CreditCard, Filter, LineChart, PieChart, Table2 } from 'lucide-react';
import type { DashboardVisualType } from '@/lib/data';

const QUICK: { type: DashboardVisualType; icon: typeof BarChart3 }[] = [
  { type: 'card', icon: CreditCard },
  { type: 'column', icon: BarChart3 },
  { type: 'line', icon: LineChart },
  { type: 'donut', icon: PieChart },
  { type: 'table', icon: Table2 },
  { type: 'slicer', icon: Filter },
];

/** On an empty page: how to build a dashboard by hand, with one-click first visuals. */
export function EmptyPageGuide({ onInsert }: { onInsert: (type: DashboardVisualType) => void }) {
  const { t } = useTranslation();
  return (
    <div className="dash-empty-guide" data-testid="empty-page-guide">
      <h2>{t('visualize.editor.guide.title')}</h2>
      <ol>
        <li>{t('visualize.editor.guide.step1')}</li>
        <li>{t('visualize.editor.guide.step2')}</li>
        <li>{t('visualize.editor.guide.step3')}</li>
      </ol>
      <div className="dash-empty-guide-actions">
        {QUICK.map(({ type, icon: Icon }) => (
          <button key={type} type="button" onClick={() => onInsert(type)} data-testid={`guide-insert-${type}`}>
            <Icon size={18} aria-hidden />
            <span>{t(`visualize.editor.guide.visuals.${type}`)}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('visualize.editor.guide.more')}</p>
    </div>
  );
}
