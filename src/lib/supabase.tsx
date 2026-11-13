import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { createClient, type Session, type SupabaseClient, type User as SupabaseUser } from '@supabase/supabase-js';
import { config } from '@/lib/config';
import i18n from '@/i18n/config';
import { DEMO_EMAIL, DEMO_PASSWORD, getCurrentUser, getSession, subscribeAuth } from '@/lib/localAuth';
import { localSupabase, localSupabaseClient, toSession, toSupabaseUser } from '@/lib/localSupabase';

export type { User as SupabaseUser } from '@supabase/supabase-js';

// API mode talks to the real Supabase Auth (the local gateway on :54321 in
// development, the hosted project in production). Mock mode keeps the
// localStorage stand-in so the UI can be demoed without any backend.
const realAuth = config.dataMode === 'api';

/** True while the app runs without the backend: sign-in is local to this browser. */
export const frontendOnlyAuth = !realAuth;

/** Where the sign-up confirmation email returns: the sign-in page, never straight into the app. */
export function emailConfirmationRedirect(): string | undefined {
  return typeof window === 'undefined' ? undefined : `${window.location.origin}/sign-in?confirmed=1`;
}

export type EmailConfirmation = { status: 'confirmed' } | { status: 'failed'; code: string };

/**
 * Confirming the email must not sign the user in: they sign in with their password next. Supabase Auth
 * returns to /sign-in?confirmed=1 with a one-time code (or an error); the code is removed from the URL
 * before the auth client starts, so it is never exchanged for a session.
 */
function takeEmailConfirmation(): EmailConfirmation | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  if (url.pathname !== '/sign-in' || !url.searchParams.has('confirmed')) return null;
  const fragment = new URLSearchParams(url.hash.slice(1));
  const read = (key: string) => url.searchParams.get(key) ?? fragment.get(key);
  const errorCode = read('error_code') ?? read('error');
  window.history.replaceState(window.history.state, '', '/sign-in');
  try {
    for (const key of Object.keys(window.localStorage)) if (key.endsWith('-code-verifier')) window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable: nothing was stored either.
  }
  return errorCode ? { status: 'failed', code: errorCode } : { status: 'confirmed' };
}

/** The outcome of the confirmation link this page was opened from, if any (read once, at start-up). */
export const emailConfirmation: EmailConfirmation | null = realAuth ? takeEmailConfirmation() : null;

/** Supabase errors as the user should read them: a network failure ("Failed to fetch") becomes a
 *  translated "cannot reach the sign-in service"; other messages pass through. */
export function authErrorMessage(error: { message: string; name?: string; status?: number }): string {
  const network = error.name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|load failed/i.test(error.message);
  return network ? i18n.t('authErrors.serviceUnreachable') : error.message;
}

/** Frontend-only mode: one click into a demo account (created on first use). */
export function signInAsDemo(): { error?: string } {
  const { error } = localSupabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  return error ? { error: error.message } : {};
}

export const supabase: SupabaseClient = realAuth
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  : localSupabaseClient;

/** Current access token for API calls (refreshed by supabase-js when needed). */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type OAuthProvider = 'google' | 'apple';

/**
 * Starts provider sign-in. Real mode redirects the browser to the provider and
 * back to /sso-callback; it first checks that the provider is enabled in
 * Supabase Auth so users never land on a raw error page.
 */
export async function signInWithProvider(provider: OAuthProvider): Promise<{ error?: string; redirected?: boolean }> {
  if (!realAuth) {
    const { error } = localSupabase.auth.signInWithOAuth({ provider });
    return error ? { error: String(error) } : {};
  }
  try {
    const response = await fetch(`${config.supabaseUrl}/auth/v1/settings`, { headers: { apikey: config.supabaseAnonKey } });
    const settings = (await response.json()) as { external?: Record<string, boolean> };
    if (!settings.external?.[provider]) {
      return { error: i18n.t('authErrors.providerDisabled', { provider: provider === 'google' ? 'Google' : 'Apple' }) };
    }
  } catch {
    return { error: i18n.t('authErrors.serviceUnreachable') };
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/sso-callback` },
  });
  return error ? { error: authErrorMessage(error) } : { redirected: true };
}

/** Step 1 of password recovery: Supabase emails a one-time recovery code. */
export async function requestPasswordReset(email: string): Promise<{ error?: string; demoCode?: string }> {
  if (!realAuth) {
    const result = localSupabase.auth.resetPasswordForEmail(email);
    if (result.error) return { error: result.error.message };
    return { demoCode: 'resetCode' in result.data ? result.data.resetCode : undefined };
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/forgot-password`,
  });
  return error ? { error: authErrorMessage(error) } : {};
}

/** Step 2: verify the emailed code (which signs the user in) and set the new password. */
export async function resetPasswordWithCode(email: string, code: string, newPassword: string): Promise<{ error?: string }> {
  if (!realAuth) {
    const result = localSupabase.auth.resetPassword({ email, code, newPassword });
    return result.error ? { error: authErrorMessage(result.error) } : {};
  }
  const verified = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
  if (verified.error) return { error: authErrorMessage(verified.error) };
  const updated = await supabase.auth.updateUser({ password: newPassword });
  return updated.error ? { error: authErrorMessage(updated.error) } : {};
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  user: SupabaseUser | null;
  session: Session | null;
  loading: boolean;
  isSignedIn: boolean;
  isSignedOut: boolean;
}

const AuthContext = createContext<AuthState>({
  status: 'loading',
  user: null,
  session: null,
  loading: true,
  isSignedIn: false,
  isSignedOut: true,
});

function useRealAuthState() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}

function useLocalAuthState() {
  const [state, setState] = useState<{ session: Session | null; user: SupabaseUser | null; loading: boolean }>({
    session: null,
    user: null,
    loading: true,
  });

  useEffect(() => {
    const sync = () => {
      const activeSession = getSession();
      const stored = activeSession ? getCurrentUser() : null;
      setState({
        user: stored ? toSupabaseUser(stored) : null,
        session: activeSession && stored ? toSession(activeSession, stored) : null,
        loading: false,
      });
    };
    sync();
    return subscribeAuth(sync);
  }, []);

  return state;
}

const useAuthState = realAuth ? useRealAuthState : useLocalAuthState;

export function SupabaseProvider({ children }: PropsWithChildren) {
  const { session, user, loading } = useAuthState();

  const value = useMemo<AuthState>(
    () => ({
      status: loading ? 'loading' : user ? 'authenticated' : 'unauthenticated',
      user,
      session,
      loading,
      isSignedIn: !loading && !!user,
      isSignedOut: !loading && !user,
    }),
    [user, session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function useSupabase(): SupabaseClient {
  return supabase;
}

export function useSession(): Session | null {
  return useAuth().session;
}

export function useUser(): SupabaseUser | null {
  return useAuth().user;
}
