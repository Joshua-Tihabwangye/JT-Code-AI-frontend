import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FilePlus2, LayoutTemplate, Sparkles, Wand2, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/http';
import { useRepository, type ColumnProfile, type DashboardTemplate } from '@/lib/data';
import { useVisualize } from '../context';
import { AIPageComposer } from './ai';

export type NewDashboardMode = 'blank' | 'auto' | 'template' | 'ai';

const MODES: { id: NewDashboardMode; label: string; icon: typeof Sparkles; hint: string }[] = [
  { id: 'blank', label: 'Blank', icon: FilePlus2, hint: 'An empty page to build on.' },
  { id: 'auto', label: 'Auto', icon: Wand2, hint: 'KPIs, a trend, a breakdown, a map and slicers, chosen from your data.' },
  { id: 'template', label: 'Template', icon: LayoutTemplate, hint: 'A ready-made layout: map your columns to it.' },
  { id: 'ai', label: 'Ask AI', icon: Sparkles, hint: 'Describe the page; preview it before it is created.' },
];

/** A template's layout in miniature (the same grid the template builds): slicers, KPI cards, a
 *  main chart with a side chart, and three charts below. */
export function TemplatePreview({ template }: { template: DashboardTemplate }) {
  const color = template.color;
  const kpis = Math.max(3, Math.min(6, template.visualTypes.filter((type) => type === 'kpi' || type === 'card').length || 4));
  return (
    <svg viewBox="0 0 240 135" className="dash-template-preview" role="img" aria-label={`${template.name} layout`}>
      <rect x="0" y="0" width="240" height="135" rx="6" className="canvas" />
      {[0, 1, 2].map((index) => (
        <rect key={`s${index}`} x={6 + index * 40} y="5" width="36" height="7" rx="2" className="tile" />
      ))}
      {Array.from({ length: kpis }, (_, index) => {
        const width = (228 - (kpis - 1) * 4) / kpis;
        return (
          <g key={`k${index}`}>
            <rect x={6 + index * (width + 4)} y="16" width={width} height="18" rx="3" className="tile" />
            <rect x={10 + index * (width + 4)} y="26" width={width * 0.5} height="4" rx="1" fill={color} opacity="0.85" />
          </g>
        );
      })}
      <rect x="6" y="38" width="150" height="44" rx="3" className="tile" />
      <polyline points="12,74 34,64 56,68 78,56 100,60 122,48 148,52" fill="none" stroke={color} strokeWidth="2" />
      <rect x="160" y="38" width="74" height="44" rx="3" className="tile" />
      <circle cx="197" cy="60" r="14" fill="none" stroke={color} strokeWidth="6" opacity="0.8" />
      {[0, 1, 2].map((index) => (
        <g key={`b${index}`}>
          <rect x={6 + index * 77} y="86" width="74" height="44" rx="3" className="tile" />
          {[0, 1, 2, 3].map((bar) => (
            <rect key={bar} x={12 + index * 77} y={93 + bar * 9} width={56 - bar * 11 - index * 3} height="5" rx="1" fill={color} opacity={0.9 - bar * 0.15} />
          ))}
        </g>
      ))}
    </svg>
  );
}

function kindOf(profile: ColumnProfile): 'numeric' | 'datetime' | 'category' {
  if (profile.kind === 'numeric') return 'numeric';
  if (profile.kind === 'datetime') return 'datetime';
  return 'category';
}

