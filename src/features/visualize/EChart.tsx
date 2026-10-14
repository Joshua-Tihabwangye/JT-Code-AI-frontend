import { useEffect, useRef, useState } from 'react';
import { useRepository, type ChartOption } from '@/lib/data';
import { Spinner } from '@/shared/components';
import { hydrate } from './hydrate';
import { prepare } from './echarts';

export interface EChartClick {
  componentType?: string;
  seriesIndex?: number;
  seriesName?: string;
  dataIndex?: number;
  name?: string;
}

interface ChartInstance {
  setOption: (o: unknown, notMerge?: boolean) => void;
  resize: () => void;
  dispose: () => void;
  on: (event: string, handler: (params: EChartClick) => void) => void;
}

/** Renders a server-built Apache ECharts option (interactive: tooltips, legend toggles, zoom).
 *  ``height`` may be a number of pixels or a CSS size such as ``'100%'`` (dashboard tiles). */
export function EChart({
  option,
  height = 420,
  testId = 'echart',
  onClick,
}: {
  option: ChartOption;
  height?: number | string;
  testId?: string;
  onClick?: (params: EChartClick) => void;
}) {
  const visualize = useRepository('visualize');
  const element = useRef<HTMLDivElement>(null);
  const chart = useRef<ChartInstance | null>(null);
  const clickHandler = useRef(onClick);
  clickHandler.current = onClick;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setError('');
    prepare(option, () => visualize.worldMap())
      .then((echarts) => {
        if (!active || !element.current) return;
        if (!chart.current) {
          chart.current = echarts.init(element.current, null, { renderer: 'canvas' }) as unknown as ChartInstance;
          chart.current.on('click', (params) => clickHandler.current?.(params));
        }
        chart.current.setOption(hydrate(option), true);
        setReady(true);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'The chart could not be drawn.');
      });
    return () => {
      active = false;
    };
  }, [option, visualize]);

  useEffect(() => {
    const node = element.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => chart.current?.resize());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      chart.current?.dispose();
      chart.current = null;
    },
    [],
  );

  return (
    <div style={{ position: 'relative', height }}>
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </div>
      )}
      {error && <p className="p-4 text-sm text-destructive">{error}</p>}
      <div ref={element} data-testid={testId} data-ready={ready ? 'true' : 'false'} style={{ width: '100%', height }} />
    </div>
  );
}
