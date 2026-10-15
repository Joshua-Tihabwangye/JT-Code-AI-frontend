import { describe, expect, it } from 'vitest';
import type { VizIssue } from '@/lib/data';
import { thumbTemplate } from '../../thumbs';
import { fixFor, KIND_BY_OP, newStep, STEP_KINDS, stepSummary } from './steps';

const GALLERY =
  'bar grouped_bar stacked_bar percent_stacked_bar lollipop dot_plot dumbbell radar bullet pareto category_heatmap line area stacked_area step_line rolling_average cumulative period_change candlestick range_band calendar_heatmap seasonal_decompose autocorrelation pie donut treemap sunburst icicle waterfall funnel marimekko histogram density_kde box violin strip ecdf ridgeline raincloud mean_ci qq_plot distribution_fit control_chart bland_altman missing_values scatter bubble regression_fit correlation_heatmap scatter_matrix density_heatmap density_contour joint_plot parallel_coordinates parallel_categories crosstab_heatmap sankey network choropleth scatter_geo scatter_3d surface_3d pca_2d pca_3d pca_biplot scree_plot tsne_2d lda_2d kmeans_clusters confusion_matrix roc_curve pr_curve calibration_curve cumulative_gain threshold_metrics predicted_vs_actual residual_plot error_distribution feature_importance learning_curve elbow silhouette kpi_card gauge decomposition_tree'.split(' ');

const issue = (type: string, column: string | null, examples: string[] = []): VizIssue => ({ id: type, type, label: type, color: '#000', severity: 'warning', column, count: 1, rows: [1], detail: '', suggestion: '', examples });

describe('applied steps', () => {
  it('starts every step with its defaults and the column in view', () => {
    expect(new Set(STEP_KINDS.map((kind) => kind.op)).size).toBe(STEP_KINDS.length);
    expect(newStep('fill_blanks', 'amount')).toEqual({ op: 'fill_blanks', enabled: true, strategy: 'median', column: 'amount' });
    expect(newStep('remove_columns', 'a')).toMatchObject({ columns: ['a'] });
    expect(newStep('remove_duplicates', 'a').columns).toBeUndefined();
    const filter = newStep('filter_rows');
    expect(filter.conditions).toEqual([{ field: '', op: 'eq', value: '' }]);
    expect(newStep('filter_rows').conditions).not.toBe(filter.conditions);
  });

  it('describes steps in one line', () => {
    expect(stepSummary({ op: 'rename', column: 'amt', name: 'Amount' })).toBe('amt → Amount');
    expect(stepSummary({ op: 'remove_columns', columns: ['a', 'b'] })).toBe('a, b');
    expect(stepSummary({ op: 'group_by', by: ['region'], aggregations: [] })).toBe('by region');
    expect(stepSummary({ op: 'filter_rows', mode: 'remove', conditions: [{}] })).toBe('remove 1 condition(s)');
  });

  it('turns quality issues into fixes', () => {
    expect(fixFor(issue('duplicate_row', null))?.steps).toEqual([newStep('remove_duplicates')]);
    expect(fixFor(issue('placeholder', 'amount', ['N/A']))?.steps[0]).toMatchObject({ op: 'replace_values', column: 'amount', find: 'N/A', replace: '' });
    expect(fixFor(issue('inconsistent_category', 'region'))?.steps.map((step) => step.op)).toEqual(['trim', 'text_case']);
    expect(fixFor(issue('invalid_date', 'when'))?.steps[0]).toMatchObject({ op: 'change_type', type: 'date' });
    expect(fixFor(issue('id_gap', 'id'))).toBeNull();
    for (const type of ['missing_value', 'whitespace', 'type_mismatch', 'outlier', 'constant_column', 'duplicate_id', 'missing_id']) {
      const fix = fixFor(issue(type, 'x'));
      expect(fix?.steps.every((step) => KIND_BY_OP[step.op])).toBe(true);
    }
  });
});

describe('chart thumbnails', () => {
  it('give every gallery chart and dashboard visual a picture of its own shape', () => {
    const fallbacks = GALLERY.filter((id) => thumbTemplate(id) === 'column' && !['bar', 'pareto', 'period_change'].includes(id));
    expect(fallbacks).toEqual([]);
    expect(thumbTemplate('donut')).toBe('donut');
    expect(thumbTemplate('something_new', 'trend')).toBe('line');
    expect(thumbTemplate('table')).toBe('table');
  });
});
