// The visualization tool runs pandas, Plotly, SciPy, statsmodels and scikit-learn on the
// server, so mock mode has no implementation: every call explains how to enable it.
import type { VisualizeRepository } from '../contracts';

export const VISUALIZE_NEEDS_API = 'Data Visualization runs on the backend. Set VITE_DATA_MODE=api and start the API to use it.';

export function createMockVisualizeRepository(): VisualizeRepository {
  return new Proxy({} as VisualizeRepository, {
    // `then` stays undefined so the repository is never mistaken for a promise.
    get: (_target, property) => (property === 'then' ? undefined : () => Promise.reject(new Error(VISUALIZE_NEEDS_API))),
  });
}
