import { AxiosError, type AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpClient } from '@/lib/api/http';
import { getActiveWorkspaceId, setActiveWorkspaceId } from '@/lib/workspace';

vi.mock('@/lib/supabase', () => ({ getAccessToken: () => Promise.resolve('access-token') }));

const ID = '7b0c1c9e-5f2a-4d8e-9b6a-2f1e0d3c4b5a';

function ok(config: InternalAxiosRequestConfig) {
  return Promise.resolve({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config });
}

function forbidden(config: InternalAxiosRequestConfig, detail: string) {
  const response = { data: { detail }, status: 403, statusText: 'Forbidden', headers: {}, config };
  return Promise.reject(new AxiosError('Forbidden', 'ERR_BAD_REQUEST', config, undefined, response));
}

function seen(adapter: { mock: { calls: unknown[][] } }, call: number): AxiosHeaders {
  return (adapter.mock.calls[call]![0] as InternalAxiosRequestConfig).headers;
}

afterEach(() => setActiveWorkspaceId(null));

describe('workspace header', () => {
  it('sends no X-Organization-ID until a workspace is chosen', async () => {
    const client = createHttpClient();
    const adapter = vi.fn(ok);
    client.defaults.adapter = adapter;
    await client.get('/conversations/');
    expect(seen(adapter, 0)['X-Organization-ID']).toBeUndefined();
    expect(seen(adapter, 0).Authorization).toBe('Bearer access-token');

    setActiveWorkspaceId(ID);
    await client.get('/conversations/');
    expect(seen(adapter, 1)['X-Organization-ID']).toBe(ID);
  });

  it('forgets a workspace the user lost and retries once against the default', async () => {
    setActiveWorkspaceId(ID);
    const client = createHttpClient();
    const adapter = vi.fn((config: InternalAxiosRequestConfig) =>
      config.headers['X-Organization-ID'] ? forbidden(config, 'You do not have access to this organization.') : ok(config),
    );
    client.defaults.adapter = adapter;
    const response = await client.get('/conversations/');
    expect(response.status).toBe(200);
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(seen(adapter, 1)['X-Organization-ID']).toBeUndefined();
    expect(getActiveWorkspaceId()).toBeNull();
  });

  it('does not retry other 403s or requests without a workspace', async () => {
    setActiveWorkspaceId(ID);
    const client = createHttpClient();
    const adapter = vi.fn((config: InternalAxiosRequestConfig) => forbidden(config, 'Organization admin access is required.'));
    client.defaults.adapter = adapter;
    await expect(client.get('/organizations/members/')).rejects.toBeInstanceOf(AxiosError);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(getActiveWorkspaceId()).toBe(ID);
  });
});
