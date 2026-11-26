import { useState } from 'react';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AUDIT_CATEGORIES, useRepository, type AuditFilter } from '@/lib/data';
import { apiErrorMessage } from '@/lib/api/http';
import { config } from '@/lib/config';
import { formatDateTime } from '@/i18n/format';
import { saveBlob } from '@/features/visualize/echarts';
import { Alert, Badge, Button, Input, Select, Spinner } from '@/shared/components';

/** Settings → Audit log: who did what in this workspace (organization admins only). */
export function AuditTab() {
  const { t } = useTranslation();
  const audit = useRepository('audit');
  const [filter, setFilter] = useState<AuditFilter>({ category: '', startDate: '', endDate: '' });
  const [error, setError] = useState('');

  const events = useInfiniteQuery({
    queryKey: ['audit-events', filter],
    queryFn: ({ pageParam }) => audit.list(filter, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    retry: false,
  });
  const download = useMutation({
    mutationFn: () => audit.exportCsv(filter),
    onSuccess: (blob) => saveBlob(blob, `audit-log-${new Date().toISOString().slice(0, 10)}.csv`),
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const forbidden = events.isError && (events.error as { response?: { status?: number } }).response?.status === 403;
  const rows = events.data?.pages.flatMap((page) => page.events) ?? [];
  const change = (next: Partial<AuditFilter>) => setFilter((current) => ({ ...current, ...next }));
  const invalidRange = Boolean(filter.startDate && filter.endDate && filter.startDate > filter.endDate);

  if (forbidden) return <Alert>{t('audit.adminOnly')}</Alert>;

  return (
    <div className="space-y-6" data-testid="audit-tab">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('audit.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('audit.desc')}</p>
      </div>
      {config.dataMode === 'mock' && <Alert>{t('audit.mockNote')}</Alert>}
      {error && (
        <Alert variant="destructive" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end">
        <div>
          <label htmlFor="audit-category" className="mb-1.5 block text-sm font-medium text-foreground">
            {t('audit.category')}
          </label>
          <Select
            id="audit-category"
            value={filter.category ?? ''}
            onChange={(e) => change({ category: e.target.value as AuditFilter['category'] })}
            options={[{ value: '', label: t('audit.allCategories') }, ...AUDIT_CATEGORIES.map((value) => ({ value, label: t(`audit.categories.${value}`) }))]}
          />
        </div>
        <Input label={t('audit.from')} type="date" value={filter.startDate ?? ''} onChange={(e) => change({ startDate: e.target.value })} />
        <Input label={t('audit.to')} type="date" value={filter.endDate ?? ''} onChange={(e) => change({ endDate: e.target.value })} />
        <Button type="button" variant="outline" disabled={download.isPending || invalidRange} onClick={() => download.mutate()} data-testid="audit-export">
          {download.isPending ? <Spinner size="sm" /> : <Download size={16} aria-hidden="true" />}
          {t('audit.export')}
        </Button>
      </div>
      {invalidRange && <Alert variant="destructive">{t('audit.badRange')}</Alert>}

      {events.isPending ? (
        <Spinner size="sm" />
      ) : events.isError ? (
        <Alert variant="destructive">{apiErrorMessage(events.error)}</Alert>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('audit.none')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm" data-testid="audit-events">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">{t('audit.when')}</th>
                <th className="p-2 font-medium">{t('audit.who')}</th>
                <th className="p-2 font-medium">{t('audit.what')}</th>
                <th className="p-2 font-medium">{t('audit.result')}</th>
                <th className="p-2 font-medium">{t('audit.ip')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((event) => (
                <tr key={event.id} className="align-top">
                  <td className="whitespace-nowrap p-2">{formatDateTime(event.createdAt)}</td>
                  <td className="p-2">{event.actorEmail || t('audit.system')}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{t(`audit.categories.${event.category}`)}</Badge>
                      <code className="text-xs">{event.action}</code>
                    </div>
                    {event.description && <div className="mt-1 text-muted-foreground">{event.description}</div>}
                  </td>
                  <td className="p-2">{event.outcome ? t(`audit.outcomes.${event.outcome}`, { defaultValue: event.outcome }) : ''}</td>
                  <td className="whitespace-nowrap p-2 text-muted-foreground">{event.ipAddress}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {events.hasNextPage && (
        <Button type="button" variant="outline" disabled={events.isFetchingNextPage} onClick={() => void events.fetchNextPage()} data-testid="audit-more">
          {events.isFetchingNextPage && <Spinner size="sm" />}
          {t('audit.more')}
        </Button>
      )}
    </div>
  );
}
