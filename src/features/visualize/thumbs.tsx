import type { ReactNode } from 'react';

/** Small static pictures of each chart shape (gallery cards, type pickers, insight cards).
 *  One template per shape; every catalog chart id maps to the template that looks like it. */

type Template = (accent: string, soft: string) => ReactNode;

const bars = (heights: number[], stacked = false): Template => (accent, soft) => (
  <>
    {heights.map((h, i) => (
      <g key={i}>
        <rect x={6 + i * (52 / heights.length)} y={36 - h} width={52 / heights.length - 3} height={h} rx={1} fill={accent} />
        {stacked && <rect x={6 + i * (52 / heights.length)} y={36 - h - h * 0.5} width={52 / heights.length - 3} height={h * 0.5} rx={1} fill={soft} />}
      </g>
    ))}
  </>
);

const TEMPLATES: Record<string, Template> = {
  column: bars([18, 26, 12, 30, 20, 24]),
  stacked: bars([12, 16, 9, 18, 14], true),
  grouped: (a, s) => (
    <>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={6 + i * 14} y={36 - [18, 24, 14, 28][i]!} width={5} height={[18, 24, 14, 28][i]} rx={1} fill={a} />
          <rect x={12 + i * 14} y={36 - [12, 16, 20, 18][i]!} width={5} height={[12, 16, 20, 18][i]} rx={1} fill={s} />
        </g>
      ))}
    </>
  ),
  barh: (a) => (
    <>
      {[46, 38, 30, 22, 14].map((w, i) => (
        <rect key={i} x={8} y={5 + i * 6.5} width={w} height={4.5} rx={1} fill={a} />
      ))}
    </>
  ),
  lollipop: (a) => (
    <>
      {[44, 36, 30, 20, 12].map((w, i) => (
        <g key={i}>
          <line x1={8} x2={8 + w} y1={6 + i * 6.5} y2={6 + i * 6.5} stroke={a} strokeWidth={1.2} />
          <circle cx={8 + w} cy={6 + i * 6.5} r={2.2} fill={a} />
        </g>
      ))}
    </>
  ),
  dumbbell: (a, s) => (
    <>
      {[
        [14, 40],
        [20, 48],
        [10, 30],
        [24, 52],
      ].map(([x1, x2], i) => (
        <g key={i}>
          <line x1={x1} x2={x2} y1={8 + i * 8} y2={8 + i * 8} stroke={s} strokeWidth={1.5} />
          <circle cx={x1} cy={8 + i * 8} r={2.4} fill={s} />
          <circle cx={x2} cy={8 + i * 8} r={2.4} fill={a} />
        </g>
      ))}
    </>
  ),
  line: (a) => <polyline points="4,30 14,22 24,26 34,14 44,18 54,8 60,12" fill="none" stroke={a} strokeWidth={2} strokeLinejoin="round" />,
  step: (a) => <polyline points="4,30 14,30 14,22 26,22 26,26 38,26 38,12 50,12 50,16 60,16" fill="none" stroke={a} strokeWidth={2} />,
  area: (a, s) => (
    <>
      <polygon points="4,36 4,28 14,22 24,25 34,14 44,17 54,8 60,10 60,36" fill={s} />
      <polyline points="4,28 14,22 24,25 34,14 44,17 54,8 60,10" fill="none" stroke={a} strokeWidth={1.8} />
    </>
  ),
  stackedArea: (a, s) => (
    <>
      <polygon points="4,36 4,22 18,18 32,20 46,12 60,14 60,36" fill={s} />
      <polygon points="4,36 4,30 18,27 32,29 46,24 60,25 60,36" fill={a} />
    </>
  ),
  band: (a, s) => (
    <>
      <polygon points="4,24 16,18 28,20 40,10 52,12 60,6 60,18 52,22 40,20 28,28 16,26 4,32" fill={s} />
      <polyline points="4,28 16,22 28,24 40,15 52,17 60,12" fill="none" stroke={a} strokeWidth={1.8} />
    </>
  ),
  candle: (a, s) => (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const top = [14, 10, 18, 8, 12, 6][i]!;
        return (
          <g key={i}>
            <line x1={9 + i * 9} x2={9 + i * 9} y1={top - 4} y2={top + 18} stroke={s} strokeWidth={1} />
            <rect x={6 + i * 9} y={top} width={6} height={12} fill={i % 2 ? s : a} />
          </g>
        );
      })}
    </>
  ),
  pie: (a, s) => (
    <>
      <circle cx={32} cy={20} r={15} fill={s} />
      <path d="M32 20 L32 5 A15 15 0 0 1 46.3 24.6 Z" fill={a} />
    </>
  ),
  donut: (a, s) => (
    <>
      <circle cx={32} cy={20} r={14} fill="none" stroke={s} strokeWidth={6} />
      <path d="M32 6 A14 14 0 0 1 45.3 24.3" fill="none" stroke={a} strokeWidth={6} />
    </>
  ),
  sunburst: (a, s) => (
    <>
      <circle cx={32} cy={20} r={16} fill="none" stroke={s} strokeWidth={5} />
      <path d="M32 4 A16 16 0 0 1 47 26" fill="none" stroke={a} strokeWidth={5} />
      <circle cx={32} cy={20} r={8} fill={a} opacity={0.6} />
    </>
  ),
  treemap: (a, s) => (
    <>
      <rect x={4} y={4} width={30} height={32} rx={1.5} fill={a} />
      <rect x={36} y={4} width={24} height={18} rx={1.5} fill={s} />
      <rect x={36} y={24} width={12} height={12} rx={1.5} fill={a} opacity={0.6} />
      <rect x={50} y={24} width={10} height={12} rx={1.5} fill={s} />
    </>
  ),
  waterfall: (a, s) => (
    <>
      <rect x={6} y={20} width={7} height={16} fill={a} />
      <rect x={16} y={12} width={7} height={8} fill={a} />
      <rect x={26} y={16} width={7} height={6} fill={s} />
      <rect x={36} y={6} width={7} height={10} fill={a} />
      <rect x={46} y={6} width={7} height={30} fill={a} opacity={0.6} />
    </>
  ),
  funnel: (a) => (
    <>
      {[52, 42, 32, 22, 12].map((w, i) => (
        <rect key={i} x={32 - w / 2} y={4 + i * 6.6} width={w} height={5} rx={1} fill={a} opacity={1 - i * 0.12} />
      ))}
    </>
  ),
  scatter: (a) => (
    <>
      {[
        [10, 30],
        [16, 24],
        [22, 26],
        [28, 18],
        [34, 20],
        [40, 12],
        [46, 14],
        [52, 8],
        [20, 32],
        [44, 22],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2} fill={a} />
      ))}
    </>
  ),
  bubble: (a, s) => (
    <>
      <circle cx={16} cy={26} r={6} fill={s} />
      <circle cx={30} cy={16} r={9} fill={a} opacity={0.75} />
      <circle cx={48} cy={22} r={5} fill={a} />
      <circle cx={50} cy={9} r={3} fill={s} />
    </>
  ),
  regression: (a, s) => (
    <>
      {[
        [10, 30],
        [18, 26],
        [24, 27],
        [30, 20],
        [38, 18],
        [46, 13],
        [54, 10],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.8} fill={s} />
      ))}
      <line x1={6} y1={32} x2={58} y2={8} stroke={a} strokeWidth={1.8} />
    </>
  ),
  heatmap: (a) => (
    <>
      {Array.from({ length: 20 }, (_, i) => (
        <rect key={i} x={6 + (i % 5) * 10.5} y={4 + Math.floor(i / 5) * 8} width={9.5} height={7} rx={1} fill={a} opacity={0.15 + ((i * 7) % 10) / 12} />
      ))}
    </>
  ),
  calendar: (a) => (
    <>
      {Array.from({ length: 35 }, (_, i) => (
        <rect key={i} x={6 + Math.floor(i / 5) * 7.5} y={6 + (i % 5) * 6} width={6} height={5} rx={1} fill={a} opacity={0.12 + ((i * 5) % 9) / 11} />
      ))}
    </>
  ),
  box: (a, s) => (
    <>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <line x1={14 + i * 18} x2={14 + i * 18} y1={6 + i * 3} y2={34 - i * 2} stroke={s} strokeWidth={1.2} />
          <rect x={8 + i * 18} y={12 + i * 3} width={12} height={14} rx={1} fill={a} opacity={0.85} />
          <line x1={8 + i * 18} x2={20 + i * 18} y1={19 + i * 3} y2={19 + i * 3} stroke="#fff" strokeWidth={1.2} />
        </g>
      ))}
    </>
  ),
  violin: (a) => (
    <>
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M${14 + i * 18} 4 C ${22 + i * 18} 12, ${22 + i * 18} 26, ${14 + i * 18} 36 C ${6 + i * 18} 26, ${6 + i * 18} 12, ${14 + i * 18} 4 Z`} fill={a} opacity={0.8 - i * 0.15} />
      ))}
    </>
  ),
  histogram: bars([6, 12, 20, 28, 24, 16, 9, 4]),
  density: (a, s) => (
    <>
      <path d="M4 36 C 14 34, 18 8, 30 8 C 42 8, 46 32, 60 35 L60 36 Z" fill={s} />
      <path d="M4 36 C 14 34, 18 8, 30 8 C 42 8, 46 32, 60 35" fill="none" stroke={a} strokeWidth={1.8} />
    </>
  ),
  ridgeline: (a, s) => (
    <>
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M4 ${16 + i * 9} C 18 ${16 + i * 9}, 22 ${4 + i * 9}, 32 ${4 + i * 9} C 42 ${4 + i * 9}, 46 ${16 + i * 9}, 60 ${16 + i * 9}`} fill={i === 1 ? a : s} opacity={0.8} />
      ))}
    </>
  ),
  ecdf: (a) => <polyline points="4,34 12,34 12,30 20,30 20,22 28,22 28,16 36,16 36,10 48,10 48,6 60,6" fill="none" stroke={a} strokeWidth={1.8} />,
  qq: (a, s) => (
    <>
      <line x1={6} y1={34} x2={58} y2={6} stroke={s} strokeWidth={1.2} strokeDasharray="2 2" />
      {[8, 16, 24, 32, 40, 48, 56].map((x, i) => (
        <circle key={i} cx={x} cy={34 - (x - 6) * 0.54 + (i % 2 ? 2 : -2)} r={1.8} fill={a} />
      ))}
    </>
  ),
  control: (a, s) => (
    <>
      <line x1={4} x2={60} y1={8} y2={8} stroke={s} strokeDasharray="2 2" />
      <line x1={4} x2={60} y1={32} y2={32} stroke={s} strokeDasharray="2 2" />
      <polyline points="4,20 12,16 20,23 28,18 36,24 44,14 52,21 60,19" fill="none" stroke={a} strokeWidth={1.6} />
    </>
  ),
  radar: (a, s) => (
    <>
      <polygon points="32,4 48,14 44,32 20,32 16,14" fill="none" stroke={s} />
      <polygon points="32,10 42,16 38,28 24,26 22,16" fill={a} opacity={0.7} />
    </>
  ),
  gauge: (a, s) => (
    <>
      <path d="M10 32 A 22 22 0 0 1 54 32" fill="none" stroke={s} strokeWidth={6} strokeLinecap="round" />
      <path d="M10 32 A 22 22 0 0 1 42 13" fill="none" stroke={a} strokeWidth={6} strokeLinecap="round" />
    </>
  ),
  bullet: (a, s) => (
    <>
      <rect x={6} y={12} width={52} height={16} fill={s} />
      <rect x={6} y={17} width={36} height={6} fill={a} />
      <line x1={48} x2={48} y1={10} y2={30} stroke={a} strokeWidth={2} />
    </>
  ),
  kpi: (a, s) => (
    <>
      <rect x={6} y={8} width={22} height={5} rx={2} fill={s} />
      <rect x={6} y={16} width={34} height={10} rx={2} fill={a} />
      <polyline points="44,30 48,26 52,28 56,20 60,22" fill="none" stroke={a} strokeWidth={1.5} />
    </>
  ),
  map: (a, s) => (
    <>
      <path d="M8 12 L18 8 L26 12 L24 22 L14 26 L8 20 Z" fill={s} />
      <path d="M30 8 L44 6 L52 14 L48 24 L36 26 L30 18 Z" fill={a} />
      <path d="M36 28 L46 28 L44 36 L38 36 Z" fill={a} opacity={0.6} />
    </>
  ),
  sankey: (a, s) => (
    <>
      <rect x={4} y={6} width={4} height={28} fill={a} />
      <rect x={56} y={4} width={4} height={14} fill={a} />
      <rect x={56} y={22} width={4} height={14} fill={a} />
      <path d="M8 6 C 32 6, 32 4, 56 4 L56 18 C 32 18, 32 20, 8 20 Z" fill={s} />
      <path d="M8 20 C 32 20, 32 22, 56 22 L56 36 C 32 36, 32 34, 8 34 Z" fill={a} opacity={0.4} />
    </>
  ),
  network: (a, s) => (
    <>
      {[
        [32, 20, 12, 8],
        [32, 20, 52, 10],
        [32, 20, 18, 32],
        [32, 20, 48, 32],
        [12, 8, 18, 32],
      ].map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={s} strokeWidth={1.2} />
      ))}
      {[
        [32, 20, 5],
        [12, 8, 3],
        [52, 10, 3.5],
        [18, 32, 3],
        [48, 32, 3],
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={a} />
      ))}
    </>
  ),
  surface: (a, s) => (
    <>
      <path d="M6 26 L26 34 L58 24 L38 16 Z" fill={s} />
      <path d="M6 26 C 18 10, 28 30, 38 16 L58 24 C 48 34, 40 18, 26 34 Z" fill={a} opacity={0.7} />
    </>
  ),
  parallel: (a, s) => (
    <>
      {[8, 24, 40, 56].map((x) => (
        <line key={x} x1={x} x2={x} y1={4} y2={36} stroke={s} />
      ))}
      <polyline points="8,10 24,26 40,14 56,30" fill="none" stroke={a} strokeWidth={1.4} />
      <polyline points="8,28 24,12 40,22 56,8" fill="none" stroke={a} strokeWidth={1.4} opacity={0.6} />
    </>
  ),
  matrix: (a, s) => (
    <>
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => <rect key={`${r}-${c}`} x={10 + c * 15} y={4 + r * 11} width={14} height={10} fill={r === c ? a : s} opacity={r === c ? 0.9 : 0.6} />),
      )}
    </>
  ),
  roc: (a, s) => (
    <>
      <line x1={6} y1={34} x2={58} y2={6} stroke={s} strokeDasharray="2 2" />
      <path d="M6 34 C 10 14, 22 8, 58 6" fill="none" stroke={a} strokeWidth={2} />
    </>
  ),
  table: (a, s) => (
    <>
      <rect x={6} y={6} width={52} height={6} fill={a} />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={6} y={14 + i * 6} width={52} height={4} fill={s} />
      ))}
    </>
  ),
  slicer: (a, s) => (
    <>
      <rect x={6} y={8} width={52} height={10} rx={2} fill="none" stroke={s} />
      <rect x={6} y={22} width={24} height={8} rx={4} fill={a} />
      <rect x={34} y={22} width={24} height={8} rx={4} fill={s} />
    </>
  ),
  text: (a, s) => (
    <>
      <rect x={6} y={8} width={40} height={5} rx={2} fill={a} />
      <rect x={6} y={18} width={52} height={3} rx={1.5} fill={s} />
      <rect x={6} y={25} width={46} height={3} rx={1.5} fill={s} />
    </>
  ),
  bars3: bars([14, 22, 30, 24, 16]),
};