/** Map each of a template's roles to a column of the dataset (suggested by name and type). */
export function MappingWizard({ template, columns, mapping, onChange }: { template: DashboardTemplate; columns: ColumnProfile[]; mapping: Record<string, string>; onChange: (mapping: Record<string, string>) => void }) {
  return (
    <div className="space-y-1.5" data-testid="template-mapping">
      {template.roles.map((role) => {
        const options = columns.filter((column) => kindOf(column) === role.kind);
        return (
          <label key={role.key} className="dash-format-row">
            <span>
              {role.label}
              {role.required && <b className="text-destructive"> *</b>}
              <small className="block text-[10px] text-muted-foreground">{role.kind === 'numeric' ? 'a number' : role.kind === 'datetime' ? 'a date' : 'a category'}</small>
            </span>
            <select className="viz-field" value={mapping[role.key] ?? ''} onChange={(event) => onChange({ ...mapping, [role.key]: event.target.value })} data-testid={`map-${role.key}`}>
              <option value="">{role.required ? 'Choose a column…' : '(skip)'}</option>
              {options.map((column) => (
                <option key={column.name} value={column.name}>
                  {column.name}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

/** “New dashboard”: Blank · Auto · Template · Ask AI. */
export function NewDashboardDialog({ initial = 'auto', onClose }: { initial?: NewDashboardMode; onClose: () => void }) {
  const navigate = useNavigate();
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const { datasets, datasetId: active } = useVisualize();
  const [mode, setMode] = useState<NewDashboardMode>(initial);
  const [datasetId, setDatasetId] = useState(active || datasets[0]?.id || '');
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<DashboardTemplate | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const dataset = datasets.find((item) => item.id === datasetId);
  const columns = useMemo(() => dataset?.profile.columnProfiles ?? [], [dataset]);
  const templates = useQuery({ queryKey: ['visualize', 'templates', datasetId], queryFn: () => visualize.dashboardTemplates(datasetId || undefined), enabled: mode === 'template', staleTime: 5 * 60_000 });
  useEffect(() => {
    const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  useEffect(() => {
    // A different dataset: the template's suggested mapping changes with it.
    if (chosen) setMapping(templates.data?.find((item) => item.id === chosen.id)?.guess ?? {});
  }, [templates.data, chosen]);

  const open = async (id: string, edit = false) => {
    await queryClient.invalidateQueries({ queryKey: ['visualize', 'dashboards'] });
    onClose();
    void navigate(`/app/visualize/dashboards/${id}${edit ? '/edit' : ''}`);
  };
  const create = useMutation({
    mutationFn: async () => {
      if (mode === 'blank') return { record: await visualize.createDashboard({ name: name.trim() || 'Untitled dashboard' }), edit: true };
      if (mode === 'auto') return { record: await visualize.autoDashboard(datasetId, name.trim()), edit: false };
      if (!chosen) throw new Error('Choose a template.');
      const filled = Object.fromEntries(Object.entries(mapping).filter(([, value]) => value));
      return { record: await visualize.dashboardFromTemplate({ templateId: chosen.id, datasetId, mapping: filled, name: name.trim() || undefined }), edit: false };
    },
    onSuccess: ({ record, edit }) => open(record.id, edit),
  });
  const missing = chosen ? chosen.roles.filter((role) => role.required && !mapping[role.key]) : [];

  return (
    <div className="dash-dialog-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dash-dialog wide" role="dialog" aria-modal="true" aria-label="New dashboard" data-testid="new-dashboard-dialog">
        <header className="flex items-center gap-2">
          <h2 className="flex-1 text-base font-semibold">New dashboard</h2>
          <button type="button" className="viz-icon-button" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </header>
        <div className="dash-new-modes" role="tablist" aria-label="How to start">
          {MODES.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={mode === item.id} onClick={() => (setMode(item.id), setChosen(null))} data-testid={`new-mode-${item.id}`}>
              <item.icon size={16} aria-hidden />
              <b>{item.label}</b>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>
        <div className="dash-dialog-body">
          <div className="grid gap-2 sm:grid-cols-2">
            {mode !== 'blank' && (
              <label className="dash-format-row">
                <span>Dataset</span>
                <select className="viz-field" value={datasetId} onChange={(event) => setDatasetId(event.target.value)} data-testid="new-dataset">
                  {!datasets.length && <option value="">Add a dataset first</option>}
                  {datasets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {mode !== 'ai' && (
              <label className="dash-format-row">
                <span>Name</span>
                <input className="viz-field" value={name} maxLength={200} placeholder={mode === 'template' && chosen ? `${dataset?.name ?? 'Data'} · ${chosen.name}` : mode === 'auto' ? `${dataset?.name ?? 'Data'} overview` : 'Untitled dashboard'} onChange={(event) => setName(event.target.value)} data-testid="new-name" />
              </label>
            )}
          </div>

          {mode === 'template' && !chosen && (
            <div className="dash-template-grid" data-testid="template-gallery">
              {templates.isLoading && <p className="text-xs text-muted-foreground">Loading templates…</p>}
              {templates.data?.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="dash-template-card"
                  onClick={() => {
                    setChosen(template);
                    setMapping(template.guess ?? {});
                  }}
                  data-testid={`template-${template.id}`}
                >
                  <TemplatePreview template={template} />
                  <b>{template.name}</b>
                  <small>{template.description}</small>
                </button>
              ))}
            </div>
          )}
          {mode === 'template' && chosen && (
            <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
              <div className="space-y-2">
                <button type="button" className="viz-chip" onClick={() => setChosen(null)} data-testid="template-back">
                  <ArrowLeft size={12} aria-hidden /> All templates
                </button>
                <TemplatePreview template={chosen} />
                <p className="text-xs text-muted-foreground">{chosen.description}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Match your columns</p>
                <MappingWizard template={chosen} columns={columns} mapping={mapping} onChange={setMapping} />
                {missing.length > 0 && <p className="text-[11px] text-muted-foreground">Still needed: {missing.map((role) => role.label).join(', ')}.</p>}
              </div>
            </div>
          )}
          {mode === 'ai' && (
            <AIPageComposer
              datasetId={datasetId}
              applyLabel="Create dashboard"
              onApply={async (proposal) => {
                const record = await visualize.createDashboard({
                  name: proposal.page.name,
                  spec: { theme: 'executive', mode: 'system', calculations: proposal.calculations, parameters: proposal.parameters, pages: [proposal.page] },
                });
                await open(record.id);
              }}
            />
          )}
          {create.error && <p className="text-xs text-destructive">{apiErrorMessage(create.error)}</p>}
        </div>
        {mode !== 'ai' && (
          <footer className="flex justify-end gap-2">
            <button type="button" className="viz-chip" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="viz-chip primary"
              disabled={create.isPending || (mode !== 'blank' && !datasetId) || (mode === 'template' && (!chosen || missing.length > 0))}
              onClick={() => create.mutate()}
              data-testid="new-create"
            >
              {create.isPending ? 'Creating…' : mode === 'template' ? 'Create from template' : mode === 'auto' ? 'Build dashboard' : 'Create'}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
