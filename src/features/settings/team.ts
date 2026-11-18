import type { CreatedTeamInvite, Workspace } from '@/lib/data';

/** The link an invitee opens; the token is shown once (the server keeps only its digest). */
export function inviteLink(invite: Pick<CreatedTeamInvite, 'id' | 'token'>, origin = window.location.origin): string {
  return `${origin}/invite/${encodeURIComponent(invite.id)}?token=${encodeURIComponent(invite.token)}`;
}

/** The selected workspace, or the server's default when none is selected (or the selection is gone). */
export function currentWorkspace(workspaces: Workspace[], selectedId: string | null): Workspace | undefined {
  return workspaces.find((workspace) => workspace.id === selectedId) ?? workspaces.find((workspace) => workspace.isDefault) ?? workspaces[0];
}
