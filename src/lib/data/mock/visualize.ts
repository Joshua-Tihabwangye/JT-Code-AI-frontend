// The visualization tool runs pandas, Plotly, SciPy, statsmodels and scikit-learn on the
// server, so mock mode has no implementation: every call explains how to enable it.
import i18n from '@/i18n/config';
import type { VisualizeRepository } from '../contracts';

/** Shown in the chosen language when a Data Visualization call is made without the backend. */
export const visualizeNeedsApi = () => i18n.t('errors.visualizeNeedsApi');

export function createMockVisualizeRepository(): VisualizeRepository {
  return new Proxy({} as VisualizeRepository, {
    // `then` stays undefined so the repository is never mistaken for a promise.
    get: (_target, property) => (property === 'then' ? undefined : () => Promise.reject(new Error(visualizeNeedsApi()))),
  });
}
