import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Code2, Copy, Link2, Share2, Users, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/http';
import { useRepository, type DashboardShareLink } from '@/lib/data';

export function shareUrl(token: string, kind: 'link' | 'embed'): string {
  return `${window.location.origin}/${kind === 'embed' ? 'embed' : 'share'}/${token}`;
}

export function embedCode(token: string): string {
  return `<iframe src="${shareUrl(token, 'embed')}" width="1280" height="760" style="border:0" loading="lazy" title="Dashboard"></iframe>`;
}

function CopyButton({ text, label, testId }: { text: string; label: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="viz-chip"
      onClick={() =>
        void navigator.clipboard
          .writeText(text)
          .then(() => setCopied(true))
          .catch(() => setCopied(false))
      }
      data-testid={testId}
    >
      {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />} {copied ? 'Copied' : label}
    </button>
  );
}

/** Public, read-only links and embeds for a dashboard. A link's address is shown once, when it is
 *  made (only a fingerprint is stored); revoking ends access straight away. */
export function ShareDialog({ dashboardId, name, workspace, onClose }: { dashboardId: string; name: string; workspace?: { shared: boolean; canChange: boolean }; onClose: () => void }) {
  const visualize = useRepository('visualize');
  const queryClient = useQueryClient();
  const links = useQuery({ queryKey: ['visualize', 'share-links', dashboardId], queryFn: () => visualize.shareLinks(dashboardId) });
  const [kind, setKind] = useState<'link' | 'embed'>('link');
  const [label, setLabel] = useState('');
  const [expires, setExpires] = useState('');
  const [fresh, setFresh] = useState<DashboardShareLink | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['visualize', 'share-links', dashboardId] });
  const create = useMutation({
    mutationFn: () => visualize.createShareLink(dashboardId, { kind, name: label.trim(), expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null }),
    onSuccess: async (link) => {
      setFresh(link);
      setLabel('');
      await refresh();
    },
  });
  const revoke = useMutation({ mutationFn: (id: string) => visualize.revokeShareLink(dashboardId, id), onSuccess: refresh });
  const [shared, setShared] = useState(workspace?.shared ?? false);
  const toggleWorkspace = useMutation({
    mutationFn: (next: boolean) => visualize.updateDashboard(dashboardId, { isShared: next }),
    onSuccess: async (record) => {
      setShared(record.isShared);
      await queryClient.invalidateQueries({ queryKey: ['visualize', 'dashboard', dashboardId] });
      await queryClient.invalidateQueries({ queryKey: ['visualize', 'dashboards'] });
    },
  });
  const active = (links.data ?? []).filter((link) => !link.revokedAt);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="dash-dialog-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dash-dialog" role="dialog" aria-modal="true" aria-label="Share dashboard" data-testid="share-dialog">
        <header className="flex items-center gap-2">
          <Share2 size={16} aria-hidden />
          <h2 className="flex-1 truncate text-sm font-semibold">Share “{name}”</h2>
          <button type="button" className="viz-icon-button" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </header>
        <div className="dash-dialog-body">
          {workspace && (
            <label className="dash-share-link cursor-pointer" data-testid="share-workspace">
              <Users size={13} aria-hidden />
              <span className="flex-1">
                <b>Everyone in my workspace</b>
                <small className="block text-[10px] text-muted-foreground">Colleagues open it signed in, as viewers: they can personalize visuals and save their own views.</small>
              </span>
              <input type="checkbox" checked={shared} disabled={!workspace.canChange || toggleWorkspace.isPending} onChange={(event) => toggleWorkspace.mutate(event.target.checked)} data-testid="share-workspace-toggle" />
            </label>
          )}
          {toggleWorkspace.error && <p className="text-xs text-destructive">{apiErrorMessage(toggleWorkspace.error)}</p>}
          <p className="text-xs text-muted-foreground">Public links: anyone with the link can view this dashboard and use its slicers — read-only, without signing in.</p>
          <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
            <div className="viz-segment" role="group" aria-label="Kind">
              <button type="button" aria-pressed={kind === 'link'} onClick={() => setKind('link')} data-testid="share-kind-link">
                <Link2 size={12} aria-hidden /> Link
              </button>
              <button type="button" aria-pressed={kind === 'embed'} onClick={() => setKind('embed')} data-testid="share-kind-embed">
                <Code2 size={12} aria-hidden /> Embed
              </button>
            </div>
            <input className="viz-field" placeholder="Label (e.g. Board pack)" value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} aria-label="Label" data-testid="share-label" />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Expires
              <input type="date" className="viz-field" min={tomorrow} value={expires} onChange={(event) => setExpires(event.target.value)} aria-label="Expiry date" />
            </label>
          </div>
          <button type="button" className="viz-chip primary self-start" disabled={create.isPending} onClick={() => create.mutate()} data-testid="share-create">
            {create.isPending ? 'Creating…' : kind === 'embed' ? 'Create embed code' : 'Create link'}
          </button>
          {create.error && <p className="text-xs text-destructive">{apiErrorMessage(create.error)}</p>}
          {fresh?.token && (
            <div className="space-y-2 rounded-xl border border-border p-2" data-testid="share-fresh">
              <p className="text-xs font-medium">Copy it now — for safety the full address is not shown again.</p>
              <input className="viz-field w-full" readOnly value={shareUrl(fresh.token, fresh.kind)} aria-label="Share address" data-testid="share-url" onFocus={(event) => event.currentTarget.select()} />
              {fresh.kind === 'embed' && <textarea className="viz-field dash-share-code" readOnly value={embedCode(fresh.token)} aria-label="Embed code" data-testid="share-embed-code" onFocus={(event) => event.currentTarget.select()} />}
              <div className="flex gap-2">
                <CopyButton text={shareUrl(fresh.token, fresh.kind)} label="Copy link" testId="share-copy" />
                {fresh.kind === 'embed' && <CopyButton text={embedCode(fresh.token)} label="Copy embed code" />}
              </div>
            </div>
          )}
          <div className="space-y-1">
            <p className="viz-label">Links ({active.length} active)</p>
            {links.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
            {!links.isLoading && !links.data?.length && <p className="text-xs text-muted-foreground">No links yet.</p>}
            {links.data?.map((link) => (
              <div key={link.id} className={`dash-share-link${link.revokedAt ? ' revoked' : ''}`} data-testid="share-link-row">
                {link.kind === 'embed' ? <Code2 size={13} aria-hidden /> : <Link2 size={13} aria-hidden />}
                <span className="flex-1 truncate">
                  <b>{link.name || (link.kind === 'embed' ? 'Embed' : 'Link')}</b> · {link.prefix}… · by {link.createdBy || 'unknown'}
                  <small className="block text-[10px] text-muted-foreground">
                    {link.revokedAt ? `Revoked ${new Date(link.revokedAt).toLocaleDateString()}` : link.expiresAt ? `Expires ${new Date(link.expiresAt).toLocaleDateString()}` : 'No expiry'}
                    {link.lastUsedAt ? ` · last opened ${new Date(link.lastUsedAt).toLocaleString()}` : ' · not opened yet'}
                  </small>
                </span>
                {!link.revokedAt && (
                  <button type="button" className="viz-chip text-destructive" disabled={revoke.isPending} onClick={() => revoke.mutate(link.id)} data-testid="share-revoke">
                    <Ban size={12} aria-hidden /> Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
