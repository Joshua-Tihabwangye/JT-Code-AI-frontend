// Responsive layout audit: every route at phone, tablet and desktop widths.
//
// Frontend-only (mock) mode, no backend needed:
//   1. here: npx vite --port 5199 --strictPort      (no .env.local, or VITE_DATA_MODE=mock)
//   2. here: npm run test:responsive
// Against the local Docker backend, with real datasets, charts and dashboards (Data Visualization only
// runs on the API):
//   1. jt-code-backend: make docker-up
//   2. here: npm run dev                           (VITE_DATA_MODE=api, http://localhost:5173)
//   3. here: RESPONSIVE_MODE=api npm run test:responsive
//      It signs up a throwaway account (confirmed through Mailpit, credits granted with
//      scripts/local_manage.py), loads the Retail sales sample and builds a dashboard first.
//
// For each route and viewport it fails on content that sticks out past the right edge of the screen
// (horizontal page scroll, or content cut off by an ancestor that hides overflow). Wide content that
// sits inside its own horizontal scroller (tables, ribbons, chart canvases) is allowed: that is the
// intended small-screen behaviour. Screenshots land in RESPONSIVE_SCREENSHOTS.
//
// Env: RESPONSIVE_BASE_URL (default http://127.0.0.1:5199, or http://localhost:5173 in api mode),
// CHROME_PATH, RESPONSIVE_SCREENSHOTS, RESPONSIVE_ONLY=<regex> (route names),
// RESPONSIVE_WIDTHS=360,768 (subset of the viewports), JT_CODE_BACKEND_DIR, MAILPIT_URL.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import puppeteer from 'puppeteer-core';

const MODE = process.env.RESPONSIVE_MODE === 'api' ? 'api' : 'mock';
const BASE = process.env.RESPONSIVE_BASE_URL ?? (MODE === 'api' ? 'http://localhost:5173' : 'http://127.0.0.1:5199');
const CHROME = process.env.CHROME_PATH ?? ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const SHOTS = process.env.RESPONSIVE_SCREENSHOTS ?? `test-results/responsive-${MODE}`;
const ONLY = process.env.RESPONSIVE_ONLY ? new RegExp(process.env.RESPONSIVE_ONLY, 'i') : null;
const BACKEND_DIR = resolve(process.env.JT_CODE_BACKEND_DIR ?? '../jt-code-backend');
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025';

const VIEWPORTS = [
  { name: 'phone-s', width: 360, height: 740, isMobile: true, hasTouch: true },
  { name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: 'tablet', width: 768, height: 1024, isMobile: true, hasTouch: true },
  { name: 'tablet-l', width: 1024, height: 768, isMobile: true, hasTouch: true },
  { name: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false },
].filter((v) => !process.env.RESPONSIVE_WIDTHS || process.env.RESPONSIVE_WIDTHS.split(',').includes(String(v.width)));

// `open` runs after navigation to reach a state worth checking (a dialog, a tab, an editor); returning
// false skips the check (the state does not exist in this mode). `path` may be a function of the setup.
const ROUTES = [
  { name: 'sign-in', path: '/sign-in', signedIn: false },
  { name: 'sign-up', path: '/sign-up', signedIn: false },
  { name: 'forgot-password', path: '/forgot-password', signedIn: false },
  { name: 'terms', path: '/terms', signedIn: false },
  { name: 'contact', path: '/contact', signedIn: false },
  { name: 'not-found', path: '/no-such-page', signedIn: false },
  { name: 'chat', path: '/app/chat' },
  { name: 'images', path: '/app/images' },
  { name: 'history', path: '/app/history' },
  { name: 'billing', path: '/app/billing' },
  { name: 'settings', path: '/app/settings' },
  { name: 'settings-team', path: '/app/settings?tab=team' },
  { name: 'nav-drawer', path: '/app/chat', open: openDrawer, widths: [360, 390, 768] },
  { name: 'visualize-home', path: '/app/visualize' },
  { name: 'visualize-data', path: '/app/visualize/data', open: waitFor('[data-testid="data-grid"]') },
  { name: 'visualize-gallery', path: '/app/visualize/gallery', open: waitFor('[data-testid^="gallery-chart-"]') },
  { name: 'visualize-explore', path: '/app/visualize/gallery', open: openExplore },
  { name: 'visualize-predict', path: '/app/visualize/predict' },
  { name: 'visualize-reports', path: '/app/visualize/reports' },
  { name: 'visualize-assistant', path: '/app/visualize/data', open: openAssistant },
  { name: 'dashboard-view', path: (setup) => setup.dashboard, open: waitFor('[data-testid="dashboard-canvas"]', 60_000) },
  { name: 'dashboard-edit', path: (setup) => setup.dashboard && `${setup.dashboard}/edit`, open: waitFor('[data-testid="editor-canvas"]', 60_000) },
];

