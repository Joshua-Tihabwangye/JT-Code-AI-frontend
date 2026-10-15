import { create } from 'zustand';
import type { DashboardPage, DashboardRecord, DashboardSpec, DashboardVisual } from '@/lib/data';

const HISTORY = 50;
const MERGE_MS = 1200;
const CLIPBOARD_KEY = 'jt.visualize.clipboard';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error';

interface EditorState {
  record: DashboardRecord | null;
  spec: DashboardSpec | null;
  version: number;
  pageId: string;
  selected: string[];
  past: DashboardSpec[];
  future: DashboardSpec[];
  saveState: SaveState;
  saveError: string;
  snap: boolean;
  gridlines: boolean;
  zoom: number | 'fit';
  /** Undo merging: consecutive edits with the same key within a moment form one undo step. */
  mergeKey: string;
  mergeAt: number;
  load: (record: DashboardRecord) => void;
  change: (mutate: (spec: DashboardSpec) => DashboardSpec, options?: { merge?: string; record?: boolean }) => void;
  /** Start a drag/resize: one undo step for the whole gesture. */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  setPage: (pageId: string) => void;
  select: (ids: string[], mode?: 'replace' | 'toggle' | 'add') => void;
  markSaving: () => void;
  markSaved: (record: DashboardRecord) => void;
  markFailed: (state: 'conflict' | 'error', message: string) => void;
  setOption: (patch: Partial<Pick<EditorState, 'snap' | 'gridlines' | 'zoom'>>) => void;
}

export const useEditor = create<EditorState>((set, get) => ({
  record: null,
  spec: null,
  version: 0,
  pageId: '',
  selected: [],
  past: [],
  future: [],
  saveState: 'saved',
  saveError: '',
  snap: true,
  gridlines: true,
  zoom: 'fit',
  mergeKey: '',
  mergeAt: 0,
  load: (record) =>
    set({
      record,
      spec: record.spec ?? null,
      version: record.version,
      pageId: record.spec?.pages[0]?.id ?? '',
      selected: [],
      past: [],
      future: [],
      saveState: 'saved',
      saveError: '',
      mergeKey: '',
    }),
  change: (mutate, options = {}) => {
    const { spec, past, mergeKey, mergeAt } = get();
    if (!spec) return;
    const next = mutate(spec);
    if (next === spec) return;
    const now = Date.now();
    const merged = options.record === false || (!!options.merge && options.merge === mergeKey && now - mergeAt < MERGE_MS);
    set({
      spec: next,
      past: merged ? past : [...past, spec].slice(-HISTORY),
      future: [],
      saveState: 'dirty',
      mergeKey: options.merge ?? '',
      mergeAt: now,
    });
  },
  checkpoint: () => {
    const { spec, past } = get();
    if (spec) set({ past: [...past, spec].slice(-HISTORY), future: [], mergeKey: '' });
  },
  undo: () => {
    const { spec, past, future } = get();
    const previous = past[past.length - 1];
    if (!spec || !previous) return;
    set({ spec: previous, past: past.slice(0, -1), future: [spec, ...future], saveState: 'dirty', mergeKey: '', selected: keepSelection(previous, get()) });
  },
  redo: () => {
    const { spec, past, future } = get();
    const next = future[0];
    if (!spec || !next) return;
    set({ spec: next, past: [...past, spec], future: future.slice(1), saveState: 'dirty', mergeKey: '', selected: keepSelection(next, get()) });
  },
  setPage: (pageId) => set({ pageId, selected: [] }),
  select: (ids, mode = 'replace') => {
    const current = get().selected;
    if (mode === 'replace') set({ selected: ids });
    else if (mode === 'add') set({ selected: [...new Set([...current, ...ids])] });
    else set({ selected: ids.every((id) => current.includes(id)) ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])] });
  },
  markSaving: () => set({ saveState: 'saving', saveError: '' }),
  markSaved: (record) =>
    set((state) => ({
      record: { ...record, spec: state.spec ?? record.spec },
      version: record.version,
      // Edits made while the save was in flight stay unsaved.
      saveState: state.saveState === 'saving' ? 'saved' : state.saveState,
    })),
  markFailed: (state, message) => set({ saveState: state, saveError: message }),
  setOption: (patch) => set(patch),
}));

function keepSelection(spec: DashboardSpec, state: EditorState): string[] {
  const page = spec.pages.find((item) => item.id === state.pageId);
  return state.selected.filter((id) => page?.visuals.some((visual) => visual.id === id));
}

export function currentPage(state: Pick<EditorState, 'spec' | 'pageId'>): DashboardPage | undefined {
  return state.spec?.pages.find((page) => page.id === state.pageId) ?? state.spec?.pages[0];
}

export function selectedVisuals(state: Pick<EditorState, 'spec' | 'pageId' | 'selected'>): DashboardVisual[] {
  const page = currentPage(state);
  return page?.visuals.filter((visual) => state.selected.includes(visual.id)) ?? [];
}

/** Copy/paste works across pages and dashboards (and survives a reload) via local storage. */
export function writeClipboard(visuals: DashboardVisual[]): void {
  try {
    localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(visuals));
  } catch {
    // Storage may be unavailable (private mode); copy then only works within this page.
  }
  memoryClipboard = visuals;
}

let memoryClipboard: DashboardVisual[] = [];

export function readClipboard(): DashboardVisual[] {
  try {
    const raw = localStorage.getItem(CLIPBOARD_KEY);
    if (raw) return JSON.parse(raw) as DashboardVisual[];
  } catch {
    // Fall back to the in-memory copy.
  }
  return memoryClipboard;
}
