import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pin, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/http';
import { useRepository, type DashboardVisual } from '@/lib/data';
import { addVisual } from './editor/actions';
import { newId, VISUAL_BY_TYPE } from './editor/catalog';

export type PinnableVisual = Omit<DashboardVisual, 'id' | 'layout'> & { layout?: { w: number; h: number } };

/** “Pin to dashboard”: add a visual to a page of an existing dashboard, or start a new one. */
export function PinDialog({ visual, title, onClose }: { visual: PinnableVisual; title?: string; onClose: () => void }) {
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const dashboards = useQuery({ queryKey: ['visualize', 'dashboards'], queryFn: () => visualize.listDashboards() });
  const editable = (dashboards.data ?? []).filter((item) => item.role !== 'viewer');
  const [target, setTarget] = useState('');
  const [pageId, setPageId] = useState('');
  const [name, setName] = useState(title ? `${title} dashboard` : 'New dashboard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ id: string; name: string } | null>(null);
  const chosen = target || editable[0]?.id || 'new';
  const record = useQuery({ queryKey: ['visualize', 'dashboard', chosen], queryFn: () => visualize.getDashboard(chosen), enabled: chosen !== 'new' });
  const pages = (record.data?.spec?.pages ?? []).filter((page) => (page.type ?? 'page') === 'page');
  const size = visual.layout ?? VISUAL_BY_TYPE[visual.type]?.size ?? { w: 8, h: 10 };
  const created: Omit<DashboardVisual, 'layout'> = { ...visual, id: newId(visual.type), format: { ...(visual.format ?? {}), ...(title ? { title: { ...(visual.format?.title ?? {}), text: title } } : {}) } };

  const pin = async () => {
    setBusy(true);
    setError('');
    try {
      if (chosen === 'new') {
        const fresh = await visualize.createDashboard({
          name: name.trim() || 'New dashboard',
          spec: { theme: 'executive', mode: 'system', pages: [{ id: 'page-1', name: 'Overview', visuals: [{ ...created, layout: { x: 0, y: 0, w: size.w, h: size.h } }] }] },
        });
        setDone({ id: fresh.id, name: fresh.name });
      } else {
        // Always pin onto the latest version (someone may have edited it since the list loaded).
        const latest = await visualize.getDashboard(chosen);
        const spec = latest.spec!;
        const page = pageId && spec.pages.some((item) => item.id === pageId) ? pageId : (spec.pages.find((item) => (item.type ?? 'page') === 'page') ?? spec.pages[0])!.id;
        const next = addVisual(spec, page, created, size).spec;
        const saved = await visualize.updateDashboard(chosen, { spec: next, version: latest.version });
        setDone({ id: saved.id, name: saved.name });
      }
      await queryClient.invalidateQueries({ queryKey: ['visualize', 'dashboards'] });
      await queryClient.invalidateQueries({ queryKey: ['visualize', 'dashboard'] });
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dash-dialog-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dash-dialog narrow" role="dialog" aria-label="Pin to dashboard" data-testid="pin-dialog">
        <header className="flex items-center gap-2">
          <Pin size={16} aria-hidden />
          <h2 className="flex-1 text-sm font-semibold">Pin to dashboard</h2>
          <button type="button" className="viz-icon-button" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </header>
        {done ? (
          <div className="space-y-3 text-sm" data-testid="pin-done">
            <p className="flex items-center gap-2">
              <Check size={16} className="text-emerald-500" aria-hidden /> Pinned to <b>{done.name}</b>.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="viz-chip" onClick={onClose}>
                Stay here
              </button>
              <Link to={`/app/visualize/dashboards/${done.id}`} className="viz-chip primary" data-testid="pin-open">
                Open dashboard
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="dash-format-row">
              <span>Dashboard</span>
              <select className="viz-field" value={chosen} onChange={(event) => (setTarget(event.target.value), setPageId(''))} data-testid="pin-dashboard">
                {editable.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
                <option value="new">+ New dashboard…</option>
              </select>
            </label>
            {chosen === 'new' ? (
              <label className="dash-format-row">
                <span>Name</span>
                <input className="viz-field" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} data-testid="pin-new-name" />
              </label>
            ) : (
              <label className="dash-format-row">
                <span>Page</span>
                <select className="viz-field" value={pageId || pages[0]?.id || ''} onChange={(event) => setPageId(event.target.value)} data-testid="pin-page">
                  {pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="viz-chip" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="viz-chip primary" disabled={busy || (chosen !== 'new' && !record.data)} onClick={() => void pin()} data-testid="pin-confirm">
                <Pin size={12} aria-hidden /> {busy ? 'Pinning…' : 'Pin'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
