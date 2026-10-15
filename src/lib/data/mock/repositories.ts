import { KEYS } from './keys';
import { simulate } from './latency';
import { MockAnalyticsRepository } from './analytics';
import { createMockVisualizeRepository } from './visualize';
import { JsonCollection, readValue, writeValue, getBlob, putBlob, deleteBlob, blobKey } from '../storage/store';
import type {
  Account,
  AccountUpdate,
  ChatMessage,
  Conversation,
  CreditCategory,
  FileItem,
  ImageAsset,
  ImageGeneration,
  ImageModel,
  Integration,
  IntegrationKey,
  Invoice,
  KnowledgeCollection,
  KnowledgeSearchResult,
  KnowledgeSource,
  KnowledgeSourceType,
  PaymentMethod,
  PasswordChange,
  Plan,
  PlanSlug,
  Subscription,
  Usage,
  Wallet,
  AppDocument,
} from '../types';
import type {
  AccountRepository,
  AuthRepository,
  AuthSession,
  AuthUser,
  BillingRepository,
  ChatRepository,
  DocumentsRepository,
  FilesRepository,
  HistoryFilter,
  HistoryRepository,
  ImageRepository,
  IntegrationRepository,
  KnowledgeRepository,
  Repositories,
  SendMessageOptions,
  TopupIntent,
} from '../contracts';

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function hashPassword(password: string): string {
  let hash = 5381;
  for (let i = 0; i < password.length; i++) {
    hash = (hash * 33) ^ password.charCodeAt(i);
  }
  return `h${(hash >>> 0).toString(16)}`;
}

interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  contact: string;
  countryCode: string;
  countryName: string;
  dialCode: string;
  timezone: string;
  createdAt: string;
}

const users = new JsonCollection<StoredUser>(KEYS.users);
const conversations = new JsonCollection<Conversation>(KEYS.conversations);
const messages = new JsonCollection<ChatMessage>(KEYS.messages);
const files = new JsonCollection<FileItem>(KEYS.files);
const documents = new JsonCollection<AppDocument>(KEYS.documents);
const integrations = new JsonCollection<Integration>(KEYS.integrations);
const knowledge = new JsonCollection<KnowledgeCollection>(KEYS.knowledge);
const images = new JsonCollection<ImageGeneration>(KEYS.images);

const authListeners = new Set<(session: AuthSession | null) => void>();
const generationControllers = new Map<string, AbortController>();

