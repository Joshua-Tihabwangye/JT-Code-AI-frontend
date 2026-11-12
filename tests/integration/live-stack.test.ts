/**
 * End-to-end contract between this React app and the real backend.
 *
 * Runs the app's own repository layer (src/lib/data/api) and auth helpers
 * against a live stack: Supabase Auth (GoTrue) + Django API + Celery worker +
 * Supabase Storage + Mailpit. Start it with `make docker-up` in jt-code-backend (or `make native-up` with JT_CODE_STACK=native),
 * then: `npm run test:integration`.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiRepositories } from '@/lib/data/api/repositories';
import { renderContext, resolveVisual } from '@/features/visualize/dashboards/customize';
import { apiErrorMessage, http } from '@/lib/api/http';
import { resetPasswordWithCode, supabase } from '@/lib/supabase';
import type { Repositories, VizFields } from '@/lib/data';

const repos: Repositories = createApiRepositories();
const runId = Date.now().toString(36);
const password = `Integration-${runId}-pass!`;
const userA = `int-a-${runId}@jt-code.local`;
const userB = `int-b-${runId}@jt-code.local`;
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025';
const BACKEND_DIR = resolve(process.env.JT_CODE_BACKEND_DIR ?? '../jt-code-backend');

// Browsers get Blob/stream responses from fetch/XHR; Node's default axios adapter
// returns Buffers. Use fetch here too so the repositories behave as in the app.
http.defaults.adapter = 'fetch';

/** `manage.py` of the stack under test: the Docker stack by default (its database is not the host's
 *  native one), or the native stack with JT_CODE_STACK=native. */
function manageCommand(): string[] {
  return process.env.JT_CODE_STACK === 'native' ? ['manage.py'] : ['scripts/local_manage.py', 'docker'];
}

/** Funds the test workspace: the free plan's 100 monthly credits are less than one image. */
async function grantCredits(email: string, credits = 5000) {
  const python = resolve(BACKEND_DIR, '.venv/bin/python');
  if (!existsSync(python)) throw new Error(`Backend checkout not found at ${BACKEND_DIR} (set JT_CODE_BACKEND_DIR).`);
  // Async on purpose: blocking the event loop lets pooled keep-alive sockets go stale.
  await promisify(execFile)(python, [...manageCommand(), 'grant_local_credits', email, '--credits', String(credits)], { cwd: BACKEND_DIR });
}

const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

async function waitFor<T>(load: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 90_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await load();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting; last value: ${JSON.stringify(value).slice(0, 400)}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function expectApiError(promise: Promise<unknown>, pattern: RegExp) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, 'expected the API call to fail').toBeDefined();
  expect(apiErrorMessage(caught)).toMatch(pattern);
}

