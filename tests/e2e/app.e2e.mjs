// Browser end-to-end test: the real UI (Vite dev server) against the live backend.
//
//   1. jt-code-backend: make native-up
//   2. here: npm run dev            (http://localhost:5173, VITE_DATA_MODE=api in .env.local)
//   3. here: npm run test:e2e
//
// Env: E2E_BASE_URL (default http://localhost:5173), CHROME_PATH, JT_CODE_BACKEND_DIR,
// E2E_SCREENSHOTS (directory for step screenshots), E2E_HEADFUL=1 to watch it.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import puppeteer from 'puppeteer-core';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const CHROME = process.env.CHROME_PATH ?? ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const BACKEND_DIR = resolve(process.env.JT_CODE_BACKEND_DIR ?? '../jt-code-backend');
const SHOTS = process.env.E2E_SCREENSHOTS ?? 'test-results/e2e';
const run = Date.now().toString(36);
const email = `e2e-${run}@jt-code.local`;
const password = `E2e-${run}-Passw0rd!`;
const results = [];

mkdirSync(SHOTS, { recursive: true });

async function grantCredits(address, credits = 5000) {
  await promisify(execFile)(resolve(BACKEND_DIR, '.venv/bin/python'), ['manage.py', 'grant_local_credits', address, '--credits', String(credits)], {
    cwd: BACKEND_DIR,
  });
}

async function step(page, name, fn) {
  const started = Date.now();
  try {
    await fn();
    await page.screenshot({ path: `${SHOTS}/${String(results.length + 1).padStart(2, '0')}-${name.replace(/\W+/g, '-')}.png`, fullPage: true });
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  ✓ ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    await page.screenshot({ path: `${SHOTS}/FAILED-${name.replace(/\W+/g, '-')}.png`, fullPage: true }).catch(() => undefined);
    results.push({ name, ok: false, error: String(error?.message ?? error) });
    console.log(`  ✗ ${name}\n      ${String(error?.message ?? error).split('\n')[0]}`);
    throw error;
  }
}

const textOf = (page, selector) => page.$eval(selector, (el) => el.textContent ?? '');

async function waitForText(page, selector, pattern, timeout = 60_000) {
  await page.waitForFunction(
    (sel, source, flags) => [...document.querySelectorAll(sel)].some((el) => new RegExp(source, flags).test(el.textContent ?? '')),
    { timeout },
    selector,
    pattern.source,
    pattern.flags,
  );
}

async function clickText(page, selector, pattern) {
  const handle = await page.waitForFunction(
    (sel, source, flags) => [...document.querySelectorAll(sel)].find((el) => new RegExp(source, flags).test(el.textContent ?? '')),
    { timeout: 30_000 },
    selector,
    pattern.source,
    pattern.flags,
  );
  await handle.asElement().click();
}

