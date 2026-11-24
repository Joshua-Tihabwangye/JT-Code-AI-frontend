import i18n from '@/i18n/config';
import { KEYS } from './keys';
import { simulate } from './latency';
import { readValue, writeValue } from '../storage/store';
import type { WebhookRepository } from '../contracts';
import type { CreatedWebhook, NewWebhook, Webhook, WebhookDelivery } from '../types';

interface Stored {
  hooks: Webhook[];
  deliveries: Record<string, WebhookDelivery[]>;
}

function secret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `whsec_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Frontend-only mode: endpoints live in this browser and nothing is sent anywhere. */
export class MockWebhookRepository implements WebhookRepository {
  private load() {
    return readValue<Stored>(KEYS.webhooks, { hooks: [], deliveries: {} });
  }
  private async change(id: string, update: Partial<Webhook>): Promise<Webhook> {
    const stored = await this.load();
    const hook = stored.hooks.find((item) => item.id === id);
    if (!hook) throw new Error(i18n.t('webhooks.errors.notFound'));
    Object.assign(hook, update);
    await writeValue(KEYS.webhooks, stored);
    return hook;
  }

  list() {
    return simulate('webhooks.list', async () => (await this.load()).hooks);
  }
  create(input: NewWebhook) {
    return simulate('webhooks.create', async (): Promise<CreatedWebhook> => {
      if (!/^https:\/\/[^\s/]+/.test(input.url)) throw new Error(i18n.t('webhooks.errors.https'));
      const stored = await this.load();
      const hook: Webhook = {
        id: crypto.randomUUID(),
        name: input.name.trim(),
        url: input.url.trim(),
        status: 'active',
        events: [...input.events],
        isVerified: false,
        lastSuccessAt: null,
        lastFailureAt: null,
        failureCount: 0,
        createdAt: new Date().toISOString(),
      };
      stored.hooks.unshift(hook);
      await writeValue(KEYS.webhooks, stored);
      return { ...hook, secret: secret() };
    });
  }
  setStatus(id: string, status: 'active' | 'paused') {
    return simulate('webhooks.status', () => this.change(id, status === 'active' ? { status, failureCount: 0 } : { status }));
  }
  remove(id: string) {
    return simulate('webhooks.remove', async () => {
      const stored = await this.load();
      stored.hooks = stored.hooks.filter((hook) => hook.id !== id);
      delete stored.deliveries[id];
      await writeValue(KEYS.webhooks, stored);
    });
  }
  sendTest(id: string) {
    return simulate('webhooks.test', async () => {
      const stored = await this.load();
      const now = new Date().toISOString();
      const delivery: WebhookDelivery = {
        id: crypto.randomUUID(),
        eventType: 'webhook.test',
        status: 'failed',
        attempt: 1,
        maxAttempts: 1,
        responseStatus: null,
        errorMessage: i18n.t('webhooks.errors.demo'),
        createdAt: now,
        deliveredAt: null,
        nextRetryAt: null,
      };
      stored.deliveries[id] = [delivery, ...(stored.deliveries[id] ?? [])];
      await writeValue(KEYS.webhooks, stored);
      return delivery;
    });
  }
  rotateSecret(id: string) {
    return simulate('webhooks.rotate', async () => ({ ...(await this.change(id, {})), secret: secret() }));
  }
  deliveries(id: string) {
    return simulate('webhooks.deliveries', async () => (await this.load()).deliveries[id] ?? []);
  }
}
