import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { createClient, type Session, type SupabaseClient, type User as SupabaseUser } from '@supabase/supabase-js';
import { config } from '@/lib/config';
import { getCurrentUser, getSession, subscribeAuth } from '@/lib/localAuth';
import { localSupabase, localSupabaseClient, toSession, toSupabaseUser } from '@/lib/localSupabase';

export type { User as SupabaseUser } from '@supabase/supabase-js';

// API mode talks to the real Supabase Auth (the local gateway on :54321 in
// development, the hosted project in production). Mock mode keeps the
// localStorage stand-in so the UI can be demoed without any backend.
const realAuth = config.dataMode === 'api';

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
      return { error: `Sign-in with ${provider === 'google' ? 'Google' : 'Apple'} is not enabled. Use your email and password.` };
    }
  } catch {
    return { error: 'Cannot reach the sign-in service. Check your connection and try again.' };
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/sso-callback` },
  });
  return error ? { error: error.message } : { redirected: true };
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
  return error ? { error: error.message } : {};
}

/** Step 2: verify the emailed code (which signs the user in) and set the new password. */
export async function resetPasswordWithCode(email: string, code: string, newPassword: string): Promise<{ error?: string }> {
  if (!realAuth) {
    const result = localSupabase.auth.resetPassword({ email, code, newPassword });
    return result.error ? { error: result.error.message } : {};
  }
  const verified = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
  if (verified.error) return { error: verified.error.message };
  const updated = await supabase.auth.updateUser({ password: newPassword });
  return updated.error ? { error: updated.error.message } : {};
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
