import type { AxiosResponse } from 'axios';
import { apiErrorMessage, http as api } from '@/lib/api/http';
import { supabase } from '@/lib/supabase';
import type { Paginated } from '@/lib/api/types';
import type {
  Account,
  AccountUpdate,
  AnalysisRun,
  AnalysisTransform,
  AppDocument,
  ChatMessage,
  Conversation,
  CreditCategory,
  Dataset,
  DatasetProfile,
  FileItem,
  ImageGeneration,
  ImageModel,
  Integration,
  IntegrationKey,
  Invoice,
  KnowledgeCollection,
  KnowledgeSearchResult,
  KnowledgeSource,
  KnowledgeSourceType,
  PasswordChange,
  PaymentMethod,
  Plan,
  PlanSlug,
  Subscription,
  Usage,
  Visualization,
  Wallet,
  SavedChart,
  VizAssistantAnswer,
  VizCatalog,
  VizCellEdit,
  VizFields,
  VizInsight,
  VizPrediction,
  VizPreview,
  VizQualityReport,
  VizRecommendation,
  VizRenderResult,
  DashboardPersonalView,
  DashboardRecord,
  DashboardSpec,
  DashboardTheme,
  DashboardVersionInfo,
  SavedTheme,
  VisualsResponse,
} from '../types';
import type {
  AccountRepository,
  AnalyticsRepository,
  AuthRepository,
  AuthSession,
  AuthUser,
  BillingRepository,
  ChatRepository,
  CreateDatasetInput,
  CreateVisualizationInput,
  DocumentsRepository,
  FilesRepository,
  HistoryFilter,
  HistoryRepository,
  ImageRepository,
  IntegrationRepository,
  KnowledgeRepository,
  RenderVisualsInput,
  Repositories,
  SendMessageOptions,
  SignUpInput,
  TopupIntent,
  SaveChartInput,
  VisualizeRepository,
  VizOrganizeSteps,
  VizPredictInput,
  VizExcelOptions,
  VizRenderInput,
  VizWorkbookInput,
} from '../contracts';

// Real-backend implementation of the repository contracts. Authentication is
// Supabase Auth (supabase-js); every Django call goes through `http`, which
// attaches the current Supabase access token.

/** Lists are plain arrays on some endpoints and DRF pages ({results}) on others. */
function items<T>(data: T[] | Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

async function list<T>(path: string, params?: Record<string, unknown>): Promise<T[]> {
  const { data } = await api.get<T[] | Paginated<T>>(path, { params });
  return items(data);
}

// --- Auth (Supabase) ---------------------------------------------------------------------------

function toAuthUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): AuthUser {
  const meta = user.user_metadata ?? {};
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    id: user.id,
    email: user.email ?? '',
    firstName: text(meta.first_name),
    lastName: text(meta.last_name),
  };
}

function toAuthSession(session: { access_token: string; user: { id: string }; expires_at?: number }): AuthSession {
  return { accessToken: session.access_token, userId: session.user.id, issuedAt: new Date().toISOString() };
}

