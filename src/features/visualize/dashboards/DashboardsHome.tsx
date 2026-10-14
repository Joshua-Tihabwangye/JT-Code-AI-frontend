import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, LayoutDashboard, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useRepository } from '@/lib/data';
import { ConfirmDialog } from '@/shared/components';
import { useVisualize } from '../context';
import { ErrorNote, SkeletonBlock } from '../ui';

/** The module home: your dashboards, and a one-click starter dashboard from any dataset. */
export function DashboardsHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const { datasets, datasetId, setAssistantContext } = useVisualize();
  const [source, setSource] = useState('');
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const dashboards = useQuery({ queryKey: ['visualize', 'dashboards'], queryFn: () => visualize.listDashboards() });

  useEffect(() => {
    setAssistantContext({ page: 'dashboards' });
  }, [setAssistantContext]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['visualize', 'dashboards'] });
  const create = useMutation({
    mutationFn: () => visualize.autoDashboard(source || datasetId),
    onSuccess: async (dashboard) => {
      await refresh();
      void navigate(`/app/visualize/dashboards/${dashboard.id}`);
    },
  });
  const blank = useMutation({
    mutationFn: () => visualize.createDashboard({ name: t('visualize.dashboards.untitled', 'Untitled dashboard') }),
    onSuccess: async (dashboard) => {
      await refresh();
      void navigate(`/app/visualize/dashboards/${dashboard.id}/edit`);
    },
  });
  const duplicate = useMutation({ mutationFn: (id: string) => visualize.duplicateDashboard(id), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: (id: string) => visualize.deleteDashboard(id),
    onSuccess: async () => {
      setRemoving(null);
      await refresh();
    },
  });

  return (
    <div className="space-y-4" data-testid="dashboards-home">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold">{t('visualize.dashboards.title', 'Dashboards')}</h1>
          <p className="text-sm text-muted-foreground">{t('visualize.dashboards.subtitle', 'KPIs, charts and slicers on one screen, all connected.')}</p>
        </div>
        <div className="w-56">
        <select className="viz-field" value={source || datasetId} onChange={(event) => setSource(event.target.value)} aria-label="Dataset for a new dashboard" data-testid="new-dashboard-dataset">
          {!datasets.length && <option value="">{t('visualize.dashboards.noData', 'Add a dataset first')}</option>}
          {datasets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        </div>
        <button type="button" className="viz-chip h-9" disabled={blank.isPending} onClick={() => blank.mutate()} data-testid="blank-dashboard">
          <Plus size={14} aria-hidden /> {t('visualize.dashboards.blank', 'Blank')}
        </button>
        <button type="button" className="viz-primary inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-white" disabled={!datasets.length || create.isPending} onClick={() => create.mutate()} data-testid="auto-dashboard">
          <Sparkles size={15} aria-hidden /> {create.isPending ? t('visualize.dashboards.building', 'Building…') : t('visualize.dashboards.auto', 'Build dashboard')}
        </button>
      </header>
      <ErrorNote error={create.error ?? blank.error ?? duplicate.error ?? remove.error ?? dashboards.error} />
      {dashboards.isLoading && <SkeletonBlock height={160} />}
      {dashboards.data && !dashboards.data.length && (
        <div className="viz-card viz-card-pad py-10 text-center text-sm text-muted-foreground">
          <LayoutDashboard className="mx-auto mb-2" aria-hidden />
          {t('visualize.dashboards.empty', 'No dashboards yet. Pick a dataset and build one in a click.')}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="dashboard-list">
        {dashboards.data?.map((dashboard) => (
          <article key={dashboard.id} className="viz-card overflow-hidden">
            <Link to={`/app/visualize/dashboards/${dashboard.id}`} className="block">
              <div className="dash-thumb">
                {dashboard.thumbnail ? <img src={dashboard.thumbnail} alt="" /> : <LayoutDashboard size={28} aria-hidden />}
              </div>
              <div className="px-3 pt-2">
                <p className="truncate font-semibold">{dashboard.name}</p>
                <p className="text-xs text-muted-foreground">
                  {dashboard.pages ?? 1} page{(dashboard.pages ?? 1) === 1 ? '' : 's'} · {new Date(dashboard.updatedAt).toLocaleDateString()} · {dashboard.role}
                  {dashboard.isShared ? ' · shared' : ''}
                </p>
              </div>
            </Link>
            <div className="flex gap-1 px-2 pb-2 pt-1">
              <button type="button" className="viz-chip" onClick={() => duplicate.mutate(dashboard.id)}>
                <Copy size={12} aria-hidden /> {t('visualize.dashboards.duplicate', 'Duplicate')}
              </button>
              {dashboard.role === 'owner' && (
                <button type="button" className="viz-chip ml-auto text-destructive" onClick={() => setRemoving({ id: dashboard.id, name: dashboard.name })} aria-label={`Delete ${dashboard.name}`}>
                  <Trash2 size={12} aria-hidden />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <ConfirmDialog
        open={!!removing}
        title={t('visualize.dashboards.deleteTitle', 'Delete dashboard?')}
        description={t('visualize.dashboards.deleteText', '{{name}} and its saved versions will be removed. Datasets are not affected.', { name: removing?.name ?? '' })}
        confirmLabel={t('common.delete', 'Delete')}
        destructive
        onConfirm={() => removing && remove.mutate(removing.id)}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
