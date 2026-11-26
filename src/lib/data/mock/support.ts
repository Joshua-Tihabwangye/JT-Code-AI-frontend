import i18n from '@/i18n/config';
import { getCurrentUser } from '@/lib/localAuth';
import { KEYS } from './keys';
import { simulate } from './latency';
import { readValue, writeValue } from '../storage/store';
import type { SupportRepository } from '../contracts';
import type { NewSupportCase, SupportCase, SupportMessage } from '../types';

interface Stored {
  cases: SupportCase[];
  messages: Record<string, SupportMessage[]>;
}

/** Frontend-only mode: cases stay in this browser; nobody answers them. */
export class MockSupportRepository implements SupportRepository {
  private load() {
    return readValue<Stored>(KEYS.support, { cases: [], messages: {} });
  }
  private find(stored: Stored, caseId: string): SupportCase {
    const item = stored.cases.find((candidate) => candidate.id === caseId);
    if (!item) throw new Error(i18n.t('support.errors.notFound'));
    return item;
  }

  list() {
    return simulate('support.list', async () => (await this.load()).cases);
  }
  open(input: NewSupportCase) {
    return simulate('support.open', async () => {
      const stored = await this.load();
      const now = new Date().toISOString();
      const item: SupportCase = {
        id: crypto.randomUUID(),
        subject: input.subject.trim(),
        description: input.description.trim(),
        category: input.category,
        priority: input.priority,
        status: 'open',
        userEmail: getCurrentUser()?.email ?? '',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      stored.cases.unshift(item);
      await writeValue(KEYS.support, stored);
      return item;
    });
  }
  messages(caseId: string) {
    return simulate('support.messages', async () => (await this.load()).messages[caseId] ?? []);
  }
  reply(caseId: string, body: string) {
    return simulate('support.reply', async () => {
      const stored = await this.load();
      const item = this.find(stored, caseId);
      if (item.status === 'closed') throw new Error(i18n.t('support.errors.closed'));
      const message: SupportMessage = {
        id: crypto.randomUUID(),
        author: 'customer',
        authorName: getCurrentUser()?.email ?? '',
        body: body.trim(),
        createdAt: new Date().toISOString(),
      };
      stored.messages[caseId] = [...(stored.messages[caseId] ?? []), message];
      Object.assign(item, { status: 'open', messageCount: item.messageCount + 1, updatedAt: message.createdAt });
      await writeValue(KEYS.support, stored);
      return message;
    });
  }
  close(caseId: string) {
    return simulate('support.close', async () => {
      const stored = await this.load();
      const item = this.find(stored, caseId);
      Object.assign(item, { status: 'closed', updatedAt: new Date().toISOString() });
      await writeValue(KEYS.support, stored);
      return item;
    });
  }
}
