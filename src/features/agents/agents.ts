/** "Weekly report" -> "weekly-report" (the server requires a slug unique in the workspace). */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'agent'
  );
}

/** Schedules offered in the form (cron, UTC). The server refuses every-minute schedules. */
export const SCHEDULE_PRESETS = {
  hourly: '0 * * * *',
  daily: '0 8 * * *',
  weekdays: '0 8 * * 1-5',
  weekly: '0 8 * * 1',
  monthly: '0 8 1 * *',
} as const;
export type SchedulePreset = keyof typeof SCHEDULE_PRESETS | 'custom';

/** A cron expression the server can accept: five fields, a fixed minute. */
export function plausibleCron(value: string): boolean {
  const fields = value.trim().split(/\s+/);
  return fields.length === 5 && fields[0] !== '*' && fields.every((field) => /^[\d*/,-]+$/.test(field));
}
