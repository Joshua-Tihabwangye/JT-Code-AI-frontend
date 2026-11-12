import i18n from '@/i18n/config';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { App } from '@/app/App';
import { AppProviders } from '@/app/providers/AppProviders';
import { initializeSentry } from '@/lib/sentry';
import '@/styles/global.css';
import '@/auth/auth.css';

initializeSentry();

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<div className="fatal-error">{i18n.t('chrome.fatalError')}</div>}>
      <AppProviders>
        <App />
      </AppProviders>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
