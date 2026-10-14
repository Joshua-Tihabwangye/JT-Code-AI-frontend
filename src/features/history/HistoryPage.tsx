import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Clock, Download, MessageSquare, Pin, Search, Trash2 } from 'lucide-react';
import { Alert, Button, Input } from '@/shared/components';
import { useRepository, type Conversation } from '@/lib/data';
import { apiErrorMessage } from '@/lib/api/http';

function formatRelativeTime(iso: string, locale: string) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (diffMs < 60_000) return rtf.format(-Math.round(diffMs / 1000), 'second');
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return rtf.format(-diffMins, 'minute');
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return rtf.format(-diffHours, 'hour');
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) return rtf.format(-diffDays, 'day');
  return date.toLocaleDateString(locale);
}

function saveText(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function HistoryPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const history = useRepository('history');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [archivedOnly, setArchivedOnly] = useState(false);
  const [error, setError] = useState('');

  const filter = { search: search.trim() || undefined, archivedOnly };
  const conversations = useQuery({
    queryKey: ['conversations', filter],
    queryFn: () => history.list(filter),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['conversations'] });
  const onError = (err: unknown) => setError(apiErrorMessage(err));

  const remove = useMutation({ mutationFn: (id: string) => history.delete(id), onSuccess: refresh, onError });
  const pin = useMutation({
    mutationFn: (c: Conversation) => history.pin(c.id, !c.pinned),
    onSuccess: refresh,
    onError,
  });
  const archive = useMutation({
    mutationFn: (c: Conversation) => history.archive(c.id, !c.archived),
    onSuccess: refresh,
    onError,
  });
  const clear = useMutation({ mutationFn: () => history.clearAll(), onSuccess: refresh, onError });
  const exportOne = useMutation({
    mutationFn: async (c: Conversation) => saveText(`${c.title || 'conversation'}.md`, await history.export(c.id, 'markdown'), 'text/markdown'),
    onError,
  });

  const items = conversations.data ?? [];

  return (
    <section className="workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{t('history.eyebrow')}</p>
          <h1>{t('history.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('history.subtitle')}</p>
        </div>
        {items.length > 0 && !archivedOnly && (
          <Button
            variant="outline"
            onClick={() => confirm(t('history.clearConfirm')) && clear.mutate()}
            className="gap-1.5"
            disabled={clear.isPending}
          >
            <Trash2 size={16} /> {t('history.clearHistory')}
          </Button>
        )}
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('history.searchPlaceholder')}
            aria-label={t('history.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Button variant={archivedOnly ? 'default' : 'outline'} size="sm" onClick={() => setArchivedOnly((v) => !v)} className="gap-1.5">
          <Archive size={14} /> {t('history.archived')}
        </Button>
      </div>

      {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
      {conversations.isError && <Alert variant="destructive" className="mb-4">{apiErrorMessage(conversations.error)}</Alert>}

      {conversations.isLoading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Clock size={40} className="mx-auto mb-3 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground mb-1">{t('history.emptyTitle')}</h2>
          <p className="text-sm text-muted-foreground mb-5">{t('history.emptyDesc')}</p>
          <Link
            to="/app/chat"
            className="inline-flex items-center justify-center rounded-md bg-secondary text-foreground px-4 py-2 text-sm font-medium hover:bg-secondary/80 transition-colors"
          >
            {t('history.startChatting')}
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-border" data-testid="history-list">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 py-4">
              <div className="p-2.5 rounded-md bg-secondary text-foreground">
                <MessageSquare size={18} />
              </div>
              <button
                type="button"
                className="flex-1 min-w-0 text-left"
                onClick={() => void navigate(`/app/chat?c=${item.id}`)}
                aria-label={t('history.openAria', { title: item.title })}
              >
                <div className="flex items-center gap-2">
                  {item.pinned && <Pin size={12} className="text-primary" aria-label={t('history.pinned')} />}
                  <h3 className="text-sm font-semibold text-foreground truncate">{item.title || t('history.untitled')}</h3>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(item.updatedAt, i18n.language)}
                  </span>
                </div>
                <p className="text-sm text-foreground/80 truncate">{item.preview}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('common.messagesCount', { count: item.messageCount })}</p>
              </button>
              <Button variant="ghost" size="sm" onClick={() => pin.mutate(item)} aria-label={item.pinned ? t('history.unpin') : t('history.pin')}>
                <Pin size={16} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => archive.mutate(item)} aria-label={item.archived ? t('history.unarchive') : t('history.archive')}>
                <Archive size={16} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => exportOne.mutate(item)} aria-label={t('history.export')}>
                <Download size={16} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => remove.mutate(item.id)} aria-label={t('history.deleteItemAria', { title: item.title })}>
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
