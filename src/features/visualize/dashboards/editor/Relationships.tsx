import { useState } from 'react';
import { Link2, Plus, Trash2 } from 'lucide-react';
import type { DashboardRelationship, DashboardSpec } from '@/lib/data';
import { useVisualize } from '../../context';

/** Links between datasets (key ↔ key), so a slicer on one dataset filters visuals of another. */
export function RelationshipsSection({ spec, onSpec }: { spec: DashboardSpec; onSpec: (mutate: (spec: DashboardSpec) => DashboardSpec) => void }) {
  const { datasets } = useVisualize();
  const used = [...new Set(spec.pages.flatMap((page) => page.visuals.map((visual) => visual.data.datasetId)).filter(Boolean))];
  const relationships = spec.relationships ?? [];
  const [draft, setDraft] = useState<DashboardRelationship>({ from: { datasetId: used[0] ?? '', field: '' }, to: { datasetId: used[1] ?? datasets.find((d) => d.id !== used[0])?.id ?? '', field: '' } });
  const columns = (id: string) => datasets.find((item) => item.id === id)?.profile.columnProfiles?.map((profile) => profile.name) ?? [];
  const name = (id: string) => datasets.find((item) => item.id === id)?.name ?? 'dataset';
  const save = (next: DashboardRelationship[]) => onSpec((current) => ({ ...current, relationships: next }));
  const exists = (link: DashboardRelationship) =>
    relationships.some(
      (r) =>
        (r.from.datasetId === link.from.datasetId && r.from.field === link.from.field && r.to.datasetId === link.to.datasetId && r.to.field === link.to.field) ||
        (r.from.datasetId === link.to.datasetId && r.from.field === link.to.field && r.to.datasetId === link.from.datasetId && r.to.field === link.from.field),
    );
  // Same-named columns in two datasets of this dashboard are likely keys.
  const suggestions: DashboardRelationship[] = [];
  used.forEach((a, i) =>
    used.slice(i + 1).forEach((b) => {
      for (const column of columns(a)) if (columns(b).includes(column)) suggestions.push({ from: { datasetId: a, field: column }, to: { datasetId: b, field: column } });
    }),
  );
  const side = (key: 'from' | 'to') => (
    <div className="flex gap-1">
      <select className="viz-field h-7 text-xs" value={draft[key].datasetId} onChange={(event) => setDraft({ ...draft, [key]: { datasetId: event.target.value, field: '' } })} aria-label={`${key === 'from' ? 'First' : 'Second'} dataset`}>
        {datasets.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <select className="viz-field h-7 text-xs" value={draft[key].field} onChange={(event) => setDraft({ ...draft, [key]: { ...draft[key], field: event.target.value } })} aria-label={`${key === 'from' ? 'First' : 'Second'} key column`} data-testid={`relationship-${key}-field`}>
        <option value="">Key column…</option>
        {columns(draft[key].datasetId).map((column) => (
          <option key={column} value={column}>
            {column}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <div className="space-y-1.5" data-testid="relationships">
      <p className="viz-label mt-3">Relationships</p>
      <p className="text-[11px] text-muted-foreground">Link a key column in two datasets so slicers and clicks filter across them.</p>
      {relationships.map((link, index) => (
        <div key={index} className="dash-view-row">
          <Link2 size={12} aria-hidden />
          <span className="flex-1 truncate text-xs">
            {name(link.from.datasetId)}.{link.from.field} ↔ {name(link.to.datasetId)}.{link.to.field}
          </span>
          <button type="button" onClick={() => save(relationships.filter((_, i) => i !== index))} aria-label="Remove relationship">
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      {suggestions
        .filter((link) => !exists(link))
        .slice(0, 4)
        .map((link) => (
          <button key={`${link.from.datasetId}-${link.to.datasetId}-${link.from.field}`} type="button" className="viz-chip" onClick={() => save([...relationships, link])} data-testid="relationship-suggestion">
            <Plus size={12} aria-hidden /> Link {link.from.field} in {name(link.from.datasetId)} and {name(link.to.datasetId)}
          </button>
        ))}
      {side('from')}
      {side('to')}
      <button
        type="button"
        className="viz-chip"
        disabled={!draft.from.field || !draft.to.field || draft.from.datasetId === draft.to.datasetId || exists(draft) || relationships.length >= 20}
        onClick={() => save([...relationships, draft])}
        data-testid="relationship-add"
      >
        <Link2 size={12} aria-hidden /> Add relationship
      </button>
    </div>
  );
}