/** Opens the sign-up confirmation link GoTrue mailed (the Docker stack does not auto-confirm), as a user would. */
async function confirmEmail(email: string): Promise<void> {
  const link = await waitFor(
    async () => {
      const { messages } = (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()) as {
        messages: { ID: string; Subject: string; To: { Address: string }[] }[];
      };
      const message = messages.find((m) => /confirm/i.test(m.Subject) && m.To.some((to) => to.Address === email));
      if (!message) return '';
      const body = (await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as { HTML: string };
      return (/href="([^"]*\/verify[^"]*)"/.exec(body.HTML)?.[1] ?? '').replace(/&amp;/g, '&');
    },
    (url) => url.length > 0,
    30_000,
  );
  const response = await fetch(link, { redirect: 'manual' });
  if (response.status >= 400) throw new Error(`Confirmation link failed with ${response.status}`);
}

/** Signs up, confirming the address first when the stack requires it, and returns the signed-in session. */
async function signUpConfirmed(input: Parameters<Repositories['auth']['signUp']>[0]) {
  try {
    return await repos.auth.signUp(input);
  } catch (error) {
    if (!/confirm/i.test(String(error))) throw error;
    await confirmEmail(input.email);
    return repos.auth.signInWithPassword(input.email, input.password);
  }
}

async function latestRecoveryCode(email: string): Promise<string> {
  return waitFor(
    async () => {
      const { messages } = (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()) as {
        messages: { ID: string; Subject: string; To: { Address: string }[] }[];
      };
      const message = messages.find((m) => !/confirm/i.test(m.Subject) && m.To.some((to) => to.Address === email));
      if (!message) return '';
      const body = (await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as { HTML: string };
      return /(\d{6})/.exec(body.HTML)?.[1] ?? '';
    },
    (code) => code.length === 6,
    30_000,
  );
}

beforeAll(async () => {
  const health = await fetch(`${process.env.VITE_API_BASE_URL}/health/ready/`).catch(() => null);
  if (!health?.ok) throw new Error('The backend is not running: start it with `make docker-up` in jt-code-backend.');
  if (!process.env.VITE_SUPABASE_ANON_KEY) throw new Error('VITE_SUPABASE_ANON_KEY is not set.');
});

afterAll(async () => {
  await supabase.auth.signOut();
});

describe('authentication (Supabase Auth + Django)', () => {
  it('signs up, provisions a workspace with free credits and returns the profile', async () => {
    const { user, session } = await signUpConfirmed({
      email: userA,
      password,
      firstName: 'Ada',
      lastName: 'Integration',
      contact: '+256700000000',
      countryCode: 'UG',
      countryName: 'Uganda',
      dialCode: '+256',
      timezone: 'Africa/Kampala',
    });
    expect(user.email).toBe(userA);
    expect(session.accessToken).toBeTruthy();

    const account = await repos.account.getAccount();
    expect(account).toMatchObject({ email: userA, firstName: 'Ada', lastName: 'Integration', countryCode: 'UG', plan: 'free' });

    const wallet = await repos.billing.getWallet();
    expect(wallet.balance).toBe(100); // the free plan's monthly credits
    await grantCredits(userA);
    expect((await repos.billing.getWallet()).balance).toBe(5100);
  });

  it('rejects requests without a valid session', async () => {
    const response = await fetch(`${process.env.VITE_API_BASE_URL}/accounts/me/`, { headers: { Authorization: 'Bearer not-a-jwt' } });
    expect(response.status).toBe(401);
  });

  it('signs out and back in with the password', async () => {
    await repos.auth.signOut();
    expect(await repos.auth.getSession()).toBeNull();
    const { user } = await repos.auth.signInWithPassword(userA, password);
    expect(user.email).toBe(userA);
    await expectApiError(repos.auth.signInWithPassword(userA, 'wrong-password-123'), /invalid/i);
    await repos.auth.signInWithPassword(userA, password);
  });
});

describe('account settings', () => {
  it('updates the profile, refuses e-mail changes and manages the avatar', async () => {
    const updated = await repos.account.updateAccount({ firstName: 'Ada', lastName: 'Lovelace', timezone: 'Africa/Nairobi' });
    expect(updated).toMatchObject({ lastName: 'Lovelace', timezone: 'Africa/Nairobi' });
    await expectApiError(repos.account.updateAccount({ email: 'someone-else@example.com' }), /e-mail/i);

    const withAvatar = await repos.account.uploadAvatar(new File([PNG_1PX], 'me.png', { type: 'image/png' }));
    expect(withAvatar.avatarUrl).toMatch(/\/storage\/v1\/object\/sign\//);
    const image = await fetch(withAvatar.avatarUrl!);
    expect(image.status).toBe(200);
    await expectApiError(repos.account.uploadAvatar(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })), /PNG|image/i);
    expect((await repos.account.removeAvatar()).avatarUrl).toBeNull();
  });

  it('changes the password only with the current one', async () => {
    await expectApiError(
      repos.account.changePassword({ currentPassword: 'not-my-password', newPassword: `${password}2`, confirmPassword: `${password}2` }),
      /current password|incorrect/i,
    );
    await repos.account.changePassword({ currentPassword: password, newPassword: `${password}2`, confirmPassword: `${password}2` });
    await repos.auth.signInWithPassword(userA, `${password}2`);
  });

  it('resets a forgotten password with the emailed code', async () => {
    await repos.auth.signOut();
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userA);
      expect(error).toBeNull();
      const code = await latestRecoveryCode(userA);
      expect(await resetPasswordWithCode(userA, code, password)).toEqual({});
    } finally {
      // Signed in again either way, so a reset failure does not cascade into the later cases.
      // (With the new password when the reset worked, else the one the previous case set.)
      await repos.auth.signInWithPassword(userA, password).catch(() => repos.auth.signInWithPassword(userA, `${password}2`));
    }
  });
});

