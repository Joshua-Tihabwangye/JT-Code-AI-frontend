import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Braces, Code2, FileImage, FileSpreadsheet, FileText, Globe, Library, Share2, Trash2 } from 'lucide-react';
import { useRepository } from '@/lib/data';
import { Button } from '@/shared/components';
import { useVisualize } from '../context';
import { saveBlob, safeName } from '../echarts';
import { ChartThumb } from '../thumbs';
import { CategoryBadge, ErrorNote, SkeletonBlock } from '../ui';

export function ReportsPage() {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const { catalog, setAssistantContext } = useVisualize();
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
          <FileText size={20} aria-hidden /> {t('visualize.reports.title', 'Reports')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('visualize.reports.subtitle', 'Export a dashboard, or reuse the visuals you saved.')}</p>
      </header>

      <section className="viz-card viz-card-pad space-y-3" data-testid="report-export">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-sm font-semibold">{t('visualize.reports.export', 'Export a dashboard')}</h2>
          <select className="viz-field w-64" value={target} onChange={(event) => setChosen(event.target.value)} aria-label="Dashboard to export" data-testid="report-dashboard">
            {!dashboards.data?.length && <option value="">No dashboards yet</option>}
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
              ['pdf', FileText, 'PDF', 'One page per dashboard page, exactly as on screen'],
              ['png', FileImage, 'PNG images', 'One image per page'],
              ['xlsx', FileSpreadsheet, 'Excel', 'Every visual’s data with native charts, plus the raw data'],
              ['html', Globe, 'Interactive HTML', 'A single file that works offline'],
              ['json', Braces, 'JSON', 'The dashboard definition'],
            ] as const
          ).map(([format, Icon, label, hint]) => (
            <button
              key={format}
              type="button"
              className="viz-export-option"
              disabled={!target || exportFile.isPending}
              onClick={() => (format === 'pdf' || format === 'png' ? void navigate(`/app/visualize/dashboards/${target}?export=${format}`) : exportFile.mutate(format))}
              data-testid={`export-${format}`}
            >
              <Icon size={20} aria-hidden />
              <b>{label}</b>
              <span className="text-[11px] text-muted-foreground">{exportFile.isPending && exportFile.variables === format ? 'Preparing…' : hint}</span>
            </button>
          ))}
        </div>
        <ErrorNote error={exportFile.error} />
      </section>

      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Library size={16} aria-hidden /> {t('visualize.library.title', 'My visuals')}
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
                  {category ? <CategoryBadge category={category} /> : <span className="viz-badge">{chart.chartType.startsWith('visual:') ? 'Explore' : 'Prediction'}</span>}
                  <span className="text-xs text-muted-foreground">{new Date(chart.updatedAt).toLocaleDateString()}</span>
                </div>
                <p className="font-semibold">{chart.title}</p>
                <p className="text-xs text-muted-foreground">
                  {type?.name ?? (chart.config.visual ? `${chart.config.visual.type.replace(/_/g, ' ')} visual` : chart.chartType.replace('prediction:', '').replace(/_/g, ' '))} · {chart.datasetName || 'deleted dataset'}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => exportChart.mutate({ id: chart.id, name: chart.title })}>
                    <Code2 size={13} aria-hidden /> HTML
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => shareChart.mutate({ id: chart.id, isShared: !chart.isShared })}>
                    <Share2 size={13} aria-hidden /> {chart.isShared ? 'Unshare' : 'Share'}
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1 text-destructive" onClick={() => removeChart.mutate(chart.id)} aria-label={`Delete ${chart.title}`}>
                    <Trash2 size={13} aria-hidden />
                  </Button>
                </div>
              </div>
            );
          })}
          {charts.data && !charts.data.length && <p className="text-sm text-muted-foreground">{t('visualize.reports.noCharts', 'Save visuals from Explore or Predict to reuse them in dashboards.')}</p>}
        </div>
      </section>
    </div>
  );
}
