import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository, type Dataset, type VizCatalog, type VizFields, type VizOptions } from '@/lib/data';

export interface StudioDraft {
  chartType: string;
  fields?: VizFields;
  options?: VizOptions;
  title?: string;
  datasetId?: string;
}

export interface PredictDraft {
  task: string;
  fields?: VizFields;
  model?: string;
  options?: VizOptions;
  datasetId?: string;
}

/** What is on screen, so the assistant can answer "this chart" questions. */
export interface AssistantContext {
  page: string;
  chartType?: string;
  fields?: VizFields;
  options?: VizOptions;
  title?: string;
}

interface VisualizeState {
  catalog: VizCatalog | undefined;
  catalogError: unknown;
  datasets: Dataset[];
  datasetsLoading: boolean;
  refreshDatasets: () => Promise<void>;
  datasetId: string;
  dataset: Dataset | undefined;
  setDatasetId: (id: string) => void;
  studioDraft: StudioDraft | null;
  clearStudioDraft: () => void;
  predictDraft: PredictDraft | null;
  clearPredictDraft: () => void;
  openStudio: (draft: StudioDraft) => void;
  openPredict: (draft: PredictDraft) => void;
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  assistantContext: AssistantContext;
  setAssistantContext: (context: AssistantContext) => void;
}

const Context = createContext<VisualizeState | null>(null);
const STORAGE_KEY = 'jt.visualize.dataset';

function storedDataset(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function VisualizeProvider({ children }: { children: ReactNode }) {
  const visualize = useRepository('visualize');
  const analytics = useRepository('analytics');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const catalog = useQuery({ queryKey: ['visualize', 'catalog'], queryFn: () => visualize.catalog(), staleTime: Infinity, retry: 1 });
  const datasets = useQuery({ queryKey: ['analytics', 'datasets'], queryFn: () => analytics.listDatasets() });
  const [datasetId, setDatasetIdState] = useState(storedDataset);
  const [studioDraft, setStudioDraft] = useState<StudioDraft | null>(null);
  const [predictDraft, setPredictDraft] = useState<PredictDraft | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantContext, setAssistantContext] = useState<AssistantContext>({ page: 'overview' });

  const list = useMemo(() => datasets.data ?? [], [datasets.data]);
  const clearStudioDraft = useCallback(() => setStudioDraft(null), []);
  const clearPredictDraft = useCallback(() => setPredictDraft(null), []);
  const setDatasetId = useCallback((id: string) => {
    setDatasetIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* private mode: selection is per tab only */
    }
  }, []);

  // Fall back to the newest dataset when the remembered one is gone.
  useEffect(() => {
    if (!datasets.data) return;
    if (!list.some((dataset) => dataset.id === datasetId)) setDatasetId(list[0]?.id ?? '');
  }, [datasets.data, list, datasetId, setDatasetId]);

  const value = useMemo<VisualizeState>(
    () => ({
      catalog: catalog.data,
      catalogError: catalog.error,
      datasets: list,
      datasetsLoading: datasets.isLoading,
      refreshDatasets: () => queryClient.invalidateQueries({ queryKey: ['analytics', 'datasets'] }),
      datasetId,
      dataset: list.find((dataset) => dataset.id === datasetId),
      setDatasetId,
      studioDraft,
      clearStudioDraft,
      predictDraft,
      clearPredictDraft,
      openStudio: (draft) => {
        if (draft.datasetId) setDatasetId(draft.datasetId);
        setStudioDraft(draft);
        void navigate('/app/visualize/studio');
      },
      openPredict: (draft) => {
        if (draft.datasetId) setDatasetId(draft.datasetId);
        setPredictDraft(draft);
        void navigate('/app/visualize/predict');
      },
      assistantOpen,
      setAssistantOpen,
      assistantContext,
      setAssistantContext,
    }),
    [catalog.data, catalog.error, list, datasets.isLoading, queryClient, datasetId, setDatasetId, studioDraft, clearStudioDraft, predictDraft, clearPredictDraft, navigate, assistantOpen, assistantContext],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useVisualize(): VisualizeState {
  const value = useContext(Context);
  if (!value) throw new Error('useVisualize must be used inside VisualizeProvider');
  return value;
}
