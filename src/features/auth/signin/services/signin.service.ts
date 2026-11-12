import type { SignInPayload } from '../types';
import { authErrorMessage, supabase } from '@/lib/supabase';

export interface SignInResult {
  error?: string;
}

export async function signin(payload: SignInPayload): Promise<SignInResult> {
  const { error } = await supabase.auth.signInWithPassword({
    email: payload.email,
    password: payload.password,
  });

  if (error) return { error: authErrorMessage(error) };
  return {};
}