const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'responsive@jt-code.local',
  passwordHash: 'x',
  firstName: 'Ada',
  lastName: 'Lovelace',
  contact: '',
  countryCode: 'UG',
  countryName: 'Uganda',
  dialCode: '+256',
  timezone: 'Africa/Kampala',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const domClick = (page, selector) => page.$eval(selector, (el) => el.click());

/** An `open` step that waits for a selector; without it (e.g. mock mode has no data) the check is skipped. */
function waitFor(selector, timeout = 30_000) {
  return async (page) => {
    try {
      await page.waitForSelector(selector, { timeout: MODE === 'api' ? timeout : 3_000 });
      await settle(page);
      return true;
    } catch {
      return MODE === 'mock';
    }
  };
}

async function openDrawer(page) {
  const button = await page.$('.mobile-hamburger');
  if (!button || !(await button.isVisible())) return false;
  await button.click();
  await sleep(400);
  return true;
}

async function openExplore(page) {
  if (!(await waitFor('[data-testid^="gallery-chart-"]')(page)) || MODE === 'mock') return MODE === 'mock';
  await domClick(page, '[data-testid^="gallery-chart-"]');
  await page.waitForSelector('[data-testid="explore"]', { timeout: 30_000 });
  await page.waitForSelector('[data-testid="explore-card-0"] canvas', { timeout: 90_000 }).catch(() => undefined);
  await settle(page);
  return true;
}

async function openAssistant(page) {
  const handle = await page.$('[data-testid="assistant-toggle"], .viz-assistant-fab, button[aria-label*="Ask JT-Code AI"]');
  if (!handle) {
    const clicked = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => /Ask JT-Code AI/.test(b.textContent ?? ''));
      button?.click();
      return Boolean(button);
    });
    if (!clicked) return false;
  } else {
    await handle.evaluate((el) => el.click());
  }
  await sleep(800);
  return true;
}

// --- api mode: one signed-up account with a dataset and a dashboard ------------------------------------

async function confirmationLink(address) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
    const message = messages.find((m) => /confirm/i.test(m.Subject) && m.To.some((to) => to.Address === address));
    if (message) {
      const { HTML } = await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json();
      const link = /href="([^"]*\/verify[^"]*)"/.exec(HTML)?.[1];
      if (link) return link.replace(/&amp;/g, '&');
    }
    await sleep(1000);
  }
  throw new Error(`No confirmation mail for ${address} in Mailpit`);
}

