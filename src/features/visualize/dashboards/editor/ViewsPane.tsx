import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, BookmarkPlus, Play, RefreshCw, Trash2 } from 'lucide-react';
import type { DashboardBookmark, DashboardBookmarkState, DashboardSpec } from '@/lib/data';
import { newId } from './catalog';

/** Author views (bookmarks): the current page with its slicers, filters, drill, parameters and visibility. */
export function ViewsPane({
  spec,
  pageId,
  capture,
  onApply,
  onSpec,
}: {
  spec: DashboardSpec;
  pageId: string;
  capture: () => DashboardBookmarkState;
  onApply: (bookmark: DashboardBookmark) => void;
  onSpec: (mutate: (spec: DashboardSpec) => DashboardSpec) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const bookmarks = spec.bookmarks ?? [];
  const save = (next: DashboardBookmark[]) => onSpec((current) => ({ ...current, bookmarks: next }));
  const move = (index: number, by: number) => {
    const next = [...bookmarks];
    const [item] = next.splice(index, 1);
    next.splice(Math.max(0, Math.min(next.length, index + by)), 0, item!);
    save(next);
  };
  return (
    <div className="space-y-2" data-testid="views-pane">
      <p className="text-[11px] text-muted-foreground">
        {t('visualize.panes.views.intro')}
      </p>
      <form
        className="flex gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          save([...bookmarks, { id: newId('view'), name: name.trim(), pageId, state: capture() }]);
          setName('');
        }}
      >
        <input className="viz-field h-7 flex-1 text-xs" value={name} maxLength={60} placeholder={t('visualize.panes.views.namePlaceholder')} onChange={(event) => setName(event.target.value)} data-testid="author-view-name" />
        <button type="submit" className="viz-chip" disabled={!name.trim()} data-testid="add-author-view">
          <BookmarkPlus size={12} /> {t('visualize.panes.views.add')}
        </button>
      </form>
      <ul className="space-y-1">
        {bookmarks.map((bookmark, index) => (
          <li key={bookmark.id} className="dash-view-row" data-testid={`author-view-${index}`}>
            <input
              className="viz-field h-7 flex-1 text-xs"
              value={bookmark.name}
              maxLength={60}
              onChange={(event) => save(bookmarks.map((item) => (item.id === bookmark.id ? { ...item, name: event.target.value } : item)))}
              aria-label={t('visualize.panes.views.nameAria')}
            />
            <span className="text-[10px] text-muted-foreground">{spec.pages.find((page) => page.id === bookmark.pageId)?.name}</span>
            <button type="button" title={t('visualize.panes.views.show')} onClick={() => onApply(bookmark)}>
              <Play size={12} />
            </button>
            <button type="button" title={t('visualize.panes.views.update')} onClick={() => save(bookmarks.map((item) => (item.id === bookmark.id ? { ...item, pageId, state: capture() } : item)))}>
              <RefreshCw size={12} />
            </button>
            <button type="button" title={t('visualize.panes.moveUp')} disabled={index === 0} onClick={() => move(index, -1)}>
              <ArrowUp size={12} />
            </button>
            <button type="button" title={t('visualize.panes.moveDown')} disabled={index === bookmarks.length - 1} onClick={() => move(index, 1)}>
              <ArrowDown size={12} />
            </button>
            <button type="button" title={t('visualize.panes.views.delete')} onClick={() => save(bookmarks.filter((item) => item.id !== bookmark.id))}>
              <Trash2 size={12} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