async function consumeCredits(category: CreditCategory, amount: number): Promise<Usage> {
  const wallet = await readValue<Wallet>(KEYS.wallet, {
    id: 'wallet',
    balance: 0,
    reservedBalance: 0,
    currency: 'USD',
    creditValueUsd: 0.01,
    autoTopupEnabled: false,
    autoTopupThreshold: 0,
    monthlySpendingLimit: null,
  });
  const usage = await readValue<Usage>(KEYS.usage, {
    totalCredits: 0,
    byType: { chat: 0, images: 0, documents: 0, agent: 0 },
  });
  wallet.balance = Math.max(0, wallet.balance - amount);
  usage.totalCredits += amount;
  usage.byType[category] += amount;
  await writeValue(KEYS.wallet, wallet);
  await writeValue(KEYS.usage, usage);
  return usage;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

class MockAuthRepository implements AuthRepository {
  async signUp(input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    contact: string;
    countryCode: string;
    countryName: string;
    dialCode: string;
    timezone: string;
  }) {
    return simulate('auth.signUp', async () => {
      const existing = (await users.all()).find((u) => u.email.toLowerCase() === input.email.toLowerCase());
      if (existing) throw new Error('An account with this email already exists.');
      const user: StoredUser = {
        id: uid('user'),
        email: input.email.trim(),
        passwordHash: hashPassword(input.password),
        firstName: input.firstName,
        lastName: input.lastName,
        contact: input.contact,
        countryCode: input.countryCode,
        countryName: input.countryName,
        dialCode: input.dialCode,
        timezone: input.timezone,
        createdAt: new Date().toISOString(),
      };
      await users.upsert(user);
      const account: Account = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        contact: user.contact,
        countryCode: user.countryCode,
        countryName: user.countryName,
        dialCode: user.dialCode,
        timezone: user.timezone,
        avatarUrl: null,
        createdAt: user.createdAt,
        termsAccepted: true,
        privacyAccepted: true,
        plan: 'free',
      };
      await writeValue(KEYS.account, account);
      const session = this.makeSession(user.id);
      await writeValue(KEYS.session, session);
      this.emit(session);
      return { user: this.toUser(user), session };
    });
  }

  async signInWithPassword(email: string, password: string) {
    return simulate('auth.signIn', async () => {
      const user = (await users.all()).find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!user || user.passwordHash !== hashPassword(password)) {
        throw new Error('Invalid email or password.');
      }
      const session = this.makeSession(user.id);
      await writeValue(KEYS.session, session);
      this.emit(session);
      return { user: this.toUser(user), session };
    });
  }

  async signInWithOAuth(provider: 'google' | 'apple') {
    return simulate(`auth.oauth.${provider}`, async () => {
      const email = `${provider}@local.dev`;
      let user = (await users.all()).find((u) => u.email === email);
      if (!user) {
        user = {
          id: uid('user'),
          email,
          passwordHash: '',
          firstName: provider.charAt(0).toUpperCase() + provider.slice(1),
          lastName: 'User',
          contact: '',
          countryCode: 'UG',
          countryName: 'Uganda',
          dialCode: '+256',
          timezone: 'Africa/Kampala',
          createdAt: new Date().toISOString(),
        };
        await users.upsert(user);
        await writeValue(KEYS.account, {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          contact: '',
          countryCode: 'UG',
          countryName: 'Uganda',
          dialCode: '+256',
          timezone: 'Africa/Kampala',
          avatarUrl: null,
          createdAt: user.createdAt,
          termsAccepted: true,
          privacyAccepted: true,
          plan: 'free',
        });
      }
      const session = this.makeSession(user.id);
      await writeValue(KEYS.session, session);
      this.emit(session);
      return { user: this.toUser(user), session };
    });
  }

  async signOut() {
    await writeValue(KEYS.session, null);
    this.emit(null);
  }

  async getSession(): Promise<AuthSession | null> {
    return readValue<AuthSession | null>(KEYS.session, null);
  }

  async getUser(): Promise<AuthUser | null> {
    const session = await this.getSession();
    if (!session) return null;
    const user = (await users.all()).find((u) => u.id === session.userId);
    return user ? this.toUser(user) : null;
  }

  async resetPasswordForEmail(email: string) {
    await simulate('auth.reset', async () => {
      const user = (await users.all()).find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!user) return; // do not leak existence
      const codes = await readValue<Record<string, string>>(KEYS.session + ':reset', {});
      codes[email.toLowerCase()] = '000000';
      await writeValue(KEYS.session + ':reset', codes);
    });
  }

  async resetPassword(code: string, newPassword: string) {
    await simulate('auth.resetConfirm', async () => {
      if (code !== '000000') throw new Error('Invalid or expired reset code.');
      // In mock mode we cannot map the code back to a user reliably; require the
      // caller to be authenticated. Real backend would validate the code.
      const session = await this.getSession();
      const user = session ? (await users.all()).find((u) => u.id === session.userId) : null;
      if (!user) throw new Error('Sign in to reset your password.');
      user.passwordHash = hashPassword(newPassword);
      await users.upsert(user);
    });
  }

  onChange(listener: (session: AuthSession | null) => void): () => void {
    authListeners.add(listener);
    return () => authListeners.delete(listener);
  }

  private makeSession(userId: string): AuthSession {
    return { accessToken: `local.${crypto.randomUUID()}`, userId, issuedAt: new Date().toISOString() };
  }

  private emit(session: AuthSession | null): void {
    authListeners.forEach((listener) => listener(session));
  }

  private toUser(user: StoredUser): AuthUser {
    return { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName };
  }
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

class MockAccountRepository implements AccountRepository {
  async getAccount(): Promise<Account> {
    const account = await readValue<Account | null>(KEYS.account, null);
    if (!account) throw new Error('No account found. Please sign in.');
    return account;
  }

  async updateAccount(update: AccountUpdate): Promise<Account> {
    return simulate('account.update', async () => {
      const account = await this.getAccount();
      const next: Account = { ...account, ...update };
      await writeValue(KEYS.account, next);
      return next;
    });
  }

  async changePassword(change: PasswordChange): Promise<void> {
    await simulate('account.password', async () => {
      if (change.newPassword !== change.confirmPassword) throw new Error('Passwords do not match.');
      const session = await readValue<AuthSession | null>(KEYS.session, null);
      if (!session) throw new Error('Sign in to change your password.');
      const user = (await users.all()).find((u) => u.id === session.userId);
      if (!user) throw new Error('Account not found.');
      if (user.passwordHash && user.passwordHash !== hashPassword(change.currentPassword)) {
        throw new Error('Current password is incorrect.');
      }
      user.passwordHash = hashPassword(change.newPassword);
      await users.upsert(user);
    });
  }

