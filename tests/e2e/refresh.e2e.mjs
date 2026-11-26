// Refreshing any page of the built app, served the way Vercel serves it (vercel.json), never gives a 404 or
// the crash screen; a page download from a replaced build reloads the app once instead of crashing.
//
//   npm run build            (frontend-only mode is enough: no .env.local, or VITE_DATA_MODE=mock)
//   npm run test:refresh
//
// The server below applies vercel.json like Vercel does: an existing file wins, otherwise the first
// matching rewrite, otherwise 404; then the matching headers. It serves a temporary copy of dist/ on a free
// port, so it never changes the build output and several runs can happen at once. Env: CHROME_PATH.
import { cpSync, existsSync, mkdtempSync, readFileSync, renameSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer-core';

if (!existsSync(join('dist', 'index.html'))) throw new Error('dist/index.html is missing: run npm run build first.');
// The stale-deploy check removes a file: work on a copy, never on the build output.
const DIST = mkdtempSync(join(tmpdir(), 'jt-refresh-'));
cpSync('dist', DIST, { recursive: true });
let BASE = '';
const CHROME = process.env.CHROME_PATH ?? ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };

/** Vercel `source` patterns used here are a path with regex groups; anchor them like Vercel does. */
const pattern = (source) => new RegExp(`^${source}$`);

function resolveRequest(pathname) {
  const file = normalize(join(DIST, decodeURIComponent(pathname)));
  if (file.startsWith(`${DIST}/`) && existsSync(file) && statSync(file).isFile()) return { file, status: 200 };
  for (const rewrite of config.rewrites ?? []) {
    if (pattern(rewrite.source).test(pathname)) return { file: join(DIST, rewrite.destination), status: 200 };
  }
  return { file: null, status: 404 };
}

const server = createServer((request, response) => {
  const { pathname } = new URL(request.url, BASE);
  const { file, status } = resolveRequest(pathname);
  for (const rule of config.headers ?? []) {
    if (pattern(rule.source).test(pathname)) for (const header of rule.headers) response.setHeader(header.key, header.value);
  }
  if (!file) {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('404: NOT_FOUND');
    return;
  }
  response.writeHead(status, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  response.end(readFileSync(file));
});

const USER = { id: '00000000-0000-4000-8000-000000000001', email: 'refresh@jt-code.local', passwordHash: 'x', firstName: 'Ada', lastName: 'Lovelace', contact: '', countryCode: 'UG', countryName: 'Uganda', dialCode: '+256', timezone: 'Africa/Kampala', avatarUrl: null, createdAt: '2026-01-01T00:00:00.000Z' };
const ROUTES = [
  ['/sign-in', false], ['/sign-up', false], ['/forgot-password', false], ['/terms', false], ['/privacy', false], ['/contact', false],
  ['/app/chat', true], ['/app/images', true], ['/app/history', true], ['/app/billing', true], ['/app/settings', true], ['/app/settings?tab=team', true],
  ['/app/visualize', true], ['/app/visualize/data', true], ['/app/visualize/gallery', true], ['/app/visualize/explore', true],
  ['/app/visualize/predict', true], ['/app/visualize/reports', true], ['/app/visualize/dashboards/abc', true],
  ['/share/some-token', false], ['/invite/abc?token=t', true],
];

const failures = [];
const ok = (label) => console.log(`  ✓ ${label}`);
const fail = (label, why) => {
  failures.push(label);
  console.log(`  ✗ ${label}\n      ${why}`);
};

async function newPage(browser, signedIn) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluateOnNewDocument(
    (user, signed) => {
      localStorage.setItem('i18nextLng', 'en');
      localStorage.setItem('jtcode_users', JSON.stringify([user]));
      if (signed) localStorage.setItem('jtcode_session', JSON.stringify({ accessToken: 'local.refresh', userId: user.id, issuedAt: new Date().toISOString() }));
    },
    USER,
    signedIn,
  );
  return page;
}

/** The app rendered something, and it is not the crash screen. */
async function rendered(page) {
  await page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, { timeout: 20_000 });
  await new Promise((r) => setTimeout(r, 600));
  return page.evaluate(() => ({ crashed: !!document.querySelector('.fatal-error'), path: location.pathname }));
}

async function checkRoutes(browser) {
  for (const [path, signedIn] of ROUTES) {
    const page = await newPage(browser, signedIn);
    try {
      const first = await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
      const again = await page.reload({ waitUntil: 'load' });
      const state = await rendered(page);
      if (first.status() !== 200 || again.status() !== 200) fail(`refresh ${path}`, `HTTP ${first.status()} then ${again.status()}`);
      else if (state.crashed) fail(`refresh ${path}`, 'the crash screen is shown');
      else ok(`refresh ${path} → 200, rendered (${state.path})`);
    } catch (error) {
      fail(`refresh ${path}`, String(error.message ?? error).split('\n')[0]);
    } finally {
      await page.close();
    }
  }
}

