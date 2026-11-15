import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

/**
 * Reloading a deep link (/app/visualize/explore…) on a plain static host would answer "page not found":
 * the file does not exist. Most hosts and static servers serve 404.html for missing paths, so the app
 * is also written there; it loads, reads the address and opens the same page.
 */
function spaFallback() {
  return {
    name: 'jt-spa-fallback',
    apply: 'build' as const,
    closeBundle() {
      const index = fileURLToPath(new URL('./dist/index.html', import.meta.url));
      if (existsSync(index)) copyFileSync(index, fileURLToPath(new URL('./dist/404.html', import.meta.url)));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), spaFallback()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@features': fileURLToPath(new URL('./src/features', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@lib': fileURLToPath(new URL('./src/lib', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // jt-code-frontend/ and jt-code-backend/ are old committed snapshots, not the app.
    exclude: ['**/node_modules/**', 'dist/**', 'jt-code-frontend/**', 'jt-code-backend/**', 'tests/integration/**'],
    css: true,
    globals: true,
  },
});