const BY_ID: Record<string, string> = {
  // comparison
  bar: 'column',
  grouped_bar: 'grouped',
  stacked_bar: 'stacked',
  percent_stacked_bar: 'stacked',
  lollipop: 'lollipop',
  dot_plot: 'lollipop',
  dumbbell: 'dumbbell',
  radar: 'radar',
  bullet: 'bullet',
  pareto: 'column',
  category_heatmap: 'heatmap',
  gauge: 'gauge',
  // trend
  line: 'line',
  area: 'area',
  stacked_area: 'stackedArea',
  step_line: 'step',
  rolling_average: 'line',
  cumulative: 'area',
  period_change: 'column',
  candlestick: 'candle',
  range_band: 'band',
  calendar_heatmap: 'calendar',
  seasonal_decompose: 'line',
  autocorrelation: 'histogram',
  kpi_card: 'kpi',
  // composition
  pie: 'pie',
  donut: 'donut',
  treemap: 'treemap',
  sunburst: 'sunburst',
  icicle: 'treemap',
  waterfall: 'waterfall',
  funnel: 'funnel',
  marimekko: 'stacked',
  decomposition_tree: 'network',
  // distribution
  histogram: 'histogram',
  density_kde: 'density',
  box: 'box',
  violin: 'violin',
  strip: 'scatter',
  ecdf: 'ecdf',
  ridgeline: 'ridgeline',
  raincloud: 'violin',
  // statistical
  mean_ci: 'lollipop',
  qq_plot: 'qq',
  distribution_fit: 'density',
  control_chart: 'control',
  bland_altman: 'scatter',
  missing_values: 'heatmap',
  // relationship
  scatter: 'scatter',
  bubble: 'bubble',
  regression_fit: 'regression',
  correlation_heatmap: 'heatmap',
  scatter_matrix: 'matrix',
  density_heatmap: 'heatmap',
  density_contour: 'density',
  joint_plot: 'regression',
  parallel_coordinates: 'parallel',
  parallel_categories: 'sankey',
  crosstab_heatmap: 'heatmap',
  // flow and geo
  sankey: 'sankey',
  network: 'network',
  choropleth: 'map',
  scatter_geo: 'map',
  // dimensional and ML
  scatter_3d: 'bubble',
  surface_3d: 'surface',
  pca_2d: 'scatter',
  pca_3d: 'bubble',
  pca_biplot: 'regression',
  scree_plot: 'bars3',
  tsne_2d: 'scatter',
  lda_2d: 'scatter',
  kmeans_clusters: 'bubble',
  confusion_matrix: 'matrix',
  roc_curve: 'roc',
  pr_curve: 'roc',
  calibration_curve: 'roc',
  cumulative_gain: 'roc',
  threshold_metrics: 'line',
  predicted_vs_actual: 'regression',
  residual_plot: 'scatter',
  error_distribution: 'histogram',
  feature_importance: 'barh',
  learning_curve: 'line',
  elbow: 'line',
  silhouette: 'barh',
  // dashboard visual types
  column: 'column',
  combo: 'grouped',
  card: 'kpi',
  multi_card: 'kpi',
  kpi: 'kpi',
  map: 'map',
  table: 'table',
  matrix: 'table',
  slicer: 'slicer',
  text: 'text',
};

const BY_CATEGORY: Record<string, string> = {
  comparison: 'column',
  trend: 'line',
  composition: 'donut',
  distribution: 'histogram',
  statistical: 'control',
  relationship: 'scatter',
  flow: 'sankey',
  geo: 'map',
  dimensional: 'bubble',
  ml: 'roc',
};

export function thumbTemplate(id: string, category?: string): string {
  return BY_ID[id] ?? (category ? BY_CATEGORY[category] : undefined) ?? 'column';
}

/** A chart's picture: ``id`` is a gallery chart or a dashboard visual type. */
export function ChartThumb({ id, category, color = 'var(--viz-indigo, #6366f1)', className = '' }: { id: string; category?: string; color?: string; className?: string }) {
  const template = TEMPLATES[thumbTemplate(id, category)] ?? TEMPLATES.column!;
  return (
    <svg viewBox="0 0 64 40" className={`viz-thumb ${className}`} role="img" aria-label={`${id.replace(/_/g, ' ')} chart`} data-thumb={thumbTemplate(id, category)}>
      {template(color, `color-mix(in srgb, ${color} 35%, transparent)`)}
    </svg>
  );
}
