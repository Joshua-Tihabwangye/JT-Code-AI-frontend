import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, BrainCircuit, Database, FileText, Rocket, Sparkles, Upload, Wand2 } from 'lucide-react';
import { useRepository } from '@/lib/data';
import { Button } from '@/shared/components';
import { useVisualize } from '../context';
import { categoryIcon, colorVar, ErrorNote, SectionTitle } from '../ui';

const STEPS = [
  { icon: Upload, title: 'Import', text: 'CSV, Excel, JSON or a sample', color: '#6366f1', to: '/app/visualize/data' },
  { icon: Database, title: 'Organize', text: 'Clean, filter, group and reshape', color: '#0ea5e9', to: '/app/visualize/data' },
  { icon: Wand2, title: 'Visualize', text: '80+ interactive charts', color: '#ec4899', to: '/app/visualize/studio' },
  { icon: BrainCircuit, title: 'Predict', text: 'Forecasts, models and segments', color: '#f59e0b', to: '/app/visualize/predict' },
  { icon: FileText, title: 'Share', text: 'Dashboards, HTML and Excel', color: '#10b981', to: '/app/visualize/dashboards' },
];

export function OverviewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const visualize = useRepository('visualize');
  const { catalog, datasets, setDatasetId, refreshDatasets, setAssistantOpen } = useVisualize();
  const charts = useQuery({ queryKey: ['visualize', 'charts'], queryFn: () => visualize.listCharts() });
  const dashboards = useQuery({ queryKey: ['visualize', 'dashboards'], queryFn: () => visualize.listDashboards() });
  const loadSample = useMutation({
    mutationFn: (sampleId: string) => visualize.createSample(sampleId),
    onSuccess: async (dataset) => {
      await refreshDatasets();
      setDatasetId(dataset.id);
      void navigate('/app/visualize/data');
    },
  });

  const counts = catalog
    ? Object.fromEntries(catalog.categories.map((category) => [category.id, catalog.charts.filter((chart) => chart.category === category.id).length]))
    : {};

  return (
    <div className="space-y-6" data-testid="visualize-overview">
      <section className="viz-hero viz-hero-slim" data-testid="overview-hero">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <Sparkles size={18} aria-hidden /> {t('visualize.hero.title', 'Data Visualization Studio')}
            </h1>
            <p className="text-sm text-white/85">
              {t('visualize.hero.short', 'Import, clean, chart, predict and share — powered by Python and Apache ECharts.')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: t('visualize.hero.charts', 'chart types'), value: catalog?.charts.length ?? '—' },
              { label: t('visualize.hero.models', 'prediction tasks'), value: catalog?.predictionTasks.length ?? '—' },
              { label: t('visualize.hero.datasets', 'datasets'), value: datasets.length },
            ].map((stat) => (
              <span key={stat.label} className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs">
                <b className="text-sm">{stat.value}</b> {stat.label}
              </span>
            ))}
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3 text-sm font-medium text-indigo-700 hover:bg-white/90"
              onClick={() => void navigate('/app/visualize/data')}
              data-testid="hero-import"
            >
              <Upload size={15} aria-hidden /> {t('visualize.hero.import', 'Import data')}
            </button>
            <Button size="sm" className="gap-1.5 border border-white/40 bg-white/10 text-white hover:bg-white/20" onClick={() => setAssistantOpen(true)}>
              <Sparkles size={14} aria-hidden /> {t('visualize.askAi', 'Ask AI')}
            </Button>
          </div>
        </div>
      </section>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <Link to={step.to} className="viz-card viz-card-pad viz-lift flex h-full items-center gap-3" style={colorVar(step.color)} data-testid={`step-${step.title.toLowerCase()}`}>
              <span className="viz-icon">
                <step.icon size={18} aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">
                  {t('visualize.step', 'Step {{n}}', { n: index + 1 })}
                </p>
                <p className="font-semibold">{t(`visualize.steps.${step.title.toLowerCase()}`, step.title)}</p>
                <p className="text-xs text-muted-foreground">{step.text}</p>
              </div>
            </Link>
          </li>
        ))}
      </ol>

      <section>
        <SectionTitle
          title={t('visualize.overview.families', 'Chart families')}
          subtitle={t('visualize.overview.familiesHint', 'Grouped by the question each chart answers.')}
          action={
            <Link to="/app/visualize/gallery" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400">
              {t('visualize.overview.all', 'See all charts')} <ArrowRight size={14} aria-hidden />
            </Link>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="category-tiles">
          {catalog?.categories.map((category) => {
            const Icon = categoryIcon(category);
            return (
              <Link
                key={category.id}
                to={`/app/visualize/gallery?category=${category.id}`}
                className="viz-card viz-card-pad viz-lift block"
                style={colorVar(category.color)}
              >
                <span className="viz-icon mb-3">
                  <Icon size={20} aria-hidden />
                </span>
                <p className="font-semibold">{category.name}</p>
                <p className="mb-2 text-xs text-muted-foreground">{category.description}</p>
                <span className="viz-badge">{counts[category.id]} charts</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle title={t('visualize.overview.samples', 'Start with a sample')} subtitle={t('visualize.overview.samplesHint', 'Realistic datasets to explore every feature in seconds.')} />
        <ErrorNote error={loadSample.error} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="sample-list">
          {catalog?.samples.map((sample, index) => (
            <div key={sample.id} className="viz-card viz-card-pad viz-lift flex items-start gap-3" style={colorVar(catalog.palettes[0]?.colors[index % 6])}>
              <span className="viz-icon">
                <Rocket size={18} aria-hidden />
              </span>
              <div className="flex-1">
                <p className="font-semibold">{sample.name}</p>
                <p className="text-xs text-muted-foreground">{sample.description}</p>
                <span className="viz-badge mt-2">{sample.audience}</span>
              </div>
              <Button size="sm" variant="outline" isLoading={loadSample.isPending && loadSample.variables === sample.id} onClick={() => loadSample.mutate(sample.id)}>
                {t('visualize.overview.load', 'Load')}
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="viz-card viz-card-pad">
          <SectionTitle title={t('visualize.overview.recentCharts', 'Recent charts')} />
          {charts.data?.length ? (
            <ul className="divide-y divide-border">
              {charts.data.slice(0, 5).map((chart) => (
                <li key={chart.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="truncate">{chart.title}</span>
                  <span className="text-xs text-muted-foreground">{chart.datasetName}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('visualize.overview.noCharts', 'Charts you save from the Studio appear here.')}</p>
          )}
        </div>
        <div className="viz-card viz-card-pad">
          <SectionTitle title={t('visualize.overview.recentDashboards', 'Dashboards')} />
          {dashboards.data?.length ? (
            <ul className="divide-y divide-border">
              {dashboards.data.slice(0, 5).map((dashboard) => (
                <li key={dashboard.id} className="py-2 text-sm">
                  <Link to={`/app/visualize/dashboards/${dashboard.id}`} className="hover:underline">
                    {dashboard.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('visualize.overview.noDashboards', 'Build a dashboard from any dataset in one click.')}</p>
          )}
        </div>
      </section>
    </div>
  );
}