class ApiAuthRepository implements AuthRepository {
  async signUp(input: SignUpInput) {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          first_name: input.firstName,
          last_name: input.lastName,
          contact: input.contact,
          country: input.countryCode,
          countryName: input.countryName,
          dialCode: input.dialCode,
          timezone: input.timezone,
        },
      },
    });
    if (error || !data.user || !data.session) throw new Error(error?.message ?? 'Sign-up needs email confirmation.');
    return { user: toAuthUser(data.user), session: toAuthSession(data.session) };
  }
  async signInWithPassword(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return { user: toAuthUser(data.user), session: toAuthSession(data.session) };
  }
  async signInWithOAuth(provider: 'google' | 'apple'): Promise<{ user: AuthUser; session: AuthSession }> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/sso-callback` },
    });
    if (error) throw new Error(error.message);
    // The browser is redirected to the provider; the session arrives on /sso-callback.
    return new Promise(() => undefined);
  }
  async signOut() {
    await supabase.auth.signOut();
  }
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session ? toAuthSession(data.session) : null;
  }
  async getUser() {
    const { data } = await supabase.auth.getUser();
    return data.user ? toAuthUser(data.user) : null;
  }
  async resetPasswordForEmail(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw new Error(error.message);
  }
  async resetPassword(code: string, newPassword: string) {
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email ?? '';
    const verified = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
    if (verified.error) throw new Error(verified.error.message);
    const updated = await supabase.auth.updateUser({ password: newPassword });
    if (updated.error) throw new Error(updated.error.message);
  }
  onChange(listener: (session: AuthSession | null) => void) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      listener(session ? toAuthSession(session) : null);
    });
    return () => data.subscription.unsubscribe();
  }
}

// --- Account -----------------------------------------------------------------------------------

class ApiAccountRepository implements AccountRepository {
  async getAccount() {
    const { data } = await api.get<Account>('/accounts/me/');
    return data;
  }
  async updateAccount(update: AccountUpdate) {
    const { data } = await api.patch<Account>('/accounts/me/', update);
    return data;
  }
  async changePassword(change: PasswordChange) {
    await api.post('/accounts/me/password/', change);
  }
  async uploadAvatar(file: File) {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post<Account>('/accounts/me/avatar/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }
  async removeAvatar() {
    const { data } = await api.delete<Account>('/accounts/me/avatar/');
    return data;
  }
  async deleteAccount() {
    await api.delete('/settings/account/');
    await supabase.auth.signOut();
  }
}

// --- Chat --------------------------------------------------------------------------------------

interface ChatRequestSnapshot {
  id: string;
  conversationId: string;
  status: string;
  outputText: string;
  errorMessage?: string;
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

/** Reads the Server-Sent Events stream of a chat request, calling `onEvent` per event. */
async function readEventStream(
  path: string,
  onEvent: (event: string, data: unknown) => boolean | void,
  signal?: AbortSignal,
): Promise<void> {
  // The fetch adapter exposes the response as a ReadableStream (XHR buffers it).
  const response: AxiosResponse<ReadableStream<Uint8Array>> = await api.get(path, {
    adapter: 'fetch',
    responseType: 'stream',
    timeout: 0,
    signal,
    headers: { Accept: 'text/event-stream' },
  });
  const reader = response.data.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = 'message';
  let dataLines: string[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line === '') {
          if (dataLines.length) {
            let payload: unknown = dataLines.join('\n');
            try {
              payload = JSON.parse(payload as string);
            } catch {
              /* plain-text event */
            }
            if (onEvent(event, payload) === false) return;
          }
          event = 'message';
          dataLines = [];
        } else if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
        newline = buffer.indexOf('\n');
      }
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

class ApiChatRepository implements ChatRepository {
  private active = new Map<string, { requestId: string; controller: AbortController }>();

  async listConversations() {
    return list<Conversation>('/conversations/');
  }
  async getConversation(id: string) {
    const { data } = await api.get<Conversation>(`/conversations/${id}/`);
    return data;
  }
  async createConversation(title = 'New conversation', model?: string) {
    const { data } = await api.post<Conversation>('/conversations/', model ? { title, model } : { title });
    return data;
  }
  async renameConversation(id: string, title: string) {
    const { data } = await api.patch<Conversation>(`/conversations/${id}/`, { title });
    return data;
  }
  async deleteConversation(id: string) {
    await api.delete(`/conversations/${id}/`);
  }
  async pinConversation(id: string, pinned: boolean) {
    const { data } = await api.patch<Conversation>(`/conversations/${id}/`, { pinned });
    return data;
  }
  async archiveConversation(id: string, archived: boolean) {
    const { data } = archived
      ? await api.post<Conversation>(`/conversations/${id}/archive/`)
      : await api.post<Conversation>(`/conversations/${id}/unarchive/`);
    return data;
  }
  async exportConversation(id: string, format: 'markdown' | 'json') {
    const { data } = await api.get<{ content: string }>(`/conversations/${id}/export/`, { params: { format } });
    return data.content;
  }
  async getMessages(id: string) {
    // The API lists newest first; the thread renders oldest first.
    const messages = await list<ChatMessage>(`/conversations/${id}/messages/`);
    return [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async sendMessage(options: SendMessageOptions): Promise<ChatMessage> {
    const { data: request } = await api.post<ChatRequestSnapshot>(
      '/chat/requests/',
      {
        conversationId: options.conversationId,
        chatInput: options.content,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: navigator.language,
      },
      { headers: { 'Idempotency-Key': crypto.randomUUID() } },
    );
    const controller = new AbortController();
    options.signal?.addEventListener('abort', () => controller.abort());
    this.active.set(options.conversationId, { requestId: request.id, controller });

    let text = '';
    let latest: ChatRequestSnapshot = request;
    const apply = (snapshot: ChatRequestSnapshot) => {
      latest = snapshot;
      options.onStatus?.(snapshot.status);
      // The stream carries snapshots of the whole reply; hand the UI the new part.
      const next = snapshot.outputText ?? '';
      if (next.length > text.length && next.startsWith(text)) options.onToken?.(next.slice(text.length));
      else if (next !== text) options.onToken?.(next);
      text = next;
    };
    try {
      await readEventStream(
        `/chat/requests/${request.id}/stream/`,
        (event, payload) => {
          if (event === 'heartbeat' || typeof payload !== 'object' || payload === null) return;
          if ('status' in payload) apply(payload as ChatRequestSnapshot);
          if (TERMINAL.has(latest.status) || event === 'timeout') return false;
        },
        controller.signal,
      );
      if (!TERMINAL.has(latest.status)) {
        // Stream ended early (proxy timeout, reconnect): read the final state once.
        const { data } = await api.get<ChatRequestSnapshot>(`/chat/requests/${request.id}/`);
        apply(data);
      }
    } catch (error) {
      if (!controller.signal.aborted) throw error;
      latest = { ...latest, status: 'cancelled' };
    } finally {
      this.active.delete(options.conversationId);
    }

    const status: ChatMessage['status'] =
      latest.status === 'completed' ? 'complete' : latest.status === 'cancelled' ? 'canceled' : 'error';
    return {
      id: request.id,
      conversationId: options.conversationId,
      role: 'assistant',
      content: status === 'error' ? latest.errorMessage || text || 'The assistant could not answer.' : text,
      createdAt: new Date().toISOString(),
      status,
    };
  }
  cancelGeneration(conversationId: string) {
    const active = this.active.get(conversationId);
    if (!active) return;
    void api.post(`/chat/requests/${active.requestId}/cancel/`).catch(() => undefined);
    active.controller.abort();
  }
  async consumeCredits(_category: CreditCategory, _amount: number) {
    /* Credits are metered server-side. */
  }
}

class ApiHistoryRepository implements HistoryRepository {
  private chat = new ApiChatRepository();

  async list(filter: HistoryFilter = {}) {
    const params: Record<string, string> = {};
    if (filter.search) params.q = filter.search;
    if (filter.pinnedOnly) params.pinnedOnly = 'true';
    if (filter.archivedOnly) params.archivedOnly = 'true';
    if (filter.withFilesOnly) params.withFilesOnly = 'true';
    return list<Conversation>('/conversations/', params);
  }
  open(id: string) {
    return this.chat.getConversation(id);
  }
  rename(id: string, title: string) {
    return this.chat.renameConversation(id, title);
  }
  pin(id: string, pinned: boolean) {
    return this.chat.pinConversation(id, pinned);
  }
  archive(id: string, archived: boolean) {
    return this.chat.archiveConversation(id, archived);
  }
  delete(id: string) {
    return this.chat.deleteConversation(id);
  }
  async bulkDelete(ids: string[]) {
    await api.post('/conversations/bulk-delete/', { ids });
  }
  async clearAll() {
    await api.post('/conversations/clear/');
  }
  export(id: string, format: 'markdown' | 'json') {
    return this.chat.exportConversation(id, format);
  }
}

// --- Billing -----------------------------------------------------------------------------------

class ApiBillingRepository implements BillingRepository {
  async getPlans() {
    return list<Plan>('/plans/');
  }
  async getSubscription() {
    const subscriptions = await list<Subscription>('/subscriptions/');
    return subscriptions.find((s) => s.isActive) ?? subscriptions[0] ?? null;
  }
  async getWallet() {
    const { data } = await api.get<Wallet>('/wallets/me/');
    return data;
  }
  async getUsage() {
    const { data } = await api.get<Usage>('/usage/');
    return data;
  }
  async topup(amountUsd: number) {
    const { data } = await api.post<TopupIntent>('/wallets/me/topup/', { amount_cents: Math.round(amountUsd * 100) });
    return data;
  }
  async createCheckout(planSlug: PlanSlug, interval: 'month' | 'year') {
    const base = `${window.location.origin}/app/billing`;
    const { data } = await api.post<{ checkoutUrl: string }>(`/plans/${planSlug}/subscribe/`, {
      interval,
      successUrl: `${base}?checkout=success`,
      cancelUrl: `${base}?checkout=cancelled`,
    });
    return data;
  }
  async cancelSubscription() {
    await api.post('/subscriptions/cancel/');
    return this.getSubscription();
  }
  async reactivate() {
    await api.post('/subscriptions/reactivate/');
    return this.getSubscription();
  }
  async openBillingPortal() {
    const { data } = await api.post<{ url: string }>('/billing/portal/', {
      returnUrl: `${window.location.origin}/app/billing`,
    });
    return data.url;
  }
  async getPaymentMethod() {
    const { data } = await api.get<PaymentMethod | null>('/payment-methods/me/');
    return data;
  }
  async setAutoRecharge(enabled: boolean, threshold: number) {
    const { data } = await api.patch<Wallet>('/wallets/me/', {
      auto_topup_enabled: enabled,
      auto_topup_threshold: threshold,
    });
    return data;
  }
  async setSpendingLimit(limit: number | null) {
    const { data } = await api.patch<Wallet>('/wallets/me/', { monthly_spending_limit: limit });
    return data;
  }
  async listInvoices() {
    return list<Invoice>('/invoices/');
  }
  async getInvoice(id: string) {
    const { data } = await api.get<Invoice>(`/invoices/${id}/`);
    return data;
  }
  async downloadInvoice(id: string) {
    const { data } = await api.get<Blob>(`/invoices/${id}/download/`, { responseType: 'blob' });
    return data;
  }
  async consumeCredits(_category: CreditCategory, _amount: number) {
    return this.getUsage();
  }
}

// --- Images ------------------------------------------------------------------------------------

class ApiImageRepository implements ImageRepository {
  async listModels() {
    const { data } = await api.get<{ id: ImageModel; label: string }[]>('/images/models/');
    return data;
  }
  async generate({ signal, onProgress: _onProgress, ...options }: Parameters<ImageRepository['generate']>[0]) {
    const { data } = await api.post<ImageGeneration>('/images/generate/', options, { signal, timeout: 120_000 });
    return data;
  }
  async edit({ signal, onProgress: _onProgress, ...options }: Parameters<ImageRepository['edit']>[0]) {
    const { data } = await api.post<ImageGeneration>('/images/edit/', options, { signal, timeout: 120_000 });
    return data;
  }
  async understand(imageRef: string, question: string) {
    const { data } = await api.post<{ answer: string }>(
      '/images/understand/',
      { image: imageRef, question },
      { timeout: 120_000 },
    );
    return data.answer;
  }
  async listGenerations() {
    return list<ImageGeneration>('/images/');
  }
  async getGeneration(id: string) {
    const { data } = await api.get<ImageGeneration>(`/images/${id}/`);
    return data;
  }
  async deleteGeneration(id: string) {
    await api.delete(`/images/${id}/`);
  }
  async toggleFavorite(id: string, favorite: boolean) {
    const { data } = await api.patch<ImageGeneration>(`/images/${id}/`, { favorite });
    return data;
  }
  async saveToFiles(id: string) {
    const { data } = await api.post<FileItem>(`/images/${id}/save-to-files/`);
    return data;
  }
  async consumeCredits(_amount: number) {
    /* Credits are metered server-side. */
  }
}

// --- Files -------------------------------------------------------------------------------------

class ApiFilesRepository implements FilesRepository {
  async list() {
    return list<FileItem>('/files/');
  }
  async get(id: string) {
    const { data } = await api.get<FileItem>(`/files/${id}/`);
    return data;
  }
  async upload(options: Parameters<FilesRepository['upload']>[0]) {
    const form = new FormData();
    form.append('file', options.file);
    const { onProgress } = options;
    const { data } = await api.post<FileItem>('/files/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
      signal: options.signal,
      // Only when asked: axios's fetch adapter drops FormData bodies when a progress handler is set.
      ...(onProgress && {
        onUploadProgress: (e: { loaded?: number; total?: number }) => onProgress(Math.round(((e.loaded ?? 0) / (e.total || 1)) * 100)),
      }),
    });
    return data;
  }
  async rename(id: string, name: string) {
    const { data } = await api.patch<FileItem>(`/files/${id}/`, { name });
    return data;
  }
  async delete(id: string) {
    await api.delete(`/files/${id}/`);
  }
  async bulkDelete(ids: string[]) {
    await api.post('/files/bulk-delete/', { ids });
  }
  async download(id: string) {
    const { data } = await api.get<Blob>(`/files/${id}/download/`, { responseType: 'blob' });
    return data;
  }
  async attachToChat(id: string, conversationId: string) {
    const { data } = await api.post<FileItem>(`/files/${id}/attach/`, { conversationId });
    return data;
  }
}

// --- Documents ---------------------------------------------------------------------------------

class ApiDocumentsRepository implements DocumentsRepository {
  async list() {
    return list<AppDocument>('/documents/');
  }
  async get(id: string) {
    const { data } = await api.get<AppDocument>(`/documents/${id}/`);
    return data;
  }
  async create(input: { title: string; template: string; content?: string }) {
    const { data } = await api.post<AppDocument>('/documents/', input);
    return data;
  }
  async update(id: string, content: string) {
    const { data } = await api.patch<AppDocument>(`/documents/${id}/`, { content });
    return data;
  }
  async rename(id: string, title: string) {
    const { data } = await api.patch<AppDocument>(`/documents/${id}/`, { title });
    return data;
  }
  async duplicate(id: string) {
    const { data } = await api.post<AppDocument>(`/documents/${id}/duplicate/`);
    return data;
  }
  async delete(id: string) {
    await api.delete(`/documents/${id}/`);
  }
  async addVersion(id: string) {
    const { data } = await api.post<AppDocument>(`/documents/${id}/versions/`);
    return data;
  }
  async exportMarkdown(id: string) {
    const { data } = await api.get<{ content: string }>(`/documents/${id}/export/`, { params: { format: 'md' } });
    return data.content;
  }
  async exportPdf(id: string) {
    const { data } = await api.get<Blob>(`/documents/${id}/export/`, { params: { format: 'pdf' }, responseType: 'blob' });
    return data;
  }
  async saveToFiles(id: string) {
    const { data } = await api.post<FileItem>(`/documents/${id}/save-to-files/`);
    return data;
  }
}

// --- Integrations ------------------------------------------------------------------------------

class ApiIntegrationRepository implements IntegrationRepository {
  async list() {
    return list<Integration>('/integrations/');
  }
  async connect(input: { key: IntegrationKey; displayName?: string; config?: Record<string, unknown> }) {
    const { data } = await api.post<Integration>('/integrations/connect/', input);
    return data;
  }
  async disconnect(id: string) {
    await api.delete(`/integrations/${id}/`);
  }
  async configure(id: string, displayName: string, config: Record<string, unknown>) {
    const { data } = await api.patch<Integration>(`/integrations/${id}/`, { displayName, config });
    return data;
  }
  async test(id: string) {
    const { data } = await api.post<{ ok: boolean; message: string }>(`/integrations/${id}/test/`);
    return data;
  }
  async reconnect(id: string) {
    const { data } = await api.post<Integration>(`/integrations/${id}/reconnect/`);
    return data;
  }
}

// --- Knowledge ---------------------------------------------------------------------------------

class ApiKnowledgeRepository implements KnowledgeRepository {
  async listCollections() {
    return list<KnowledgeCollection>('/knowledge/collections/');
  }
  async getCollection(id: string) {
    const { data } = await api.get<KnowledgeCollection>(`/knowledge/collections/${id}/`);
    return data;
  }
  async createCollection(name: string, description = '') {
    const { data } = await api.post<KnowledgeCollection>('/knowledge/collections/', { name, description });
    return data;
  }
  async renameCollection(id: string, name: string) {
    const { data } = await api.patch<KnowledgeCollection>(`/knowledge/collections/${id}/`, { name });
    return data;
  }
  async deleteCollection(id: string) {
    await api.delete(`/knowledge/collections/${id}/`);
  }
  async addSource(input: { collectionId: string; type: KnowledgeSourceType; name: string; config?: Record<string, unknown> }) {
    const { data } = await api.post<KnowledgeCollection>(`/knowledge/collections/${input.collectionId}/sources/`, input);
    return data;
  }
  async removeSource(collectionId: string, sourceId: string) {
    const { data } = await api.delete<KnowledgeCollection>(`/knowledge/collections/${collectionId}/sources/${sourceId}/`);
    return data;
  }
  async syncSource(_collectionId: string, sourceId: string) {
    const { data } = await api.post<KnowledgeSource>(`/knowledge/sources/${sourceId}/sync/`);
    return data;
  }
  async search(collectionId: string, query: string) {
    const { data } = await api.get<KnowledgeSearchResult[]>('/knowledge/search/', {
      params: { collectionId, query },
    });
    return data;
  }
  async query(collectionId: string, query: string) {
    const { data } = await api.post<{ answer: string }>('/knowledge/query/', { collectionId, query });
    return data.answer;
  }
}

// --- Analytics ---------------------------------------------------------------------------------

interface DatasetDto {
  id: string;
  name: string;
  mime_type: string;
  source_type: 'asset' | 'inline';
  schema: { columns?: string[]; dtypes?: Record<string, string> } | null;
  profile: DatasetProfile | null;
  row_count: number | null;
  byte_size: number;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

interface RunDto {
  id: string;
  dataset: string;
  status: AnalysisRun['status'];
  transform: AnalysisTransform | null;
  profile: DatasetProfile | null;
  result_schema: { columns?: string[]; rows?: number } | null;
  result_preview: Record<string, unknown>[] | null;
  result_download_url: string | null;
  error_message: string;
  created_at: string;
  completed_at: string | null;
}

interface VisualizationDto {
  id: string;
  analysis_run: string;
  kind: Visualization['kind'];
  x_column: string;
  y_column: string;
  color_column: string;
  title: string;
  status: Visualization['status'];
  artifact_url: string | null;
  spec_url: string | null;
  error_message: string;
  created_at: string;
}

function toDataset(dto: DatasetDto): Dataset {
  return {
    id: dto.id,
    name: dto.name,
    mimeType: dto.mime_type,
    sourceType: dto.source_type,
    columns: dto.schema?.columns ?? dto.profile?.columns ?? [],
    dtypes: dto.schema?.dtypes ?? {},
    profile: dto.profile ?? {},
    rowCount: dto.row_count ?? dto.profile?.rows ?? null,
    byteSize: dto.byte_size,
    isShared: dto.is_shared,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

function toRun(dto: RunDto): AnalysisRun {
  return {
    id: dto.id,
    datasetId: dto.dataset,
    status: dto.status,
    transform: dto.transform ?? {},
    columns: dto.result_schema?.columns ?? [],
    rowCount: dto.result_schema?.rows ?? null,
    preview: dto.result_preview ?? [],
    profile: dto.profile ?? {},
    downloadUrl: dto.result_download_url,
    errorMessage: dto.error_message ?? '',
    createdAt: dto.created_at,
    completedAt: dto.completed_at,
  };
}

function toVisualization(dto: VisualizationDto): Visualization {
  return {
    id: dto.id,
    runId: dto.analysis_run,
    kind: dto.kind,
    xColumn: dto.x_column,
    yColumn: dto.y_column ?? '',
    colorColumn: dto.color_column ?? '',
    title: dto.title ?? '',
    status: dto.status,
    imageUrl: dto.artifact_url,
    specUrl: dto.spec_url,
    errorMessage: dto.error_message ?? '',
    createdAt: dto.created_at,
  };
}

class ApiAnalyticsRepository implements AnalyticsRepository {
  async listDatasets() {
    return (await list<DatasetDto>('/analysis/datasets/')).map(toDataset);
  }
  async createDataset(input: CreateDatasetInput) {
    let source: Record<string, unknown>;
    if (input.file) {
      // Large CSVs go to private storage first; the dataset references the file.
      const form = new FormData();
      form.append('file', input.file, input.file.name);
      const { data: asset } = await api.post<FileItem>('/files/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000,
      });
      source = { asset: asset.id };
    } else {
      source = { inline_data: input.csv ?? '' };
    }
    const { data } = await api.post<DatasetDto>('/analysis/datasets/', {
      name: input.name,
      mime_type: 'text/csv',
      is_shared: input.isShared ?? false,
      ...source,
    });
    return toDataset(data);
  }
  async deleteDataset(id: string) {
    await api.delete(`/analysis/datasets/${id}/`);
  }
  async listRuns(datasetId?: string) {
    const runs = (await list<RunDto>('/analysis/runs/')).map(toRun);
    return datasetId ? runs.filter((run) => run.datasetId === datasetId) : runs;
  }
  async getRun(id: string) {
    const { data } = await api.get<RunDto>(`/analysis/runs/${id}/`);
    return toRun(data);
  }
  async createRun(datasetId: string, transform: AnalysisTransform) {
    const { data } = await api.post<RunDto>('/analysis/runs/', { dataset: datasetId, transform });
    return toRun(data);
  }
  async retryRun(id: string) {
    const { data } = await api.post<RunDto>(`/analysis/runs/${id}/retry/`);
    return toRun(data);
  }
  async deleteRun(id: string) {
    await api.delete(`/analysis/runs/${id}/`);
  }
  async downloadRun(id: string) {
    const { data } = await api.get<Blob>(`/analysis/runs/${id}/download/`, { responseType: 'blob' });
    return data;
  }
  async listVisualizations(runId?: string) {
    const charts = (await list<VisualizationDto>('/visualizations/')).map(toVisualization);
    return runId ? charts.filter((chart) => chart.runId === runId) : charts;
  }
  async getVisualization(id: string) {
    const { data } = await api.get<VisualizationDto>(`/visualizations/${id}/`);
    return toVisualization(data);
  }
  async createVisualization(input: CreateVisualizationInput) {
    const body: Record<string, unknown> = {
      analysis_run: input.runId,
      kind: input.kind,
      x_column: input.xColumn,
      title: input.title ?? '',
    };
    if (input.yColumn) body.y_column = input.yColumn;
    if (input.colorColumn) body.color_column = input.colorColumn;
    const { data } = await api.post<VisualizationDto>('/visualizations/', body);
    return toVisualization(data);
  }
  async deleteVisualization(id: string) {
    await api.delete(`/visualizations/${id}/`);
  }
}

// --- Data visualization (/visualize/*) -----------------------------------------------------------

/** Long-running sandbox work (model training, Excel exports) gets a generous timeout. */
const SLOW = { timeout: 300_000 };

async function blob(path: string, params?: Record<string, unknown>): Promise<Blob> {
  const { data } = await api.get<Blob>(path, { params, responseType: 'blob', ...SLOW });
  return data;
}

class ApiVisualizeRepository implements VisualizeRepository {
  async catalog() {
    const { data } = await api.get<VizCatalog>('/visualize/catalog/');
    return data;
  }
  async createSample(sampleId: string, name?: string) {
    const { data } = await api.post<DatasetDto>('/visualize/samples/', { sampleId, name: name ?? '' }, SLOW);
    return toDataset(data);
  }
  async importFile(file: File, options: { name?: string; format?: string; sheet?: string } = {}) {
    const form = new FormData();
    form.append('file', file, file.name);
    if (options.name) form.append('name', options.name);
    if (options.format) form.append('format', options.format);
    if (options.sheet) form.append('sheet', options.sheet);
    const { data } = await api.post<DatasetDto>('/visualize/datasets/import/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      ...SLOW,
    });
    return toDataset(data);
  }
  async preview(datasetId: string, offset = 0, rows = 100, quality: { issues?: boolean; filter?: string } = {}) {
    const params: Record<string, unknown> = { offset, rows };
    if (quality.issues) params.issues = 1;
    if (quality.filter) params.filter = quality.filter;
    const { data } = await api.get<VizPreview>(`/visualize/datasets/${datasetId}/preview/`, { params, ...SLOW });
    return data;
  }
  async quality(datasetId: string) {
    const { data } = await api.get<VizQualityReport>(`/visualize/datasets/${datasetId}/quality/`, SLOW);
    return data;
  }
  async editDataset(datasetId: string, edits: VizCellEdit[], deleteRows: number[] = []) {
    const { data } = await api.post<DatasetDto>(`/visualize/datasets/${datasetId}/edit/`, { edits, deleteRows }, SLOW);
    return toDataset(data);
  }
  async replaceDataset(datasetId: string, file: File) {
    const form = new FormData();
    form.append('file', file, file.name);
    const { data } = await api.post<DatasetDto>(`/visualize/datasets/${datasetId}/replace/`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      ...SLOW,
    });
    return toDataset(data);
  }
  async updateDataset(datasetId: string, patch: { name?: string; isShared?: boolean }) {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.isShared !== undefined) body.is_shared = patch.isShared;
    await api.patch(`/analysis/datasets/${datasetId}/`, body);
    // The update endpoint echoes only the changed fields; re-read the full record.
    const { data } = await api.get<DatasetDto>(`/analysis/datasets/${datasetId}/`);
    return toDataset(data);
  }
  async worldMap() {
    const { data } = await api.get<Record<string, unknown>>('/visualize/maps/world/');
    return data;
  }
  async insights(datasetId: string) {
    const { data } = await api.get<{ insights: VizInsight[]; recommendations: VizRecommendation[] }>(
      `/visualize/datasets/${datasetId}/insights/`,
      SLOW,
    );
    return data;
  }
  async suggestFields(datasetId: string, chartType: string) {
    const { data } = await api.get<{ fields?: VizFields }>(`/visualize/datasets/${datasetId}/recommend/`, { params: { chart: chartType } });
    return data.fields ?? {};
  }
  async organizePreview(datasetId: string, steps: VizOrganizeSteps) {
    const { data } = await api.post<{ profile: DatasetProfile; preview: Record<string, unknown>[] }>(
      `/visualize/datasets/${datasetId}/organize/`,
      { steps },
      SLOW,
    );
    return data;
  }
  async organizeSave(datasetId: string, steps: VizOrganizeSteps, name: string) {
    const { data } = await api.post<DatasetDto>(`/visualize/datasets/${datasetId}/organize/`, { steps, saveAs: name }, SLOW);
    return toDataset(data);
  }
  async exportDataset(datasetId: string, type: 'csv' | 'xlsx' | 'json', excel: VizExcelOptions = {}) {
    return blob(`/visualize/datasets/${datasetId}/export/`, { type, ...(type === 'xlsx' && excel.graphs ? { graphs: 1 } : {}) });
  }
  async workbook(input: VizWorkbookInput) {
    const { data } = await api.post<Blob>('/visualize/workbook/', input, { responseType: 'blob', ...SLOW });
    return data;
  }
  async render(input: VizRenderInput) {
    const { data } = await api.post<VizRenderResult>('/visualize/render/', input, SLOW);
    return data;
  }
  async predict(input: VizPredictInput) {
    const { data } = await api.post<VizPrediction>('/visualize/predict/', input, SLOW);
    return data;
  }
  async downloadPrediction(resultId: string, type: 'csv' | 'xlsx' = 'csv', excel: VizExcelOptions = {}) {
    return blob(`/visualize/predict/results/${resultId}/`, { type, ...(type === 'xlsx' ? { graphs: excel.graphs === false ? 0 : 1 } : {}) });
  }
  async savePrediction(resultId: string, name?: string) {
    const { data } = await api.post<DatasetDto>(`/visualize/predict/results/${resultId}/`, { name: name ?? '' }, SLOW);
    return toDataset(data);
  }
  async ask(input: { prompt: string; datasetId?: string; context?: Record<string, unknown> }) {
    const { data } = await api.post<VizAssistantAnswer>('/visualize/assistant/', input, { timeout: 120_000 });
    return data;
  }
  async listCharts() {
    return list<SavedChart>('/visualize/charts/');
  }
  async getChart(id: string) {
    const { data } = await api.get<SavedChart>(`/visualize/charts/${id}/`);
    return data;
  }
  async saveChart(input: SaveChartInput) {
    const { data } = await api.post<SavedChart>('/visualize/charts/', input, SLOW);
    return data;
  }
  async updateChart(id: string, patch: Partial<Pick<SavedChart, 'title' | 'description' | 'isShared'>>) {
    const { data } = await api.patch<SavedChart>(`/visualize/charts/${id}/`, patch);
    return data;
  }
  async deleteChart(id: string) {
    await api.delete(`/visualize/charts/${id}/`);
  }
  async exportChart(id: string, type: 'html' | 'json') {
    return blob(`/visualize/charts/${id}/export/`, { type });
  }
  async listDashboards() {
    return list<DashboardRecord>('/visualize/dashboards/');
  }
  async getDashboard(id: string) {
    const { data } = await api.get<DashboardRecord>(`/visualize/dashboards/${id}/`);
    return data;
  }
  async createDashboard(input: { name: string; description?: string; spec?: DashboardSpec }) {
    const { data } = await api.post<DashboardRecord>('/visualize/dashboards/', input);
    return data;
  }
  async autoDashboard(datasetId: string, name?: string) {
    const { data } = await api.post<DashboardRecord>('/visualize/dashboards/auto/', { datasetId, name: name ?? '' }, SLOW);
    return data;
  }
  async updateDashboard(
    id: string,
    patch: Partial<Pick<DashboardRecord, 'name' | 'description' | 'spec' | 'thumbnail' | 'isShared' | 'version'>>,
    options: { force?: boolean } = {},
  ) {
    const { data } = await api.patch<DashboardRecord>(`/visualize/dashboards/${id}/`, patch, options.force ? { params: { force: 1 } } : undefined);
    return data;
  }
  async duplicateDashboard(id: string) {
    const { data } = await api.post<DashboardRecord>(`/visualize/dashboards/${id}/duplicate/`, {});
    return data;
  }
  async deleteDashboard(id: string) {
    await api.delete(`/visualize/dashboards/${id}/`);
  }
  async dashboardVersions(id: string) {
    const { data } = await api.get<DashboardVersionInfo[]>(`/visualize/dashboards/${id}/versions/`);
    return data;
  }
  async saveDashboardVersion(id: string, name: string) {
    const { data } = await api.post<DashboardVersionInfo>(`/visualize/dashboards/${id}/versions/`, { name });
    return data;
  }
  async restoreDashboardVersion(id: string, number: number) {
    const { data } = await api.post<DashboardRecord>(`/visualize/dashboards/${id}/versions/${number}/restore/`, {});
    return data;
  }
  async personalView(id: string) {
    const response = await api.get<DashboardPersonalView | ''>(`/visualize/dashboards/${id}/personal-view/`);
    return response.status === 204 || !response.data ? null : response.data;
  }
  async savePersonalView(id: string, state: DashboardPersonalView['state']) {
    const { data } = await api.put<DashboardPersonalView>(`/visualize/dashboards/${id}/personal-view/`, { state });
    return data;
  }
  async resetPersonalView(id: string) {
    await api.delete(`/visualize/dashboards/${id}/personal-view/`);
  }
  async builtInThemes() {
    const { data } = await api.get<{ themes: DashboardTheme[]; default: string }>('/visualize/themes/builtin/');
    return data;
  }
  async listThemes() {
    const { data } = await api.get<SavedTheme[] | { results: SavedTheme[] }>('/visualize/themes/');
    return Array.isArray(data) ? data : data.results;
  }
  async saveTheme(input: { id?: string; name: string; spec: DashboardTheme; isShared?: boolean }) {
    const { id, ...body } = input;
    const { data } = id ? await api.patch<SavedTheme>(`/visualize/themes/${id}/`, body) : await api.post<SavedTheme>('/visualize/themes/', body);
    return data;
  }
  async deleteTheme(id: string) {
    await api.delete(`/visualize/themes/${id}/`);
  }
  async renderVisuals(input: RenderVisualsInput, signal?: AbortSignal) {
    const { data } = await api.post<VisualsResponse>('/visualize/visuals/', input, { ...SLOW, signal });
    return data;
  }
}

export function createApiRepositories(): Repositories {
  return {
    auth: new ApiAuthRepository(),
    account: new ApiAccountRepository(),
    chat: new ApiChatRepository(),
    history: new ApiHistoryRepository(),
    billing: new ApiBillingRepository(),
    images: new ApiImageRepository(),
    files: new ApiFilesRepository(),
    documents: new ApiDocumentsRepository(),
    integrations: new ApiIntegrationRepository(),
    knowledge: new ApiKnowledgeRepository(),
    analytics: new ApiAnalyticsRepository(),
    visualize: new ApiVisualizeRepository(),
  };
}

export { apiErrorMessage };
