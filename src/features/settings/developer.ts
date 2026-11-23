import { config } from '@/lib/config';

export const EXPIRY_DAYS = ['30', '90', '365', 'never'] as const;
export type Expiry = (typeof EXPIRY_DAYS)[number];

/** ISO date-time `days` from now, or null for a key that does not expire. */
export function expiryFrom(choice: Expiry, now = new Date()): string | null {
  if (choice === 'never') return null;
  return new Date(now.getTime() + Number(choice) * 86_400_000).toISOString();
}

/** The API's absolute address for the usage example (VITE_API_BASE_URL may be relative, e.g. /api/v1). */
export function apiAddress(base = config.apiBaseUrl, origin = window.location.origin): string {
  return /^https?:\/\//.test(base) ? base : `${origin}${base.startsWith('/') ? '' : '/'}${base}`;
}
