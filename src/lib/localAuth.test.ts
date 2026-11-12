import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_EMAIL, findUserByEmail, getCurrentUser } from './localAuth';
import { localSupabase } from './localSupabase';

describe('frontend-only sign-in (no backend)', () => {
  beforeEach(() => localStorage.clear());

  it('signs in straight away with a new email, creating the local account', () => {
    const { data, error } = localSupabase.auth.signInWithPassword({ email: 'grace.hopper@example.com', password: 'anything-1' });
    expect(error).toBeNull();
    expect(data.session?.access_token).toMatch(/^local\./);
    const user = findUserByEmail('grace.hopper@example.com');
    expect(user).toMatchObject({ firstName: 'Grace', lastName: 'Hopper' });
    expect(getCurrentUser()?.id).toBe(user?.id);
  });

  it('still checks the password of an account that exists', () => {
    localSupabase.auth.signInWithPassword({ email: 'ada@example.com', password: 'first-password' });
    localSupabase.auth.signOut();
    const wrong = localSupabase.auth.signInWithPassword({ email: 'ada@example.com', password: 'other-password' });
    expect(wrong.error?.message).toBe('Invalid email or password.');
    const right = localSupabase.auth.signInWithPassword({ email: 'ada@example.com', password: 'first-password' });
    expect(right.error).toBeNull();
  });

  it('has a one-click demo account', async () => {
    const { signInAsDemo } = await import('./supabase');
    expect(signInAsDemo()).toEqual({});
    expect(getCurrentUser()?.email).toBe(DEMO_EMAIL);
    // A second click signs in to the same account.
    localSupabase.auth.signOut();
    expect(signInAsDemo()).toEqual({});
    expect(getCurrentUser()?.email).toBe(DEMO_EMAIL);
  });
});
