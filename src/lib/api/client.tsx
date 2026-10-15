import type { AxiosError, AxiosInstance } from 'axios';
import { createContext, useContext, useEffect, type PropsWithChildren } from 'react';
import * as Sentry from '@sentry/react';
import { config } from '@/lib/config';
import { useAuth } from '@/lib/supabase';
import { http } from '@/lib/api/http';
import type { ApiErrorBody } from '@/lib/api/types';

export { apiErrorMessage, apiErrorStatus } from '@/lib/api/http';

let sentryInterceptorInstalled = false;

function installSentryInterceptor(instance: AxiosInstance) {
  if (sentryInterceptorInstalled) return;
  sentryInterceptorInstalled = true;
  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError<ApiErrorBody>) => {
      const status = error.response?.status;
      // Expected client errors (validation, auth, not found) are not crashes.
      if (!status || status >= 500) {
        Sentry.captureException(error, {
          tags: {
            api_status: String(status ?? 'network'),
            request_id: error.response?.data?.requestId ?? 'unknown',
          },
        });
      }
      return Promise.reject(error);
    },
  );
}

const ApiClientContext = createContext<AxiosInstance | null>(null);

export function ApiClientProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  installSentryInterceptor(http);

  // Confirms the session with Django once per sign-in; the first authenticated
  // request also provisions the user's personal workspace server-side.
  useEffect(() => {
    if (config.dataMode === 'mock' || !session?.access_token) return;
    void http.get('/auth/ping/').catch(() => undefined);
  }, [session?.access_token]);

  return <ApiClientContext.Provider value={http}>{children}</ApiClientContext.Provider>;
}

export function useApiClient(): AxiosInstance {
  const client = useContext(ApiClientContext);
  if (!client) throw new Error('useApiClient must be used inside ApiClientProvider');
  return client;
}
