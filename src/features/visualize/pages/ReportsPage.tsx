import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Braces, Code2, FileImage, FileSpreadsheet, FileText, Globe, Library, Share2, Trash2 } from 'lucide-react';
import { formatDate } from '@/i18n/format';
import { useRepository } from '@/lib/data';
import { Button } from '@/shared/components';
import { useCatalogText } from '../catalogText';
import { useVisualize } from '../context';
import { saveBlob, safeName } from '../echarts';
import { ChartThumb } from '../thumbs';
import { CategoryBadge, ErrorNote, SkeletonBlock } from '../ui';

export function ReportsPage() {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const { catalog, setAssistantContext } = useVisualize();
  const { chartName } = useCatalogText();
  const charts = useQuery({ queryKey: ['visualize', 'charts'], queryFn: () => visualize.listCharts() });
  const navigate = useNavigate();
  const dashboards = useQuery({ queryKey: ['visualize', 'dashboards'], queryFn: () => visualize.listDashboards() });
  const [chosen, setChosen] = useState('');
  const target = chosen || dashboards.data?.[0]?.id || '';
  const targetName = dashboards.data?.find((item) => item.id === target)?.name ?? 'dashboard';
  const exportFile = useMutation({
    mutationFn: async (format: 'xlsx' | 'html' | 'json') => saveBlob(await visualize.exportDashboard(target, { format }), `${safeName(targetName)}.${format}`),
  });

  useEffect(() => {
    setAssistantContext({ page: 'reports' });
  }, [setAssistantContext]);

  const removeChart = useMutation({
    mutationFn: (id: string) => visualize.deleteChart(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['visualize', 'charts'] }),
  });
  const shareChart = useMutation({
    mutationFn: ({ id, isShared }: { id: string; isShared: boolean }) => visualize.updateChart(id, { isShared }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['visualize', 'charts'] }),
  });
  const exportChart = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => saveBlob(await visualize.exportChart(id, 'html'), `${safeName(name)}.html`),
  });

  return (
    <div className="space-y-6" data-testid="visualize-reports">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <FileText size={20} aria-hidden /> {t('visualize.reports.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('visualize.reports.subtitle')}</p>
      </header>

      <section className="viz-card viz-card-pad space-y-3" data-testid="report-export">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-sm font-semibold">{t('visualize.reports.export')}</h2>
          <select className="viz-field w-64" value={target} onChange={(event) => setChosen(event.target.value)} aria-label={t('visualize.reports.dashboardToExport')} data-testid="report-dashboard">
            {!dashboards.data?.length && <option value="">{t('visualize.reports.noDashboards')}</option>}
            {dashboards.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="viz-export-grid">
          {(
            [
              ['pdf', FileText],
              ['png', FileImage],
              ['xlsx', FileSpreadsheet],
              ['html', Globe],
              ['json', Braces],
            ] as const
          ).map(([format, Icon]) => (
            <button
              key={format}
              type="button"
              className="viz-export-option"
              disabled={!target || exportFile.isPending}
              onClick={() => (format === 'pdf' || format === 'png' ? void navigate(`/app/visualize/dashboards/${target}?export=${format}`) : exportFile.mutate(format))}
              data-testid={`export-${format}`}
            >
              <Icon size={20} aria-hidden />
              <b>{t(`visualize.reports.formats.${format}.label`)}</b>
              <span className="text-[11px] text-muted-foreground">{exportFile.isPending && exportFile.variables === format ? t('visualize.reports.preparing') : t(`visualize.reports.formats.${format}.hint`)}</span>
            </button>
          ))}
        </div>
        <ErrorNote error={exportFile.error} />
      </section>

      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Library size={16} aria-hidden /> {t('visualize.reports.library.title')}
      </h2>

      <section>
        {charts.isLoading && <SkeletonBlock height={140} />}
        <ErrorNote error={removeChart.error ?? shareChart.error ?? exportChart.error} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="saved-charts">
          {charts.data?.map((chart) => {
            const type = catalog?.charts.find((entry) => entry.id === chart.chartType);
            const category = catalog?.categories.find((entry) => entry.id === type?.category);
            return (
              <div key={chart.id} className="viz-card viz-card-pad space-y-2">
                <span className="block w-24">
                  <ChartThumb id={chart.config.visual?.type ?? chart.chartType.replace(/^(prediction|visual):/, '')} category={type?.category} color={category?.color} />
                </span>
                <div className="flex items-center justify-between gap-2">
                  {category ? <CategoryBadge category={category} /> : <span className="viz-badge">{chart.chartType.startsWith('visual:') ? t('visualize.reports.explore') : t('visualize.reports.prediction')}</span>}
                  <span className="text-xs text-muted-foreground">{formatDate(chart.updatedAt)}</span>
                </div>
                <p className="font-semibold">{chart.title}</p>
                <p className="text-xs text-muted-foreground">
                  {type ? chartName(type) : chart.config.visual ? t('visualize.reports.visualOf', { type: chart.config.visual.type.replace(/_/g, ' ') }) : chart.chartType.replace('prediction:', '').replace(/_/g, ' ')} · {chart.datasetName || t('visualize.reports.deletedDataset')}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => exportChart.mutate({ id: chart.id, name: chart.title })}>
                    <Code2 size={13} aria-hidden /> HTML
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => shareChart.mutate({ id: chart.id, isShared: !chart.isShared })}>
                    <Share2 size={13} aria-hidden /> {chart.isShared ? t('visualize.reports.unshare') : t('visualize.reports.share')}
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1 text-destructive" onClick={() => removeChart.mutate(chart.id)} aria-label={t('visualize.reports.deleteNamed', { name: chart.title })}>
                    <Trash2 size={13} aria-hidden />
                  </Button>
                </div>
              </div>
            );
          })}
          {charts.data && !charts.data.length && <p className="text-sm text-muted-foreground">{t('visualize.reports.noCharts')}</p>}
        </div>
      </section>
    </div>
  );
}