async function apiSetup(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => localStorage.setItem('i18nextLng', 'en'));
  let email = process.env.RESPONSIVE_EMAIL;
  let password = process.env.RESPONSIVE_PASSWORD;
  if (process.env.RESPONSIVE_SIGNUP === '1') {
    // Only when GoTrue mails through Mailpit: a real SMTP server would try to deliver to this address.
    const run = Date.now().toString(36);
    email = `responsive-${run}@jt-code.local`;
    password = `Resp-${run}-Passw0rd!`;
    console.log(`api setup: signing up ${email}`);
    await page.goto(`${BASE}/sign-up`, { waitUntil: 'load' });
    await page.waitForSelector('#firstName');
    await page.type('#firstName', 'Ada');
    await page.type('#lastName', 'Lovelace');
    await page.type('#email', email);
    await page.select('#countryCode', 'UG');
    await page.type('#contact', '700000000');
    await page.type('#password', password);
    await page.type('#confirmPassword', password);
    await page.click('#acceptedTerms');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => location.pathname === '/app/chat' || /confirmation link/i.test(document.body.innerText), { timeout: 30_000 });
    if (!(await page.evaluate(() => location.pathname === '/app/chat'))) {
      await page.goto(await confirmationLink(email), { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="email-confirmed"]', { timeout: 30_000 });
    }
  } else if (!email || !password) {
    throw new Error('api mode needs RESPONSIVE_EMAIL and RESPONSIVE_PASSWORD (an existing, confirmed login), or RESPONSIVE_SIGNUP=1 when Auth mails through Mailpit.');
  }
  if (!(await page.evaluate(() => location.pathname.startsWith('/app/')))) {
    console.log(`api setup: signing in as ${email}`);
    await page.goto(`${BASE}/sign-in`, { waitUntil: 'load' });
    await page.waitForSelector('#email');
    await page.type('#email', email);
    await page.type('#password', password);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => location.pathname.startsWith('/app/'), { timeout: 30_000 });
  }
  // The first authenticated request creates the Django user; credits pay for the dashboard build.
  await page.goto(`${BASE}/app/settings`, { waitUntil: 'load' });
  await sleep(3000);
  await promisify(execFile)(resolve(BACKEND_DIR, '.venv/bin/python'), ['scripts/local_manage.py', 'docker', 'grant_local_credits', email, '--credits', '5000'], { cwd: BACKEND_DIR }).catch((error) =>
    console.log(`api setup: could not grant credits (${String(error.message).split('\n')[0]})`),
  );
  console.log('api setup: loading the Retail sales sample');
  await page.goto(`${BASE}/app/visualize`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="sample-retail_sales"]', { timeout: 60_000 });
  await domClick(page, '[data-testid="sample-retail_sales"]');
  await page.waitForFunction(() => /Retail sales/.test(document.querySelector('[data-testid="module-dataset"]')?.selectedOptions[0]?.textContent ?? ''), { timeout: 60_000 });
  console.log('api setup: building a dashboard');
  await page.goto(`${BASE}/app/visualize/dashboards`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="dashboards-home"]', { timeout: 60_000 });
  const option = await page.$$eval('[data-testid="new-dashboard-dataset"] option', (options) => options.find((o) => /Retail sales/.test(o.textContent ?? ''))?.value);
  if (option) await page.select('[data-testid="new-dashboard-dataset"]', option);
  await domClick(page, '[data-testid="auto-dashboard"]');
  await page.waitForSelector('[data-testid="dashboard-canvas"]', { timeout: 90_000 });
  await page.waitForFunction(() => {
    const tiles = [...document.querySelectorAll('[data-testid^="tile-"]')];
    return tiles.length > 0 && tiles.every((tile) => tile.getAttribute('data-status') !== 'loading');
  }, { timeout: 120_000 });
  const dashboard = await page.evaluate(() => location.pathname.replace(/\/edit$/, ''));
  await page.close();
  console.log(`api setup: done (${dashboard})\n`);
  return { dashboard };
}

async function settle(page) {
  await page.evaluate(() => document.fonts?.ready);
  await new Promise((r) => setTimeout(r, 1500));
}

