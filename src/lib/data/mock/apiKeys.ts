import i18n from '@/i18n/config';
import { getCurrentUser } from '@/lib/localAuth';
import { KEYS } from './keys';
import { simulate } from './latency';
import { readValue, writeValue } from '../storage/store';
import type { ApiKeyRepository } from '../contracts';
import type { ApiKey, CreatedApiKey, NewApiKey } from '../types';

function secret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Frontend-only mode: keys live in this browser and authenticate nothing (there is no server). */
export class MockApiKeyRepository implements ApiKeyRepository {
  private load() {
    return readValue<ApiKey[]>(KEYS.apiKeys, []);
  }
  private async update(id: string, change: Partial<ApiKey>): Promise<ApiKey> {
    const keys = await this.load();
    const index = keys.findIndex((key) => key.id === id);
    if (index < 0) throw new Error(i18n.t('developer.errors.notFound'));
    keys[index] = { ...keys[index]!, ...change };
    await writeValue(KEYS.apiKeys, keys);
    return keys[index];
  }

  list() {
    return simulate('apiKeys.list', () => this.load());
  }
  create(input: NewApiKey) {
    return simulate('apiKeys.create', async (): Promise<CreatedApiKey> => {
      if (!input.name.trim()) throw new Error(i18n.t('developer.errors.nameRequired'));
      if (input.scopes.length === 0) throw new Error(i18n.t('developer.errors.scopeRequired'));
      const created: ApiKey = {
        id: crypto.randomUUID(),
        name: input.name.trim(),
        prefix: 'jtk_test',
        status: 'active',
        scopes: [...new Set(input.scopes)].sort(),
        rateLimit: 1000,
        lastUsedAt: null,
        expiresAt: input.expiresAt,
        createdAt: new Date().toISOString(),
        ownerEmail: getCurrentUser()?.email ?? '',
      };
      await writeValue(KEYS.apiKeys, [created, ...(await this.load())]);
      return { ...created, key: `jtk_test_${secret()}` };
    });
  }
  revoke(id: string) {
    return simulate('apiKeys.revoke', () => this.update(id, { status: 'revoked' }));
  }
}
