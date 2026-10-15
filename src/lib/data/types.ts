// Core domain model shared across all repositories and pages.
// Page components depend only on these types and the repository contracts,
// never on transport details (Axios / Supabase / IndexedDB).

export type DataMode = 'mock' | 'api';

export type PlanSlug = 'free' | 'pro' | 'team' | 'business';

export type CreditCategory = 'chat' | 'images' | 'documents' | 'agent';

export interface Account {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  contact: string;
  countryCode: string;
  countryName: string;
  dialCode: string;
  timezone: string;
  avatarUrl: string | null;
  createdAt: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  plan: PlanSlug;
}

export interface AccountUpdate {
  firstName?: string;
  lastName?: string;
  email?: string;
  contact?: string;
  countryCode?: string;
  countryName?: string;
  dialCode?: string;
  timezone?: string;
}

export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface Plan {
  id: string;
  name: string;
  slug: PlanSlug;
  priceCents: number;
  currency: string;
  interval: 'month' | 'year';
  monthlyCredits: number;
  isPopular: boolean;
  description: string;
  features: string[];
}

export type SubscriptionStatus = 'active' | 'canceled' | 'trialing' | 'past_due';

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  plan: PlanSlug;
  planName: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  isActive: boolean;
  daysRemaining: number;
}

export interface Wallet {
  id: string;
  balance: number;
  reservedBalance: number;
  currency: string;
  creditValueUsd: number;
  autoTopupEnabled: boolean;
  autoTopupThreshold: number;
  monthlySpendingLimit: number | null;
}

export interface UsageByType {
  chat: number;
  images: number;
  documents: number;
  agent: number;
}

export interface Usage {
  totalCredits: number;
  byType: UsageByType;
}

export type InvoiceStatus = 'paid' | 'open' | 'void' | 'uncollectible';

export interface Invoice {
  id: string;
  number: string;
  date: string;
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  description: string;
}

export interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  name: string;
}

export type ChatRole = 'user' | 'assistant' | 'system';

export type AttachmentKind = 'image' | 'document' | 'file';

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  size: number;
  // In mock mode this is an IndexedDB blob key; in api mode a URL.
  ref: string;
  previewUrl?: string;
}

export type MessageStatus = 'streaming' | 'complete' | 'error' | 'canceled';

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  model?: string;
  status: MessageStatus;
  attachments?: Attachment[];
}

export interface Conversation {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  model: string;
  updatedAt: string;
  createdAt: string;
  pinned: boolean;
  archived: boolean;
  hasAttachments: boolean;
}

export type ImageModel = 'auto' | 'dall-e-3' | 'stable-diffusion' | 'imagen';

export interface ImageAsset {
  id: string;
  url: string;
  width: number;
  height: number;
  blobKey?: string;
}

export interface ImageGeneration {
  id: string;
  prompt: string;
  negativePrompt?: string;
  model: ImageModel;
  aspectRatio: string;
  style: string;
  seed?: number;
  imageCount: number;
  createdAt: string;
  images: ImageAsset[];
  favorite: boolean;
  mode: 'generate' | 'edit' | 'understand';
}

export interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  blobKey: string;
  createdAt: string;
  updatedAt: string;
  usedIn: string[];
}

export interface DocumentVersion {
  id: string;
  version: number;
  content: string;
  createdAt: string;
}

export interface AppDocument {
  id: string;
  title: string;
  template: string;
  content: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  versions: DocumentVersion[];
}

export type IntegrationKey = 'github' | 'google_drive' | 'slack' | 'notion';

export type IntegrationStatus = 'connected' | 'error' | 'syncing' | 'disconnected';

export interface Integration {
  id: string;
  key: IntegrationKey;
  name: string;
  displayName: string;
  connected: boolean;
  status: IntegrationStatus;
  lastSync: string | null;
  permissions: string[];
  config: Record<string, unknown>;
}

export type KnowledgeSourceType = 'file' | 'integration' | 'text';

export type KnowledgeSourceStatus = 'pending' | 'indexing' | 'indexed' | 'error';

export interface KnowledgeSource {
  id: string;
  collectionId: string;
  type: KnowledgeSourceType;
  name: string;
  status: KnowledgeSourceStatus;
  chunkCount: number;
  docCount: number;
  lastSync: string | null;
  config: Record<string, unknown>;
}

export interface KnowledgeCollection {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  sources: KnowledgeSource[];
}

export interface KnowledgeSearchResult {
  sourceId: string;
  collectionId: string;
  text: string;
  score: number;
}

// --- Data analytics (backend: /analysis/datasets|runs, /visualizations) ---------------------