/** Elements whose box crosses the right edge of the viewport and that no horizontal scroller contains. */
function findOverflow() {
  const width = document.documentElement.clientWidth;
  const scrollerOf = (el) => {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      // The app's page scrollers are the page itself: sideways scrolling there is the bug we look for.
      if (node.matches('.page-scroll, .main-content, .app-shell, #root')) return null;
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1) {
        // A scroller that itself fits the screen is fine: its content scrolls inside it.
        return node.getBoundingClientRect().right <= width + 1 ? node : null;
      }
    }
    return null;
  };
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const classes = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).map((c) => `.${c}`).join('') : '';
    const text = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${classes}${text ? ` "${text}"` : ''}`;
  };
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[aria-hidden="true"], .sr-only, svg, canvas')) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed' && style.pointerEvents === 'none') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.right <= width + 1) continue;
    if (scrollerOf(el)) continue;
    // Report only the outermost offender of each subtree.
    const parent = el.parentElement;
    if (parent && parent.getBoundingClientRect().right > width + 1 && !scrollerOf(parent) && parent !== document.body) continue;
    offenders.push({ element: describe(el), right: Math.round(rect.right), width: Math.round(rect.width) });
  }
  const pageScroll = document.documentElement.scrollWidth > width + 1;
  if (pageScroll && !offenders.length) {
    // Positioned content escapes a scroller's clipping when its containing block is outside it.
    for (const el of document.querySelectorAll('body *')) {
      const position = getComputedStyle(el).position;
      const rect = el.getBoundingClientRect();
      if ((position === 'absolute' || position === 'fixed') && rect.right > width + 1 && rect.width > 0) {
        offenders.push({ element: `${describe(el)} (position: ${position}, escapes its scroller)`, right: Math.round(rect.right), width: Math.round(rect.width) });
      }
    }
  }
  // Sideways scrollers in Visualize hide their scrollbar on phones: one that overflows must show a hint.
  const hintless = [];
  for (const el of document.querySelectorAll('.viz-nav, .viz-libraries, .viz-ribbon-tabs, .viz-ribbon-body, .dash-editor-bar, .dash-pages')) {
    if (el.scrollWidth <= el.clientWidth + 1 || getComputedStyle(el).display === 'none') continue;
    if (!el.hasAttribute('data-more-left') && !el.hasAttribute('data-more-right')) hintless.push(describe(el));
  }
  // The open phone drawer: its last control must end clear of a browser toolbar drawn over the bottom
  // (Safari's floating bar), or be reachable by scrolling the drawer.
  let drawer = null;
  const sidebar = document.querySelector('.app-shell.drawer-open .sidebar');
  if (sidebar) {
    const controls = [...sidebar.querySelectorAll('.sidebar-footer button, .sidebar-footer a')].filter((el) => el.getBoundingClientRect().height > 0);
    const last = controls[controls.length - 1];
    const bottom = last ? Math.round(last.getBoundingClientRect().bottom) : 0;
    const clear = window.innerHeight - 96;
    const scrolls = sidebar.scrollHeight > sidebar.clientHeight + 1;
    if (!last || (bottom > clear && !scrolls)) drawer = `last drawer control ends at ${bottom}px, toolbar zone starts at ${clear}px`;
  }
  return {
    pageScroll,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: offenders.slice(0, 12),
    hintless,
    drawer,
  };
}

async function main() {
  if (!CHROME) throw new Error('No Chrome found; set CHROME_PATH.');
  mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const failures = [];
  const skipped = [];
  let checked = 0;
  try {
    const setup = MODE === 'api' ? await apiSetup(browser) : {};
    // api mode: signed-in pages share the set-up session; signed-out pages get a clean context.
    const signedOut = MODE === 'api' ? await browser.createBrowserContext() : null;
    for (const route of ROUTES) {
      if (ONLY && !ONLY.test(route.name)) continue;
      const path = typeof route.path === 'function' ? route.path(setup) : route.path;
      for (const viewport of VIEWPORTS) {
        if (route.widths && !route.widths.includes(viewport.width)) continue;
        const label = `${route.name} @ ${viewport.width}px`;
        if (!path) {
          skipped.push(label);
          continue;
        }
        const signedIn = route.signedIn !== false;
        const page = MODE === 'api' && !signedIn ? await signedOut.newPage() : await browser.newPage();
        await page.setViewport(viewport);
        // No slide-in or fade animations: the layout is measured in its final position.
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        if (MODE === 'mock') {
          await page.evaluateOnNewDocument(
            (user, signed) => {
              localStorage.setItem('jtcode_users', JSON.stringify([user]));
              if (signed) localStorage.setItem('jtcode_session', JSON.stringify({ accessToken: 'local.responsive', userId: user.id, issuedAt: new Date().toISOString() }));
              else localStorage.removeItem('jtcode_session');
            },
            USER,
            signedIn,
          );
        }
        await page.evaluateOnNewDocument(() => localStorage.setItem('i18nextLng', 'en'));
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error.message ?? error)));
        try {
          await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 60_000 });
          await settle(page);
          if (route.open && (await route.open(page)) === false) {
            skipped.push(label);
            continue;
          }
          const result = await page.evaluate(findOverflow);
          await page.screenshot({ path: `${SHOTS}/${route.name}-${viewport.width}.png`, fullPage: false });
          checked += 1;
          const problems = [
            ...(result.pageScroll ? [`page scrolls sideways (scrollWidth ${result.scrollWidth})`] : []),
            ...result.offenders.map((o) => `${o.element} → right ${o.right}px (width ${o.width})`),
            ...result.hintless.map((h) => `${h} scrolls sideways without a hint`),
            ...(result.drawer ? [result.drawer] : []),
            ...errors.map((e) => `page error: ${e}`),
          ];
          if (problems.length) {
            failures.push(label);
            console.log(`  ✗ ${label}\n${problems.map((p) => `      ${p}`).join('\n')}`);
          } else {
            console.log(`  ✓ ${label}`);
          }
        } catch (error) {
          failures.push(label);
          console.log(`  ✗ ${label}\n      ${String(error?.message ?? error).split('\n')[0]}`);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  if (skipped.length) console.log(`\nskipped (state not available in ${MODE} mode): ${skipped.join(', ')}`);
  console.log(`\n${checked - failures.length}/${checked} route/viewport checks fit the screen (${MODE} mode). Screenshots: ${SHOTS}/`);
  if (failures.length) process.exitCode = 1;
}

await main();