describe('chat and history', () => {
  let conversationId = '';

  it('streams an assistant reply over SSE and persists the thread', async () => {
    const conversation = await repos.chat.createConversation('Integration chat');
    conversationId = conversation.id;
    const tokens: string[] = [];
    const statuses: string[] = [];
    const reply = await repos.chat.sendMessage({
      conversationId,
      content: 'Hello from the integration test',
      model: 'auto',
      onToken: (token) => tokens.push(token),
      onStatus: (status) => statuses.push(status),
    });
    expect(reply.status).toBe('complete');
    expect(reply.content).toContain('Hello from the integration test');
    expect(tokens.join('')).toBe(reply.content);
    expect(statuses.at(-1)).toBe('completed');

    const messages = await repos.chat.getMessages(conversationId);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[0]!.content).toBe('Hello from the integration test');
  });

  it('attaches an uploaded file to the conversation', async () => {
    const file = await repos.files.upload({ file: new File(['notes'], 'notes.txt', { type: 'text/plain' }) });
    const attached = await repos.files.attachToChat(file.id, conversationId);
    expect(attached.usedIn).toContain(`conversation:${conversationId}`);
  });

  it('lists, searches, pins, archives, exports and deletes conversations', async () => {
    expect((await repos.history.list()).map((c) => c.id)).toContain(conversationId);
    expect((await repos.history.list({ search: 'Integration chat' })).map((c) => c.id)).toContain(conversationId);
    expect((await repos.history.pin(conversationId, true)).pinned).toBe(true);
    expect((await repos.history.list({ pinnedOnly: true })).map((c) => c.id)).toEqual([conversationId]);
    expect(await repos.history.export(conversationId, 'markdown')).toContain('Hello from the integration test');

    await repos.history.archive(conversationId, true);
    expect((await repos.history.list()).map((c) => c.id)).not.toContain(conversationId);
    expect((await repos.history.list({ archivedOnly: true })).map((c) => c.id)).toContain(conversationId);
    await repos.history.archive(conversationId, false);

    const extra = await repos.chat.createConversation('To delete');
    await repos.history.delete(extra.id);
    expect((await repos.history.list()).map((c) => c.id)).not.toContain(extra.id);
  });
});

describe('files', () => {
  it('uploads, renames, downloads and deletes a private file', async () => {
    const uploaded = await repos.files.upload({ file: new File(['hello,world\n'], 'hello.csv', { type: 'text/csv' }) });
    expect(uploaded).toMatchObject({ name: 'hello.csv', mimeType: 'text/csv' });
    expect((await repos.files.rename(uploaded.id, 'renamed.csv')).name).toBe('renamed.csv');
    expect(await (await repos.files.download(uploaded.id)).text()).toBe('hello,world\n');
    await repos.files.delete(uploaded.id);
    expect((await repos.files.list()).map((f) => f.id)).not.toContain(uploaded.id);
  });
});

