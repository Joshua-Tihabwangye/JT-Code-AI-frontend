import { ChevronDown, ChevronUp, Eye, EyeOff, Group, Lock, Ungroup, Unlock } from 'lucide-react';
import type { DashboardPage, DashboardVisual, VisualOutput } from '@/lib/data';
import { humanize } from '../../ui';
import { expandGroups, group, layer, mapVisuals, setFormat, ungroup } from './actions';
import { VISUAL_BY_TYPE } from './catalog';
import { useEditor } from './store';

export function visualName(visual: DashboardVisual, output: VisualOutput | undefined): string {
  const fieldName = visual.data.wells.values?.[0]?.field ?? visual.data.wells.category?.[0]?.field;
  return (
    (visual.format?.title as { text?: string } | undefined)?.text ||
    output?.title ||
    visual.title ||
    `${VISUAL_BY_TYPE[visual.type]?.label ?? visual.type}${fieldName ? ` · ${humanize(fieldName)}` : ''}`
  );
}

/** Every visual on the page as a layer: rename, show/hide, lock, reorder and group. */
export function SelectionPane({ page, outputs }: { page: DashboardPage; outputs: Record<string, VisualOutput> }) {
  const { selected, select, change } = useEditor();
  const layers = [...page.visuals].sort((a, b) => (b.layout.z ?? 0) - (a.layout.z ?? 0));
  const grouped = selected.length > 1 && page.visuals.filter((v) => selected.includes(v.id)).every((v) => v.groupId && v.groupId === page.visuals.find((x) => x.id === selected[0])?.groupId);
  return (
    <div className="space-y-2" data-testid="selection-pane">
      <div className="flex gap-1">
        <button type="button" className="viz-chip" disabled={selected.length < 2 || grouped} onClick={() => change((spec) => group(spec, page.id, selected))} data-testid="group-visuals">
          <Group size={12} aria-hidden /> Group
        </button>
        <button type="button" className="viz-chip" disabled={!page.visuals.some((v) => selected.includes(v.id) && v.groupId)} onClick={() => change((spec) => ungroup(spec, page.id, selected))}>
          <Ungroup size={12} aria-hidden /> Ungroup
        </button>
      </div>
      <ul className="dash-layers">
        {layers.map((visual) => {
          const isSelected = selected.includes(visual.id);
          return (
            <li key={visual.id} className={isSelected ? 'selected' : ''}>
              <button type="button" className="dash-layer-name" onClick={(event) => select(expandGroups(page, [visual.id]), event.ctrlKey || event.metaKey || event.shiftKey ? 'toggle' : 'replace')} title={visual.type}>
                {visual.groupId && <span className="dash-group-dot" aria-label="In a group" />}
                <input
                  className="dash-layer-input"
                  value={visualName(visual, outputs[visual.id])}
                  onChange={(event) => change((spec) => mapVisuals(spec, page.id, [visual.id], (v) => setFormat(v, 'title', 'text', event.target.value || undefined)), { merge: `rename.${visual.id}` })}
                  onClick={(event) => event.stopPropagation()}
                  aria-label="Layer name"
                />
              </button>
              <button type="button" onClick={() => change((spec) => mapVisuals(spec, page.id, [visual.id], (v) => ({ ...v, hidden: !v.hidden })))} aria-label={visual.hidden ? 'Show' : 'Hide'} title={visual.hidden ? 'Show' : 'Hide'}>
                {visual.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
              <button type="button" onClick={() => change((spec) => mapVisuals(spec, page.id, [visual.id], (v) => ({ ...v, locked: !v.locked })))} aria-label={visual.locked ? 'Unlock' : 'Lock'} title={visual.locked ? 'Unlock' : 'Lock'}>
                {visual.locked ? <Lock size={12} /> : <Unlock size={12} />}
              </button>
              <button type="button" onClick={() => change((spec) => layer(spec, page.id, [visual.id], 'forward'))} aria-label="Bring forward" title="Bring forward">
                <ChevronUp size={12} />
              </button>
              <button type="button" onClick={() => change((spec) => layer(spec, page.id, [visual.id], 'backward'))} aria-label="Send backward" title="Send backward">
                <ChevronDown size={12} />
              </button>
            </li>
          );
        })}
        {!layers.length && <li className="text-xs text-muted-foreground">No visuals yet — use Insert.</li>}
      </ul>
    </div>
  );
}
