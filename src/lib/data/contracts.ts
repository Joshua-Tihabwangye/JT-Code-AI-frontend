// Repository contracts. Every page/feature must consume these interfaces
// instead of importing Axios/Supabase directly. Swapping mock -> api is then a
// configuration change (see `factory.ts`), not a page rewrite.

import type {
  Account,
  AccountUpdate,
  Attachment,
  ChatMessage,
  Conversation,
  CreditCategory,
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
  PaymentMethod,
  Plan,
  PlanSlug,
  Subscription,
  Usage,
  Wallet,
  AppDocument,
  PasswordChange,
  AnalysisRun,
  AnalysisTransform,
  ChartKind,
  Dataset,
  DatasetProfile,
  Visualization,
  SavedChart,
  VizAssistantAnswer,
  VizCatalog,
  VizCellEdit,
  VizFields,
  VizInsight,
  VizOptions,
  VizPrediction,
  VizPreview,
  VizQualityReport,
  VizRecommendation,
  VizRenderResult,
  VizStyle,
  DashboardFilter,
  DashboardPersonalView,
  DashboardRecord,
  DashboardSpec,
  DashboardTheme,
  DashboardVersionInfo,
  DashboardVisual,
  VisualsResponse,
} from './types';

export interface AuthSession {
  accessToken: string;
  userId: string;
  issuedAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface SignUpInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  contact: string;
  countryCode: string;
  countryName: string;
  dialCode: string;
  timezone: string;
}

