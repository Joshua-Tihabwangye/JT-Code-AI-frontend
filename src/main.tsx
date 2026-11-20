import i18n, { i18nReady } from '@/i18n/config';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { App } from '@/app/App';
import { AppProviders } from '@/app/providers/AppProviders';
import { initializeSentry } from '@/lib/sentry';
import { installChunkReloadInBrowser } from '@/lib/chunkReload';
import '@/styles/global.css';
import '@/auth/auth.css';

initializeSentry();
// After a new deployment, a page download from the old build reloads the app instead of crashing.
installChunkReloadInBrowser();

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// Render once the chosen language's translations are in (no flash of English).
void i18nReady.then(() => createRoot(root).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<div className="fatal-error">{i18n.t('chrome.fatalError')}</div>}>
      <AppProviders>
        <App />
      </AppProviders>
    </Sentry.ErrorBoundary>
  </StrictMode>,
));