describe('data analytics', () => {
  const csv = 'region,product,revenue\nEast,A,120\nEast,B,80\nWest,A,200\nWest,B,50\nNorth,A,75\n';

  it('profiles a dataset, runs a grouped analysis and renders a chart', async () => {
    const dataset = await repos.analytics.createDataset({ name: 'Integration sales', csv });
    expect(dataset.columns).toEqual(['region', 'product', 'revenue']);
    expect(dataset.rowCount).toBe(5);
    expect(dataset.profile.columnProfiles?.find((p) => p.name === 'revenue')?.kind).toBe('numeric');
    expect((await repos.analytics.listDatasets()).map((d) => d.id)).toContain(dataset.id);

    const queued = await repos.analytics.createRun(dataset.id, {
      filters: [{ column: 'revenue', operator: 'gte', value: 60 }],
      group_by: ['region'],
      aggregate: { revenue: 'sum' },
      sort: [{ column: 'revenue_sum', direction: 'desc' }],
    });
    expect(['queued', 'running', 'completed']).toContain(queued.status);
    const run = await waitFor(() => repos.analytics.getRun(queued.id), (r) => r.status === 'completed' || r.status === 'failed');
    expect(run.errorMessage).toBe('');
    expect(run.status).toBe('completed');
    expect(run.columns).toEqual(['region', 'revenue_sum']);
    // Sorted by revenue_sum descending; the East/West tie keeps group order (stable sort).
    expect(run.preview).toEqual([
      { region: 'East', revenue_sum: 200 },
      { region: 'West', revenue_sum: 200 },
      { region: 'North', revenue_sum: 75 },
    ]);

    const download = await (await repos.analytics.downloadRun(run.id)).text();
    expect(download.split('\n')[0]).toBe('region,revenue_sum');

    const chartRequest = await repos.analytics.createVisualization({ runId: run.id, kind: 'bar', xColumn: 'region', yColumn: 'revenue_sum', title: 'Revenue' });
    const chart = await waitFor(() => repos.analytics.getVisualization(chartRequest.id), (c) => c.status === 'ready' || c.status === 'failed');
    expect(chart.errorMessage).toBe('');
    expect(chart.status).toBe('ready');
    const png = await fetch(chart.imageUrl!);
    expect(png.headers.get('content-type')).toContain('image/png');

    await expectApiError(
      repos.analytics.createVisualization({ runId: run.id, kind: 'bar', xColumn: 'region', yColumn: 'no_such_column' }),
      /column/i,
    );
    await repos.analytics.deleteDataset(dataset.id);
    expect((await repos.analytics.listDatasets()).map((d) => d.id)).not.toContain(dataset.id);
  });

  it('rejects malformed CSV with a clear message', async () => {
    await expectApiError(repos.analytics.createDataset({ name: 'Bad', csv: 'a,a\n1,2\n' }), /unique|duplicate|column/i);
  });
});

describe('images', () => {
  it('generates, lists, favourites, analyses and deletes images', async () => {
    const models = await repos.images.listModels();
    expect(models.map((m) => m.id)).toContain('auto');
    const generation = await repos.images.generate({ prompt: 'a red cube', model: 'auto', aspectRatio: '1:1', style: '', imageCount: 1 });
    expect(generation.images).toHaveLength(1);
    expect((await fetch(generation.images[0]!.url)).status).toBe(200);
    expect((await repos.images.listGenerations()).map((g) => g.id)).toContain(generation.id);
    expect((await repos.images.toggleFavorite(generation.id, true)).favorite).toBe(true);
    const answer = await repos.images.understand(`data:image/png;base64,${btoa(String.fromCharCode(...PNG_1PX))}`, 'What is this?');
    expect(answer).toBeTruthy();
    await repos.images.deleteGeneration(generation.id);
    expect((await repos.images.listGenerations()).map((g) => g.id)).not.toContain(generation.id);
  });
});