export interface AuthRepository {
  signUp(input: SignUpInput): Promise<{ user: AuthUser; session: AuthSession }>;
  signInWithPassword(email: string, password: string): Promise<{ user: AuthUser; session: AuthSession }>;
  signInWithOAuth(provider: 'google' | 'apple'): Promise<{ user: AuthUser; session: AuthSession }>;
  signOut(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
  getUser(): Promise<AuthUser | null>;
  resetPasswordForEmail(email: string): Promise<void>;
  resetPassword(code: string, newPassword: string): Promise<void>;
  onChange(listener: (session: AuthSession | null) => void): () => void;
}

export interface AccountRepository {
  getAccount(): Promise<Account>;
  updateAccount(update: AccountUpdate): Promise<Account>;
  changePassword(change: PasswordChange): Promise<void>;
  uploadAvatar(file: File): Promise<Account>;
  removeAvatar(): Promise<Account>;
  deleteAccount(): Promise<void>;
}

export interface SendMessageOptions {
  conversationId: string;
  content: string;
  model: string;
  attachments?: Attachment[];
  /** Next piece of the assistant reply as it streams in. */
  onToken?: (token: string) => void;
  /** Server-side request status (queued, running, completed, failed, cancelled). */
  onStatus?: (status: string) => void;
  signal?: AbortSignal;
}

export interface ChatRepository {
  listConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  createConversation(title?: string, model?: string): Promise<Conversation>;
  renameConversation(id: string, title: string): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;
  pinConversation(id: string, pinned: boolean): Promise<Conversation>;
  archiveConversation(id: string, archived: boolean): Promise<Conversation>;
  exportConversation(id: string, format: 'markdown' | 'json'): Promise<string>;
  getMessages(id: string): Promise<ChatMessage[]>;
  sendMessage(options: SendMessageOptions): Promise<ChatMessage>;
  cancelGeneration(conversationId: string): void;
  consumeCredits(category: CreditCategory, amount: number): Promise<void>;
}

export interface HistoryFilter {
  search?: string;
  pinnedOnly?: boolean;
  archivedOnly?: boolean;
  withFilesOnly?: boolean;
}

export interface HistoryRepository {
  list(filter?: HistoryFilter): Promise<Conversation[]>;
  open(id: string): Promise<Conversation | null>;
  rename(id: string, title: string): Promise<Conversation>;
  pin(id: string, pinned: boolean): Promise<Conversation>;
  archive(id: string, archived: boolean): Promise<Conversation>;
  delete(id: string): Promise<void>;
  bulkDelete(ids: string[]): Promise<void>;
  clearAll(): Promise<void>;
  export(id: string, format: 'markdown' | 'json'): Promise<string>;
}

export interface BillingRepository {
  getPlans(): Promise<Plan[]>;
  getSubscription(): Promise<Subscription | null>;
  getWallet(): Promise<Wallet>;
  getUsage(): Promise<Usage>;
  /** Starts a card payment for credits (Stripe PaymentIntent, confirmed with Stripe.js). */
  topup(amountUsd: number): Promise<TopupIntent>;
  /** Stripe Checkout session for a plan; the browser is sent to `checkoutUrl`. */
  createCheckout(planSlug: PlanSlug, interval: 'month' | 'year'): Promise<{ checkoutUrl: string }>;
  cancelSubscription(): Promise<Subscription | null>;
  reactivate(): Promise<Subscription | null>;
  /** Stripe Billing Portal (payment methods, invoices); the browser is sent to the URL. */
  openBillingPortal(): Promise<string>;
  getPaymentMethod(): Promise<PaymentMethod | null>;
  setAutoRecharge(enabled: boolean, threshold: number): Promise<Wallet>;
  setSpendingLimit(limit: number | null): Promise<Wallet>;
  listInvoices(): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | null>;
  downloadInvoice(id: string): Promise<Blob>;
  consumeCredits(category: CreditCategory, amount: number): Promise<Usage>;
}

export interface TopupIntent {
  clientSecret: string;
  paymentIntentId: string;
  credits: number;
  publishableKey: string;
}

export interface GenerateImageOptions {
  prompt: string;
  negativePrompt?: string;
  model: ImageModel;
  aspectRatio: string;
  style: string;
  seed?: number;
  imageCount: number;
  referenceImageRef?: string;
  referenceStrength?: number;
  compositionStrength?: number;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

export interface ImageRepository {
  listModels(): Promise<{ id: ImageModel; label: string }[]>;
  generate(options: GenerateImageOptions): Promise<ImageGeneration>;
  edit(options: GenerateImageOptions & { instruction: string }): Promise<ImageGeneration>;
  understand(imageRef: string, question: string): Promise<string>;
  listGenerations(): Promise<ImageGeneration[]>;
  getGeneration(id: string): Promise<ImageGeneration | null>;
  deleteGeneration(id: string): Promise<void>;
  toggleFavorite(id: string, favorite: boolean): Promise<ImageGeneration>;
  saveToFiles(id: string): Promise<FileItem>;
  consumeCredits(amount: number): Promise<void>;
}

export interface UploadOptions {
  file: File;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export interface FilesRepository {
  list(): Promise<FileItem[]>;
  get(id: string): Promise<FileItem | null>;
  upload(options: UploadOptions): Promise<FileItem>;
  rename(id: string, name: string): Promise<FileItem>;
  delete(id: string): Promise<void>;
  bulkDelete(ids: string[]): Promise<void>;
  download(id: string): Promise<Blob>;
  attachToChat(id: string, conversationId: string): Promise<FileItem>;
}

export interface CreateDocumentInput {
  title: string;
  template: string;
  content?: string;
}

export interface DocumentsRepository {
  list(): Promise<AppDocument[]>;
  get(id: string): Promise<AppDocument | null>;
  create(input: CreateDocumentInput): Promise<AppDocument>;
  update(id: string, content: string): Promise<AppDocument>;
  rename(id: string, title: string): Promise<AppDocument>;
  duplicate(id: string): Promise<AppDocument>;
  delete(id: string): Promise<void>;
  addVersion(id: string): Promise<AppDocument>;
  exportMarkdown(id: string): Promise<string>;
  exportPdf(id: string): Promise<Blob>;
  saveToFiles(id: string): Promise<FileItem>;
}

export interface ConnectIntegrationInput {
  key: IntegrationKey;
  displayName?: string;
  config?: Record<string, unknown>;
}

export interface IntegrationRepository {
  list(): Promise<Integration[]>;
  connect(input: ConnectIntegrationInput): Promise<Integration>;
  disconnect(id: string): Promise<void>;
  configure(id: string, displayName: string, config: Record<string, unknown>): Promise<Integration>;
  test(id: string): Promise<{ ok: boolean; message: string }>;
  reconnect(id: string): Promise<Integration>;
}

export interface AddSourceInput {
  collectionId: string;
  type: KnowledgeSourceType;
  name: string;
  config?: Record<string, unknown>;
}

export interface KnowledgeRepository {
  listCollections(): Promise<KnowledgeCollection[]>;
  getCollection(id: string): Promise<KnowledgeCollection | null>;
  createCollection(name: string, description?: string): Promise<KnowledgeCollection>;
  renameCollection(id: string, name: string): Promise<KnowledgeCollection>;
  deleteCollection(id: string): Promise<void>;
  addSource(input: AddSourceInput): Promise<KnowledgeCollection>;
  removeSource(collectionId: string, sourceId: string): Promise<KnowledgeCollection>;
  syncSource(collectionId: string, sourceId: string): Promise<KnowledgeSource>;
  search(collectionId: string, query: string): Promise<KnowledgeSearchResult[]>;
  query(collectionId: string, query: string): Promise<string>;
}

export interface CreateDatasetInput {
  name: string;
  /** CSV text (inline, up to 5 MB) or an uploaded CSV file (up to 25 MB). */
  csv?: string;
  file?: File;
  isShared?: boolean;
}

export interface CreateVisualizationInput {
  runId: string;
  kind: ChartKind;
  xColumn: string;
  yColumn?: string;
  colorColumn?: string;
  title?: string;
}

export interface AnalyticsRepository {
  listDatasets(): Promise<Dataset[]>;
  createDataset(input: CreateDatasetInput): Promise<Dataset>;
  deleteDataset(id: string): Promise<void>;
  listRuns(datasetId?: string): Promise<AnalysisRun[]>;
  getRun(id: string): Promise<AnalysisRun>;
  createRun(datasetId: string, transform: AnalysisTransform): Promise<AnalysisRun>;
  retryRun(id: string): Promise<AnalysisRun>;
  deleteRun(id: string): Promise<void>;
  downloadRun(id: string): Promise<Blob>;
  listVisualizations(runId?: string): Promise<Visualization[]>;
  getVisualization(id: string): Promise<Visualization>;
  createVisualization(input: CreateVisualizationInput): Promise<Visualization>;
  deleteVisualization(id: string): Promise<void>;
}

export interface VizRenderInput {
  datasetId: string;
  chartType: string;
  fields: VizFields;
  options?: VizOptions;
  style?: VizStyle;
}

/** Excel exports: values only, or values with a native Excel chart beside each chart's data. */
export interface VizExcelOptions {
  graphs?: boolean;
}

export interface VizWorkbookInput {
  title?: string;
  graphs: boolean;
  charts: (VizRenderInput & { title?: string })[];
}

export interface VizPredictInput {
  datasetId: string;
  task: string;
  model?: string;
  fields: VizFields;
  options?: VizOptions;
  style?: VizStyle;
}

/** Cleaning steps plus the shared declarative transform (validated server-side). */
export interface VizOrganizeSteps {
  clean?: {
    drop_columns?: string[];
    rename?: Record<string, string>;
    cast?: Record<string, 'number' | 'date' | 'text'>;
    fill_missing?: Record<string, { strategy: 'mean' | 'median' | 'mode' | 'zero' | 'forward' | 'value'; value?: string }>;
    drop_missing?: 'any' | string[];
    dedupe?: boolean;
    trim_text?: boolean;
    date_parts?: Record<string, string[]>;
  };
  transform?: AnalysisTransform;
}

export type SaveChartInput =
  | (VizRenderInput & { title?: string; description?: string; isShared?: boolean })
  | { resultId: string; chartIndex: number; title?: string; description?: string; isShared?: boolean };

export interface VisualizeRepository {
  catalog(): Promise<VizCatalog>;
  createSample(sampleId: string, name?: string): Promise<Dataset>;
  importFile(file: File, options?: { name?: string; format?: string; sheet?: string }): Promise<Dataset>;
  preview(datasetId: string, offset?: number, rows?: number, quality?: { issues?: boolean; filter?: string }): Promise<VizPreview>;
  quality(datasetId: string): Promise<VizQualityReport>;
  editDataset(datasetId: string, edits: VizCellEdit[], deleteRows?: number[]): Promise<Dataset>;
  replaceDataset(datasetId: string, file: File): Promise<Dataset>;
  updateDataset(datasetId: string, patch: { name?: string; isShared?: boolean }): Promise<Dataset>;
  worldMap(): Promise<Record<string, unknown>>;
  insights(datasetId: string): Promise<{ insights: VizInsight[]; recommendations: VizRecommendation[] }>;
  suggestFields(datasetId: string, chartType: string): Promise<VizFields>;
  organizePreview(datasetId: string, steps: VizOrganizeSteps): Promise<{ profile: DatasetProfile; preview: Record<string, unknown>[] }>;
  organizeSave(datasetId: string, steps: VizOrganizeSteps, name: string): Promise<Dataset>;
  exportDataset(datasetId: string, type: 'csv' | 'xlsx' | 'json', excel?: VizExcelOptions): Promise<Blob>;
  workbook(input: VizWorkbookInput): Promise<Blob>;
  render(input: VizRenderInput): Promise<VizRenderResult>;
  predict(input: VizPredictInput): Promise<VizPrediction>;
  downloadPrediction(resultId: string, type?: 'csv' | 'xlsx', excel?: VizExcelOptions): Promise<Blob>;
  savePrediction(resultId: string, name?: string): Promise<Dataset>;
  ask(input: { prompt: string; datasetId?: string; context?: Record<string, unknown> }): Promise<VizAssistantAnswer>;
  listCharts(): Promise<SavedChart[]>;
  getChart(id: string): Promise<SavedChart>;
  saveChart(input: SaveChartInput): Promise<SavedChart>;
  updateChart(id: string, patch: Partial<Pick<SavedChart, 'title' | 'description' | 'isShared'>>): Promise<SavedChart>;
  deleteChart(id: string): Promise<void>;
  exportChart(id: string, type: 'html' | 'json'): Promise<Blob>;
  // Dashboards: Python builds every visual from aggregated data; the browser displays it.
  listDashboards(): Promise<DashboardRecord[]>;
  getDashboard(id: string): Promise<DashboardRecord>;
  createDashboard(input: { name: string; description?: string; spec?: DashboardSpec }): Promise<DashboardRecord>;
  autoDashboard(datasetId: string, name?: string): Promise<DashboardRecord>;
  updateDashboard(id: string, patch: Partial<Pick<DashboardRecord, 'name' | 'description' | 'spec' | 'thumbnail' | 'isShared' | 'version'>>, options?: { force?: boolean }): Promise<DashboardRecord>;
  duplicateDashboard(id: string): Promise<DashboardRecord>;
  deleteDashboard(id: string): Promise<void>;
  dashboardVersions(id: string): Promise<DashboardVersionInfo[]>;
  saveDashboardVersion(id: string, name: string): Promise<DashboardVersionInfo>;
  restoreDashboardVersion(id: string, number: number): Promise<DashboardRecord>;
  personalView(id: string): Promise<DashboardPersonalView | null>;
  savePersonalView(id: string, state: DashboardPersonalView['state']): Promise<DashboardPersonalView>;
  resetPersonalView(id: string): Promise<void>;
  builtInThemes(): Promise<{ themes: DashboardTheme[]; default: string }>;
  renderVisuals(input: { visuals: DashboardVisual[]; filters?: DashboardFilter[]; theme?: string | DashboardTheme; mode: 'light' | 'dark'; today?: string; dashboardId?: string }, signal?: AbortSignal): Promise<VisualsResponse>;
}

export interface Repositories {
  auth: AuthRepository;
  account: AccountRepository;
  chat: ChatRepository;
  history: HistoryRepository;
  billing: BillingRepository;
  images: ImageRepository;
  files: FilesRepository;
  documents: DocumentsRepository;
  integrations: IntegrationRepository;
  knowledge: KnowledgeRepository;
  analytics: AnalyticsRepository;
  visualize: VisualizeRepository;
}
