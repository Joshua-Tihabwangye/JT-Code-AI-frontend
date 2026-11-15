import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Trash2 } from 'lucide-react';
import { formatDate, formatNumber } from '@/i18n/format';
import { apiErrorMessage } from '@/lib/api/http';
import { useRepository } from '@/lib/data';
import { Alert, Button, Modal } from '@/shared/components';
import { useVisualize } from './context';

/** Every dataset in one list, each with Delete (confirmed in place). */
export function DatasetsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const analytics = useRepository('analytics');
  const queryClient = useQueryClient();
  const { datasets, datasetId, setDatasetId, refreshDatasets } = useVisualize();
  const [confirming, setConfirming] = useState('');
  const remove = useMutation({
    mutationFn: (id: string) => analytics.deleteDataset(id),
    onSuccess: async (_, id) => {
      setConfirming('');
      await refreshDatasets();
      if (id === datasetId) setDatasetId(datasets.find((item) => item.id !== id)?.id ?? '');
      await queryClient.invalidateQueries({ queryKey: ['visualize'] });
    },
  });
  return (
    <Modal isOpen={open} onClose={onClose} title={t('visualize.datasets.title')} description={t('visualize.datasets.description')}>
      <div className="space-y-3" data-testid="datasets-dialog">
        {remove.error && <Alert variant="destructive">{apiErrorMessage(remove.error)}</Alert>}
        {!datasets.length && <p className="text-sm text-muted-foreground">{t('visualize.datasets.none')}</p>}
        <ul className="space-y-2">
          {datasets.map((item) => (
            <li key={item.id} className="viz-dataset-row" data-testid={`dataset-row-${item.id}`}>
              <Database size={16} className="shrink-0 text-indigo-500" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {item.name}
                  {item.id === datasetId && <span className="viz-badge ml-2">{t('visualize.datasets.open')}</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('visualize.datasets.meta', { rows: formatNumber(item.rowCount ?? 0), date: formatDate(item.createdAt) })}
                </p>
              </div>
              {confirming === item.id ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-xs text-destructive">{t('visualize.datasets.confirm')}</span>
                  <Button size="sm" variant="destructive" onClick={() => remove.mutate(item.id)} isLoading={remove.isPending} data-testid={`dataset-delete-confirm-${item.id}`}>
                    {t('visualize.datasets.delete')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming('')}>
                    {t('common.cancel')}
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" className="shrink-0 gap-1 text-destructive" onClick={() => setConfirming(item.id)} aria-label={t('visualize.datasets.deleteNamed', { name: item.name })} data-testid={`dataset-delete-${item.id}`}>
                  <Trash2 size={14} aria-hidden /> {t('visualize.datasets.delete')}
                </Button>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t('visualize.datasets.note')}</p>
      </div>
    </Modal>
  );
}
