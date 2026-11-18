import { beforeEach, describe, expect, it } from 'vitest';
import { createMockRepositories } from '../mock/repositories';
import { configureMockRuntime } from '../mock/latency';
import { resetDemoData } from '../storage/migrations';
import { seedMockData } from '../mock/seed';
import type { Repositories } from '../contracts';
import { localSupabase } from '@/lib/localSupabase';

/** Frontend-only sign-in (src/lib/localAuth.ts) is what the mock team repository reads. */
function signedIn(): Repositories {
  const { error } = localSupabase.auth.signInWithPassword({ email: 'ada.lovelace@example.com', password: 'Password1' });
  expect(error).toBeNull();
  return createMockRepositories();
}

beforeEach(async () => {
  configureMockRuntime({ latencyMs: 0, failureRate: 0, failFor: [] });
  localStorage.clear();
  await resetDemoData();
  await seedMockData();
});

describe('Mock repository: team', () => {
  it('starts with the signed-in user as the owner of one local workspace', async () => {
    const repos = signedIn();
    const team = await repos.team.getTeam();
    expect(team.members).toHaveLength(1);
    expect(team.members[0]).toMatchObject({ email: 'ada.lovelace@example.com', name: 'Ada Lovelace', role: 'admin', isOwner: true });
    expect(await repos.team.listWorkspaces()).toEqual([
      { id: 'local-workspace', name: "Ada's workspace", role: 'admin', isOwner: true, isDefault: true },
    ]);
  });

  it('creates and revokes invites, and returns the token only at creation', async () => {
    const repos = signedIn();
    const created = await repos.team.invite(' Grace@Example.com ', 'editor');
    expect(created).toMatchObject({ email: 'grace@example.com', role: 'editor' });
    expect(created.token).toMatch(/^[0-9a-f]{48}$/);
    const listed = (await repos.team.getTeam()).invites;
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty('token');

    await repos.team.revokeInvite(created.id);
    expect((await repos.team.getTeam()).invites).toEqual([]);
  });

  it('protects the owner with translated errors', async () => {
    const repos = signedIn();
    const owner = (await repos.team.getTeam()).members[0]!;
    await expect(repos.team.changeRole(owner.userId, 'viewer')).rejects.toThrow("The workspace owner's role cannot be changed.");
    await expect(repos.team.removeMember(owner.userId)).rejects.toThrow('The workspace owner cannot be removed.');
    await expect(repos.team.invite('ada.lovelace@example.com', 'viewer')).rejects.toThrow('This user is already a member of the workspace.');
    await expect(repos.team.acceptInvite('id', 'token')).rejects.toThrow(/JT-Code backend/);
  });
});
