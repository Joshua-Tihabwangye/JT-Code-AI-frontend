import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Database, LayoutDashboard, LayoutTemplate, Library, Plus, Rocket, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { formatDate } from '@/i18n/format';
import { useRepository } from '@/lib/data';
import { ConfirmDialog } from '@/shared/components';
import { useVisualize } from '../context';
import { ChartThumb } from '../thumbs';
import { ErrorNote, SkeletonBlock } from '../ui';
import { NewDashboardDialog, type NewDashboardMode } from './NewDashboardDialog';

/** The module home: your dashboards, and a one-click starter dashboard from any dataset. */
export function DashboardsHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const { datasets, datasetId, setDatasetId, refreshDatasets, catalog, setAssistantContext } = useVisualize();
  const [source, setSource] = useState('');
  const [filter, setFilter] = useState<'all' | 'mine' | 'shared'>('all');
  const charts = useQuery({ queryKey: ['visualize', 'charts'], queryFn: () => visualize.listCharts() });
  const loadSample = useMutation({
    mutationFn: (sampleId: string) => visualize.createSample(sampleId),
    onSuccess: async (dataset) => {
      await refreshDatasets();
      setDatasetId(dataset.id);
      setSource(dataset.id);
    },
  });
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [starting, setStarting] = useState<NewDashboardMode | null>(null);
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
    mutationFn: () => visualize.createDashboard({ name: t('visualize.dashboards.home.untitled') }),
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
          <h1 className="text-xl font-semibold">{t('visualize.dashboards.home.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('visualize.dashboards.home.subtitle')}</p>
        </div>
        <div className="w-56">
        <select className="viz-field" value={source || datasetId} onChange={(event) => setSource(event.target.value)} aria-label={t('visualize.dashboards.home.datasetLabel')} data-testid="new-dashboard-dataset">
          {!datasets.length && <option value="">{t('visualize.dashboards.home.noData')}</option>}
          {datasets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        </div>
        <button type="button" className="viz-chip h-9" disabled={blank.isPending} onClick={() => blank.mutate()} data-testid="blank-dashboard">
          <Plus size={14} aria-hidden /> {t('visualize.dashboards.home.blank')}
        </button>
        <button type="button" className="viz-chip h-9" disabled={!datasets.length} onClick={() => setStarting('template')} data-testid="template-dashboard">
          <LayoutTemplate size={14} aria-hidden /> {t('visualize.dashboards.home.template')}
        </button>
        <button type="button" className="viz-chip h-9" disabled={!datasets.length} onClick={() => setStarting('ai')} data-testid="ai-dashboard">
          <Sparkles size={14} aria-hidden /> {t('visualize.askAi')}
        </button>
        <button type="button" className="viz-primary inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-white" disabled={!datasets.length || create.isPending} onClick={() => create.mutate()} data-testid="auto-dashboard">
          <Wand2 size={15} aria-hidden /> {create.isPending ? t('visualize.dashboards.home.building') : t('visualize.dashboards.home.auto')}
        </button>
      </header>
      <ErrorNote error={create.error ?? blank.error ?? duplicate.error ?? remove.error ?? dashboards.error ?? loadSample.error} />
      {catalog && (
        <div className="viz-start" data-testid="start-row">
          <span className="viz-label m-0">{datasets.length ? t('visualize.dashboards.home.more') : t('visualize.dashboards.home.start')}</span>
          <Link to="/app/visualize/data" className="viz-chip" data-testid="hero-import">
            <Database size={13} aria-hidden /> {t('visualize.dashboards.home.import')}
          </Link>
          {catalog.samples.map((sample) => (
            <button key={sample.id} type="button" className="viz-chip" title={sample.description} disabled={loadSample.isPending} onClick={() => loadSample.mutate(sample.id)} data-testid={`sample-${sample.id}`}>
              <Rocket size={13} aria-hidden /> {loadSample.isPending && loadSample.variables === sample.id ? t('visualize.dashboards.home.loading') : sample.name}
            </button>
          ))}
        </div>
      )}
      <div className="viz-segment" role="group" aria-label={t('visualize.dashboards.home.show')}>
        {(['all', 'mine', 'shared'] as const).map((value) => (
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} data-testid={`dashboards-${value}`}>
            {t(`visualize.dashboards.home.filter.${value}`)}
          </button>
        ))}
      </div>
      {dashboards.isLoading && <SkeletonBlock height={160} />}
      {dashboards.data && !dashboards.data.length && (
        <div className="viz-card viz-card-pad py-10 text-center text-sm text-muted-foreground">
          <LayoutDashboard className="mx-auto mb-2" aria-hidden />
          {t('visualize.dashboards.home.empty')}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="dashboard-list">
        {dashboards.data
          ?.filter((dashboard) => filter === 'all' || (filter === 'mine' ? dashboard.role === 'owner' : dashboard.role !== 'owner'))
          .map((dashboard) => (
          <article key={dashboard.id} className="viz-card overflow-hidden">
            <Link to={`/app/visualize/dashboards/${dashboard.id}`} className="block">
              <div className="dash-thumb">
                {dashboard.thumbnail ? <img src={dashboard.thumbnail} alt="" /> : <LayoutDashboard size={28} aria-hidden />}
              </div>
              <div className="px-3 pt-2">
                <p className="truncate font-semibold">{dashboard.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t('visualize.dashboards.home.pages', { count: dashboard.pages ?? 1 })} · {formatDate(dashboard.updatedAt)} · {t(`visualize.dashboards.home.roles.${dashboard.role}`)}
                  {dashboard.isShared ? ` · ${t('visualize.dashboards.home.sharedFlag')}` : ''}
                </p>
              </div>
            </Link>
            <div className="flex gap-1 px-2 pb-2 pt-1">
              <button type="button" className="viz-chip" onClick={() => duplicate.mutate(dashboard.id)}>
                <Copy size={12} aria-hidden /> {t('visualize.dashboards.home.duplicate')}
              </button>
              {dashboard.role === 'owner' && (
                <button type="button" className="viz-chip ml-auto text-destructive" onClick={() => setRemoving({ id: dashboard.id, name: dashboard.name })} aria-label={t('visualize.dashboards.home.deleteNamed', { name: dashboard.name })}>
                  <Trash2 size={12} aria-hidden />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {(charts.data?.length ?? 0) > 0 && (
        <section className="space-y-2" data-testid="my-visuals">
          <div className="flex items-center gap-2">
            <Library size={16} aria-hidden />
            <h2 className="text-sm font-semibold">{t('visualize.dashboards.home.library')}</h2>
            <Link to="/app/visualize/reports" className="ml-auto text-xs text-muted-foreground hover:underline">
              {t('visualize.dashboards.home.allVisuals')}
            </Link>
          </div>
          <div className="viz-library-strip">
            {charts.data!.slice(0, 8).map((chart) => (
              <article key={chart.id} className="viz-library-item" title={chart.title}>
                <ChartThumb id={chart.config.visual?.type ?? chart.chartType.replace(/^(prediction|visual):/, '')} />
                <span className="truncate text-xs">{chart.title}</span>
              </article>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">{t('visualize.dashboards.home.libraryHint')}</p>
        </section>
      )}
      {starting && <NewDashboardDialog initial={starting} onClose={() => setStarting(null)} />}
      <ConfirmDialog
        open={!!removing}
        title={t('visualize.dashboards.home.deleteTitle')}
        description={t('visualize.dashboards.home.deleteText', { name: removing?.name ?? '' })}
        confirmLabel={t('visualize.dashboards.home.delete')}
        destructive
        onConfirm={() => removing && remove.mutate(removing.id)}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
