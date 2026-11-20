import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Mail, Trash2, UserPlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRepository, type CreatedTeamInvite, type TeamMember, type TeamRole } from '@/lib/data';
import { currentWorkspace, inviteLink } from '@/features/settings/team';
import { apiErrorMessage } from '@/lib/api/http';
import { config } from '@/lib/config';
import { formatDate } from '@/i18n/format';
import { getActiveWorkspaceId, onWorkspaceChange, setActiveWorkspaceId } from '@/lib/workspace';
import { Alert, Badge, Button, Input, Select, Spinner, useConfirm } from '@/shared/components';

const ROLES: TeamRole[] = ['admin', 'editor', 'viewer'];

function useActiveWorkspaceId(): string | null {
  const [id, setId] = useState(getActiveWorkspaceId);
  useEffect(() => onWorkspaceChange(setId), []);
  return id;
}

/** Settings → Team: switch workspace, manage members and roles, invite people, revoke invites. */
export function TeamTab() {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const team = useRepository('team');
  const accounts = useRepository('account');
  const queryClient = useQueryClient();
  const activeId = useActiveWorkspaceId();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('editor');
  const [created, setCreated] = useState<CreatedTeamInvite | null>(null);
  const [copied, setCopied] = useState(false);

  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: () => team.listWorkspaces() });
  const account = useQuery({ queryKey: ['account'], queryFn: () => accounts.getAccount() });
  const workspace = currentWorkspace(workspaces.data ?? [], activeId);
  const isAdmin = workspace?.role === 'admin';
  const overview = useQuery({
    queryKey: ['team', workspace?.id ?? null],
    queryFn: () => team.getTeam(),
    enabled: isAdmin,
  });

  const flash = (message: string) => {
    setError('');
    setSuccess(message);
    window.setTimeout(() => setSuccess(''), 3000);
  };
  const fail = (err: unknown) => {
    setSuccess('');
    setError(apiErrorMessage(err));
  };
  const refreshTeam = () => queryClient.invalidateQueries({ queryKey: ['team'] });

  async function switchWorkspace(id: string) {
    const next = (workspaces.data ?? []).find((candidate) => candidate.id === id);
    if (!next || next.id === workspace?.id) return;
    setActiveWorkspaceId(next.id);
    setCreated(null);
    // Every cached answer (chats, files, dashboards, billing) belonged to the previous workspace.
    await queryClient.resetQueries();
    flash(t('team.switched', { name: next.name }));
  }

  const invite = useMutation({
    mutationFn: () => team.invite(email.trim(), role),
    onSuccess: async (next) => {
      setCreated(next);
      setCopied(false);
      setEmail('');
      flash(t('team.inviteCreated', { email: next.email }));
      await refreshTeam();
    },
    onError: fail,
  });
  const changeRole = useMutation({
    mutationFn: ({ userId, next }: { userId: string; next: TeamRole }) => team.changeRole(userId, next),
    onSuccess: async () => {
      flash(t('team.roleChanged'));
      await refreshTeam();
    },
    onError: fail,
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) => team.removeMember(userId),
    onSuccess: async () => {
      flash(t('team.memberRemoved'));
      await refreshTeam();
    },
    onError: fail,
  });
  const revokeInvite = useMutation({
    mutationFn: (inviteId: string) => team.revokeInvite(inviteId),
    onSuccess: async (_result, inviteId) => {
      if (created?.id === inviteId) setCreated(null);
      flash(t('team.inviteRevoked'));
      await refreshTeam();
    },
    onError: fail,
  });

  function submitInvite(event: FormEvent) {
    event.preventDefault();
    if (email.trim()) invite.mutate();
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false); // clipboard blocked: the link stays selectable in the field
    }
  }

  const memberName = (member: TeamMember) => member.name || member.email;
  const roleOptions = ROLES.map((value) => ({ value, label: t(`team.roles.${value}`) }));
  const workspaceOptions = (workspaces.data ?? []).map((item) => ({
    value: item.id,
    label: t('team.workspaceOption', { name: item.name, role: t(`team.roles.${item.role}`) }),
  }));

  return (
    <div className="space-y-10" data-testid="team-tab">
      {error && (
        <Alert variant="destructive" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}
      {config.dataMode === 'mock' && <Alert>{t('team.mockNote')}</Alert>}

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">{t('team.workspaceTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('team.workspaceDesc')}</p>
        </div>
        {workspaces.isPending ? (
          <Spinner size="sm" />
        ) : workspaces.isError ? (
          <Alert variant="destructive">{apiErrorMessage(workspaces.error)}</Alert>
        ) : (
          <div className="max-w-xl">
            <label htmlFor="workspace" className="block text-sm font-medium text-foreground mb-1.5">
              {t('team.workspaceLabel')}
            </label>
            <Select
              id="workspace"
              options={workspaceOptions}
              value={workspace?.id ?? ''}
              disabled={workspaceOptions.length < 2}
              onChange={(e) => void switchWorkspace(e.target.value)}
            />
          </div>
        )}
      </section>

      {workspace && !isAdmin && <Alert>{t('team.adminOnly', { name: workspace.name })}</Alert>}

      {isAdmin && (
        <>
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">{t('team.inviteTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('team.inviteDesc')}</p>
            </div>
            <form className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_12rem_auto] md:items-end" onSubmit={submitInvite}>
              <Input label={t('team.inviteEmail')} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              <div>
                <label htmlFor="invite-role" className="block text-sm font-medium text-foreground mb-1.5">
                  {t('team.inviteRole')}
                </label>
                <Select id="invite-role" options={roleOptions} value={role} onChange={(e) => setRole(e.target.value as TeamRole)} />
              </div>
              <Button type="submit" disabled={invite.isPending || !email.trim()}>
                {invite.isPending ? <Spinner size="sm" /> : <UserPlus size={16} aria-hidden="true" />}
                {t('team.inviteSend')}
              </Button>
            </form>
            <p className="mt-2 text-sm text-muted-foreground">{t('team.roleHelp')}</p>
            {created && (
              <div className="mt-4 rounded-lg border border-border p-4" data-testid="invite-link">
                <p className="text-sm text-foreground mb-2">{t('team.inviteLinkHelp', { email: created.email })}</p>
                <div className="flex gap-2">
                  <Input readOnly value={inviteLink(created)} aria-label={t('team.inviteLinkLabel')} onFocus={(e) => e.target.select()} />
                  <Button type="button" variant="outline" onClick={() => void copyLink(inviteLink(created))}>
                    {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                    {copied ? t('team.copied') : t('team.copyLink')}
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">{t('team.membersTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('team.membersDesc')}</p>
            </div>
            {overview.isPending ? (
              <Spinner size="sm" />
            ) : overview.isError ? (
              <Alert variant="destructive">{apiErrorMessage(overview.error)}</Alert>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border" data-testid="team-members">
                {overview.data.members.map((member) => {
                  const isSelf = member.email.toLowerCase() === (account.data?.email ?? '').toLowerCase();
                  return (
                    <li key={member.userId} className="flex flex-wrap items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <span className="truncate">{memberName(member)}</span>
                          {member.isOwner && <Badge variant="secondary">{t('team.owner')}</Badge>}
                          {isSelf && <Badge variant="outline">{t('team.you')}</Badge>}
                        </div>
                        {member.name && <div className="truncate text-sm text-muted-foreground">{member.email}</div>}
                      </div>
                      <div className="w-40">
                        <Select
                          options={roleOptions}
                          value={member.role}
                          aria-label={t('team.changeRoleFor', { name: memberName(member) })}
                          disabled={member.isOwner || isSelf || changeRole.isPending}
                          onChange={(e) => changeRole.mutate({ userId: member.userId, next: e.target.value as TeamRole })}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={member.isOwner || isSelf || removeMember.isPending}
                        aria-label={t('team.removeFor', { name: memberName(member) })}
                        onClick={() =>
                          void confirm({
                            title: t('team.removeTitle'),
                            description: t('team.removeConfirm', { name: memberName(member) }),
                            confirmLabel: t('team.remove'),
                            destructive: true,
                          }).then((ok) => ok && removeMember.mutate(member.userId))
                        }
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">{t('team.pendingTitle')}</h2>
            </div>
            {overview.data && overview.data.invites.length === 0 && <p className="text-sm text-muted-foreground">{t('team.pendingNone')}</p>}
            {overview.data && overview.data.invites.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border" data-testid="team-invites">
                {overview.data.invites.map((pending) => (
                  <li key={pending.id} className="flex flex-wrap items-center gap-3 p-3">
                    <Mail size={16} className="text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{pending.email}</div>
                      <div className="text-sm text-muted-foreground">
                        {t(`team.roles.${pending.role}`)}
                        {pending.expiresAt && ` · ${t('team.expires', { date: formatDate(pending.expiresAt) })}`}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={revokeInvite.isPending}
                      onClick={() =>
                        void confirm({
                          title: t('team.revokeTitle'),
                          description: t('team.revokeConfirm', { email: pending.email }),
                          confirmLabel: t('team.revoke'),
                          destructive: true,
                        }).then((ok) => ok && revokeInvite.mutate(pending.id))
                      }
                    >
                      <X size={14} aria-hidden="true" />
                      {t('team.revoke')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {dialog}
    </div>
  );
}
