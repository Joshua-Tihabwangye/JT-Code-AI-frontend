import { describe, expect, it } from 'vitest';
import { plausibleCron, slugify } from './agents';

describe('agent helpers', () => {
  it('derives a slug from a name', () => {
    expect(slugify('Weekly Sales Report!')).toBe('weekly-sales-report');
    expect(slugify('Café résumé')).toBe('cafe-resume');
    expect(slugify('***')).toBe('agent');
  });

  it('accepts only five-field cron with a fixed minute', () => {
    expect(plausibleCron('30 7 * * 1-5')).toBe(true);
    expect(plausibleCron('* * * * *')).toBe(false);
    expect(plausibleCron('0 8 * *')).toBe(false);
    expect(plausibleCron('0 8 * * MON; rm')).toBe(false);
  });
});
