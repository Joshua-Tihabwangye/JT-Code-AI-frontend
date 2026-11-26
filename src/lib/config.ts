import { z } from 'zod';

const env = import.meta.env as Record<string, string | undefined>;

const dataMode: 'mock' | 'api' = env.VITE_DATA_MODE === 'api' ? 'api' : 'mock';
const isMock = dataMode === 'mock';

const baseSchema = z.object({
  VITE_API_BASE_URL: z.string().default('/api/v1'),
  VITE_SENTRY_DSN: z.string().optional(),
  VITE_SENTRY_ENVIRONMENT: z.string().default('development'),
  VITE_SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  VITE_APP_NAME: z.literal('JT-Code').default('JT-Code'),
  VITE_APP_VERSION: z.string().default('0.1.0'),
});

// Supabase credentials are only required when talking to a real backend.
const schema = baseSchema
  .extend({
    VITE_SUPABASE_URL: z.string().optional(),
    VITE_SUPABASE_ANON_KEY: z.string().optional(),
  })
  .superRefine((values, context) => {
    if (isMock) return;
    for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const) {
      if (!values[key]) context.addIssue({ code: 'custom', path: [key], message: `${key} is required when VITE_DATA_MODE=api.` });
    }
  });

const parsed = schema.safeParse(env);

if (!parsed.success) {
  console.error('Invalid frontend environment configuration', parsed.error.flatten().fieldErrors);
  throw new Error('JT-Code web configuration is invalid. Check .env against .env.example.');
}

export const config = {
  dataMode,
  supabaseUrl: parsed.data.VITE_SUPABASE_URL || '',
  supabaseAnonKey: parsed.data.VITE_SUPABASE_ANON_KEY || '',
  apiBaseUrl: parsed.data.VITE_API_BASE_URL.replace(/\/$/, ''),
  sentryDsn: parsed.data.VITE_SENTRY_DSN || undefined,
  sentryEnvironment: parsed.data.VITE_SENTRY_ENVIRONMENT,
  sentryTracesSampleRate: parsed.data.VITE_SENTRY_TRACES_SAMPLE_RATE,
  appName: parsed.data.VITE_APP_NAME,
  appVersion: parsed.data.VITE_APP_VERSION,
} as const;
