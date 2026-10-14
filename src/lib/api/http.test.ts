import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from '@/lib/api/http';

function apiError(status: number, data: unknown): AxiosError {
  const response = { status, data, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } } as AxiosResponse;
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, response);
}

describe('apiErrorMessage', () => {
  it('uses the envelope message', () => {
    expect(apiErrorMessage(apiError(503, { code: 'billing_not_configured', message: 'Billing is not configured.' }))).toBe(
      'Billing is not configured.',
    );
  });

  it('prefers the field message over the generic validation message', () => {
    const error = apiError(400, { code: 'invalid', message: 'Request validation failed.', details: { countryCode: ['Bad code.'] } });
    expect(apiErrorMessage(error)).toBe('countryCode: Bad code.');
  });

  it('reads plain DRF {detail} and top-level field errors', () => {
    expect(apiErrorMessage(apiError(404, { detail: 'Not found.' }))).toBe('Not found.');
    expect(apiErrorMessage(apiError(400, { email: ['Change your e-mail through Supabase.'] }))).toBe(
      'email: Change your e-mail through Supabase.',
    );
  });

  it('explains network failures', () => {
    expect(apiErrorMessage(new AxiosError('Network Error'))).toMatch(/Cannot reach the JT-Code API/);
  });

  it('handles plain errors and unknown values', () => {
    expect(apiErrorMessage(new Error('boom'))).toBe('boom');
    expect(apiErrorMessage(null)).toBe('An unexpected error occurred.');
  });
});