describe('documents', () => {
  it('creates, edits, versions, exports and deletes a document', async () => {
    const doc = await repos.documents.create({ title: 'Integration doc', template: 'blank', content: '# Hello\n\nWorld' });
    expect((await repos.documents.update(doc.id, '# Hello\n\nUpdated')).content).toContain('Updated');
    expect((await repos.documents.addVersion(doc.id)).version).toBeGreaterThanOrEqual(1);
    expect(await repos.documents.exportMarkdown(doc.id)).toContain('Updated');
    const pdf = await repos.documents.exportPdf(doc.id);
    expect(new TextDecoder().decode(new Uint8Array(await pdf.arrayBuffer()).slice(0, 4))).toBe('%PDF');
    await repos.documents.delete(doc.id);
  });
});

describe('knowledge', () => {
  it('creates a collection with a text source and finds it by search', async () => {
    const collection = await repos.knowledge.createCollection(`KB ${runId}`, 'Integration test');
    await repos.knowledge.addSource({
      collectionId: collection.id,
      type: 'text',
      name: 'Facts',
      config: { text: 'The JT-Code integration suite verifies pgvector hybrid search end to end.' },
    });
    const indexed = await waitFor(
      () => repos.knowledge.getCollection(collection.id),
      (c) => !!c?.sources.length && c.sources.every((s) => s.status === 'indexed' || s.status === 'error'),
    );
    expect(indexed?.sources[0]?.status).toBe('indexed');
    const results = await repos.knowledge.search(collection.id, 'pgvector hybrid search');
    expect(results.length).toBeGreaterThan(0);
    await repos.knowledge.deleteCollection(collection.id);
  });
});

