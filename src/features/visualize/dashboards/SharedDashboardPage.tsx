import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Eraser, FilterX, Lock } from 'lucide-react';
import { useRepository, type DashboardPage, type DashboardSpec, type RenderVisualsInput, type SharedVisualRequest } from '@/lib/data';
import { useTheme } from '@/lib/theme';
import { resolveVisual, type ParameterValues } from './customize';
import { hierarchyOf, kpiIndexes, pageRows, PAGE_WIDTH, ROW_PX, Tile, useDashboardRuntime, useWidth } from './runtime';
import { resolveMode, themeStyle } from './theme';
import { tileStyle } from './visuals';

/** What a public link may ask for: each visual by id with the viewer's clicks and drill level
 *  (the server keeps the spec; it rejects fields the dashboard does not use). */
export function sharedRequest(input: RenderVisualsInput, spec: DashboardSpec, page: DashboardPage, parameters: ParameterValues): { visuals: SharedVisualRequest[]; filters: RenderVisualsInput['filters']; parameters: ParameterValues; mode: 'light' | 'dark'; today?: string } {
  const originals = new Map(page.visuals.map((visual) => [visual.id, visual]));
  const visuals = input.visuals.map((visual): SharedVisualRequest => {
    const original = originals.get(visual.id);
    const request: SharedVisualRequest = { id: visual.id };
    if (visual.data.filters?.length) request.filters = visual.data.filters;
    if (visual.data.highlight?.length) request.highlight = visual.data.highlight;
    const hierarchy = original ? hierarchyOf(resolveVisual(original, spec, parameters)) : null;
    if (hierarchy) {
      const current = visual.data.wells[visual.type === 'matrix' ? 'rows' : 'category']?.[0];
      const level = hierarchy.levels.findIndex((ref) => ref.field === current?.field && (ref.grain ?? '') === (current?.grain ?? ''));
      if (level >= 0 && level !== hierarchy.start) request.level = level;
    }
    return request;
  });
  return { visuals, filters: input.filters, parameters, mode: input.mode, today: input.today };
}

/** A dashboard opened from a public link (``/share/…``) or embedded in another site
 *  (``/embed/…``): read-only, no sign-in; slicers, clicks and drilling still work. */
export function SharedDashboardPage({ embed = false }: { embed?: boolean }) {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const visualize = useRepository('visualize');
  const { resolvedTheme } = useTheme();
  const shared = useQuery({ queryKey: ['visualize', 'shared', token], queryFn: () => visualize.sharedDashboard(token), retry: false, staleTime: 60_000 });
  const spec = shared.data?.spec;
  const [pageId, setPageId] = useState('');
  const viewable = (spec?.pages ?? []).filter((item) => !item.hidden && (item.type ?? 'page') === 'page');
  const page = spec?.pages.find((item) => item.id === pageId) ?? viewable[0];
  const theme = shared.data?.theme ?? undefined;
  const mode = resolveMode(spec?.mode, resolvedTheme === 'dark' ? 'dark' : 'light');
  const draw = useCallback(
    (input: RenderVisualsInput, signal: AbortSignal, parameters: ParameterValues) => visualize.sharedVisuals(token, sharedRequest(input, spec!, page!, parameters), signal),
    [visualize, token, spec, page],
  );
  const render = useMemo(() => ({ key: `shared:${token}`, draw }), [token, draw]);
  const runtime = useDashboardRuntime({ spec, page, mode, render });
  const [canvas, width] = useWidth<HTMLDivElement>();

  if (shared.isLoading) return <div className="dash-shared grid place-items-center text-sm text-muted-foreground">{t('visualize.dashboards.shared.loading')}</div>;
  if (shared.error || !spec || !page) {
    return (
      <div className="dash-shared grid place-items-center" data-testid="shared-missing">
        <div className="max-w-sm text-center">
          <Lock className="mx-auto mb-2 text-muted-foreground" aria-hidden />
          <h1 className="text-base font-semibold">{t('visualize.dashboards.shared.missingTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('visualize.dashboards.shared.missingText')}</p>
        </div>
      </div>
    );
  }
  const { visuals, outputs, selection, setSelection, onSelect } = runtime;
  const rowHeight = Math.max((width / PAGE_WIDTH) * ROW_PX, 1);
  const stacked = width > 0 && width < 640;
  const height = Math.max(...visuals.map((visual) => visual.layout.y + visual.layout.h), pageRows(page)) * rowHeight;
  const kpis = kpiIndexes(visuals);
  const local = { spec: { ...spec, bookmarks: [] }, pageId: page.id, parameters: runtime.parameters, setParameter: runtime.setParameter, bookmarks: [], onAction: () => undefined };

  return (
    <div className={`dash-shared${embed ? ' embed' : ''}`} data-testid="shared-dashboard">
      {(!embed || viewable.length > 1) && (
        <header className="mb-2 flex flex-wrap items-center gap-2">
          {!embed && (
            <h1 className="mr-2 truncate text-lg font-semibold" data-testid="shared-name">
              {shared.data?.name}
            </h1>
          )}
          {viewable.length > 1 && (
            <nav className="viz-segment" aria-label={t('visualize.dashboards.shared.pages')}>
              {viewable.map((item) => (
                <button key={item.id} type="button" aria-pressed={item.id === page.id} onClick={() => setPageId(item.id)}>
                  {item.name}
                </button>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {selection && (
              <button type="button" className="viz-chip" onClick={() => setSelection(null)}>
                <Eraser size={12} aria-hidden /> {t('visualize.dashboards.shared.clearSelection')}
              </button>
            )}
            {Object.values(runtime.slicers).some(Boolean) && (
              <button type="button" className="viz-chip" onClick={runtime.clearSlicers}>
                <FilterX size={12} aria-hidden /> {t('visualize.dashboards.shared.clearSlicers')}
              </button>
            )}
            {!embed && <span>{t('visualize.dashboards.shared.readOnly')}</span>}
          </div>
        </header>
      )}
      <div className={`dash-canvas ${mode}`} style={themeStyle(theme, mode, spec.density)} data-testid="dashboard-canvas" data-mode={mode} data-page={page.id}>
        <div ref={canvas} className={stacked ? 'dash-stack' : 'dash-grid'} style={stacked ? undefined : { height }}>
          {width > 0 &&
            visuals.map((visual) => (
              <Tile
                key={visual.id}
                visual={visual}
                output={outputs[visual.id]}
                theme={theme}
                kpiIndex={kpis[visual.id] ?? -1}
                className={selection?.source === visual.id ? 'selected' : ''}
                style={stacked ? { height: Math.max(visual.layout.h * 24, 56) } : tileStyle(visual, rowHeight)}
                onSelect={onSelect(visual.id)}
                slicerValue={runtime.slicerValue(visual)}
                onSlicerChange={(value) => runtime.setSlicer(visual, value)}
                local={local}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
