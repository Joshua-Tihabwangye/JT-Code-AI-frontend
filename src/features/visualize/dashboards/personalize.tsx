import { useEffect, useRef, useState } from 'react';
import { Bookmark, BookmarkPlus, Check, ChevronDown, Moon, Plus, RotateCcw, Star, Sun, Trash2, Undo2, X } from 'lucide-react';
import type { ColumnProfile, DashboardBookmark, DashboardFieldRef, DashboardVisual, DashboardVisualType } from '@/lib/data';
import { humanize } from '../ui';
import { AGGREGATIONS, COMPATIBLE, fieldKind, retype, VISUAL_BY_TYPE, wellItem } from './editor/catalog';

export interface PersonalDisplay {
  mode: 'light' | 'dark' | 'system' | null;
  density: 'compact' | 'comfortable' | null;
}

/** “Views ▾”: the author's views, the viewer's own, a default, light/dark and density for oneself. */
export function ViewsMenu({
  author,
  personal,
  active,
  defaultView,
  display,
  canSave,
  onApply,
  onSave,
  onDelete,
  onDefault,
  onDisplay,
  onReset,
}: {
  author: DashboardBookmark[];
  personal: DashboardBookmark[];
  active?: string;
  defaultView?: string;
  display: PersonalDisplay;
  canSave: boolean;
  onApply: (bookmark: DashboardBookmark) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  onDefault: (id: string | undefined) => void;
  onDisplay: (display: PersonalDisplay) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => !box.current?.contains(event.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const current = [...author, ...personal].find((bookmark) => bookmark.id === active);
  const row = (bookmark: DashboardBookmark, mine: boolean) => (
    <div key={bookmark.id} className="dash-view-row">
      <button type="button" className="flex-1 truncate text-left" aria-pressed={bookmark.id === active} onClick={() => (onApply(bookmark), setOpen(false))} data-testid={`view-${bookmark.id}`}>
        {bookmark.name}
      </button>
      {canSave && (
        <button type="button" title={defaultView === bookmark.id ? 'Your default view' : 'Open with this view'} aria-pressed={defaultView === bookmark.id} onClick={() => onDefault(defaultView === bookmark.id ? undefined : bookmark.id)} data-testid={`default-view-${bookmark.id}`}>
          <Star size={12} fill={defaultView === bookmark.id ? 'currentColor' : 'none'} />
        </button>
      )}
      {mine && (
        <button type="button" title="Delete this view" onClick={() => onDelete(bookmark.id)} data-testid={`delete-view-${bookmark.id}`}>
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
  return (
    <div ref={box} className="relative">
      <button type="button" className="viz-chip" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="views-menu">
        <Bookmark size={12} aria-hidden /> {current ? current.name : 'Views'} <ChevronDown size={12} aria-hidden />
      </button>
      {open && (
        <div className="dash-popover menu dash-views" role="dialog" aria-label="Views">
          {author.length > 0 && <p className="dash-menu-title">Views</p>}
          {author.map((bookmark) => row(bookmark, false))}
          {canSave && (
            <>
              <p className="dash-menu-title">My views</p>
              {personal.length === 0 && <p className="px-2 text-[11px] text-muted-foreground">Save what you see — filters, slicers, drill, your changes.</p>}
              {personal.map((bookmark) => row(bookmark, true))}
              <form
                className="flex gap-1 px-1 pt-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!name.trim()) return;
                  onSave(name.trim());
                  setName('');
                }}
              >
                <input className="viz-field h-7 flex-1 text-xs" value={name} maxLength={60} placeholder="Name this view" onChange={(event) => setName(event.target.value)} data-testid="view-name" />
                <button type="submit" className="viz-chip" disabled={!name.trim()} data-testid="save-view">
                  <BookmarkPlus size={12} aria-hidden /> Save
                </button>
              </form>
            </>
          )}
          <p className="dash-menu-title">For me</p>
          <div className="flex flex-wrap gap-1 px-1">
            {(['system', 'light', 'dark'] as const).map((mode) => (
              <button key={mode} type="button" className="viz-chip" aria-pressed={(display.mode ?? 'system') === mode} onClick={() => onDisplay({ ...display, mode })} data-testid={`personal-mode-${mode}`}>
                {mode === 'light' ? <Sun size={12} /> : mode === 'dark' ? <Moon size={12} /> : null} {humanize(mode)}
              </button>
            ))}
            {(['comfortable', 'compact'] as const).map((density) => (
              <button key={density} type="button" className="viz-chip" aria-pressed={display.density === density} onClick={() => onDisplay({ ...display, density })} data-testid={`personal-density-${density}`}>
                {humanize(density)}
              </button>
            ))}
          </div>
          <button type="button" role="menuitem" className="mt-1" onClick={() => (onReset(), setOpen(false))} data-testid="reset-personal">
            <RotateCcw size={13} /> Reset to default
          </button>
        </div>
      )}
    </div>
  );
}

/** “Personalize this visual”: change its type and fields for yourself; the author's version stays. */
export function PersonalizePane({
  visual,
  base,
  profiles,
  canUndo,
  onChange,
  onReset,
  onUndo,
  onClose,
}: {
  /** The visual as the viewer sees it now. */
  visual: DashboardVisual;
  /** The author's visual (to show what changed). */
  base: DashboardVisual;
  profiles: ColumnProfile[];
  canUndo: boolean;
  onChange: (override: Partial<DashboardVisual>) => void;
  onReset: () => void;
  onUndo: () => void;
  onClose: () => void;
}) {
  const spec = VISUAL_BY_TYPE[visual.type];
  const types = [base.type, ...(COMPATIBLE[base.type] ?? [])].filter((type, index, all) => all.indexOf(type) === index && VISUAL_BY_TYPE[type]);
  const wells = visual.data.wells;
  const legend = (visual.format?.legend as { show?: boolean } | undefined)?.show !== false;
  const labels = (visual.format?.labels as { show?: boolean } | undefined)?.show;
  const sort = (visual.format?.sort ?? {}) as { by?: 'value' | 'category'; dir?: 'asc' | 'desc' };
  const kindOf = (field: string) => fieldKind(profiles.find((profile) => profile.name === field));
  const setWells = (next: DashboardVisual['data']['wells']) => onChange({ data: { ...visual.data, wells: next } });
  const setFormat = (section: string, value: Record<string, unknown>) => onChange({ format: { [section]: { ...(visual.format?.[section] ?? {}), ...value } } });
  return (
    <div className="dash-personalize" role="dialog" aria-label="Personalize this visual" data-testid="personalize-pane">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Personalize this visual</p>
        <button type="button" className="viz-icon-button" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">Only you see these changes.</p>
      <label className="viz-label mt-2 block">Visual type</label>
      <select className="viz-field" value={visual.type} onChange={(event) => {
          const next = retype(visual, event.target.value as DashboardVisualType);
          onChange({ type: next.type, data: next.data });
        }} data-testid="personalize-type">
        {types.map((type) => (
          <option key={type} value={type}>
            {VISUAL_BY_TYPE[type].label}
          </option>
        ))}
      </select>
      {spec?.wells.map((well) => {
        const refs = wells[well.key] ?? [];
        const allowed = profiles.filter((profile) => well.measure || well.accepts.includes(kindOf(profile.name)));
        const update = (index: number, ref: DashboardFieldRef | null) => setWells({ ...wells, [well.key]: ref ? refs.map((item, i) => (i === index ? ref : item)) : refs.filter((_, i) => i !== index) });
        return (
          <div key={well.key} className="mt-2">
            <span className="viz-label">{well.label}</span>
            {refs.map((ref, index) => (
              <div key={index} className="mt-1 flex items-center gap-1">
                <select
                  className="viz-field h-7 text-xs"
                  style={{ flex: 1, minWidth: 0 }}
                  value={ref.field}
                  onChange={(event) => update(index, { ...wellItem(event.target.value, kindOf(event.target.value), well), ...(ref.grain && kindOf(event.target.value) === 'datetime' ? { grain: ref.grain } : {}) })}
                  data-testid={`personalize-field-${well.key}-${index}`}
                >
                  {!profiles.some((profile) => profile.name === ref.field) && <option value={ref.field}>{ref.label ?? ref.field}</option>}
                  {allowed.map((profile) => (
                    <option key={profile.name} value={profile.name}>
                      {humanize(profile.name)}
                    </option>
                  ))}
                </select>
                {well.measure && !ref.expr && !ref.calc && (
                  <select className="viz-field h-7 text-xs" style={{ width: 96, flex: 'none' }} value={ref.agg ?? 'sum'} onChange={(event) => update(index, { ...ref, agg: event.target.value })} aria-label="Aggregation">
                    {AGGREGATIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
                <button type="button" className="viz-icon-button" onClick={() => update(index, null)} aria-label={`Remove ${ref.field}`}>
                  <X size={12} />
                </button>
              </div>
            ))}
            {refs.length < well.max && allowed.length > 0 && (
              <button
                type="button"
                className="viz-chip mt-1"
                onClick={() => {
                  const first = allowed.find((profile) => !refs.some((ref) => ref.field === profile.name)) ?? allowed[0]!;
                  setWells({ ...wells, [well.key]: [...refs, wellItem(first.name, kindOf(first.name), well)] });
                }}
                data-testid={`personalize-add-${well.key}`}
              >
                <Plus size={12} /> Add
              </button>
            )}
          </div>
        );
      })}
      <div className="mt-3 flex flex-wrap gap-1">
        <button type="button" className="viz-chip" aria-pressed={legend} onClick={() => setFormat('legend', { show: !legend })}>
          {legend && <Check size={12} />} Legend
        </button>
        <button type="button" className="viz-chip" aria-pressed={!!labels} onClick={() => setFormat('labels', { show: !labels })}>
          {labels && <Check size={12} />} Data labels
        </button>
        <select className="viz-field h-7 text-xs" value={`${sort.by ?? 'value'}:${sort.dir ?? 'desc'}`} onChange={(event) => setFormat('sort', { by: event.target.value.split(':')[0], dir: event.target.value.split(':')[1] })} aria-label="Sort">
          <option value="value:desc">Largest first</option>
          <option value="value:asc">Smallest first</option>
          <option value="category:asc">A → Z</option>
          <option value="category:desc">Z → A</option>
        </select>
      </div>
      <div className="mt-3 flex gap-1">
        <button type="button" className="viz-chip" disabled={!canUndo} onClick={onUndo} data-testid="personalize-undo">
          <Undo2 size={12} /> Undo
        </button>
        <button type="button" className="viz-chip" onClick={onReset} data-testid="personalize-reset">
          <RotateCcw size={12} /> Reset this visual
        </button>
      </div>
    </div>
  );
}
