import { describe, expect, it } from 'vitest';
import { apiAddress, expiryFrom } from './developer';

describe('API key helpers', () => {
  it('turns an expiry choice into a date, or none', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(expiryFrom('30', now)).toBe('2026-01-31T00:00:00.000Z');
    expect(expiryFrom('365', now)).toBe('2027-01-01T00:00:00.000Z');
    expect(expiryFrom('never', now)).toBeNull();
  });

  it('shows the API address callers need, also when the app uses a relative /api/v1', () => {
    expect(apiAddress('/api/v1', 'https://app.example.com')).toBe('https://app.example.com/api/v1');
    expect(apiAddress('https://api.example.com/api/v1', 'https://app.example.com')).toBe('https://api.example.com/api/v1');
  });
});
