import { beforeEach, describe, expect, it } from 'vitest';
import { createMockRepositories } from '../mock/repositories';
import { configureMockRuntime } from '../mock/latency';
import { resetDemoData } from '../storage/migrations';
import { seedMockData } from '../mock/seed';
import type { Repositories } from '../contracts';

function makeRepos(): Repositories {
  return createMockRepositories();
}

beforeEach(async () => {
  configureMockRuntime({ latencyMs: 0, failureRate: 0, failFor: [] });
  localStorage.clear();
  await resetDemoData();
  // Mimic the RepositoryProvider bootstrap so plans/wallet/account exist.
  await seedMockData();
});

describe('Mock repository: auth', () => {
  it('signs up, signs in, and signs out', async () => {
    const repos = makeRepos();
    const { user, session } = await repos.auth.signUp({
      email: 'a@b.com',
      password: 'Password1',
      firstName: 'A',
      lastName: 'B',
      contact: '+256 700000000',
      countryCode: 'UG',
      countryName: 'Uganda',
      dialCode: '+256',
      timezone: 'Africa/Kampala',
    });
    expect(user.id).toBeTruthy();
    expect(session.accessToken).toBeTruthy();

    await repos.auth.signOut();
    expect(await repos.auth.getSession()).toBeNull();
  });

  it('rejects duplicate email', async () => {
    const repos = makeRepos();
    const input = {
      email: 'dup@b.com',
      password: 'Password1',
      firstName: 'A',
      lastName: 'B',
      contact: '',
      countryCode: 'UG',
      countryName: 'Uganda',
      dialCode: '+256',
      timezone: 'Africa/Kampala',
    };
    await repos.auth.signUp(input);
    await expect(repos.auth.signUp(input)).rejects.toThrow(/already exists/i);
  });

  it('rejects wrong password', async () => {
    const repos = makeRepos();
    await repos.auth.signUp({
      email: 'c@b.com',
      password: 'Password1',
      firstName: 'A',
      lastName: 'B',
      contact: '',
      countryCode: 'UG',
      countryName: 'Uganda',
      dialCode: '+256',
      timezone: 'Africa/Kampala',
    });
    await expect(repos.auth.signInWithPassword('c@b.com', 'wrong')).rejects.toThrow(/invalid/i);
  });
});

describe('Mock repository: account', () => {
  it('updates account fields', async () => {
    const repos = makeRepos();
    await repos.auth.signUp({
      email: 'acc@b.com',
      password: 'Password1',
      firstName: 'Old',
      lastName: 'Name',
      contact: '',
      countryCode: 'UG',
      countryName: 'Uganda',
      dialCode: '+256',
      timezone: 'Africa/Kampala',
    });
    const updated = await repos.account.updateAccount({ firstName: 'New' });
    expect(updated.firstName).toBe('New');
    expect((await repos.account.getAccount()).firstName).toBe('New');
  });
});

describe('Mock repository: billing accounting', () => {
  it('tops up credits and creates an invoice', async () => {
    const repos = makeRepos();
    const before = await repos.billing.getWallet();
    const intent = await repos.billing.topup(10);
    expect(intent.credits).toBe(1000);
    expect((await repos.billing.getWallet()).balance).toBe(before.balance + 1000);
    expect((await repos.billing.listInvoices()).length).toBeGreaterThan(0);
  });

  it('changes plan via checkout and updates account plan', async () => {
    const repos = makeRepos();
    await repos.billing.createCheckout('team', 'month');
    expect((await repos.billing.getSubscription())?.plan).toBe('team');
    expect((await repos.account.getAccount()).plan).toBe('team');
  });

  it('cancels and reactivates a subscription', async () => {
    const repos = makeRepos();
    const canceled = await repos.billing.cancelSubscription();
    expect(canceled?.cancelAtPeriodEnd).toBe(true);
    const reactivated = await repos.billing.reactivate();
    expect(reactivated?.cancelAtPeriodEnd).toBe(false);
  });

  it('consumes credits from wallet and usage', async () => {
    const repos = makeRepos();
    const wallet = await repos.billing.getWallet();
    const usage = await repos.billing.consumeCredits('images', 50);
    const after = await repos.billing.getWallet();
    expect(after.balance).toBe(wallet.balance - 50);
    expect(usage.byType.images).toBeGreaterThanOrEqual(50);
  });
});

