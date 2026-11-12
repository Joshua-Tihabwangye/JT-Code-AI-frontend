import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n/config';
import { formatDate, formatDateTime } from '@/i18n/format';
import { Ban, Check, Code2, Copy, Link2, Share2, Users, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/http';
import { useRepository, type DashboardShareLink } from '@/lib/data';

export function shareUrl(token: string, kind: 'link' | 'embed'): string {
  return `${window.location.origin}/${kind === 'embed' ? 'embed' : 'share'}/${token}`;
}

export function embedCode(token: string): string {
  return `<iframe src="${shareUrl(token, 'embed')}" width="1280" height="760" style="border:0" loading="lazy" title="${i18n.t('visualize.dashboards.share.embedTitle').replace(/"/g, '&quot;')}"></iframe>`;
}

function CopyButton({ text, label, testId }: { text: string; label: string; testId?: string }) {
  const { t } = useTranslation();
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
      {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />} {copied ? t('visualize.dashboards.share.copied') : label}
    </button>
  );
}

/** Public, read-only links and embeds for a dashboard. A link's address is shown once, when it is
 *  made (only a fingerprint is stored); revoking ends access straight away. */
export function ShareDialog({ dashboardId, name, workspace, onClose }: { dashboardId: string; name: string; workspace?: { shared: boolean; canChange: boolean }; onClose: () => void }) {
  const { t } = useTranslation();
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
      <div className="dash-dialog" role="dialog" aria-modal="true" aria-label={t('visualize.dashboards.share.title')} data-testid="share-dialog">
        <header className="flex items-center gap-2">
          <Share2 size={16} aria-hidden />
          <h2 className="flex-1 truncate text-sm font-semibold">{t('visualize.dashboards.share.heading', { name })}</h2>
          <button type="button" className="viz-icon-button" onClick={onClose} aria-label={t('visualize.dashboards.share.close')}>
            <X size={14} />
          </button>
        </header>
        <div className="dash-dialog-body">
          {workspace && (
            <label className="dash-share-link cursor-pointer" data-testid="share-workspace">
              <Users size={13} aria-hidden />
              <span className="flex-1">
                <b>{t('visualize.dashboards.share.workspace')}</b>
                <small className="block text-[10px] text-muted-foreground">{t('visualize.dashboards.share.workspaceNote')}</small>
              </span>
              <input type="checkbox" checked={shared} disabled={!workspace.canChange || toggleWorkspace.isPending} onChange={(event) => toggleWorkspace.mutate(event.target.checked)} data-testid="share-workspace-toggle" />
            </label>
          )}
          {toggleWorkspace.error && <p className="text-xs text-destructive">{apiErrorMessage(toggleWorkspace.error)}</p>}
          <p className="text-xs text-muted-foreground">{t('visualize.dashboards.share.publicNote')}</p>
          <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
            <div className="viz-segment" role="group" aria-label={t('visualize.dashboards.share.kind')}>
              <button type="button" aria-pressed={kind === 'link'} onClick={() => setKind('link')} data-testid="share-kind-link">
                <Link2 size={12} aria-hidden /> {t('visualize.dashboards.share.link')}
              </button>
              <button type="button" aria-pressed={kind === 'embed'} onClick={() => setKind('embed')} data-testid="share-kind-embed">
                <Code2 size={12} aria-hidden /> {t('visualize.dashboards.share.embed')}
              </button>
            </div>
            <input className="viz-field" placeholder={t('visualize.dashboards.share.labelPlaceholder')} value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} aria-label={t('visualize.dashboards.share.label')} data-testid="share-label" />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              {t('visualize.dashboards.share.expires')}
              <input type="date" className="viz-field" min={tomorrow} value={expires} onChange={(event) => setExpires(event.target.value)} aria-label={t('visualize.dashboards.share.expiryDate')} />
            </label>
          </div>
          <button type="button" className="viz-chip primary self-start" disabled={create.isPending} onClick={() => create.mutate()} data-testid="share-create">
            {create.isPending ? t('visualize.dashboards.share.creating') : kind === 'embed' ? t('visualize.dashboards.share.createEmbed') : t('visualize.dashboards.share.createLink')}
          </button>
          {create.error && <p className="text-xs text-destructive">{apiErrorMessage(create.error)}</p>}
          {fresh?.token && (
            <div className="space-y-2 rounded-xl border border-border p-2" data-testid="share-fresh">
              <p className="text-xs font-medium">{t('visualize.dashboards.share.copyNow')}</p>
              <input className="viz-field w-full" readOnly value={shareUrl(fresh.token, fresh.kind)} aria-label={t('visualize.dashboards.share.address')} data-testid="share-url" onFocus={(event) => event.currentTarget.select()} />
              {fresh.kind === 'embed' && <textarea className="viz-field dash-share-code" readOnly value={embedCode(fresh.token)} aria-label={t('visualize.dashboards.share.embedCode')} data-testid="share-embed-code" onFocus={(event) => event.currentTarget.select()} />}
              <div className="flex gap-2">
                <CopyButton text={shareUrl(fresh.token, fresh.kind)} label={t('visualize.dashboards.share.copyLink')} testId="share-copy" />
                {fresh.kind === 'embed' && <CopyButton text={embedCode(fresh.token)} label={t('visualize.dashboards.share.copyEmbed')} />}
              </div>
            </div>
          )}
          <div className="space-y-1">
            <p className="viz-label">{t('visualize.dashboards.share.links', { count: active.length })}</p>
            {links.isLoading && <p className="text-xs text-muted-foreground">{t('visualize.dashboards.share.loading')}</p>}
            {!links.isLoading && !links.data?.length && <p className="text-xs text-muted-foreground">{t('visualize.dashboards.share.none')}</p>}
            {links.data?.map((link) => (
              <div key={link.id} className={`dash-share-link${link.revokedAt ? ' revoked' : ''}`} data-testid="share-link-row">
                {link.kind === 'embed' ? <Code2 size={13} aria-hidden /> : <Link2 size={13} aria-hidden />}
                <span className="flex-1 truncate">
                  <b>{link.name || (link.kind === 'embed' ? t('visualize.dashboards.share.embed') : t('visualize.dashboards.share.link'))}</b> · {link.prefix}… · {t('visualize.dashboards.share.by', { name: link.createdBy || t('visualize.dashboards.share.unknown') })}
                  <small className="block text-[10px] text-muted-foreground">
                    {link.revokedAt ? t('visualize.dashboards.share.revokedOn', { date: formatDate(link.revokedAt) }) : link.expiresAt ? t('visualize.dashboards.share.expiresOn', { date: formatDate(link.expiresAt) }) : t('visualize.dashboards.share.noExpiry')}
                    {' · '}
                    {link.lastUsedAt ? t('visualize.dashboards.share.lastOpened', { date: formatDateTime(link.lastUsedAt) }) : t('visualize.dashboards.share.notOpened')}
                  </small>
                </span>
                {!link.revokedAt && (
                  <button type="button" className="viz-chip text-destructive" disabled={revoke.isPending} onClick={() => revoke.mutate(link.id)} data-testid="share-revoke">
                    <Ban size={12} aria-hidden /> {t('visualize.dashboards.share.revoke')}
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
