import axios, { type AxiosInstance } from 'axios';
import { config } from '@/lib/config';
import { getAccessToken } from '@/lib/supabase';
import type { ApiErrorBody } from '@/lib/api/types';

/**
 * The one HTTP client for the Django API. Each request carries the current
 * Supabase access token (supabase-js refreshes it before it expires).
 */
export function createHttpClient(): AxiosInstance {
  const instance = axios.create({
    baseURL: config.apiBaseUrl,
    timeout: 30_000,
    headers: { 'Content-Type': 'application/json' },
  });
  instance.interceptors.request.use(async (request) => {
    const token = await getAccessToken();
    if (token) request.headers.Authorization = `Bearer ${token}`;
    request.headers['X-JT-Code-Client'] = `web/${config.appVersion}`;
    return request;
  });
  return instance;
}

export const http = createHttpClient();

const ENVELOPE_KEYS = new Set(['code', 'message', 'details', 'detail', 'errors', 'requestId']);

function firstFieldError(body: ApiErrorBody): string | undefined {
  // Field errors live in the envelope's `details`, in `errors`, or (plain DRF
  // views such as /accounts/me/) at the top level: {"email": ["..."]}.
  const topLevel = Object.fromEntries(Object.entries(body).filter(([key]) => !ENVELOPE_KEYS.has(key)));
  const fields: Record<string, unknown> | undefined =
    body.details && typeof body.details === 'object'
      ? body.details
      : (body.errors ?? (Object.keys(topLevel).length ? topLevel : undefined));
  if (!fields || typeof fields !== 'object') return undefined;
  for (const [field, value] of Object.entries(fields)) {
    const text: unknown = Array.isArray(value) ? (value as unknown[])[0] : value;
    if (typeof text === 'string' && text) return field === 'detail' || field === 'non_field_errors' ? text : `${field}: ${text}`;
  }
  return undefined;
}

/** Human-readable message from any API error (`{code,message,details}` or DRF `{detail}`). */
export function apiErrorMessage(error: unknown, fallback = 'An unexpected error occurred.'): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const body = error.response?.data;
    if (body && typeof body === 'object') {
      // DRF validation errors: the envelope message is generic, the field message is useful.
      if (body.code === 'invalid' || body.code === 'validation_error') return firstFieldError(body) ?? body.message ?? fallback;
      return body.message ?? body.detail ?? firstFieldError(body) ?? fallback;
    }
    if (!error.response) return 'Cannot reach the JT-Code API. Check your connection and try again.';
    return error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

/** HTTP status of an API error, if any. */
export function apiErrorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}
