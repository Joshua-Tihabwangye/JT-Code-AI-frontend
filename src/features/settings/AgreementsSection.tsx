import { useQuery } from '@tanstack/react-query';
import { FileCheck2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRepository } from '@/lib/data';
import { apiErrorMessage } from '@/lib/api/http';
import { formatDateTime } from '@/i18n/format';
import { Alert, Badge, Spinner } from '@/shared/components';

/** Settings → Profile: what the user agreed to, which version and when (read-only evidence). */
export function AgreementsSection() {
  const { t } = useTranslation();
  const consents = useRepository('consents');
  const entries = useQuery({ queryKey: ['consents'], queryFn: () => consents.list() });

  return (
    <section data-testid="agreements">
      <h2 className="mb-1 text-lg font-semibold text-foreground">{t('agreements.title')}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('agreements.desc')}</p>
      {entries.isPending ? (
        <Spinner size="sm" />
      ) : entries.isError ? (
        <Alert variant="destructive">{apiErrorMessage(entries.error)}</Alert>
      ) : entries.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('agreements.none')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {entries.data.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <FileCheck2 size={16} className="text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 font-medium text-foreground">{t(`agreements.types.${entry.type}`, { defaultValue: entry.type })}</span>
              <span className="text-muted-foreground">
                {[
                  t('agreements.version', { version: entry.version }),
                  entry.status === 'withdrawn' && entry.withdrawnAt
                    ? t('agreements.withdrawnOn', { date: formatDateTime(entry.withdrawnAt) })
                    : formatDateTime(entry.grantedAt ?? entry.createdAt),
                ].join(' · ')}
              </span>
              <Badge variant={entry.status === 'granted' ? 'secondary' : 'outline'}>{t(`agreements.status.${entry.status}`)}</Badge>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t('agreements.endHelp')}</p>
    </section>
  );
}
