import { getCurrentUser } from '@/lib/localAuth';
import { KEYS } from './keys';
import { simulate } from './latency';
import { readValue, writeValue } from '../storage/store';
import type { TeamRepository } from '../contracts';
import type { CreatedTeamInvite, TeamInvite, TeamMember, TeamOverview, TeamRole } from '../types';

interface StoredTeam {
  members: TeamMember[];
  invites: TeamInvite[];
}

const INVITE_DAYS = 7;

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Frontend-only mode: the signed-in local user owns a one-person workspace; invites stay in this browser. */
export class MockTeamRepository implements TeamRepository {
  private async load(): Promise<StoredTeam> {
    const user = getCurrentUser();
    const stored = await readValue<StoredTeam>(KEYS.team, { members: [], invites: [] });
    if (user && !stored.members.some((member) => member.userId === user.id)) {
      const owner: TeamMember = {
        userId: user.id,
        email: user.email,
        name: [user.firstName, user.lastName].filter(Boolean).join(' '),
        role: 'admin',
        isOwner: true,
      };
      stored.members = [owner, ...stored.members.filter((member) => !member.isOwner)];
      await writeValue(KEYS.team, stored);
    }
    return stored;
  }

  async getTeam(): Promise<TeamOverview> {
    const team = await this.load();
    return simulate('team.get', () => team);
  }

  async invite(email: string, role: TeamRole): Promise<CreatedTeamInvite> {
    const team = await this.load();
    const address = email.trim().toLowerCase();
    if (team.members.some((member) => member.email.toLowerCase() === address)) {
      throw new Error('This user is already an organization member.');
    }
    const invite: TeamInvite = {
      id: crypto.randomUUID(),
      email: address,
      role,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
    };
    await writeValue(KEYS.team, { ...team, invites: [...team.invites, invite] });
    return simulate('team.invite', () => ({ ...invite, token: randomToken() }));
  }

  async changeRole(userId: string, role: TeamRole): Promise<TeamMember> {
    const team = await this.load();
    const member = team.members.find((candidate) => candidate.userId === userId);
    if (!member) throw new Error('Member not found.');
    if (member.isOwner) throw new Error('The organization owner role cannot be changed here.');
    const updated = { ...member, role };
    await writeValue(KEYS.team, { ...team, members: team.members.map((m) => (m.userId === userId ? updated : m)) });
    return simulate('team.changeRole', () => updated);
  }

  async removeMember(userId: string): Promise<void> {
    const team = await this.load();
    if (team.members.find((member) => member.userId === userId)?.isOwner) {
      throw new Error('The organization owner cannot be removed.');
    }
    await writeValue(KEYS.team, { ...team, members: team.members.filter((member) => member.userId !== userId) });
    await simulate('team.removeMember', () => undefined);
  }

  async revokeInvite(inviteId: string): Promise<void> {
    const team = await this.load();
    await writeValue(KEYS.team, { ...team, invites: team.invites.filter((invite) => invite.id !== inviteId) });
    await simulate('team.revokeInvite', () => undefined);
  }

  async acceptInvite(): Promise<TeamMember> {
    // One browser holds one workspace in frontend-only mode, so there is nothing to join.
    throw new Error('Invitations need the JT-Code backend (VITE_DATA_MODE=api).');
  }
}