describe('data visualization', () => {
  it('imports data, renders charts, predicts, assists and exports reports', async () => {
    const catalog = await repos.visualize.catalog();
    expect(catalog.charts.length).toBeGreaterThanOrEqual(80);
    expect(catalog.categories.map((c) => c.id)).toEqual(expect.arrayContaining(['distribution', 'relationship', 'ml', 'dimensional']));

    const sample = await repos.visualize.createSample('retail_sales');
    expect(sample.rowCount).toBe(2400);
    const imported = await repos.visualize.importFile(
      new File([JSON.stringify([{ city: 'Kampala', sales: 3 }, { city: 'Nairobi', sales: 5 }])], 'cities.json', { type: 'application/json' }),
    );
    expect(imported.columns).toEqual(['city', 'sales']);

    const messy = await repos.analytics.createDataset({ name: 'Messy', csv: 'id,city,amount\n1,Kampala,5\n2,Kampala,N/A\n2,kampala ,7\n2,kampala ,7\n,Gulu,4\n' });
    const scan = await repos.visualize.quality(messy.id);
    expect(scan.issues.map((issue) => issue.type)).toEqual(expect.arrayContaining(['duplicate_row', 'duplicate_id', 'missing_id', 'placeholder']));
    const flagged = await repos.visualize.preview(messy.id, 0, 50, { issues: true, filter: 'issues' });
    expect(flagged.flags?.['3']?.['*']).toContain('duplicate_row');
    expect((await repos.visualize.preview(messy.id, 0, 50)).datasetRows).toBe(5);
    const fixed = await repos.visualize.editDataset(messy.id, [{ row: 4, column: 'id', value: '5' }], [3]);
    expect(fixed.rowCount).toBe(4);
    expect((await repos.visualize.quality(messy.id)).issues.map((issue) => issue.type)).not.toContain('duplicate_row');
    expect(((await repos.visualize.worldMap()).features as unknown[]).length).toBeGreaterThan(150);

    const preview = await repos.visualize.preview(sample.id, 0, 5);
    expect(preview.rows).toHaveLength(5);
    const { insights, recommendations } = await repos.visualize.insights(sample.id);
    expect(insights.length).toBeGreaterThan(0);
    expect(recommendations.length).toBeGreaterThan(0);
    const fields = await repos.visualize.suggestFields(sample.id, 'scatter');
    expect(Object.keys(fields)).toEqual(expect.arrayContaining(['x', 'y']));

    const cases: [string, VizFields][] = [
      ['line', { x: 'date', y: ['revenue'] }],
      ['violin', { y: 'revenue', x: 'region' }],
      ['correlation_heatmap', {}],
      ['pca_2d', { color: 'region' }],
    ];
    for (const [chartType, chartFields] of cases) {
      const rendered = await repos.visualize.render({ datasetId: sample.id, chartType, fields: chartFields, style: { palette: 'colorblind' } });
      expect(rendered.option.series?.length, chartType).toBeGreaterThan(0);
      expect(rendered.explanation.insight, chartType).toBeTruthy();
    }
    await expectApiError(repos.visualize.render({ datasetId: sample.id, chartType: 'histogram', fields: { x: 'region' } }), /numeric/i);

    const organized = await repos.visualize.organizeSave(
      sample.id,
      { clean: { dedupe: true }, transform: { group_by: ['region'], aggregate: { revenue: 'sum' } } },
      'Revenue by region',
    );
    expect(organized.rowCount).toBe(5);
    // .xlsx files are zip archives; native Excel charts live under xl/charts/.
    const excelCharts = async (file: Blob) => (new TextDecoder('latin1').decode(await file.arrayBuffer()).match(/xl\/charts\/chart\d+\.xml/g) ?? []).length;
    const workbook = await repos.visualize.exportDataset(sample.id, 'xlsx');
    expect(workbook.size).toBeGreaterThan(10_000);
    expect(await excelCharts(workbook)).toBe(0);
    expect(await excelCharts(await repos.visualize.exportDataset(sample.id, 'xlsx', { graphs: true }))).toBeGreaterThan(2);
    const studioBook = await repos.visualize.workbook({
      title: 'Integration page',
      graphs: true,
      charts: [
        { datasetId: sample.id, chartType: 'bar', fields: { x: 'region', y: 'revenue' } },
        { datasetId: sample.id, chartType: 'donut', fields: { x: 'channel' }, style: { colors: ['#123456'] } },
      ],
    });
    expect(await excelCharts(studioBook)).toBeGreaterThanOrEqual(2);

    const prediction = await repos.visualize.predict({ datasetId: sample.id, task: 'forecast', model: 'holt_winters', fields: { date: 'date', target: 'revenue' }, options: { horizon: 3, time_grain: 'M' } });
    expect(prediction.metrics.map((m) => m.key)).toContain('mape');
    expect(prediction.charts[0]?.option.series?.length).toBeGreaterThan(0);
    expect((await (await repos.visualize.downloadPrediction(prediction.resultId)).text()).split('\n')[0]).toContain('forecast');
    expect(await excelCharts(await repos.visualize.downloadPrediction(prediction.resultId, 'xlsx'))).toBeGreaterThan(0);

    const answer = await repos.visualize.ask({ prompt: 'Compare revenue by region', datasetId: sample.id });
    expect(answer.reply.length).toBeGreaterThan(0);
    expect(answer.action).not.toBeNull();

    const chart = await repos.visualize.saveChart({ datasetId: sample.id, chartType: 'bar', fields: { x: 'region', y: 'revenue' }, title: 'Revenue by region' });
    const fromPrediction = await repos.visualize.saveChart({ resultId: prediction.resultId, chartIndex: 0 });
    const html = await (await repos.visualize.exportChart(chart.id, 'html')).text();
    expect(html).toContain('echarts.init');
    expect(html).toContain('Key takeaway');
    await repos.visualize.deleteChart(fromPrediction.id);

    // Dashboards: a starter dashboard, every visual built by Python over the Postgres query store.
    const dashboard = await repos.visualize.autoDashboard(sample.id, 'Integration dashboard');
    expect(dashboard.role).toBe('owner');
    const page = dashboard.spec!.pages[0]!;
    expect(page.visuals.filter((v) => v.type === 'kpi').length).toBeGreaterThanOrEqual(6);
    // As the app does: field parameters and calculations resolved, their context sent along.
    const visuals = page.visuals.map((visual) => resolveVisual(visual, dashboard.spec, {}));
    const context = renderContext(dashboard.spec, {});
    const drawn = await repos.visualize.renderVisuals({ visuals, ...context, mode: 'dark', theme: 'midnight', dashboardId: dashboard.id });
    expect(drawn.visuals.filter((v) => v.status !== 'ok')).toEqual([]);
    const east = await repos.visualize.renderVisuals({ visuals, ...context, mode: 'dark', theme: 'midnight', filters: [{ field: 'region', op: 'in', value: ['East'] }] });
    const kpi = (visuals: typeof drawn.visuals) => visuals.find((v) => v.id === 'kpi-0')!.kpi!.value!;
    expect(kpi(east.visuals)).toBeLessThan(kpi(drawn.visuals));
    // Templates, the AI page (free rules when no model answers), explain a change, a public link.
    const templates = await repos.visualize.dashboardTemplates(sample.id);
    expect(templates).toHaveLength(9);
    const sales = templates.find((item) => item.id === 'sales')!;
    const fromTemplate = await repos.visualize.dashboardFromTemplate({ templateId: 'sales', datasetId: sample.id, mapping: sales.guess ?? {} });
    expect(fromTemplate.spec!.pages[0]!.visuals.length).toBeGreaterThanOrEqual(12);
    const proposal = await repos.visualize.aiPage({ datasetId: sample.id, prompt: 'Profit by product and channel with the monthly trend' });
    expect(proposal.page.visuals.length).toBeGreaterThan(2);
    const explained = await repos.visualize.explainChange({ datasetId: sample.id, measure: { field: 'revenue', agg: 'sum' }, dateField: 'date', period: ['2025-11-01T00:00:00', '2025-11-30T23:59:59'], grain: 'month' });
    expect(explained.headline).toMatch(/^Revenue is (up|down|unchanged)/);
    const link = await repos.visualize.createShareLink(fromTemplate.id, { kind: 'link', name: 'Integration' });
    const shared = await repos.visualize.sharedDashboard(link.token!);
    expect(shared.spec.settings?.allowPersonalize).toBe(false);
    const sharedDrawn = await repos.visualize.sharedVisuals(link.token!, { visuals: [{ id: 'kpi-0' }, { id: 'main', level: 0 }], mode: 'light' });
    expect(sharedDrawn.visuals.map((v) => v.status)).toEqual(['ok', 'ok']);
    await repos.visualize.revokeShareLink(fromTemplate.id, link.id);
    await expectApiError(repos.visualize.sharedDashboard(link.token!), /not valid/i);
    await repos.visualize.deleteDashboard(fromTemplate.id);
    const gallery = await repos.visualize.renderVisuals({
      visuals: [{ id: 'violin', type: 'chart', layout: { x: 0.25, y: 0, w: 8, h: 8 }, data: { datasetId: sample.id, wells: {} }, format: { chart: { chartType: 'violin', fields: { y: 'revenue', x: 'channel' } } } }],
      mode: 'light',
    });
    expect(gallery.visuals[0]?.status).toBe('ok');
    const renamed = await repos.visualize.updateDashboard(dashboard.id, { name: 'Renamed', version: dashboard.version });
    expect(renamed.version).toBe(dashboard.version + 1);
    await expectApiError(repos.visualize.updateDashboard(dashboard.id, { name: 'Stale', version: dashboard.version }), /changed elsewhere/i);
    expect((await repos.visualize.dashboardVersions(dashboard.id)).length).toBeGreaterThan(0);
    await repos.visualize.savePersonalView(dashboard.id, { slicers: { 'slicer-1': { values: ['East'] } } });
    expect((await repos.visualize.personalView(dashboard.id))?.state.slicers).toEqual({ 'slicer-1': { values: ['East'] } });
    await repos.visualize.resetPersonalView(dashboard.id);
    expect(await repos.visualize.personalView(dashboard.id)).toBeNull();
    expect((await repos.visualize.builtInThemes()).themes.length).toBe(13);
    await repos.visualize.deleteDashboard(dashboard.id);
    expect((await repos.visualize.listDashboards()).map((d) => d.id)).not.toContain(dashboard.id);
    await repos.visualize.deleteChart(chart.id);
    expect((await repos.visualize.listCharts()).map((c) => c.id)).not.toContain(chart.id);
  }, 300_000);
});

