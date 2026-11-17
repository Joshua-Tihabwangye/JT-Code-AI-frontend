import type { SignupPayload } from '../types';
import { authErrorMessage, emailConfirmationRedirect, supabase } from '@/lib/supabase';
import { CONSENT_VERSION } from '@/shared/constants/consent';

export interface SignupResult {
  error?: string;
  /** Supabase requires email confirmation before the first sign-in. */
  needsConfirmation?: boolean;
}

export async function signup(payload: SignupPayload): Promise<SignupResult> {
  const { data, error } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: {
      // The confirmation link returns to the sign-in page; confirming does not sign the user in.
      emailRedirectTo: emailConfirmationRedirect(),
      data: {
        first_name: payload.firstName,
        last_name: payload.lastName,
        contact: payload.contact,
        country: payload.countryCode,
        countryName: payload.countryName,
        dialCode: payload.dialCode,
        timezone: payload.timezone,
        // The sign-up checkbox accepts both documents; the backend records them as consents.
        terms_accepted: payload.acceptedTerms,
        privacy_accepted: payload.acceptedTerms,
        consent_version: CONSENT_VERSION,
      },
    },
  });

  if (error) return { error: authErrorMessage(error) };
  return data.session ? {} : { needsConfirmation: true };
}
