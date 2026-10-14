import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Code2, Library, Share2, Trash2 } from 'lucide-react';
import { useRepository } from '@/lib/data';
import { Button } from '@/shared/components';
import { useVisualize } from '../context';
import { saveBlob, safeName } from '../echarts';
import { CategoryBadge, ErrorNote, SkeletonBlock } from '../ui';

export function ReportsPage() {
  const { t } = useTranslation();
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const { catalog, setAssistantContext } = useVisualize();
  const charts = useQuery({ queryKey: ['visualize', 'charts'], queryFn: () => visualize.listCharts() });

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
          <Library size={20} aria-hidden /> {t('visualize.library.title', 'My visuals')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('visualize.library.subtitle', 'Charts saved from the Studio and Predict pages. Dashboard exports arrive here next.')}</p>
      </header>

      <section>
        {charts.isLoading && <SkeletonBlock height={140} />}
        <ErrorNote error={removeChart.error ?? shareChart.error ?? exportChart.error} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="saved-charts">
          {charts.data?.map((chart) => {
            const type = catalog?.charts.find((entry) => entry.id === chart.chartType);
            const category = catalog?.categories.find((entry) => entry.id === type?.category);
            return (
              <div key={chart.id} className="viz-card viz-card-pad space-y-2">
                <div className="flex items-center justify-between gap-2">
                  {category ? <CategoryBadge category={category} /> : <span className="viz-badge">Prediction</span>}
                  <span className="text-xs text-muted-foreground">{new Date(chart.updatedAt).toLocaleDateString()}</span>
                </div>
                <p className="font-semibold">{chart.title}</p>
                <p className="text-xs text-muted-foreground">
                  {type?.name ?? chart.chartType.replace('prediction:', '').replace(/_/g, ' ')} · {chart.datasetName || 'deleted dataset'}
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
          {charts.data && !charts.data.length && <p className="text-sm text-muted-foreground">{t('visualize.reports.noCharts', 'Save charts from the Studio or Predict pages.')}</p>}
        </div>
      </section>
    </div>
  );
}