/** Sets a React-controlled input (range, text) and fires the events React listens to. */
async function setInput(page, selector, value) {
  await page.waitForSelector(selector);
  await page.$eval(
    selector,
    (el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    String(value),
  );
}

/** Clicks through the DOM (for links scrolled out of view inside the app's scroll container). */
async function domClick(page, selector) {
  await page.waitForSelector(selector);
  await page.$eval(selector, (el) => el.click());
}

/** Fails when the page or the tool header scrolls sideways (ribbons may scroll; their pinned group must stay in view). */
async function fitsOnScreen(page, name) {
  const pinned = await page.evaluate(() =>
    [...document.querySelectorAll('[data-pinned]')].filter((el) => {
      const box = el.getBoundingClientRect();
      return box.width && (box.right > window.innerWidth + 1 || box.left < 0);
    }).length,
  );
  if (pinned) throw new Error(`${name}: a pinned ribbon group is off screen`);
  const overflow = await page.evaluate(() =>
    [document.scrollingElement, ...document.querySelectorAll('.viz-header')]
      .filter((el) => el && el.scrollWidth > el.clientWidth + 1)
      .map((el) => `${el.className || el.tagName} (${el.scrollWidth} > ${el.clientWidth})`),
  );
  if (overflow.length) throw new Error(`${name}: content wider than the screen: ${overflow.join(', ')}`);
  const header = await page.evaluate(() => document.querySelector('.viz-header')?.getBoundingClientRect().top ?? 0);
  if (header < -1) throw new Error(`${name}: the tool header is cut off at the top (${header}px)`);
  if (process.env.E2E_SCREENSHOTS) await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/${name}.png`, fullPage: false });
}

async function main() {
  if (!CHROME) throw new Error('Chrome not found; set CHROME_PATH.');
  const health = await fetch(`${BASE}/api/v1/health/ready/`).catch(() => null);
  if (!health?.ok) throw new Error(`No app at ${BASE} with a reachable API (start the backend and \`npm run dev\`).`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: process.env.E2E_HEADFUL ? false : true,
    args: ['--no-first-run', '--no-default-browser-check'],
    defaultViewport: { width: 1366, height: 900 },
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const consoleErrors = [];
  page.on('console', (message) => message.type() === 'error' && consoleErrors.push(message.text().slice(0, 1500)));
  page.on('response', async (response) => {
    if (!response.url().includes('/api/v1/') || response.status() < 500) return;
    // Stripe is not configured locally: 503 billing_not_configured is the expected answer.
    const body = await response.json().catch(() => null);
    if (response.status() === 503 && body?.code === 'billing_not_configured') return;
    pageErrors.push(`${response.status()} ${response.url()}`);
  });

  try {
    console.log(`JT-Code browser e2e against ${BASE} as ${email}`);

    await step(page, 'sign up', async () => {
      await page.goto(`${BASE}/sign-up`, { waitUntil: 'networkidle0' });
      await page.type('#firstName', 'Grace');
      await page.type('#lastName', 'Hopper');
      await page.type('#email', email);
      await page.select('#countryCode', 'UG');
      await page.type('#contact', '700000000');
      await page.type('#password', password);
      await page.type('#confirmPassword', password);
      await page.click('#acceptedTerms');
      await page.click('button[type="submit"]');
      await page.waitForFunction(() => location.pathname === '/app/chat', { timeout: 30_000 });
      await grantCredits(email);
    });

    await step(page, 'sidebar shows the signed-in sections', async () => {
      for (const href of ['/app/history', '/app/visualize', '/app/billing']) await page.waitForSelector(`a[href="${href}"]`);
      await waitForText(page, 'a[href="/app/visualize"]', /Data Visualization/);
      // Data Analytics was merged into Data Visualization.
      if (await page.$('a[href="/app/analytics"]')) throw new Error('The old Data Analytics entry is still in the sidebar');
    });

    await step(page, 'chat streams a reply into the thread', async () => {
      const field = 'textarea.composer__field:not(.composer__field-mirror)';
      await page.waitForSelector(field);
      await page.type(field, 'Hello from the browser e2e test');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-testid="message-user"]');
      await waitForText(page, '[data-testid="message-assistant"].complete', /Hello from the browser e2e test/, 60_000);
      await page.waitForFunction(() => new URL(location.href).searchParams.get('c'));
      await page.waitForSelector('[data-testid="new-chat"]', { visible: true });
    });

    await step(page, 'history lists and reopens the conversation', async () => {
      await page.click('a[href="/app/history"]');
      await waitForText(page, '[data-testid="history-list"]', /Hello from the browser e2e test/);
      await clickText(page, '[data-testid="history-list"] button', /Hello from the browser e2e test/);
      await page.waitForFunction(() => location.pathname === '/app/chat' && new URL(location.href).searchParams.get('c'));
      await waitForText(page, '[data-testid="message-assistant"]', /Hello from the browser e2e test/);
    });

    await step(page, 'visualize: the sidebar door opens the tool overview', async () => {
      await page.click('a[href="/app/visualize"]');
      await page.waitForSelector('[data-testid="visualize-overview"]');
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="category-tiles"] > a').length === 10, { timeout: 30_000 });
    });

    await step(page, 'data: paste a dataset in the ribbon, scan its quality and fix it', async () => {
      await domClick(page, 'a[href="/app/visualize/data"]');
      await page.waitForSelector('[data-testid="data-ribbon"]');
      await domClick(page, '[data-testid="toggle-paste"]');
      await page.waitForSelector('[data-testid="import-paste"]');
      await page.type(
        '[data-testid="import-paste"]',
        'order_id,region,amount\n1,East,120\n2,West,N/A\n3,East,80\n3,East,80\n,North,75\n6,west ,90\n',
      );
      await domClick(page, '[data-testid="import-submit"]');
      await waitForText(page, '[data-testid="data-grid"]', /order_id/, 60_000);
      // One name field (the dataset's own); new data is named after its file.
      if (await page.$('input[aria-label="New dataset name"]')) throw new Error('the ribbon still has a second name field');
      await page.waitForSelector('[data-pinned] [data-testid="go-predict"]');
      await fitsOnScreen(page, 'data-home');
      await domClick(page, '[data-testid="ribbon-quality"]');
      await domClick(page, '[data-testid="scan-quality"]');
      await waitForText(page, '[data-testid="issue-list"]', /Duplicate row/, 90_000);
      await waitForText(page, '[data-testid="issue-list"]', /Placeholder value/);
      await waitForText(page, '[data-testid="issue-list"]', /Missing ID/);
      await fitsOnScreen(page, 'data-quality');
      await page.waitForSelector('[data-testid="data-grid"] td[data-flag]', { timeout: 60_000 });
      // The scan changes nothing; the person deletes the duplicate row and saves.
      await page.select('[data-testid="issue-filter"]', 'duplicate_row');
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="data-grid"] tbody tr').length === 1, { timeout: 60_000 });
      await domClick(page, '[data-testid="data-grid"] tbody tr button[aria-label^="Delete row"]');
      await domClick(page, '[data-testid="save-edits"]');
      await page.select('[data-testid="issue-filter"]', '');
      await waitForText(page, '[data-testid="data-grid"]', /5 rows/, 60_000);
    });

    await step(page, 'visualize: load a sample and explore the data', async () => {
      await domClick(page, 'a[href="/app/visualize"]');
      await page.waitForSelector('[data-testid="sample-list"] > div');
      const load = await page.waitForFunction(
        () => [...document.querySelectorAll('[data-testid="sample-list"] > div')].find((el) => /Retail sales/.test(el.textContent ?? ''))?.querySelector('button'),
      );
      await load.asElement().click();
      await page.waitForSelector('[data-testid="visualize-data"]', { timeout: 60_000 });
      await waitForText(page, '[data-testid="active-dataset"]', /Retail sales/, 60_000);
      await waitForText(page, '[data-testid="data-grid"]', /revenue/, 60_000);
      await domClick(page, '[data-testid="ribbon-insights"]');
      await page.waitForSelector('[data-testid="recommendations"] button', { timeout: 60_000 });
    });

    await step(page, 'visualize: pick a chart in the gallery and build a multi-chart page', async () => {
      await domClick(page, 'a[href="/app/visualize/gallery"]');
      await page.waitForSelector('[data-testid="gallery-search"]');
      const toolbar = await page.$eval('[data-testid="gallery-toolbar"]', (el) => el.getBoundingClientRect().height);
      if (toolbar > 80) throw new Error(`the gallery toolbar wraps onto several lines (${toolbar}px)`);
      await fitsOnScreen(page, 'gallery');
      await page.type('[data-testid="gallery-search"]', 'violin');
      await domClick(page, '[data-testid="gallery-chart-violin"]');
      await page.waitForSelector('[data-testid="studio-ribbon"]');
      await page.waitForSelector('[data-testid="studio-chart-0"][data-ready="true"]', { timeout: 90_000 });
      await waitForText(page, '[data-testid="chart-panel-0"] [data-testid="chart-explanation"]', /How to read it/);
      await page.select('[data-testid="studio-chart-type"]', 'bar');
      await page.waitForFunction(() => (document.querySelector('[data-testid="slot-x"]')?.value ?? '') !== '', { timeout: 60_000 });
      await page.waitForSelector('[data-testid="studio-chart-0"][data-ready="true"]', { timeout: 90_000 });
      await domClick(page, '[data-testid="ribbon-layout"]');
      await page.select('[data-testid="chart-count"]', '4');
      for (const index of [1, 2, 3]) await page.waitForSelector(`[data-testid="studio-chart-${index}"][data-ready="true"]`, { timeout: 120_000 });
      // Insert one more chart of the person's choice, then read its organized data.
      await domClick(page, '[data-testid="ribbon-insert"]');
      await fitsOnScreen(page, 'studio-insert');
      await page.select('[data-testid="insert-chart-type"]', 'pie');
      await domClick(page, '[data-testid="insert-chart"]');
      await page.waitForSelector('[data-testid="studio-chart-4"][data-ready="true"]', { timeout: 120_000 });
      await domClick(page, '[data-testid="view-data-0"]');
      await page.waitForSelector('[data-testid="chart-data-modal"] table tbody tr', { timeout: 30_000 });
      await domClick(page, '[data-testid="chart-data-modal"] button[aria-label="Close"]');
      await domClick(page, '[data-testid="ribbon-export"]');
      const [workbook] = await Promise.all([
        page.waitForResponse((response) => response.url().includes('/visualize/workbook/'), { timeout: 120_000 }),
        domClick(page, '[data-testid="excel-with-charts"]'),
      ]);
      if (workbook.status() !== 200) throw new Error(`Excel + charts failed with ${workbook.status()}`);
      await domClick(page, '[data-testid="save-chart"]');
      await waitForText(page, 'body', /Saved “/, 60_000);
    });

    await step(page, 'studio: a bar with a category and no value draws counts', async () => {
      await domClick(page, 'a[href="/app/visualize/studio"]');
      await domClick(page, '[data-testid="ribbon-chart"]');
      await page.select('[data-testid="studio-chart-type"]', 'bar');
      await page.waitForFunction(() => (document.querySelector('[data-testid="slot-x"]')?.value ?? '') !== '', { timeout: 60_000 });
      await page.select('[data-testid="slot-x"]', 'channel');
      if (await page.$('[data-testid="slot-y"]')) await page.select('[data-testid="slot-y"]', '');
      await page.waitForFunction(() => /Count by channel/.test(document.querySelector('[data-testid="chart-panel-0"]')?.textContent ?? ''), { timeout: 60_000 });
      await page.waitForSelector('[data-testid="studio-chart-0"][data-ready="true"]', { timeout: 60_000 });
      await domClick(page, '[data-testid="view-data-0"]');
      const rows = await page.$$eval('[data-testid="chart-data-modal"] tbody tr', (trs) => trs.length);
      if (rows !== 3) throw new Error(`expected 3 channels, got ${rows}`);
      await fitsOnScreen(page, 'studio-counts');
      await domClick(page, '[data-testid="chart-data-modal"] button[aria-label="Close"]');
    });

    await step(page, 'visualize: run a forecast', async () => {
      await domClick(page, 'a[href="/app/visualize/predict"]');
      await page.waitForSelector('[data-testid="visualize-predict"]');
      await page.waitForSelector('[data-testid="predict-ribbon"]');
      await page.waitForSelector('[data-testid="viz-home"]');
      await domClick(page, '[data-testid="task-forecast"]');
      await page.select('#slot-date', 'date');
      await page.select('#slot-target', 'revenue');
      await fitsOnScreen(page, 'predict-data');
      await domClick(page, '[data-testid="ribbon-run"]');
      await domClick(page, '[data-testid="run-prediction"]');
      await page.waitForSelector('[data-testid="prediction-metrics"]', { timeout: 120_000 });
      await page.waitForSelector('[data-testid="prediction-chart-forecast"][data-ready="true"]', { timeout: 60_000 });
      await waitForText(page, '[data-testid="prediction-results"]', /How to read it/);
      await fitsOnScreen(page, 'predict-results');
      const [excel] = await Promise.all([
        page.waitForResponse((response) => response.url().includes('/predict/results/') && response.url().includes('type=xlsx'), { timeout: 120_000 }),
        domClick(page, '[data-testid="prediction-excel"]'),
      ]);
      if (excel.status() !== 200) throw new Error(`prediction Excel failed with ${excel.status()}`);
      await domClick(page, '[data-testid="prediction-data-forecast"]');
      await page.waitForSelector('[data-testid="chart-data-modal"] table tbody tr', { timeout: 30_000 });
      await domClick(page, '[data-testid="chart-data-modal"] button[aria-label="Close"]');
    });

    await step(page, 'visualize: ask the AI assistant and open its suggestion', async () => {
      await domClick(page, '[data-testid="open-assistant"]');
      await page.waitForSelector('[data-testid="assistant-prompt"]');
      await fitsOnScreen(page, 'assistant-drawer');
      await page.type('[data-testid="assistant-prompt"]', 'Compare revenue by region');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-testid="assistant-answer"]', { timeout: 90_000 });
      await domClick(page, '[data-testid="assistant-open-studio"]');
      await page.waitForSelector('[data-testid="studio-chart-0"][data-ready="true"]', { timeout: 90_000 });
    });

    await step(page, 'visualize: saved charts appear in My visuals', async () => {
      await domClick(page, 'a[href="/app/visualize/reports"]');
      await page.waitForSelector('[data-testid="saved-charts"] .viz-card', { timeout: 30_000 });
    });

    await step(page, 'dashboards: build one from a dataset, then filter it with a click and a slicer', async () => {
      if (await page.$('[data-testid="assistant-panel"]')) await page.keyboard.press('Escape');
      await domClick(page, 'a[href="/app/visualize/dashboards"]');
      await page.waitForSelector('[data-testid="dashboards-home"]');
      const option = await page.$$eval('[data-testid="new-dashboard-dataset"] option', (options) => options.find((o) => /Retail sales/.test(o.textContent ?? ''))?.value);
      if (option) await page.select('[data-testid="new-dashboard-dataset"]', option);
      await domClick(page, '[data-testid="auto-dashboard"]');
      await page.waitForSelector('[data-testid="dashboard-canvas"]', { timeout: 60_000 });
      await page.waitForFunction(
        () => {
          const tiles = [...document.querySelectorAll('[data-testid^="tile-"]')];
          return tiles.length >= 12 && tiles.every((tile) => tile.getAttribute('data-status') !== 'loading');
        },
        { timeout: 120_000 },
      );
      const failed = await page.$$eval('[data-testid^="tile-"]', (tiles) => tiles.filter((t) => t.getAttribute('data-status') !== 'ok').map((t) => `${t.getAttribute('data-testid')}:${t.textContent}`));
      if (failed.length) throw new Error(`visuals not drawn: ${failed.join(' | ')}`);
      await fitsOnScreen(page, 'dashboard');
      const kpi = () => page.$eval('[data-testid="tile-kpi-0"] .dash-kpi-value', (el) => el.textContent);
      const total = await kpi();
      // Click a matrix row: every other visual follows the selection; Esc clears it.
      await domClick(page, '[data-testid="tile-matrix"] tbody tr');
      await page.waitForFunction((before) => document.querySelector('[data-testid="tile-kpi-0"] .dash-kpi-value')?.textContent !== before, { timeout: 60_000 }, total);
      await fitsOnScreen(page, 'dashboard-selected');
      await page.keyboard.press('Escape');
      await page.waitForFunction((before) => document.querySelector('[data-testid="tile-kpi-0"] .dash-kpi-value')?.textContent === before, { timeout: 60_000 }, total);
      // A slicer filters too, and “Clear all slicers” restores the totals.
      await domClick(page, '[data-testid="tile-slicer-1"] [data-testid="slicer-button"]');
      await domClick(page, '[data-testid="tile-slicer-1"] [role="option"]');
      await page.waitForFunction((before) => document.querySelector('[data-testid="tile-kpi-0"] .dash-kpi-value')?.textContent !== before, { timeout: 60_000 }, total);
      await domClick(page, '[data-testid="clear-slicers"]');
      await page.waitForFunction((before) => document.querySelector('[data-testid="tile-kpi-0"] .dash-kpi-value')?.textContent === before, { timeout: 60_000 }, total);
      // The same dashboard in dark mode (the theme follows the app unless the author fixes it).
      await domClick(page, '.sidebar-footer button');
      await page.waitForSelector('[data-testid="dashboard-canvas"][data-mode="dark"]');
      await new Promise((resolve) => setTimeout(resolve, 500));
      await page.waitForSelector('[data-testid="render-time"]', { timeout: 60_000 });
      await new Promise((resolve) => setTimeout(resolve, 800));
      await fitsOnScreen(page, 'dashboard-dark');
      await domClick(page, '.sidebar-footer button');
    });

    await step(page, 'dashboards: edit — insert, build, format, undo, drag, add a page, autosave', async () => {
      await domClick(page, '[data-testid="edit-dashboard"]');
      await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 60_000 });
      const frames = () => page.$$eval('[data-testid^="frame-"]', (els) => els.length);
      const before = await frames();
      await domClick(page, '[data-testid="insert-menu"]');
      await domClick(page, '[data-testid="insert-column"]');
      await page.waitForFunction((n) => document.querySelectorAll('[data-testid^="frame-"]').length === n + 1, { timeout: 10_000 }, before);
      await domClick(page, '[data-testid="field-region"]');
      await domClick(page, '[data-testid="field-revenue"]');
      const created = await page.$eval('.dash-edit-frame.selected', (el) => el.getAttribute('data-testid'));
      await page.waitForFunction((id) => document.querySelector(`[data-testid="${id}"] .dash-tile`)?.getAttribute('data-status') === 'ok', { timeout: 60_000 }, created);
      // Format: a custom title, then undo it.
      await domClick(page, '[data-testid="pane-format"]');
      await page.type('[data-testid="format-title"]', 'Sales split');
      await waitForText(page, `[data-testid="${created}"] .dash-tile-title`, /Sales split/, 10_000);
      await domClick(page, '[data-testid="undo"]');
      await page.waitForFunction((id) => !/Sales split/.test(document.querySelector(`[data-testid="${id}"] .dash-tile-title`)?.textContent ?? ''), { timeout: 10_000 }, created);
      // Drag it two columns to the right on the canvas.
      const box = await (await page.$(`[data-testid="${created}"]`)).boundingBox();
      const leftBefore = await page.$eval(`[data-testid="${created}"]`, (el) => parseFloat(el.style.left));
      await page.mouse.move(box.x + box.width / 2, box.y + 12);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 60, box.y + 14, { steps: 6 });
      await page.mouse.move(box.x + box.width / 2 + 120, box.y + 16, { steps: 6 });
      await page.mouse.up();
      const leftAfter = await page.$eval(`[data-testid="${created}"]`, (el) => parseFloat(el.style.left));
      if (!(leftAfter > leftBefore)) throw new Error(`drag did not move the visual (${leftBefore} → ${leftAfter})`);
      const leftover = await page.$$eval('.dash-guide', (els) => els.length);
      if (leftover) throw new Error(`${leftover} alignment guides stayed on screen after the drag`);
      await domClick(page, '[data-testid="add-page"]');
      await page.waitForSelector('[data-testid="page-1"]');
      await domClick(page, '[data-testid="page-0"]');
      await page.waitForSelector('[data-testid="save-state"][data-state="saved"]', { timeout: 30_000 });
      await fitsOnScreen(page, 'editor');
      await domClick(page, '[data-testid="done-editing"]');
      await page.waitForSelector('[data-testid="dashboard-canvas"]');
      await page.waitForFunction((n) => document.querySelectorAll('[data-testid^="tile-"]').length === n + 1, { timeout: 60_000 }, before);
      // The dashboards home shows a thumbnail painted from the editor.
      await page.goto(`${BASE}/app/visualize/dashboards`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('[data-testid="dashboard-list"] .dash-thumb img', { timeout: 30_000 });
      await fitsOnScreen(page, 'dashboards-home');
    });

    await step(page, 'dashboards: interact — multi-select, filters pane, table, focus, drill, interactions, drill-through', async () => {
      await domClick(page, '[data-testid="dashboard-list"] a');
      await page.waitForSelector('[data-testid="tile-matrix"][data-status="ok"]', { timeout: 60_000 });
      const kpi = (id) => page.$eval(`[data-testid="tile-${id}"] .dash-kpi-value`, (el) => el.textContent);
      const kpiIs = (id, test, value) =>
        page.waitForFunction((sel, same, v) => (document.querySelector(sel)?.textContent === v) === same, { timeout: 60_000 }, `[data-testid="tile-${id}"] .dash-kpi-value`, test, value);
      const rowClick = (index, ctrlKey = false) =>
        page.$eval(`[data-testid="tile-matrix"] tbody tr:nth-child(${index + 1})`, (el, ctrl) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: ctrl })), ctrlKey);
      const total = await kpi('kpi-0');
      // Ctrl-click adds a second matrix row to the selection.
      await rowClick(0);
      await kpiIs('kpi-0', false, total);
      const one = await kpi('kpi-0');
      await rowClick(1, true);
      await kpiIs('kpi-0', false, one);
      await page.keyboard.press('Escape');
      await kpiIs('kpi-0', true, total);
      // The filters pane opens and closes.
      const paneOpen = !!(await page.$('[data-testid="filters-pane"]'));
      await domClick(page, '[data-testid="toggle-filters"]');
      await page.waitForFunction((was) => !!document.querySelector('[data-testid="filters-pane"]') !== was, { timeout: 5_000 }, paneOpen);
      if (!paneOpen) await fitsOnScreen(page, 'dashboard-filters-pane');
      await domClick(page, '[data-testid="toggle-filters"]');
      // Visual header: show as table and back, focus mode and Esc.
      await domClick(page, '[data-testid="vheader-trend"] [data-testid="vheader-more"]');
      await domClick(page, '[data-testid="menu-show-table"]');
      await page.waitForSelector('[data-testid="tile-trend"] [data-testid="visual-as-table"]');
      await domClick(page, '[data-testid="vheader-trend"] [data-testid="vheader-more"]');
      await domClick(page, '[data-testid="menu-show-table"]');
      await page.waitForFunction(() => !document.querySelector('[data-testid="tile-trend"] [data-testid="visual-as-table"]'));
      await domClick(page, '[data-testid="vheader-trend"] [data-testid="vheader-focus"]');
      await page.waitForSelector('[data-testid="focus-mode"] [data-testid="tile-trend"][data-status="ok"]', { timeout: 60_000 });
      await page.screenshot({ path: `${SHOTS}/focus-mode.png` });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('[data-testid="focus-mode"]'));
      // Drill the monthly trend down to days, then up to quarters and back to months.
      const drill = async (button, level) => {
        await domClick(page, `[data-testid="vheader-trend"] [data-testid="${button}"]`);
        await page.waitForSelector(`[data-testid="tile-trend"][data-drill="${level}"][data-status="ok"]`, { timeout: 60_000 });
      };
      await page.waitForSelector('[data-testid="tile-trend"][data-drill="2"]');
      await drill('drill-next', 3);
      await drill('drill-up', 2);
      await drill('drill-up', 1);
      await drill('drill-next', 2);
      // Editor: clicks on the matrix stop affecting the first KPI; page 2 becomes a drill-through page.
      const rowField = (await textOf(page, '[data-testid="tile-matrix"] thead th')).trim().toLowerCase();
      await domClick(page, '[data-testid="edit-dashboard"]');
      await page.waitForSelector('[data-testid="frame-matrix"] .dash-tile[data-status="ok"]', { timeout: 60_000 });
      await page.click('[data-testid="frame-matrix"] .dash-tile-title');
      await page.waitForSelector('[data-testid="frame-matrix"].selected');
      await domClick(page, '[data-testid="edit-interactions"]');
      await domClick(page, '[data-testid="interact-kpi-0-none"]');
      await page.waitForSelector('[data-testid="interact-kpi-0-none"][aria-pressed="true"]');
      await fitsOnScreen(page, 'editor-interactions');
      await domClick(page, '[data-testid="edit-interactions"]');
      await domClick(page, '[data-testid="page-1"]');
      await domClick(page, '[data-testid="insert-menu"]');
      await domClick(page, '[data-testid="insert-card"]');
      await domClick(page, '[data-testid="field-revenue"]');
      const card = await page.$eval('.dash-edit-frame.selected', (el) => el.getAttribute('data-testid'));
      await page.waitForSelector(`[data-testid="${card}"] .dash-tile[data-status="ok"]`, { timeout: 60_000 });
      const cardTotal = await textOf(page, `[data-testid="${card}"] .dash-kpi-value`);
      const area = await (await page.$('[data-testid="editor-canvas"]')).boundingBox();
      await page.mouse.click(area.x + area.width - 30, area.y + 200);
      await page.waitForFunction(() => !document.querySelector('.dash-edit-frame.selected'));
      await domClick(page, '[data-testid="pane-format"]');
      await page.select('[data-testid="format-page-type"]', 'drillthrough');
      await clickText(page, '[data-testid="drillthrough-fields"] button', new RegExp(`^${rowField.replace(/[^\w ]/g, '.')}$`, 'i'));
      await page.waitForSelector('[data-testid="drillthrough-fields"] button[aria-pressed="true"]');
      await page.waitForSelector('[data-testid="save-state"][data-state="saved"]', { timeout: 30_000 });
      await domClick(page, '[data-testid="done-editing"]');
      await page.waitForSelector('[data-testid="tile-matrix"][data-status="ok"]', { timeout: 60_000 });
      // The matrix no longer filters the first KPI, but still filters the second.
      const second = await kpi('kpi-1');
      await rowClick(0);
      await kpiIs('kpi-1', false, second);
      if ((await kpi('kpi-0')) !== total) throw new Error('the matrix still filters kpi-0 after setting its interaction to none');
      await page.keyboard.press('Escape');
      await kpiIs('kpi-1', true, second);
      // Right-click a row → drill through to the detail page, filtered to that member; Back returns.
      await page.$eval('[data-testid="tile-matrix"] tbody tr', (el) => {
        const box = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 5 }));
      });
      await page.waitForSelector('[data-testid="point-menu"]');
      await domClick(page, '[data-testid="point-menu"] [data-testid^="drillthrough-"]');
      await page.waitForSelector('[data-testid="drillthrough-back"]');
      await waitForText(page, '[data-testid="drillthrough-filters"]', / · \S/, 5_000);
      await page.waitForSelector('[data-testid^="tile-"][data-status="ok"] .dash-kpi-value', { timeout: 60_000 });
      const detail = await textOf(page, '[data-testid^="tile-"] .dash-kpi-value');
      if (detail === cardTotal) throw new Error(`the drill-through page is not filtered (${detail})`);
      await fitsOnScreen(page, 'drillthrough');
      await domClick(page, '[data-testid="drillthrough-back"]');
      await page.waitForSelector('[data-testid="tile-matrix"]');
    });

    await step(page, 'dashboards: customize — calculations, what-if, conditional formatting, Python, theme, views, phone layout', async () => {
      await domClick(page, '[data-testid="edit-dashboard"]');
      await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 60_000 });
      await domClick(page, '[data-testid="page-0"]');
      await page.waitForSelector('[data-testid="frame-kpi-0"] .dash-tile[data-status="ok"]', { timeout: 60_000 });
      await page.click('[data-testid="frame-kpi-0"] .dash-kpi-label');
      await domClick(page, '[data-testid="pane-build"]');
      // A calculated measure, checked by Python before saving.
      const calculation = async (name, expression, format) => {
        await domClick(page, '[data-testid="new-calculation"]');
        await setInput(page, '[data-testid="calc-name"]', name);
        await setInput(page, '[data-testid="calc-expression"]', expression);
        if (format) await page.select('[data-testid="calc-editor"] select', format);
        await domClick(page, '[data-testid="calc-check"]');
        await waitForText(page, '[data-testid="calc-preview"]', /^= .+ over all rows/, 60_000);
        await domClick(page, '[data-testid="calc-save"]');
        await page.waitForSelector(`[data-testid="calc-${name}"]`);
      };
      await calculation('Margin', 'DIVIDE(SUM([profit]), SUM([revenue]))', 'percent');
      const insertCard = async (calc) => {
        await domClick(page, '[data-testid="insert-menu"]');
        await domClick(page, '[data-testid="insert-card"]');
        const id = await page.$eval('.dash-edit-frame.selected', (el) => el.getAttribute('data-testid').replace('frame-', ''));
        await domClick(page, `[data-testid="calc-${calc}"]`);
        await page.waitForSelector(`[data-testid="frame-${id}"] .dash-tile[data-status="ok"] .dash-kpi-value`, { timeout: 60_000 });
        return id;
      };
      const marginCard = await insertCard('Margin');
      await waitForText(page, `[data-testid="frame-${marginCard}"] .dash-kpi-value`, /%$/, 10_000);
      // A what-if parameter and a calculation that uses it.
      await domClick(page, '[data-testid="insert-menu"]');
      await domClick(page, '[data-testid="insert-parameter"]');
      await setInput(page, '[data-testid="parameter-name"]', 'Price change');
      await domClick(page, '[data-testid="parameter-save"]');
      await page.waitForSelector('[data-testid^="param-slider-"]');
      await domClick(page, '[data-testid="pane-build"]');
      await calculation('Projected', 'SUM([revenue]) * (1 + [Price change])');
      const projectedCard = await insertCard('Projected');
      // Conditional formatting on the matrix: a colour scale replaces the heat shading.
      await page.click('[data-testid="frame-matrix"] .dash-tile-title');
      await domClick(page, '[data-testid="pane-format"]');
      await domClick(page, '[data-testid="section-conditional"] summary');
      await domClick(page, '[data-testid="add-conditional"]');
      await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="frame-matrix"] td.num')].some((td) => /rgb\(254, 226, 226\)/.test(td.getAttribute('style') ?? '')), { timeout: 60_000 });
      // Analytics: an average line on the trend.
      await page.click('[data-testid="frame-trend"] .dash-tile-title');
      await domClick(page, '[data-testid="section-analytics"] summary');
      await domClick(page, '[data-testid="add-analytics"]');
      await page.waitForSelector('[data-testid="frame-trend"] .dash-tile[data-status="ok"]', { timeout: 60_000 });
      // A Python visual over two fields (the starter script draws a bar chart).
      await domClick(page, '[data-testid="insert-menu"]');
      await domClick(page, '[data-testid="insert-python"]');
      const python = await page.$eval('.dash-edit-frame.selected', (el) => el.getAttribute('data-testid'));
      await domClick(page, '[data-testid="field-region"]');
      await domClick(page, '[data-testid="field-revenue"]');
      await page.waitForSelector(`[data-testid="${python}"] .dash-tile[data-status="ok"] canvas`, { timeout: 90_000 });
      // Format painter: the Python visual takes the matrix's look.
      await page.click('[data-testid="frame-matrix"] .dash-tile-title');
      await domClick(page, '[data-testid="format-painter"]');
      await page.waitForSelector('[data-testid="editor-canvas"].painting');
      await page.click(`[data-testid="${python}"] .dash-tile-title`);
      await page.waitForFunction(() => !document.querySelector('[data-testid="editor-canvas"].painting'));
      // Theme: customize with a palette from a brand colour.
      await domClick(page, '[data-testid="theme-menu"]');
      await domClick(page, '[data-testid="theme-customize"]');
      await page.waitForSelector('[data-testid="theme-dialog"]');
      await domClick(page, '[data-testid="theme-generate"]');
      await page.screenshot({ path: `${SHOTS}/theme-dialog.png` });
      await domClick(page, '[data-testid="theme-apply"]');
      // An author view and the phone layout.
      await domClick(page, '[data-testid="pane-views"]');
      await setInput(page, '[data-testid="author-view-name"]', 'Start');
      await domClick(page, '[data-testid="add-author-view"]');
      await page.waitForSelector('[data-testid="author-view-0"]');
      await domClick(page, '[data-testid="layout-phone"]');
      await domClick(page, '[data-testid="mobile-auto"]');
      await page.waitForSelector('[data-testid^="mobile-item-"]');
      await page.screenshot({ path: `${SHOTS}/editor-phone.png` });
      await domClick(page, '[data-testid="layout-desktop"]');
      await page.waitForSelector('[data-testid="save-state"][data-state="saved"]', { timeout: 30_000 });
      await fitsOnScreen(page, 'editor-customized');
      await domClick(page, '[data-testid="done-editing"]');
      await page.waitForSelector(`[data-testid="tile-${projectedCard}"][data-status="ok"]`, { timeout: 60_000 });
      globalThis.projectedCard = projectedCard;
    });

    await step(page, 'dashboards: viewer — what-if slider, personalize a visual, personal views', async () => {
      const projected = `[data-testid="tile-${globalThis.projectedCard}"] .dash-kpi-value`;
      const before = await textOf(page, projected);
      await setInput(page, '[data-testid^="param-slider-"]', '0.3');
      await page.waitForFunction((sel, was) => document.querySelector(sel)?.textContent !== was, { timeout: 60_000 }, projected, before);
      // Personalize the matrix as a table, only for me; it survives a reload.
      await domClick(page, '[data-testid="vheader-matrix"] [data-testid="vheader-personalize"]');
      await page.waitForSelector('[data-testid="personalize-pane"]');
      await page.select('[data-testid="personalize-type"]', 'table');
      // A table lists the matrix's row and column fields side by side.
      await waitForText(page, '[data-testid="tile-matrix"] .dash-table thead th', /^Channel$/);
      await page.waitForSelector('[data-testid="vheader-matrix"] [data-testid="vheader-personalize"][aria-pressed="true"]');
      await fitsOnScreen(page, 'personalized');
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await page.reload({ waitUntil: 'networkidle2' });
      await page.waitForSelector('[data-testid="vheader-matrix"] [data-testid="vheader-personalize"][aria-pressed="true"]', { timeout: 60_000 });
      // A personal view, then reset everything to the author's dashboard.
      await domClick(page, '[data-testid="views-menu"]');
      await setInput(page, '[data-testid="view-name"]', 'Mine');
      await domClick(page, '[data-testid="save-view"]');
      await waitForText(page, '[data-testid="views-menu"]', /Mine/, 5_000);
      await page.screenshot({ path: `${SHOTS}/views-menu.png` });
      // Dark mode just for me (the author's dashboard keeps its own setting).
      await domClick(page, '[data-testid="personal-mode-dark"]');
      await page.waitForSelector('[data-testid="dashboard-canvas"][data-mode="dark"]');
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await fitsOnScreen(page, 'personal-dark');
      await domClick(page, '[data-testid="reset-personal"]');
      await page.waitForSelector('[data-testid="dashboard-canvas"][data-mode="light"]');
      await page.waitForSelector('[data-testid="vheader-matrix"] [data-testid="vheader-personalize"][aria-pressed="false"]', { timeout: 30_000 });
    });

    await step(page, 'settings: edit and save the profile', async () => {
      await page.goto(`${BASE}/app/settings`, { waitUntil: 'networkidle0' });
      await waitForText(page, 'body', new RegExp(email.replace(/[.@]/g, '\\$&')));
      await page.click('button[aria-label="Edit profile"]');
      const first = 'input[id="first-name"], input[aria-label="First name"], label input';
      await page.waitForSelector(first);
      await page.$eval('form input', (el) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, 'Grace B.');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await clickText(page, 'form button[type="submit"]', /Save/);
      await waitForText(page, '[role="alert"], .text-success, body', /Profile updated/i);
      // The sidebar account menu shows the saved API profile, not stale auth metadata.
      await waitForText(page, 'button.account-row', /Grace B\./);
    });

    await step(page, 'billing shows the real plans and wallet', async () => {
      await page.goto(`${BASE}/app/billing`, { waitUntil: 'networkidle0' });
      await waitForText(page, '[data-testid="current-plan"]', /Free/);
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="plan-grid"] > *').length === 4);
      const credits = await textOf(page, '[data-testid="available-credits"]');
      if (!/\d/.test(credits)) throw new Error(`No credit balance shown: ${credits}`);
      await clickText(page, '[data-testid="plan-grid"] button', /Choose Pro/);
      await waitForText(page, '[role="alert"], body', /Stripe|billing is not configured|no Stripe/i);
    });

    await step(page, 'sign out protects the app', async () => {
      await page.click('button.account-row');
      await clickText(page, 'button, [role="menuitem"]', /Sign out/);
      // The menu signs out with Supabase, then routes to /sign-in.
      await page.waitForFunction(() => location.pathname === '/sign-in', { timeout: 30_000 });
      await page.goto(`${BASE}/app/history`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => location.pathname === '/sign-in');
    });

    await step(page, 'sign in again with the password', async () => {
      await page.type('#email', email);
      await page.type('#password', password);
      await page.click('button[type="submit"]');
      await page.waitForFunction(() => location.pathname.startsWith('/app/'), { timeout: 30_000 });
    });

    if (pageErrors.length) throw new Error(`Page errors during the run:\n${pageErrors.join('\n')}`);
  } catch (error) {
    if (consoleErrors.length) console.error(`Browser console errors:\n${consoleErrors.slice(-5).join('\n---\n')}`);
    throw error;
  } finally {
    await browser.close();
  }
}

main()
  .then(() => {
    console.log(`\n${results.length} steps passed. Screenshots: ${SHOTS}`);
  })
  .catch((error) => {
    console.error(`\nE2E FAILED: ${error?.message ?? error}`);
    process.exit(1);
  });