/** A tab from the previous build asks for a page file the new deployment no longer has. */
async function checkStaleDeploy(browser) {
  // A fresh context (empty HTTP cache): the route checks above already cached every page file, which are
  // immutable for a year, and a visitor who has a file cached never sees the failure.
  const context = await browser.createBrowserContext();
  const page = await newPage(context, true);
  let loads = 0;
  const requested = new Set();
  const messages = [];
  page.on('load', () => (loads += 1));
  page.on('request', (request) => requested.add(new URL(request.url()).pathname.split('/').pop()));
  page.on('pageerror', (error) => messages.push(String(error.message).slice(0, 160)));
  let renamed = null;
  try {
    await page.goto(`${BASE}/app/chat`, { waitUntil: 'load' });
    await rendered(page);
    // A sidebar page whose file this tab has not downloaded yet (pages are fetched on first visit).
    const files = readdirSync(join(DIST, 'assets'));
    const target = [
      ['/app/billing', /^BillingPage-.*\.js$/],
      ['/app/images', /^ImagePlaygroundPage-.*\.js$/],
      ['/app/history', /^HistoryPage-.*\.js$/],
      ['/app/visualize', /^VisualizeLayout-.*\.js$/],
    ]
      .map(([href, name]) => [href, files.find((file) => name.test(file))])
      .find(([, file]) => file && !requested.has(file));
    if (!target) return fail('stale deploy', 'every page file was already downloaded; nothing to simulate');
    const [href, file] = target;
    renamed = join(DIST, 'assets', file);
    renameSync(renamed, `${renamed}.gone`);
    loads = 0;
    // An in-app link to a page whose file is gone: the app reloads once instead of crashing.
    await page.evaluate((link) => document.querySelector(`a[href="${link}"]`)?.click(), href);
    await new Promise((r) => setTimeout(r, 4000));
    if (loads !== 1) fail('stale deploy', `expected exactly one reload after opening ${href}, saw ${loads} ${messages.slice(-2).join(' | ')}`);
    else ok(`stale deploy: opening ${href} with its file gone reloads once instead of crashing`);
    // The reloaded page fails the same way (the file is really missing): it must not reload again.
    await new Promise((r) => setTimeout(r, 3000));
    if (loads !== 1) fail('stale deploy loop guard', `reloaded ${loads} times`);
    else ok('stale deploy: a broken deploy shows the error instead of reloading forever');
  } finally {
    if (renamed && existsSync(`${renamed}.gone`)) renameSync(`${renamed}.gone`, renamed);
    await context.close();
  }
}

/** Security headers on Vercel, like nginx.conf: no framing except /embed/, no MIME sniffing. */
async function checkHeaders() {
  const headers = async (path) => (await fetch(`${BASE}${path}`)).headers;
  const app = await headers('/app/chat');
  const embed = await headers('/embed/abc');
  const problems = [];
  if (app.get('x-frame-options') !== 'DENY') problems.push('/app/chat lacks X-Frame-Options: DENY');
  if (!app.get('content-security-policy')?.includes("frame-ancestors 'none'")) problems.push("/app/chat lacks frame-ancestors 'none'");
  if (app.get('x-content-type-options') !== 'nosniff') problems.push('/app/chat lacks nosniff');
  if (!app.get('strict-transport-security')) problems.push('/app/chat lacks HSTS');
  if (embed.get('x-frame-options')) problems.push('/embed/ must be frameable but sends X-Frame-Options');
  if (!embed.get('content-security-policy')?.includes('frame-ancestors *')) problems.push('/embed/ lacks frame-ancestors *');
  if ((embed.get('content-security-policy') ?? '').split(',').length > 1) problems.push('/embed/ gets two CSP headers');
  if (problems.length) fail('security headers', problems.join('; '));
  else ok('security headers: pages refuse framing (embeds allow it), nosniff, HSTS');
}

async function main() {
  if (!CHROME) throw new Error('No Chrome found; set CHROME_PATH.');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  BASE = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    // The host itself: deep links get the app, missing build files get a real 404, not index.html.
    const asset = resolveRequest('/assets/does-not-exist.js');
    if (asset.status !== 404) fail('missing asset', 'a missing /assets file is answered with index.html (JavaScript would get HTML)');
    else ok('missing /assets file → 404 (never index.html)');
    await checkHeaders();
    await checkRoutes(browser);
    await checkStaleDeploy(browser);
  } finally {
    await browser.close();
    server.close();
    rmSync(DIST, { recursive: true, force: true });
  }
  console.log(`\n${failures.length ? `${failures.length} failed` : 'all passed'}`);
  if (failures.length) process.exitCode = 1;
}

await main();
