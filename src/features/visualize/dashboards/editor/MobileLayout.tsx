import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Minus, Plus, Smartphone, Trash2, Wand2 } from 'lucide-react';
import type { DashboardPage, DashboardTheme, DashboardVisual, VisualOutput } from '@/lib/data';
import { humanize } from '../../ui';
import { autoMobileLayout } from '../customize';
import type { LocalContext } from '../local';
import { kpiIndexes, ROW_PX, Tile } from '../runtime';

type Layout = NonNullable<DashboardPage['mobileLayout']>;

/** The phone layout: one column of visuals, in order, each with its own height (desktop unchanged). */
export function MobileLayoutEditor({
  page,
  visuals,
  outputs,
  theme,
  local,
  onChange,
}: {
  page: DashboardPage;
  visuals: DashboardVisual[];
  outputs: Record<string, VisualOutput>;
  theme: DashboardTheme | undefined;
  local: LocalContext;
  onChange: (layout: Layout) => void;
}) {
  const { t } = useTranslation();
  const layout = [...(page.mobileLayout ?? [])].sort((a, b) => a.y - b.y);
  const byId = new Map(visuals.map((visual) => [visual.id, visual]));
  const unused = page.visuals.filter((visual) => !layout.some((item) => item.visualId === visual.id));
  const kpis = kpiIndexes(visuals);
  const save = (next: Layout) => onChange(next.map((item, index) => ({ ...item, y: index })));
  const move = (index: number, by: number) => {
    const next = [...layout];
    const [item] = next.splice(index, 1);
    next.splice(Math.max(0, Math.min(next.length, index + by)), 0, item!);
    save(next);
  };
  const label = (visual: DashboardVisual) => outputs[visual.id]?.title || visual.title || humanize(visual.type);
  return (
    <div className="dash-mobile-editor" data-testid="mobile-editor">
      <div className="dash-phone" aria-label={t('visualize.panes.mobile.phone')}>
        {layout.length === 0 && (
          <div className="dash-message">
            <Smartphone size={18} aria-hidden />
            <span>{t('visualize.panes.mobile.empty')}</span>
            <button type="button" onClick={() => onChange(autoMobileLayout(page))} data-testid="mobile-auto">
              <Wand2 size={12} aria-hidden /> {t('visualize.panes.mobile.auto')}
            </button>
          </div>
        )}
        {layout.map((item, index) => {
          const visual = byId.get(item.visualId) ?? page.visuals.find((v) => v.id === item.visualId);
          if (!visual) return null;
          return (
            <div key={item.visualId} className="dash-phone-item" data-testid={`mobile-item-${item.visualId}`}>
              <Tile visual={visual} output={outputs[visual.id]} theme={theme} kpiIndex={kpis[visual.id] ?? -1} style={{ position: 'relative', height: item.h * ROW_PX }} onSelect={() => undefined} local={local} />
              <div className="dash-phone-tools">
                <button type="button" title={t('visualize.panes.moveUp')} disabled={index === 0} onClick={() => move(index, -1)}>
                  <ArrowUp size={12} />
                </button>
                <button type="button" title={t('visualize.panes.moveDown')} disabled={index === layout.length - 1} onClick={() => move(index, 1)}>
                  <ArrowDown size={12} />
                </button>
                <button type="button" title={t('visualize.panes.mobile.shorter')} disabled={item.h <= 2} onClick={() => save(layout.map((other) => (other.visualId === item.visualId ? { ...other, h: other.h - 1 } : other)))}>
                  <Minus size={12} />
                </button>
                <button type="button" title={t('visualize.panes.mobile.taller')} onClick={() => save(layout.map((other) => (other.visualId === item.visualId ? { ...other, h: other.h + 1 } : other)))} data-testid={`mobile-taller-${item.visualId}`}>
                  <Plus size={12} />
                </button>
                <button type="button" title={t('visualize.panes.mobile.remove')} onClick={() => save(layout.filter((other) => other.visualId !== item.visualId))} data-testid={`mobile-remove-${item.visualId}`}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {layout.length > 0 && (
        <aside className="dash-mobile-side">
          <p className="viz-label">{t('visualize.panes.mobile.notOnPhones')}</p>
          {unused.length === 0 && <p className="text-[11px] text-muted-foreground">{t('visualize.panes.mobile.allPlaced')}</p>}
          {unused.map((visual) => (
            <button key={visual.id} type="button" className="viz-chip w-full justify-start" onClick={() => save([...layout, { visualId: visual.id, y: layout.length, h: visual.type === 'kpi' || visual.type === 'card' ? 4 : 9 }])} data-testid={`mobile-add-${visual.id}`}>
              <Plus size={12} /> <span className="truncate">{label(visual)}</span>
            </button>
          ))}
          <button type="button" className="viz-chip mt-2" onClick={() => onChange([])} data-testid="mobile-clear">
            {t('visualize.panes.mobile.clear')}
          </button>
        </aside>
      )}
    </div>
  );
}