describe('billing', () => {
  it('reads plans, wallet, usage, invoices and subscription', async () => {
    const plans = await repos.billing.getPlans();
    expect(plans.map((p) => p.slug)).toEqual(expect.arrayContaining(['free', 'pro', 'team', 'business']));
    const usage = await repos.billing.getUsage();
    expect(usage.totalCredits).toBeGreaterThan(0); // the chat and analysis above were metered
    expect(Array.isArray(await repos.billing.listInvoices())).toBe(true);
    expect(await repos.billing.getSubscription()).toBeNull();
    expect(await repos.billing.getPaymentMethod()).toBeNull();
  });

  it('updates wallet settings and reports payment configuration errors clearly', async () => {
    expect((await repos.billing.setSpendingLimit(5000)).monthlySpendingLimit).toBe(5000);
    expect((await repos.billing.setSpendingLimit(null)).monthlySpendingLimit).toBeNull();
    await expectApiError(repos.billing.topup(10), /billing is not configured|stripe/i);
    await expectApiError(http.post('/plans/pro/subscribe/', { interval: 'month' }), /stripe|billing/i);
  });
});

describe('integrations', () => {
  it('lists, connects, tests and disconnects an integration (no provider keys locally)', async () => {
    const before = await repos.integrations.list();
    expect(Array.isArray(before)).toBe(true);
    let connected: Awaited<ReturnType<Repositories['integrations']['connect']>> | undefined;
    try {
      connected = await repos.integrations.connect({ key: 'github', displayName: `GitHub ${runId}` });
    } catch (error) {
      // Without a GitHub App configured the API may refuse, but with a clear client error, never a 5xx.
      const status = (error as { response?: { status?: number } }).response?.status ?? 0;
      expect(status, apiErrorMessage(error)).toBeGreaterThanOrEqual(400);
      expect(status, apiErrorMessage(error)).toBeLessThan(500);
      return;
    }
    expect(connected.id).toBeTruthy();
    expect((await repos.integrations.list()).map((item) => item.id)).toContain(connected.id);
    const result = await repos.integrations.test(connected.id);
    expect(typeof result.message).toBe('string');
    await repos.integrations.disconnect(connected.id);
    expect((await repos.integrations.list()).map((item) => item.id)).not.toContain(connected.id);
  });
});

describe('tenant isolation', () => {
  it('keeps one user’s data invisible to another', async () => {
    const mine = await repos.chat.createConversation('Private to A');
    await repos.auth.signOut();
    await signUpConfirmed({
      email: userB,
      password,
      firstName: 'Bob',
      lastName: 'Other',
      contact: '',
      countryCode: 'KE',
      countryName: 'Kenya',
      dialCode: '+254',
      timezone: 'Africa/Nairobi',
    });
    expect((await repos.history.list()).map((c) => c.id)).not.toContain(mine.id);
    await expectApiError(repos.chat.getMessages(mine.id), /not found|no conversation matches/i);
    await expectApiError(repos.history.export(mine.id, 'markdown'), /not found|no conversation matches/i);
    expect(await repos.analytics.listDatasets()).toEqual([]);

    await repos.account.deleteAccount();
    expect(await repos.auth.getSession()).toBeNull();
    await expectApiError(repos.auth.signInWithPassword(userB, password), /invalid/i);
  });
});