export type ColumnKind = 'numeric' | 'datetime' | 'categorical' | 'boolean' | 'text';

export interface ColumnProfile {
  name: string;
  dtype: string;
  kind: ColumnKind;
  nulls: number;
  nullRatio: number;
  distinct: number;
  min?: number | string | null;
  max?: number | string | null;
  mean?: number | null;
  std?: number | null;
  median?: number | null;
  topValues?: { value: string; count: number }[];
  /** Numeric columns: counts in 12 equal-width bins (profile sparkline). */
  histogram?: number[];
  trueCount?: number;
}

export interface DatasetProfile {
  rows?: number;
  column_count?: number;
  columns?: string[];
  columnProfiles?: ColumnProfile[];
}

export interface Dataset {
  id: string;
  name: string;
  mimeType: string;
  sourceType: 'asset' | 'inline';
  columns: string[];
  dtypes: Record<string, string>;
  profile: DatasetProfile;
  rowCount: number | null;
  byteSize: number;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AnalysisStatus = 'queued' | 'running' | 'completed' | 'failed';
export type FilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
export type AggregateOp = 'count' | 'sum' | 'mean' | 'min' | 'max';

/** The backend's declarative transform language (no code is ever evaluated). */
export interface AnalysisTransform {
  filters?: { column: string; operator: FilterOperator; value: string | number | (string | number)[] }[];
  group_by?: string[];
  aggregate?: AggregateOp | Record<string, AggregateOp>;
  select?: string[];
  sort?: { column: string; direction: 'asc' | 'desc' }[];
  limit?: number;
}

export interface AnalysisRun {
  id: string;
  datasetId: string;
  status: AnalysisStatus;
  transform: AnalysisTransform;
  columns: string[];
  rowCount: number | null;
  preview: Record<string, unknown>[];
  profile: DatasetProfile;
  downloadUrl: string | null;
  errorMessage: string;
  createdAt: string;
  completedAt: string | null;
}

export type ChartKind = 'bar' | 'line' | 'scatter' | 'histogram' | 'area' | 'box' | 'pie';
export type VisualizationStatus = 'queued' | 'running' | 'ready' | 'failed';

export interface Visualization {
  id: string;
  runId: string;
  kind: ChartKind;
  xColumn: string;
  yColumn: string;
  colorColumn: string;
  title: string;
  status: VisualizationStatus;
  imageUrl: string | null;
  specUrl: string | null;
  errorMessage: string;
  createdAt: string;
}

// --- Data visualization tool (backend: /visualize/*) -----------------------------------------

export type VizSlotKind = 'any' | 'numeric' | 'categorical' | 'datetime' | 'dimension';

export interface VizSlot {
  key: string;
  label: string;
  kind: VizSlotKind;
  required: boolean;
  multiple: boolean;
  help: string;
}

export interface VizOption {
  key: string;
  label: string;
  type: 'select' | 'boolean' | 'number';
  default: string | number | boolean;
  choices: [string, string][];
  minimum: number | null;
  maximum: number | null;
}

export interface VizChartType {
  id: string;
  name: string;
  category: string;
  description: string;
  slots: VizSlot[];
  options: VizOption[];
  tags: string[];
  level: 'essential' | 'advanced';
  /** One sentence on how to read the chart. */
  howToRead: string;
}

export interface VizCategory {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
}

export interface VizPalette {
  id: string;
  name: string;
  colors: string[];
  sequential: string[];
}

export interface VizPredictionTask {
  id: string;
  name: string;
  description: string;
  slots: VizSlot[];
  models: [string, string][];
  options: VizOption[];
  outputs: string[];
}

export interface VizSample {
  id: string;
  name: string;
  description: string;
  audience: string;
}

export interface VizCatalog {
  version: number;
  categories: VizCategory[];
  charts: VizChartType[];
  palettes: VizPalette[];
  themes: ('light' | 'dark')[];
  predictionTasks: VizPredictionTask[];
  importFormats: { id: string; name: string; extensions: string }[];
  exportFormats: { id: string; name: string }[];
  samples: VizSample[];
  limits: { maxUploadBytes: number; maxRows: number; maxColumns: number; maxChartPoints: number };
}

/**
 * An Apache ECharts option built by the server. It is plain JSON: the few callbacks
 * ECharts needs are `{"$fn": name}` markers replaced client-side (see visualize/hydrate.ts).
 */
export type ChartOption = Record<string, unknown> & { series?: Record<string, unknown>[] };

/** The data a chart shows, organized as a table (computed server-side). */
export interface ChartTable {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  truncated: boolean;
}

/** What a chart shows, how to read it and the key takeaway (all computed without AI). */
export interface ChartExplanation {
  about: string;
  howToRead: string;
  insight: string;
}

export type VizFields = Record<string, string | string[]>;
export type VizOptions = Record<string, string | number | boolean>;

export interface VizStyle {
  palette?: string;
  theme?: 'light' | 'dark';
  title?: string;
  xTitle?: string;
  yTitle?: string;
  showLegend?: boolean;
  /** Custom series colours (hex); they take precedence over the palette. */
  colors?: string[];
  /** Maximum number of lines / series per chart; smaller groups are combined as “Other”. */
  maxSeries?: number;
}

export interface VizStat {
  label: string;
  value: string | number;
  format: 'number' | 'integer' | 'percent' | 'percent_value' | 'text';
}

export interface VizRenderResult {
  option: ChartOption;
  renderer: 'echarts';
  /** Needs echarts-gl (3D charts). */
  gl: boolean;
  /** Needs a registered map (choropleth / geo charts). */
  map: 'world' | null;
  explanation: ChartExplanation;
  table: ChartTable;
  title: string;
  chartType: string;
  fields: VizFields;
  options: VizOptions;
  notes: string[];
  stats: VizStat[];
  rows: number;
  sampled: boolean;
}

export interface VizPreview {
  datasetId: string;
  name: string;
  profile: DatasetProfile;
  rows: Record<string, unknown>[];
  /** 0-based positions of `rows` in the dataset (stable for editing). */
  rowNumbers: number[];
  offset: number;
  /** Rows matching the current filter. */
  total: number;
  datasetRows: number;
  /** Issue types per cell for this page: row → column (or "*" for the whole row) → types. */
  flags?: Record<string, Record<string, string[]>>;
}

export type VizIssueSeverity = 'error' | 'warning' | 'info';

export interface VizIssue {
  id: string;
  type: string;
  label: string;
  color: string;
  severity: VizIssueSeverity;
  column: string | null;
  count: number;
  rows: number[];
  detail: string;
  suggestion: string;
  examples: string[];
}

export interface VizQualityReport {
  datasetId: string;
  summary: { rows: number; columns: number; issues: number; affectedRows: number; flaggedCells: number; score: number };
  types: { type: string; label: string; color: string; severity: VizIssueSeverity; count: number }[];
  issues: VizIssue[];
}

export interface VizCellEdit {
  row: number;
  column: string;
  value: string | null;
}

export interface VizChartSuggestion {
  chartType: string;
  fields: VizFields;
  options?: VizOptions;
}

export interface VizInsight {
  id: string;
  kind: string;
  severity: 'info' | 'positive' | 'warning';
  title: string;
  detail: string;
  chart?: VizChartSuggestion;
  /** Compact card: ≤ 6 words and one number (the sentence stays in title/detail). */
  headline?: string;
  value?: string;
}

export interface VizRecommendation extends VizChartSuggestion {
  name: string;
  category: string;
  reason: string;
}

export type VizQuality = 'excellent' | 'good' | 'fair' | 'weak' | 'unknown';

export interface VizMetric {
  key: string;
  label: string;
  value: number | string | null;
  format: 'number' | 'integer' | 'percent' | 'percent_value';
  quality?: VizQuality;
  help: string;
}

export interface VizPrediction {
  task: string;
  model: string;
  modelName: string;
  fields: VizFields;
  options: VizOptions;
  metrics: VizMetric[];
  charts: { id: string; title: string; option: ChartOption; explanation: ChartExplanation; table: ChartTable }[];
  table: { columns: string[]; rows: Record<string, unknown>[] };
  summary: string[];
  notes: string[];
  comparison: { model: string; name: string; score: number }[];
  resultId: string;
  datasetId: string;
  resultRows: number;
}

export type VizAssistantAction =
  | { kind: 'chart'; chartType: string; fields: VizFields; options: VizOptions; title: string }
  | { kind: 'predict'; task: string; fields: VizFields; model: string; options: VizOptions };

export interface VizAssistantAnswer {
  reply: string;
  action: VizAssistantAction | null;
  notes: string[];
  source: 'ai' | 'heuristic';
  usage: { credits: string; inputTokens?: number; outputTokens?: number; model?: string };
}

export interface SavedChart {
  id: string;
  title: string;
  description: string;
  chartType: string;
  datasetId: string | null;
  datasetName: string;
  config: { fields?: VizFields; options?: VizOptions; style?: VizStyle; prediction?: string; visual?: DashboardVisual };
  option: ChartOption | null;
  explanation: Partial<ChartExplanation>;
  stats: VizStat[];
  notes: string[];
  isShared: boolean;
  ownerId: number;
  createdAt: string;
  updatedAt: string;
}

// --- Dashboards --------------------------------------------------------------------------------

export type DashboardVisualType =
  | 'card'
  | 'multi_card'
  | 'kpi'
  | 'gauge'
  | 'bar'
  | 'column'
  | 'line'
  | 'area'
  | 'combo'
  | 'donut'
  | 'pie'
  | 'treemap'
  | 'funnel'
  | 'waterfall'
  | 'scatter'
  | 'map'
  | 'table'
  | 'matrix'
  | 'slicer'
  | 'text'
  | 'chart'
  | 'python'
  | 'parameter'
  | 'button'
  | 'navigator'
  | 'snapshot';

export type DashboardWell =
  | 'category'
  | 'values'
  | 'legend'
  | 'secondaryValues'
  | 'target'
  | 'size'
  | 'details'
  | 'tooltips'
  | 'rows'
  | 'columns'
  | 'smallMultiples';

export interface DashboardFieldRef {
  field: string;
  grain?: 'year' | 'quarter' | 'month' | 'week' | 'day';
  agg?: string;
  showValueAs?: string;
  label?: string;
  /** Bound to a field parameter: the viewer's choice replaces this field. */
  param?: string;
  /** A calculated measure (``spec.calculations``) by id; ``expr`` is filled in when rendering. */
  calc?: string;
  expr?: string;
  format?: 'number' | 'percent' | 'currency';
  /** Moving average window (show value as → moving average). */
  window?: number;
}

export interface DashboardCalculation {
  id: string;
  name: string;
  expression: string;
  format?: 'number' | 'percent' | 'currency';
  datasetId?: string;
}

export type DashboardParameter =
  | { id: string; name: string; kind: 'whatif'; min: number; max: number; step: number; default: number; format?: 'number' | 'percent' | 'currency' }
  | { id: string; name: string; kind: 'fields'; role: 'measure' | 'dimension'; options: DashboardFieldRef[]; default: number };

export interface DashboardBookmarkState {
  slicers?: Record<string, unknown>;
  overrides?: Record<string, DashboardFilter | null>;
  drill?: Record<string, unknown>;
  parameters?: Record<string, number>;
  /** Visuals of the page hidden by this view (buttons and bookmarks toggle visibility). */
  hidden?: string[];
}

export interface DashboardRelationship {
  from: { datasetId: string; field: string };
  to: { datasetId: string; field: string };
}

/** A saved calculation in the organization's measures library. */
export interface DashboardMeasure {
  id: string;
  name: string;
  expression: string;
  format: 'number' | 'percent' | 'currency';
  description?: string;
  datasetId?: string | null;
  ownerId?: string;
}

export interface DashboardBookmark {
  id: string;
  name: string;
  pageId: string;
  state: DashboardBookmarkState;
}

export interface DashboardFilter {
  field: string;
  op: string;
  value?: unknown;
  datasetId?: string;
  id?: string;
  label?: string;
  locked?: boolean;
  hidden?: boolean;
}

export interface DashboardVisual {
  id: string;
  type: DashboardVisualType;
  title?: string;
  layout: { x: number; y: number; w: number; h: number; z?: number };
  data: { datasetId: string; wells: Partial<Record<DashboardWell, DashboardFieldRef[]>>; filters?: DashboardFilter[]; highlight?: DashboardFilter[] };
  format?: Record<string, Record<string, unknown> | undefined>;
  interactions?: Record<string, 'filter' | 'highlight' | 'none'>;
  hidden?: boolean;
  locked?: boolean;
  allowPersonalize?: boolean;
  groupId?: string;
  text?: string;
  altText?: string;
}

export interface DashboardPage {
  id: string;
  name: string;
  hidden?: boolean;
  type?: 'page' | 'tooltip' | 'drillthrough';
  canvas?: { preset?: string; width?: number; height?: number; background?: string };
  filters?: DashboardFilter[];
  /** Drill-through pages: clicking a member of one of these fields elsewhere can open this page. */
  drillthroughFields?: string[];
  visuals: DashboardVisual[];
  /** Phone layout: visuals in one column, in order, each with its own height in grid rows. */
  mobileLayout?: { visualId: string; y: number; h: number }[];
}

export interface DashboardThemeColors {
  canvas: string;
  tile: string;
  border: string;
  gridline: string;
  text: string;
  mutedText: string;
  accent: string;
}

export interface DashboardTheme {
  id: string;
  name: string;
  dataColors: string[];
  good: string;
  neutral: string;
  bad: string;
  light: DashboardThemeColors;
  dark: DashboardThemeColors;
  fontFamily: string;
  radius: number;
  shadow: 'none' | 'soft' | 'medium';
  kpiStyle: 'plain' | 'solid' | 'gradient' | 'outlined' | 'icon';
  density: 'compact' | 'comfortable';
}

export interface DashboardSpec {
  version?: number;
  theme: string | DashboardTheme;
  mode: 'light' | 'dark' | 'system';
  density?: 'compact' | 'comfortable';
  settings?: { allowPersonalize?: boolean; showFiltersPane?: boolean; lockFilters?: boolean; defaultPageId?: string; applyMode?: 'instant' | 'button' };
  filters?: DashboardFilter[];
  parameters?: DashboardParameter[];
  calculations?: DashboardCalculation[];
  bookmarks?: DashboardBookmark[];
  syncGroups?: Record<string, unknown>[];
  /** Links between datasets so slicers filter across them. */
  relationships?: DashboardRelationship[];
  pages: DashboardPage[];
}

export interface DashboardRecord {
  id: string;
  name: string;
  description: string;
  spec?: DashboardSpec;
  thumbnail: string;
  isShared: boolean;
  version: number;
  ownerId: string;
  ownerName: string;
  role: 'owner' | 'editor' | 'viewer';
  createdAt: string;
  updatedAt: string;
  pages?: number;
  datasetIds?: string[];
}

export interface DashboardVersionInfo {
  number: number;
  name: string;
  createdAt: string;
  createdBy: string | null;
}

export interface DashboardPersonalView {
  id: string;
  name: string;
  state: {
    visualOverrides?: Record<string, Partial<DashboardVisual>>;
    slicers?: Record<string, unknown>;
    filters?: DashboardFilter[];
    pageId?: string;
    mode?: 'light' | 'dark' | 'system' | null;
    density?: 'compact' | 'comfortable' | null;
    bookmarks?: DashboardBookmark[];
    defaultBookmark?: string;
    parameters?: Record<string, number>;
  };
  isDefault: boolean;
  updatedAt: string;
}

export interface SavedTheme {
  id: string;
  name: string;
  spec: DashboardTheme;
  isShared: boolean;
  ownerId: string;
}

/** Conditional formatting of one value (Python decides; the browser paints). */
export interface CellStyle {
  bg?: string;
  color?: string;
  icon?: string;
  iconColor?: string;
  bar?: string;
}

export interface KpiData {
  /** Conditional formatting: the value's colour. */
  color?: string;
  label: string;
  value: number | null;
  display: string;
  delta?: { value: number; display: string; direction: 'up' | 'down' | 'flat'; good: boolean; label: string; period: string };
  sparkline?: number[];
  sparkLabels?: string[];
  target?: { value: number; display: string; progress: number; progressDisplay: string };
}

export interface SlicerData {
  field: string;
  label: string;
  options?: { value: string | number | boolean | null; label: string; count: number }[];
  range?: { min: number | string | null; max: number | string | null };
  truncated?: boolean;
  /** Hierarchy slicers: the level fields and the tree of members. */
  fields?: string[];
  tree?: SlicerNode[];
}

export interface SlicerNode {
  value: string | number | boolean | null;
  label: string;
  field: string;
  count: number;
  children: SlicerNode[];
}

export interface VisualTable {
  matrix?: boolean;
  columns: ({ key: string; label: string; align: 'left' | 'right'; percent?: boolean } | string)[];
  rows: Record<string, unknown>[];
  totals?: Record<string, number | null> | null;
  bars?: Record<string, number | null>;
  rowHeader?: string;
  columnTotals?: string[];
  grandTotal?: string;
  accent?: string;
  truncated?: boolean;
}

export interface VisualOutput {
  id: string;
  type: DashboardVisualType;
  status: 'ok' | 'empty' | 'error';
  message?: string;
  title?: string;
  option?: ChartOption;
  map?: string;
  kpi?: KpiData;
  cards?: { label: string; value: number | null; display: string; color?: string }[];
  table?: VisualTable;
  slicer?: SlicerData;
  data?: ChartTable;
  selectors?: { category?: (DashboardFilter | null)[]; series?: (DashboardFilter | null)[]; columns?: (DashboardFilter | null)[]; names?: string[] };
  notes?: string[];
  truncated?: boolean;
  /** Python visuals: what the script printed. */
  console?: string;
  /** A ≤ 15-word reading of the chart (who leads, or the change over time). */
  insight?: string | null;
}

export interface VisualsResponse {
  visuals: VisualOutput[];
  meta: { visuals: number; cachedVisuals: number; cachedQueries: number; sqlQueries: number; engineRuns: number; ms: number };
}