  async uploadAvatar(file: File): Promise<Account> {
    return simulate('account.avatar', async () => {
      const avatarUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error('Could not read the image.'));
        reader.readAsDataURL(file);
      });
      const next: Account = { ...(await this.getAccount()), avatarUrl };
      await writeValue(KEYS.account, next);
      return next;
    });
  }

  async removeAvatar(): Promise<Account> {
    const next: Account = { ...(await this.getAccount()), avatarUrl: null };
    await writeValue(KEYS.account, next);
    return next;
  }

  async deleteAccount(): Promise<void> {
    await writeValue(KEYS.account, null);
    await writeValue(KEYS.session, null);
  }
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

function placeholderReply(prompt: string): string {
  return `Here is a mock response to: "${prompt.slice(0, 80)}". In mock mode the assistant returns deterministic text so the UI can exercise streaming, retry and persistence without a backend.`;
}

class MockChatRepository implements ChatRepository {
  async listConversations(): Promise<Conversation[]> {
    const all = await conversations.all();
    return [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return (await conversations.get(id)) ?? null;
  }

  async createConversation(title = 'New conversation', model = 'gpt-4o'): Promise<Conversation> {
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: uid('conv'),
      title,
      preview: '',
      messageCount: 0,
      model,
      updatedAt: now,
      createdAt: now,
      pinned: false,
      archived: false,
      hasAttachments: false,
    };
    await conversations.upsert(conversation);
    return conversation;
  }

  async renameConversation(id: string, title: string): Promise<Conversation> {
    const conversation = await this.requireConversation(id);
    const next = { ...conversation, title };
    await conversations.upsert(next);
    return next;
  }

  async deleteConversation(id: string): Promise<void> {
    await conversations.remove(id);
    const remaining = (await messages.all()).filter((m) => m.conversationId !== id);
    await messages.replaceAll(remaining);
  }

  async pinConversation(id: string, pinned: boolean): Promise<Conversation> {
    const conversation = await this.requireConversation(id);
    const next = { ...conversation, pinned };
    await conversations.upsert(next);
    return next;
  }

  async archiveConversation(id: string, archived: boolean): Promise<Conversation> {
    const conversation = await this.requireConversation(id);
    const next = { ...conversation, archived };
    await conversations.upsert(next);
    return next;
  }

  async exportConversation(id: string, format: 'markdown' | 'json'): Promise<string> {
    const conversation = await this.requireConversation(id);
    const msgs = (await messages.all()).filter((m) => m.conversationId === id);
    if (format === 'json') {
      return JSON.stringify({ conversation, messages: msgs }, null, 2);
    }
    return [`# ${conversation.title}`, '', ...msgs.map((m) => `**${m.role}**: ${m.content}`), ''].join('\n');
  }

