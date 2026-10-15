import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Live integration suite: the app's real repositories against a running backend
// (jt-code-backend `make native-up`). Run with `npm run test:integration`.
function anonKey(): string {
  if (process.env.VITE_SUPABASE_ANON_KEY) return process.env.VITE_SUPABASE_ANON_KEY;
  const secrets = `${homedir()}/.local/share/jt-code-native/etc/secrets.env`;
  if (!existsSync(secrets)) return '';
  const line = readFileSync(secrets, 'utf8').split('\n').find((l) => l.startsWith('JT_SUPABASE_ANON_KEY='));
  return line ? line.slice('JT_SUPABASE_ANON_KEY='.length).trim() : '';
}

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@features': fileURLToPath(new URL('./src/features', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@lib': fileURLToPath(new URL('./src/lib', import.meta.url)),
    },
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    env: {
      VITE_DATA_MODE: 'api',
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: anonKey(),
      VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000/api/v1',
      MAILPIT_URL: process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025',
    },
  },
});
