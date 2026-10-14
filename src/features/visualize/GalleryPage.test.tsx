import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type * as DataModule from '@/lib/data';
import type { VizCatalog } from '@/lib/data';
import { createMockVisualizeRepository, VISUALIZE_NEEDS_API } from '@/lib/data/mock/visualize';
import { VisualizeProvider } from './context';
import { GalleryPage } from './pages/GalleryPage';

const catalog: VizCatalog = {
  version: 1,
  categories: [
    { id: 'comparison', name: 'Comparison', description: 'Compare', color: '#6366f1', icon: 'BarChart3' },
    { id: 'ml', name: 'Model evaluation', description: 'Judge models', color: '#ef4444', icon: 'BrainCircuit' },
  ],
  charts: [
    { id: 'bar', name: 'Bar chart', category: 'comparison', description: 'Compare values.', slots: [], options: [], tags: ['rank'], level: 'essential', howToRead: 'Compare heights.' },
    { id: 'roc_curve', name: 'ROC curve', category: 'ml', description: 'AUC.', slots: [], options: [], tags: ['auc'], level: 'essential', howToRead: 'Higher is better.' },
  ],
  palettes: [],
  themes: ['light', 'dark'],
  predictionTasks: [],
  importFormats: [],
  exportFormats: [],
  samples: [],
  limits: { maxUploadBytes: 1, maxRows: 1, maxColumns: 1, maxChartPoints: 1 },
};

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof DataModule>();
  const repositories = {
    visualize: { catalog: () => Promise.resolve(catalog), suggestFields: () => Promise.resolve({}) },
    analytics: { listDatasets: () => Promise.resolve([]) },
  };
  return { ...actual, useRepository: (key: keyof typeof repositories) => repositories[key] };
});

function renderGallery() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/app/visualize/gallery']}>
        <VisualizeProvider>
          <Routes>
            <Route path="/app/visualize/gallery" element={<GalleryPage />} />
            <Route path="/app/visualize/studio" element={<p>Studio open</p>} />
          </Routes>
        </VisualizeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('GalleryPage', () => {
  it('groups charts by family, filters by search and opens the Studio', async () => {
    renderGallery();
    await screen.findByTestId('gallery-chart-bar');
    expect(screen.getByTestId('gallery-chart-roc_curve')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('gallery-search'), { target: { value: 'auc' } });
    await waitFor(() => expect(screen.queryByTestId('gallery-chart-bar')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTestId('gallery-chart-roc_curve'));
    expect(await screen.findByText('Studio open')).toBeInTheDocument();
  });
});

describe('mock mode', () => {
  it('explains that the tool needs the API', async () => {
    const repository = createMockVisualizeRepository();
    await expect(repository.catalog()).rejects.toThrow(VISUALIZE_NEEDS_API);
    expect((repository as unknown as { then?: unknown }).then).toBeUndefined();
  });
});