  async getMessages(id: string): Promise<ChatMessage[]> {
    const all = (await messages.all()).filter((m) => m.conversationId === id);
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async sendMessage(options: SendMessageOptions): Promise<ChatMessage> {
    const controller = new AbortController();
    generationControllers.set(options.conversationId, controller);
    try {
      const userMessage: ChatMessage = {
        id: uid('msg'),
        conversationId: options.conversationId,
        role: 'user',
        content: options.content,
        createdAt: new Date().toISOString(),
        status: 'complete',
        attachments: options.attachments,
      };
      await messages.upsert(userMessage);

      const reply = placeholderReply(options.content);
      const tokens = reply.match(/\S+\s*/g) ?? [reply];
      let streamed = '';
      const assistantMessage: ChatMessage = {
        id: uid('msg'),
        conversationId: options.conversationId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        model: options.model,
        status: 'streaming',
      };
      await messages.upsert(assistantMessage);

      for (const token of tokens) {
        if (controller.signal.aborted) {
          assistantMessage.status = 'canceled';
          assistantMessage.content = streamed;
          await messages.upsert(assistantMessage);
          break;
        }
        streamed += token;
        assistantMessage.content = streamed;
        options.onToken?.(token);
        await new Promise((r) => setTimeout(r, 18));
      }

      if (!controller.signal.aborted) {
        assistantMessage.status = 'complete';
        await messages.upsert(assistantMessage);
      }

      await this.touchConversation(options.conversationId, options.content, !!options.attachments);
      await consumeCredits('chat', 4);
      return assistantMessage;
    } finally {
      generationControllers.delete(options.conversationId);
    }
  }

  cancelGeneration(conversationId: string): void {
    generationControllers.get(conversationId)?.abort();
  }

  async consumeCredits(category: CreditCategory, amount: number): Promise<void> {
    await consumeCredits(category, amount);
  }

  private async requireConversation(id: string): Promise<Conversation> {
    const conversation = await conversations.get(id);
    if (!conversation) throw new Error('Conversation not found.');
    return conversation;
  }

  private async touchConversation(id: string, preview: string, hasAttachments: boolean): Promise<void> {
    const conversation = await this.requireConversation(id);
    const count = (await messages.all()).filter((m) => m.conversationId === id).length;
    await conversations.upsert({
      ...conversation,
      preview: preview.slice(0, 120),
      messageCount: count,
      hasAttachments: conversation.hasAttachments || hasAttachments,
      updatedAt: new Date().toISOString(),
    });
  }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

class MockHistoryRepository implements HistoryRepository {
  async list(filter: HistoryFilter = {}): Promise<Conversation[]> {
    let all = await conversations.all();
    if (filter.search) {
      const q = filter.search.toLowerCase();
      const msgMatches = (await messages.all()).filter((m) => m.content.toLowerCase().includes(q));
      const matchedIds = new Set(msgMatches.map((m) => m.conversationId));
      all = all.filter(
        (c) => c.title.toLowerCase().includes(q) || matchedIds.has(c.id),
      );
    }
    if (filter.pinnedOnly) all = all.filter((c) => c.pinned);
    if (filter.archivedOnly) all = all.filter((c) => c.archived);
    else all = all.filter((c) => !c.archived);
    if (filter.withFilesOnly) all = all.filter((c) => c.hasAttachments);
    return [...all].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }

  async open(id: string): Promise<Conversation | null> {
    return (await conversations.get(id)) ?? null;
  }

  async rename(id: string, title: string): Promise<Conversation> {
    return new MockChatRepository().renameConversation(id, title);
  }

  async pin(id: string, pinned: boolean): Promise<Conversation> {
    return new MockChatRepository().pinConversation(id, pinned);
  }

  async archive(id: string, archived: boolean): Promise<Conversation> {
    return new MockChatRepository().archiveConversation(id, archived);
  }

  async delete(id: string): Promise<void> {
    await new MockChatRepository().deleteConversation(id);
  }

  async bulkDelete(ids: string[]): Promise<void> {
    const chat = new MockChatRepository();
    await Promise.all(ids.map((id) => chat.deleteConversation(id)));
  }

  async clearAll(): Promise<void> {
    await conversations.replaceAll([]);
    await messages.replaceAll([]);
  }

  async export(id: string, format: 'markdown' | 'json'): Promise<string> {
    return new MockChatRepository().exportConversation(id, format);
  }
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

class MockBillingRepository implements BillingRepository {
  async getPlans(): Promise<Plan[]> {
    return simulate('billing.plans', () => readValue<Plan[]>(KEYS.plans, []));
  }

  async getSubscription(): Promise<Subscription | null> {
    return readValue<Subscription | null>(KEYS.subscription, null);
  }

  async getWallet(): Promise<Wallet> {
    return readValue<Wallet>(KEYS.wallet, {
      id: 'wallet',
      balance: 0,
      reservedBalance: 0,
      currency: 'USD',
      creditValueUsd: 0.01,
      autoTopupEnabled: false,
      autoTopupThreshold: 0,
      monthlySpendingLimit: null,
    });
  }

  async getUsage(): Promise<Usage> {
    return readValue<Usage>(KEYS.usage, {
      totalCredits: 0,
      byType: { chat: 0, images: 0, documents: 0, agent: 0 },
    });
  }

  async topup(amountUsd: number): Promise<TopupIntent> {
    return simulate('billing.topup', async () => {
      const wallet = await this.getWallet();
      const credits = Math.round(amountUsd / wallet.creditValueUsd);
      wallet.balance += credits;
      await writeValue(KEYS.wallet, wallet);
      const invoice: Invoice = {
        id: uid('inv'),
        number: `JT-TOPUP-${Date.now()}`,
        date: new Date().toISOString(),
        amountCents: Math.round(amountUsd * 100),
        currency: 'USD',
        status: 'paid',
        description: `Credit top-up (${credits} credits)`,
      };
      const all = await readValue<Invoice[]>(KEYS.invoices, []);
      await writeValue(KEYS.invoices, [invoice, ...all]);
      // Demo mode: the payment is applied immediately; there is nothing to confirm.
      return { clientSecret: '', paymentIntentId: invoice.id, credits, publishableKey: '' };
    });
  }

  async createCheckout(planSlug: PlanSlug, interval: 'month' | 'year'): Promise<{ checkoutUrl: string }> {
    return simulate('billing.checkout', async () => {
      const plans = await this.getPlans();
      const plan = plans.find((p) => p.slug === planSlug);
      if (!plan) throw new Error('Plan not found.');
      const now = new Date().toISOString();
      const subscription: Subscription = {
        id: uid('sub'),
        status: 'active',
        plan: planSlug,
        planName: plan.name,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(Date.now() + (interval === 'year' ? 365 : 30) * 864e5).toISOString(),
        cancelAtPeriodEnd: false,
        isActive: true,
        daysRemaining: interval === 'year' ? 365 : 30,
      };
      await writeValue(KEYS.subscription, subscription);
      const account = await readValue<Account | null>(KEYS.account, null);
      if (account) await writeValue(KEYS.account, { ...account, plan: planSlug });
      return { checkoutUrl: '/app/billing?checkout=success' };
    });
  }

  async cancelSubscription(): Promise<Subscription | null> {
    return simulate('billing.cancel', async () => {
      const sub = await this.requireSubscription();
      const next = { ...sub, cancelAtPeriodEnd: true, status: 'canceled' as const };
      await writeValue(KEYS.subscription, next);
      return next;
    });
  }

  async reactivate(): Promise<Subscription | null> {
    return simulate('billing.reactivate', async () => {
      const sub = await this.requireSubscription();
      const next = { ...sub, cancelAtPeriodEnd: false, status: 'active' as const };
      await writeValue(KEYS.subscription, next);
      return next;
    });
  }

  openBillingPortal(): Promise<string> {
    return Promise.resolve('/app/billing');
  }

  async getPaymentMethod(): Promise<PaymentMethod | null> {
    return readValue<PaymentMethod | null>(KEYS.paymentMethod, null);
  }

  async setAutoRecharge(enabled: boolean, threshold: number): Promise<Wallet> {
    const wallet = await this.getWallet();
    wallet.autoTopupEnabled = enabled;
    wallet.autoTopupThreshold = threshold;
    await writeValue(KEYS.wallet, wallet);
    return wallet;
  }

  async setSpendingLimit(limit: number | null): Promise<Wallet> {
    const wallet = await this.getWallet();
    wallet.monthlySpendingLimit = limit;
    await writeValue(KEYS.wallet, wallet);
    return wallet;
  }

  async listInvoices(): Promise<Invoice[]> {
    return readValue<Invoice[]>(KEYS.invoices, []);
  }

  async getInvoice(id: string): Promise<Invoice | null> {
    const all = await this.listInvoices();
    return all.find((i) => i.id === id) ?? null;
  }

  async downloadInvoice(id: string): Promise<Blob> {
    return simulate('billing.invoice', async () => {
      const invoice = await this.getInvoice(id);
      if (!invoice) throw new Error('Invoice not found.');
      const body = `JT-Code Invoice\nNumber: ${invoice.number}\nDate: ${invoice.date}\nAmount: $${(invoice.amountCents / 100).toFixed(2)}\nStatus: ${invoice.status}\n\n${invoice.description}`;
      return new Blob([body], { type: 'application/pdf' });
    });
  }

  async consumeCredits(category: CreditCategory, amount: number): Promise<Usage> {
    return consumeCredits(category, amount);
  }

  private async requireSubscription(): Promise<Subscription> {
    const sub = await this.getSubscription();
    if (!sub) throw new Error('No active subscription.');
    return sub;
  }
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

function svgAsset(label: string, hue: number): ImageAsset {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,55%)"/><stop offset="1" stop-color="hsl(${(hue + 70) % 360},70%,40%)"/></linearGradient></defs><rect width="768" height="768" fill="url(#g)"/><text x="384" y="400" font-family="sans-serif" font-size="30" fill="white" text-anchor="middle">${label}</text></svg>`;
  return { id: uid('asset'), url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, width: 768, height: 768 };
}

class MockImageRepository implements ImageRepository {
  listModels(): Promise<{ id: ImageModel; label: string }[]> {
    return Promise.resolve([
      { id: 'auto', label: 'Auto (recommended)' },
      { id: 'dall-e-3', label: 'DALL·E 3' },
      { id: 'stable-diffusion', label: 'Stable Diffusion' },
      { id: 'imagen', label: 'Imagen' },
    ]);
  }

  async generate(options: Parameters<ImageRepository['generate']>[0]): Promise<ImageGeneration> {
    return simulate('images.generate', async () => {
      const count = Math.min(options.imageCount, 4);
      const hue = Math.floor(Math.random() * 360);
      const assets: ImageAsset[] = Array.from({ length: count }, (_, i) =>
        svgAsset(options.style || 'generated', hue + i * 12),
      );
      const generation: ImageGeneration = {
        id: uid('img'),
        prompt: options.prompt,
        negativePrompt: options.negativePrompt,
        model: options.model,
        aspectRatio: options.aspectRatio,
        style: options.style,
        seed: options.seed,
        imageCount: count,
        createdAt: new Date().toISOString(),
        images: assets,
        favorite: false,
        mode: 'generate',
      };
      await images.upsert(generation);
      await consumeCredits('images', 10 * count);
      return generation;
    });
  }

  async edit(options: Parameters<ImageRepository['edit']>[0]): Promise<ImageGeneration> {
    return simulate('images.edit', async () => {
      const generation: ImageGeneration = {
        id: uid('img'),
        prompt: options.instruction,
        model: options.model,
        aspectRatio: options.aspectRatio,
        style: options.style,
        seed: options.seed,
        imageCount: 1,
        createdAt: new Date().toISOString(),
        images: [svgAsset('edited', 200)],
        favorite: false,
        mode: 'edit',
      };
      await images.upsert(generation);
      await consumeCredits('images', 12);
      return generation;
    });
  }

  async understand(imageRef: string, question: string): Promise<string> {
    return simulate('images.understand', async () => {
      await consumeCredits('images', 3);
      return `Analyzing image "${imageRef}": ${question} — this is a mock understanding result describing the visual content.`;
    });
  }

  async listGenerations(): Promise<ImageGeneration[]> {
    const all = await images.all();
    return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getGeneration(id: string): Promise<ImageGeneration | null> {
    return (await images.get(id)) ?? null;
  }

  async deleteGeneration(id: string): Promise<void> {
    await images.remove(id);
  }

  async toggleFavorite(id: string, favorite: boolean): Promise<ImageGeneration> {
    const generation = await this.require(id);
    const next = { ...generation, favorite };
    await images.upsert(next);
    return next;
  }

  async saveToFiles(id: string): Promise<FileItem> {
    const generation = await this.require(id);
    const asset = generation.images[0]!;
    const blob = await (await fetch(asset.url)).blob();
    const key = blobKey('file');
    await putBlob(key, blob);
    const item: FileItem = {
      id: uid('file'),
      name: `${generation.prompt.slice(0, 24) || 'image'}.svg`,
      mimeType: 'image/svg+xml',
      size: blob.size,
      blobKey: key,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usedIn: [],
    };
    await files.upsert(item);
    return item;
  }

  async consumeCredits(amount: number): Promise<void> {
    await consumeCredits('images', amount);
  }

  private async require(id: string): Promise<ImageGeneration> {
    const generation = await images.get(id);
    if (!generation) throw new Error('Image generation not found.');
    return generation;
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

class MockFilesRepository implements FilesRepository {
  async list(): Promise<FileItem[]> {
    const all = await files.all();
    return [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<FileItem | null> {
    return (await files.get(id)) ?? null;
  }

  async upload(options: Parameters<FilesRepository['upload']>[0]): Promise<FileItem> {
    return simulate('files.upload', async () => {
      const total = options.file.size || 1;
      let sent = 0;
      const step = Math.max(1, Math.floor(total / 10));
      while (sent < total) {
        if (options.signal?.aborted) throw new Error('Upload canceled.');
        sent = Math.min(total, sent + step);
        options.onProgress?.(Math.round((sent / total) * 100));
        await new Promise((r) => setTimeout(r, 25));
      }
      const key = blobKey('file');
      await putBlob(key, options.file);
      const item: FileItem = {
        id: uid('file'),
        name: options.file.name,
        mimeType: options.file.type || 'application/octet-stream',
        size: options.file.size,
        blobKey: key,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usedIn: [],
      };
      await files.upsert(item);
      return item;
    });
  }

  async rename(id: string, name: string): Promise<FileItem> {
    const item = await this.require(id);
    const next = { ...item, name, updatedAt: new Date().toISOString() };
    await files.upsert(next);
    return next;
  }

  async delete(id: string): Promise<void> {
    const item = await files.get(id);
    if (item) await deleteBlob(item.blobKey);
    await files.remove(id);
  }

  async bulkDelete(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.delete(id)));
  }

  async download(id: string): Promise<Blob> {
    const item = await this.require(id);
    const blob = await getBlob(item.blobKey);
    if (!blob) throw new Error('File content unavailable.');
    return blob;
  }

  async attachToChat(id: string, conversationId: string): Promise<FileItem> {
    const item = await this.require(id);
    const next = { ...item, usedIn: [...new Set([...item.usedIn, conversationId])] };
    await files.upsert(next);
    return next;
  }

  private async require(id: string): Promise<FileItem> {
    const item = await files.get(id);
    if (!item) throw new Error('File not found.');
    return item;
  }
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

class MockDocumentsRepository implements DocumentsRepository {
  async list(): Promise<AppDocument[]> {
    const all = await documents.all();
    return [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<AppDocument | null> {
    return (await documents.get(id)) ?? null;
  }

  async create(input: { title: string; template: string; content?: string }): Promise<AppDocument> {
    const now = new Date().toISOString();
    const doc: AppDocument = {
      id: uid('doc'),
      title: input.title,
      template: input.template,
      content: input.content ?? '',
      favorite: false,
      createdAt: now,
      updatedAt: now,
      version: 1,
      versions: [{ id: uid('dv'), version: 1, content: input.content ?? '', createdAt: now }],
    };
    await documents.upsert(doc);
    return doc;
  }

  async update(id: string, content: string): Promise<AppDocument> {
    const doc = await this.require(id);
    const next: AppDocument = { ...doc, content, updatedAt: new Date().toISOString() };
    await documents.upsert(next);
    return next;
  }

  async rename(id: string, title: string): Promise<AppDocument> {
    const doc = await this.require(id);
    const next = { ...doc, title, updatedAt: new Date().toISOString() };
    await documents.upsert(next);
    return next;
  }

  async duplicate(id: string): Promise<AppDocument> {
    const doc = await this.require(id);
    const now = new Date().toISOString();
    const next: AppDocument = {
      ...doc,
      id: uid('doc'),
      title: `${doc.title} (copy)`,
      createdAt: now,
      updatedAt: now,
      versions: [{ id: uid('dv'), version: 1, content: doc.content, createdAt: now }],
    };
    await documents.upsert(next);
    return next;
  }

  async delete(id: string): Promise<void> {
    await documents.remove(id);
  }

  async addVersion(id: string): Promise<AppDocument> {
    const doc = await this.require(id);
    const version = doc.version + 1;
    const next: AppDocument = {
      ...doc,
      version,
      updatedAt: new Date().toISOString(),
      versions: [...doc.versions, { id: uid('dv'), version, content: doc.content, createdAt: new Date().toISOString() }],
    };
    await documents.upsert(next);
    return next;
  }

  async exportMarkdown(id: string): Promise<string> {
    const doc = await this.require(id);
    return `# ${doc.title}\n\n${doc.content}`;
  }

  async exportPdf(id: string): Promise<Blob> {
    const doc = await this.require(id);
    return new Blob([`# ${doc.title}\n\n${doc.content}`], { type: 'application/pdf' });
  }

  async saveToFiles(id: string): Promise<FileItem> {
    const doc = await this.require(id);
    const blob = new Blob([doc.content], { type: 'text/markdown' });
    const key = blobKey('file');
    await putBlob(key, blob);
    const item: FileItem = {
      id: uid('file'),
      name: `${doc.title}.md`,
      mimeType: 'text/markdown',
      size: blob.size,
      blobKey: key,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usedIn: [],
    };
    await files.upsert(item);
    return item;
  }

  private async require(id: string): Promise<AppDocument> {
    const doc = await documents.get(id);
    if (!doc) throw new Error('Document not found.');
    return doc;
  }
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

class MockIntegrationRepository implements IntegrationRepository {
  async list(): Promise<Integration[]> {
    return integrations.all();
  }

  async connect(input: { key: IntegrationKey; displayName?: string; config?: Record<string, unknown> }): Promise<Integration> {
    return simulate(`integrations.connect.${input.key}`, async () => {
      const existing = (await integrations.all()).find((i) => i.key === input.key);
      if (existing) {
        const next: Integration = { ...existing, connected: true, status: 'connected', lastSync: new Date().toISOString() };
        await integrations.upsert(next);
        return next;
      }
      const created: Integration = {
        id: uid('int'),
        key: input.key,
        name: input.key.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        displayName: input.displayName ?? '',
        connected: true,
        status: 'connected',
        lastSync: new Date().toISOString(),
        permissions: ['Read basic profile'],
        config: input.config ?? {},
      };
      await integrations.upsert(created);
      return created;
    });
  }

  async disconnect(id: string): Promise<void> {
    const item = await this.require(id);
    const next: Integration = { ...item, connected: false, status: 'disconnected', lastSync: null };
    await integrations.upsert(next);
  }

  async configure(id: string, displayName: string, config: Record<string, unknown>): Promise<Integration> {
    const item = await this.require(id);
    const next = { ...item, displayName, config };
    await integrations.upsert(next);
    return next;
  }

  async test(id: string): Promise<{ ok: boolean; message: string }> {
    return simulate(`integrations.test.${id}`, async () => {
      const item = await this.require(id);
      if (!item.connected) return { ok: false, message: 'Not connected.' };
      return { ok: true, message: `${item.name} connection is healthy.` };
    });
  }

  async reconnect(id: string): Promise<Integration> {
    const item = await this.require(id);
    const next: Integration = { ...item, connected: true, status: 'connected', lastSync: new Date().toISOString() };
    await integrations.upsert(next);
    return next;
  }

  private async require(id: string): Promise<Integration> {
    const item = await integrations.get(id);
    if (!item) throw new Error('Integration not found.');
    return item;
  }
}

// ---------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------

class MockKnowledgeRepository implements KnowledgeRepository {
  async listCollections(): Promise<KnowledgeCollection[]> {
    return knowledge.all();
  }

  async getCollection(id: string): Promise<KnowledgeCollection | null> {
    return (await knowledge.get(id)) ?? null;
  }

  async createCollection(name: string, description = ''): Promise<KnowledgeCollection> {
    const collection: KnowledgeCollection = {
      id: uid('kc'),
      name,
      description,
      createdAt: new Date().toISOString(),
      sources: [],
    };
    await knowledge.upsert(collection);
    return collection;
  }

  async renameCollection(id: string, name: string): Promise<KnowledgeCollection> {
    const collection = await this.require(id);
    const next = { ...collection, name };
    await knowledge.upsert(next);
    return next;
  }

  async deleteCollection(id: string): Promise<void> {
    await knowledge.remove(id);
  }

  async addSource(input: { collectionId: string; type: KnowledgeSourceType; name: string; config?: Record<string, unknown> }): Promise<KnowledgeCollection> {
    const collection = await this.require(input.collectionId);
    const source: KnowledgeSource = {
      id: uid('ks'),
      collectionId: input.collectionId,
      type: input.type,
      name: input.name,
      status: 'indexing',
      chunkCount: 0,
      docCount: 1,
      lastSync: null,
      config: input.config ?? {},
    };
    const next = { ...collection, sources: [...collection.sources, source] };
    await knowledge.upsert(next);
    return next;
  }

  async removeSource(collectionId: string, sourceId: string): Promise<KnowledgeCollection> {
    const collection = await this.require(collectionId);
    const next = { ...collection, sources: collection.sources.filter((s) => s.id !== sourceId) };
    await knowledge.upsert(next);
    return next;
  }

  async syncSource(collectionId: string, sourceId: string): Promise<KnowledgeSource> {
    return simulate(`knowledge.sync.${sourceId}`, async () => {
      const collection = await this.require(collectionId);
      const source = collection.sources.find((s) => s.id === sourceId);
      if (!source) throw new Error('Source not found.');
      const updated: KnowledgeSource = {
        ...source,
        status: 'indexed',
        chunkCount: 8 + Math.floor(Math.random() * 40),
        lastSync: new Date().toISOString(),
      };
      const next = { ...collection, sources: collection.sources.map((s) => (s.id === sourceId ? updated : s)) };
      await knowledge.upsert(next);
      return updated;
    });
  }

  async search(collectionId: string, query: string): Promise<KnowledgeSearchResult[]> {
    const collection = await this.require(collectionId);
    return collection.sources
      .filter((s) => s.status === 'indexed')
      .map((s) => ({ sourceId: s.id, collectionId, text: `${s.name}: mock chunk matching "${query}"`, score: 0.9 }));
  }

  async query(collectionId: string, query: string): Promise<string> {
    return simulate('knowledge.query', async () => {
      const results = await this.search(collectionId, query);
      if (results.length === 0) return 'No indexed sources found for this query.';
      return `Based on ${results.length} source(s), here is a mock retrieval-augmented answer for: "${query}".`;
    });
  }

  private async require(id: string): Promise<KnowledgeCollection> {
    const collection = await knowledge.get(id);
    if (!collection) throw new Error('Collection not found.');
    return collection;
  }
}

export function createMockRepositories(): Repositories {
  return {
    auth: new MockAuthRepository(),
    account: new MockAccountRepository(),
    chat: new MockChatRepository(),
    history: new MockHistoryRepository(),
    billing: new MockBillingRepository(),
    images: new MockImageRepository(),
    files: new MockFilesRepository(),
    documents: new MockDocumentsRepository(),
    integrations: new MockIntegrationRepository(),
    knowledge: new MockKnowledgeRepository(),
    analytics: new MockAnalyticsRepository(),
    visualize: createMockVisualizeRepository(),
  };
}