describe('Mock repository: chat + history', () => {
  it('creates a conversation, streams a message, and restores the thread', async () => {
    const repos = makeRepos();
    const conv = await repos.chat.createConversation('Test', 'gpt-4o');
    let streamed = '';
    await repos.chat.sendMessage({
      conversationId: conv.id,
      content: 'Hello there friend',
      model: 'gpt-4o',
      onToken: (t) => {
        streamed += t;
      },
    });
    const msgs = await repos.chat.getMessages(conv.id);
    expect(msgs.length).toBe(2);
    expect(msgs[1]!.role).toBe('assistant');
    expect(msgs[1]!.content.length).toBeGreaterThan(0);
    expect(streamed).toBe(msgs[1]!.content);
  });

  it('restores a conversation from history and supports pin/archive/delete', async () => {
    const repos = makeRepos();
    const conv = await repos.chat.createConversation('Hist');
    await repos.chat.sendMessage({ conversationId: conv.id, content: 'x', model: 'gpt-4o' });
    const opened = await repos.history.open(conv.id);
    expect(opened?.id).toBe(conv.id);

    await repos.history.pin(conv.id, true);
    expect((await repos.history.list({ pinnedOnly: true })).some((c) => c.id === conv.id)).toBe(true);

    await repos.history.archive(conv.id, true);
    expect((await repos.history.list({ archivedOnly: true })).some((c) => c.id === conv.id)).toBe(true);

    await repos.history.delete(conv.id);
    expect(await repos.history.open(conv.id)).toBeNull();
  });

  it('searches conversations by message content', async () => {
    const repos = makeRepos();
    const conv = await repos.chat.createConversation('Unique title');
    await repos.chat.sendMessage({ conversationId: conv.id, content: 'needle-in-haystack', model: 'gpt-4o' });
    const results = await repos.history.list({ search: 'needle-in-haystack' });
    expect(results.some((c) => c.id === conv.id)).toBe(true);
  });
});

describe('Mock repository: files', () => {
  it('uploads, downloads, renames and deletes a file', async () => {
    const repos = makeRepos();
    const file = new File(['hello world'], 'note.txt', { type: 'text/plain' });
    const item = await repos.files.upload({ file });
    expect(item.name).toBe('note.txt');

    const blob = await repos.files.download(item.id);
    expect(blob.size).toBe(file.size);

    const renamed = await repos.files.rename(item.id, 'renamed.txt');
    expect(renamed.name).toBe('renamed.txt');

    await repos.files.delete(item.id);
    expect(await repos.files.get(item.id)).toBeNull();
  });
});

describe('Mock repository: documents', () => {
  it('creates, updates, duplicates, versions and exports', async () => {
    const repos = makeRepos();
    const doc = await repos.documents.create({ title: 'Doc', template: 'blank', content: '# Hi' });
    const updated = await repos.documents.update(doc.id, '# Updated');
    expect(updated.content).toBe('# Updated');
    const dup = await repos.documents.duplicate(doc.id);
    expect(dup.title).toContain('copy');
    const versioned = await repos.documents.addVersion(doc.id);
    expect(versioned.version).toBe(2);
    expect(await repos.documents.exportMarkdown(doc.id)).toContain('# Doc');
  });
});

describe('Mock repository: integrations', () => {
  it('connects, tests and disconnects', async () => {
    const repos = makeRepos();
    const connected = await repos.integrations.connect({ key: 'slack', displayName: 'Team' });
    expect(connected.connected).toBe(true);
    expect((await repos.integrations.test(connected.id)).ok).toBe(true);
    await repos.integrations.disconnect(connected.id);
    expect((await repos.integrations.list()).find((i) => i.id === connected.id)?.connected).toBe(false);
  });
});

describe('Mock repository: knowledge', () => {
  it('creates a collection, adds and syncs a source, and queries', async () => {
    const repos = makeRepos();
    const collection = await repos.knowledge.createCollection('Docs');
    const withSource = await repos.knowledge.addSource({
      collectionId: collection.id,
      type: 'file',
      name: 'guide.md',
    });
    const source = withSource.sources[0]!;
    expect(source.status).toBe('indexing');
    const synced = await repos.knowledge.syncSource(collection.id, source.id);
    expect(synced.status).toBe('indexed');
    const answer = await repos.knowledge.query(collection.id, 'how do I start?');
    expect(answer.length).toBeGreaterThan(0);
  });
});

describe('Mock runtime: deterministic failure injection', () => {
  it('throws when a tag is forced to fail', async () => {
    const repos = makeRepos();
    configureMockRuntime({ failFor: ['billing.topup'] });
    await expect(repos.billing.topup(5)).rejects.toThrow();
  });
});
