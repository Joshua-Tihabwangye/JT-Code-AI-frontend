import { useTranslation } from 'react-i18next';
import { Calculator } from 'lucide-react';
import type { ChartExplanation, VizMetric } from '@/lib/data';

/** "How this was calculated" under a prediction chart: method, steps and formula (from Python). */
export function HowCalculated({ explanation }: { explanation: Partial<ChartExplanation> }) {
  const { t } = useTranslation();
  if (!explanation.method && !explanation.formula && !explanation.howToRead) return null;
  return (
    <details className="predict-how" data-testid="how-calculated">
      <summary>
        <Calculator size={13} aria-hidden /> {t('visualize.predict.howCalculated')}
      </summary>
      <div className="mt-2 space-y-2 text-sm">
        {explanation.method && <p className="font-semibold">{explanation.method}</p>}
        {explanation.steps && explanation.steps.length > 0 && (
          <ol className="list-decimal space-y-1 pl-5">
            {explanation.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}
        {explanation.formula && (
          <div>
            <p className="viz-label m-0">{t('visualize.predict.formula')}</p>
            <code className="predict-formula">{explanation.formula}</code>
          </div>
        )}
        {explanation.howToRead && (
          <p className="text-muted-foreground">
            <b>{t('visualize.predict.howToRead')}</b> {explanation.howToRead}
          </p>
        )}
      </div>
    </details>
  );
}

/** The formula and meaning of one result number. */
export function MetricFormula({ metric }: { metric: VizMetric }) {
  const { t } = useTranslation();
  if (!metric.formula && !metric.meaning) return null;
  return (
    <details className="predict-how predict-how-small" data-testid={`metric-formula-${metric.key}`}>
      <summary>
        <Calculator size={11} aria-hidden /> {t('visualize.predict.howCalculatedShort')}
      </summary>
      {metric.formula && <code className="predict-formula mt-1">{metric.formula}</code>}
      {metric.meaning && <p className="mt-1 text-[11px] text-muted-foreground">{metric.meaning}</p>}
    </details>
  );
}
