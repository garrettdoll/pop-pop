// End-to-end tests in a real browser against a mock GitHub API.
// Run from the repo root:  NODE_PATH=$(npm root -g) node tests/e2e.mjs
// (needs Playwright with Chromium; starts its own static server and mock GitHub, nothing to set up)
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMock, TOKEN } from './mock-github.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_PORT = 8125, API_PORT = 8126;
const APP = `http://localhost:${APP_PORT}/`;
const TODAY = '2026-10-03';
const FIXTURES = path.join(root, 'tests/fixtures/data'); // a frozen copy of the data: tests must never depend on the live hub

// ---------- static server for the app ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const appServer = http.createServer((req, res) => {
  const url = new URL(req.url, APP);
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (file.endsWith('/')) file += 'index.html';
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => appServer.listen(APP_PORT, r));

const browser = await chromium.launch();
const results = [];
const pageErrors = [];
let active = []; // open pages + mock servers, always closed after each test (even a failing one)

async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return; // ONLY="service worker" runs just that test
  try { await fn(); results.push([name, true]); console.log(`PASS  ${name}`); }
  catch (e) { results.push([name, false]); console.log(`FAIL  ${name}\n      ${String(e.message).split('\n').slice(0, 6).join('\n      ')}`); }
  finally {
    for (const close of active) await close().catch(() => {});
    active = [];
  }
}

const until = async (fn, { ms = 6000, what = 'condition' } = {}) => {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v; } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 60));
  }
  throw new Error(`Timed out waiting for ${what}${last ? ` (${last.message})` : ''}`);
};

/** A fresh browser context + page wired to a fresh mock GitHub. */
async function open({ token = false, sw = false, hash = '#/markets', route } = {}) {
  const mock = await startMock({ port: API_PORT, dataDir: FIXTURES });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: sw ? 'allow' : 'block' });
  await ctx.addInitScript(({ token, port }) => {
    try {
      localStorage.setItem('pop.setupSeen', '1');
      localStorage.setItem('pop.config', JSON.stringify({ owner: 'garrettdoll', repo: 'pop-pop', branch: 'main', apiBase: `http://localhost:${port}` }));
      if (token) localStorage.setItem('pop.token', token);
    } catch { /* ignore */ }
  }, { token: token ? TOKEN : null, port: API_PORT });
  if (!sw) {
    await ctx.route((u) => u.origin === new URL(APP).origin && u.pathname.startsWith('/data/'), (r) => { // the app's own files only, never the mock GitHub API
      const name = path.basename(new URL(r.request().url()).pathname);
      const file = path.join(FIXTURES, name);
      if (fs.existsSync(file)) r.fulfill({ body: fs.readFileSync(file), contentType: 'application/json' });
      else r.continue();
    });
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  if (route) await route(page, ctx);
  await page.goto(`${APP}?today=${TODAY}${hash}`);
  const close = async () => { await ctx.close(); await mock.close(); };
  active.push(close);
  await page.waitForSelector('.view:not(.loading)', { timeout: 8000 });
  return { page, ctx, mock, close };
}

const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
const expand = async (page, id) => {
  const c = card(page, id);
  if (!(await c.evaluate((el) => el.classList.contains('open')))) await c.locator('.card-head').click();
  await page.waitForTimeout(350);
  return c;
};
const initial = (p) => JSON.parse(fs.readFileSync(path.join(FIXTURES, path.basename(p)), 'utf8'));

// =====================================================================

await test('read-only without a token: a tap explains itself and changes nothing', async () => {
  const t = await open();
  const c = await expand(t.page, 'fort-greene-artisans-bazaar');
  await c.locator('select.status-select').selectOption('applied');
  await until(async () => /View-only/.test(await t.page.locator('#toast').innerText()), { what: 'view-only toast' });
  assert.equal(await c.locator('select.status-select').inputValue(), 'unknown', 'select snaps back');
  assert.equal(await t.page.locator('#ro-pill').isVisible(), true, 'view-only pill shows');
  assert.equal(t.mock.requests.length, 0, 'no GitHub API calls without a token');
  await t.close();
});

await test('token flow: bad token is refused with a clear message, good token connects, removal works', async () => {
  const t = await open();
  await t.page.getByRole('button', { name: 'Settings' }).click();
  const input = t.page.locator('dialog input[name="token"]');
  await input.fill('wrong-token');
  await t.page.locator('dialog button[type="submit"]').click();
  await until(async () => /rejected/i.test(await t.page.locator('dialog .form-msg').innerText()), { what: 'rejection message' });
  assert.equal(await t.page.evaluate(() => localStorage.getItem('pop.token')), null, 'a rejected token is not stored');
  await input.fill(TOKEN);
  await t.page.locator('dialog button[type="submit"]').click();
  await until(async () => (await t.page.locator('dialog .acct-in_system').count()) > 0, { what: 'Connected tag' });
  assert.equal(await t.page.evaluate(() => localStorage.getItem('pop.token')), TOKEN);
  assert.equal(await t.page.locator('dialog input[name="token"]').count(), 0, 'token field is gone once connected');
  t.page.once('dialog', (d) => d.accept());
  await t.page.getByRole('button', { name: 'Remove token' }).click();
  await until(async () => (await t.page.evaluate(() => localStorage.getItem('pop.token'))) === null, { what: 'token removed' });
  await t.close();
});

await test('a status tap saves exactly one change, to the right file, with history', async () => {
  const t = await open({ token: true });
  const before = initial('data/markets.json');
  const c = await expand(t.page, 'fort-greene-artisans-bazaar');
  await c.locator('select.status-select').selectOption('applied');
  await until(() => t.mock.commits.length === 1, { what: 'one commit' });
  assert.deepEqual(t.mock.commits[0], { path: 'data/markets.json', message: 'app: Fort Greene Artisans Bazaar → applied', branch: 'main' });
  const saved = t.mock.json('data/markets.json');
  const m = saved.markets.find((x) => x.id === 'fort-greene-artisans-bazaar');
  assert.equal(m.status, 'applied');
  assert.ok(!m.flags.some((f) => f.type === 'unconfirmed' && f.field === 'status'), 'the "not confirmed" flag is cleared');
  const last = m.history[m.history.length - 1];
  assert.equal(last.by, 'app');
  assert.match(last.change, /unknown → applied/);
  for (const other of before.markets.filter((x) => x.id !== 'fort-greene-artisans-bazaar')) {
    assert.deepEqual(saved.markets.find((x) => x.id === other.id), other, `${other.id} untouched`);
  }
  assert.equal(await c.locator('.sticker').innerText().then((s) => /applied/i.test(s)), true, 'UI shows the new status');
  await until(async () => /Saved/.test(await t.page.locator('#toast').innerText()), { what: 'Saved toast' });
  await t.close();
});

await test("never overwrites Claude's edits made after the app loaded", async () => {
  const t = await open({ token: true });
  // Claude edits the repo while the app is already open with older data
  t.mock.edit('data/markets.json', (d) => {
    d.markets.find((m) => m.id === 'osh-fall-bazaar-2026-10-17').notes = 'Claude: emailed the organizer today';
    d.markets.push({ id: 'new-from-claude', name: 'Brand New Claude Market', status: 'unknown', dates: [{ date: '2026-11-21' }] });
  });
  const c = await expand(t.page, 'fort-greene-artisans-bazaar');
  await c.locator('select.status-select').selectOption('applied');
  await until(() => t.mock.commits.length === 1, { what: 'commit' });
  const saved = t.mock.json('data/markets.json');
  assert.equal(saved.markets.find((m) => m.id === 'fort-greene-artisans-bazaar').status, 'applied');
  assert.equal(saved.markets.find((m) => m.id === 'osh-fall-bazaar-2026-10-17').notes, 'Claude: emailed the organizer today', "Claude's note survived");
  assert.ok(saved.markets.some((m) => m.id === 'new-from-claude'), "Claude's new card survived");
  await until(async () => (await t.page.locator('.card', { hasText: 'Brand New Claude Market' }).count()) === 1, { what: 'new card shown after save' });
  await t.close();
});

await test('write conflicts: retries quietly, and a stuck save is kept and can be retried', async () => {
  const t = await open({ token: true });
  // two stale-sha rejections, then success
  t.mock.hooks.failPuts = 2;
  let c = await expand(t.page, 'fort-greene-artisans-bazaar');
  await c.locator('select.status-select').selectOption('applied');
  await until(() => t.mock.commits.length === 1, { what: 'save after 2 conflicts', ms: 8000 });
  assert.equal(await t.page.locator('.banner-error').count(), 0, 'no error shown for conflicts that resolve');
  // a conflict that never clears
  t.mock.hooks.failPuts = 999;
  c = await expand(t.page, 'osh-fall-bazaar-2026-10-17');
  await c.locator('select.status-select').selectOption('to-apply');
  await until(async () => (await t.page.locator('.banner-error').count()) === 1, { what: 'error banner', ms: 10000 });
  assert.match(await t.page.locator('.banner-error').innerText(), /Couldn't save/);
  assert.equal(await c.locator('.sticker').innerText().then((s) => /to apply/i.test(s)), true, 'UI keeps the optimistic change');
  assert.equal(t.mock.commits.length, 1, 'nothing extra was written');
  const pending = await t.page.evaluate(() => JSON.parse(localStorage.getItem('pop.pending.v1')));
  assert.equal(pending.length, 1, 'the change is kept on the device');
  // conflict clears; Retry saves it
  t.mock.hooks.failPuts = 0;
  await t.page.locator('.banner-error .banner-action').click();
  await until(() => t.mock.commits.length === 2, { what: 'retry commit' });
  assert.equal(t.mock.json('data/markets.json').markets.find((m) => m.id === 'osh-fall-bazaar-2026-10-17').status, 'to-apply');
  await until(async () => (await t.page.locator('.banner-error').count()) === 0, { what: 'banner gone' });
  assert.equal(await t.page.evaluate(() => JSON.parse(localStorage.getItem('pop.pending.v1')).length), 0);
  await t.close();
});

await test('a pending change survives closing the app and is saved on the next open', async () => {
  const t = await open({ token: true });
  t.mock.hooks.failPuts = 999;
  t.mock.hooks.failStatus = 500;
  const c = await expand(t.page, 'fort-greene-artisans-bazaar');
  await c.locator('select.status-select').selectOption('skipped');
  await until(async () => (await t.page.locator('.banner-error').count()) === 1, { what: 'error banner' });
  t.mock.hooks.failPuts = 0;
  await t.page.reload();
  await t.page.waitForSelector('.card');
  await until(() => t.mock.commits.length === 1, { what: 'saved on next open', ms: 8000 });
  assert.equal(t.mock.json('data/markets.json').markets.find((m) => m.id === 'fort-greene-artisans-bazaar').status, 'skipped');
  await t.close();
});

await test('a two-file save that dies halfway is safe to retry (no duplicate history)', async () => {
  const t = await open({ token: true, hash: '#/foryou' });
  const id = 'bq-living-furniture-decor-fair-2026-07-19';
  t.mock.hooks.failPuts = 999;
  t.mock.hooks.failStatus = 500;
  t.mock.hooks.failPath = 'data/questions.json'; // markets.json will save, questions.json will not
  const row = t.page.locator('.q-row', { hasText: 'Living Furniture & Decor Fair' }).first();
  await row.getByRole('button', { name: 'Vended', exact: true }).click();
  await until(async () => (await t.page.locator('.banner-error').count()) === 1, { what: 'error banner' });
  assert.equal(t.mock.commits.filter((c) => c.path === 'data/markets.json').length, 1, 'first half saved');
  t.mock.hooks.failPuts = 0;
  await t.page.locator('.banner-error .banner-action').click();
  await until(() => t.mock.commits.some((c) => c.path === 'data/questions.json'), { what: 'second half saved' });
  const m = t.mock.json('data/markets.json').markets.find((x) => x.id === id);
  assert.equal(m.status, 'completed');
  assert.equal(m.history.filter((h) => /Status:/.test(h.change)).length, 1, 'status change logged once');
  assert.ok(t.mock.json('data/questions.json').items.find((q) => q.id === 'q-005').answers[id], 'answer recorded');
  assert.equal(t.mock.commits.filter((c) => c.path === 'data/markets.json').length, 1, 'markets.json not rewritten on retry');
  await t.close();
});

await test('Explore: add to hub and dismiss', async () => {
  const t = await open({ token: true, hash: '#/explore' });
  t.mock.edit('data/explore.json', (d) => {
    d.items.push(
      { id: 'find-a', name: 'Bushwick Night Market', status: 'unknown', foundBy: 'search', foundAt: '2026-10-03', worthALook: true, worthReason: 'In Bushwick, big streetwear crowd', dates: [{ date: '2026-10-31' }], location: { neighborhood: 'Bushwick', borough: 'Brooklyn' } },
      { id: 'find-b', name: 'Somewhere Far Market', status: 'unknown', foundBy: 'search', foundAt: '2026-10-03', worthALook: false, dates: [{ date: '2026-11-01' }] },
    );
  });
  await t.page.reload();
  await t.page.waitForSelector('.find');
  assert.equal(await t.page.locator('.tab[data-tab="explore"] .badge').innerText(), '2');
  assert.match(await t.page.locator(".find").first().innerText(), /worth a look/i, "starred find sits first");
  assert.match(await t.page.locator('.find').first().innerText(), /found by search, verify/i);
  await t.page.locator('.find[data-id="find-a"]').getByRole('button', { name: 'Add to hub' }).click();
  await until(() => t.mock.commits.length === 2, { what: 'two commits (markets + explore)' });
  const m = t.mock.json('data/markets.json').markets.find((x) => x.id === 'find-a');
  assert.equal(m.status, 'researching');
  assert.ok(!('worthALook' in m) && !('foundBy' in m), 'explore-only fields stripped');
  assert.ok(m.flags.some((f) => f.type === 'verify'));
  assert.equal(t.mock.json('data/explore.json').items.find((x) => x.id === 'find-a').moved, true);
  await t.page.locator('.find[data-id="find-b"]').getByRole('button', { name: 'Dismiss' }).click();
  await until(() => t.mock.json('data/explore.json').items.find((x) => x.id === 'find-b').dismissed === true, { what: 'dismissed saved' });
  await until(async () => (await t.page.locator('.find').count()) === 0, { what: 'finds gone' });
  await t.close();
});

await test('Questions: per-market answers set status, date answers set the date, counts update', async () => {
  const t = await open({ token: true, hash: '#/foryou' });
  const badge = () => t.page.locator('.tab[data-tab="foryou"] .badge').innerText();
  const waiting = initial('data/questions.json').items.filter((q) => q.type === 'question' && !q.answeredAt).length;
  assert.equal(await badge(), String(waiting), 'badge counts unanswered questions, not ideas');
  // q-001 row: Old Stone House Oct 17 → Applied
  const row = t.page.locator('.q-row', { hasText: 'Old Stone House Fall' });
  await row.getByRole('button', { name: 'Applied', exact: true }).click();
  await until(() => t.mock.json('data/markets.json').markets.find((m) => m.id === 'osh-fall-bazaar-2026-10-17').status === 'applied', { what: 'status applied' });
  // q-002: date
  const q2 = t.page.locator('.q-card', { hasText: 'final DUMBO flea' });
  await q2.locator('input[type="date"]').fill('2026-11-14');
  await q2.getByRole('button', { name: 'Save date' }).click();
  await until(() => (t.mock.json('data/markets.json').markets.find((m) => m.id === 'bq-flea-dumbo-final-2026').dates || []).length === 1, { what: 'date saved' });
  const bq = t.mock.json('data/markets.json').markets.find((m) => m.id === 'bq-flea-dumbo-final-2026');
  assert.equal(bq.dates[0].date, '2026-11-14');
  assert.ok(!bq.flags.some((f) => f.field === 'dates'), 'date flag cleared');
  await until(async () => (await badge()) === String(waiting - 1), { what: 'badge goes down by one' });
  await t.close();
});

await test('results: profit shows only when both sales and booth fee exist', async () => {
  const t = await open({ token: true, hash: '#/markets' });
  let c = await expand(t.page, 'fad-fall-cobble-hill-2026');
  await c.getByRole('button', { name: 'Add results' }).click();
  await c.locator('input[name="salesTotal"]').fill('$800');
  await c.locator('input[name="boothFee"]').fill('');
  await c.getByRole('button', { name: /Good day/ }).click();
  await c.getByRole('button', { name: 'Save results' }).click();
  await until(() => t.mock.commits.length === 1, { what: 'results saved' });
  c = card(t.page, 'fad-fall-cobble-hill-2026');
  await until(async () => /Sales/.test(await c.innerText()), { what: 'results block' });
  assert.ok(!/Profit/.test(await c.innerText()), 'no profit without a booth fee');
  await c.getByRole('button', { name: 'Edit results' }).click();
  await c.locator('input[name="boothFee"]').fill('150');
  await c.getByRole('button', { name: 'Save results' }).click();
  await until(() => t.mock.commits.length === 2, { what: 'second save' });
  await until(async () => /Profit/.test(await card(t.page, 'fad-fall-cobble-hill-2026').innerText()), { what: 'profit shows' });
  assert.match(await card(t.page, 'fad-fall-cobble-hill-2026').innerText(), /\$650/);
  await t.close();
});

await test('holiday-weekend logic in the UI: Mon Oct 12 likely free, Wed Oct 14 flagged, Sat no flag', async () => {
  const t = await open({
    hash: '#/markets',
    route: (page) => page.route('**/data/markets.json*', (r) => r.fulfill({ json: { version: 1, markets: [
      { id: 'hol-mon', name: 'Holiday Monday Market', status: 'accepted', dates: [{ date: '2026-10-12' }] },
      { id: 'plain-wed', name: 'Plain Wednesday Market', status: 'accepted', dates: [{ date: '2026-10-14' }] },
      { id: 'sat-ev', name: 'Saturday Market', status: 'accepted', dates: [{ date: '2026-10-17' }, { date: '2026-10-18', rainDate: null }] },
    ] } })),
  });
  const text = async (id) => card(t.page, id).innerText();
  assert.match(await text('hol-mon'), /Falls on Columbus Day weekend/);
  assert.doesNotMatch(await text('hol-mon'), /Availability to confirm/);
  assert.match(await text('plain-wed'), /Availability to confirm/);
  assert.doesNotMatch(await text('sat-ev'), /Availability|Falls on|Next to/);
  // filters
  await t.page.getByRole('button', { name: /Weekends only/ }).click();
  await until(async () => (await t.page.locator('.card').count()) === 1, { what: 'weekends only → 1 card' });
  await t.page.getByRole('button', { name: /Weekends only/ }).click();
  await t.page.getByRole('button', { name: /Needs availability check/ }).click();
  await until(async () => (await t.page.locator('.card').count()) === 2, { what: 'availability check → 2 cards' });
  // the likely-free holiday Monday sorts above the plain Wednesday
  assert.equal(await t.page.locator('.card').first().getAttribute('data-id'), 'hol-mon');
  await t.close();
});

await test('malformed data never blanks the screen, and problems are listed in Settings', async () => {
  const t = await open({
    hash: '#/markets',
    route: async (page) => {
      await page.route('**/data/markets.json*', (r) => r.fulfill({ json: { version: 1, markets: [
        { id: 'min', name: 'Minimal card' },
        { id: 'baddate', name: 'Bad date card', dates: [{ date: 'Oct 17' }] },
        { id: 'weird', name: 'Weird status card', status: 'maybe-ish' },
        { id: 'min', name: 'Duplicate id' },
        { name: 'No id at all' },
        'a string, not an object',
      ] } }));
      await page.route('**/data/organizers.json*', (r) => r.fulfill({ body: '"not an object"', contentType: 'application/json' }));
      await page.route('**/data/questions.json*', (r) => r.fulfill({ json: { version: 1, items: 'nope' } }));
      await page.route('**/data/settings.json*', (r) => r.fulfill({ body: '{ this is not json', contentType: 'application/json' }));
    },
  });
  assert.equal(await t.page.locator('.card').count(), 3, 'only the 3 usable cards show');
  for (const tab of ['home', 'explore', 'organizers', 'foryou']) {
    await t.page.locator(`.tab[data-tab="${tab}"]`).click();
    await t.page.waitForTimeout(250);
    assert.ok((await t.page.locator('#view').innerText()).length > 20, `${tab} tab isn't blank`);
  }
  await t.page.getByRole('button', { name: 'Settings' }).click();
  const problems = await t.page.locator('dialog .callout').innerText();
  assert.match(problems, /duplicate id/i);
  assert.match(problems, /without an id/i);
  assert.match(problems, /isn't YYYY-MM-DD|date/i);
  await t.close();
});

await test('no network and no saved copy: a friendly retry screen, never blank', async () => {
  const t = await open({ route: (page) => page.route('**/data/*.json*', (r) => r.abort()) }).catch(() => null);
  // open() waits for a non-loading view; the failed view qualifies
  assert.ok(t, 'page rendered something');
  assert.equal(await t.page.getByRole('button', { name: 'Try again' }).isVisible(), true);
  await t.close();
});

await test('lost connection after a good load: last saved data stays visible with an offline banner', async () => {
  const t = await open();
  assert.ok((await t.page.locator('.card').count()) > 5);
  await t.ctx.route('**/data/*.json*', (r) => r.abort());
  await t.page.reload();
  await t.page.waitForSelector('.card');
  assert.ok((await t.page.locator('.card').count()) > 5, 'cards still there');
  assert.match(await t.page.locator('.banner-offline').innerText(), /Offline/);
  await t.close();
});

await test('service worker: app opens offline, data is network-first (fresh when online)', async () => {
  const t = await open({ sw: true, hash: '#/home' });
  await t.page.evaluate(() => navigator.serviceWorker.ready);
  await t.page.reload(); // now controlled by the worker
  await t.page.waitForSelector('.hero');
  // wait until the worker has actually stored all five data files (not just created a cache)
  await until(() => t.page.evaluate(async () => {
    let n = 0;
    for (const key of await caches.keys()) for (const req of await (await caches.open(key)).keys()) if (/\/data\/.+\.json$/.test(new URL(req.url).pathname)) n++;
    return n >= 5;
  }), { what: 'data files cached' });
  // online + data changed on the server → we must see the new data, not a cached copy
  const fresh = await t.page.evaluate(async () => {
    const res = await fetch(`data/settings.json?t=${Date.now()}`);
    return { fromCache: res.headers.get('x-pop-cache') };
  });
  assert.equal(fresh.fromCache, null, 'online data is not served from cache');
  await t.ctx.setOffline(true);
  await t.page.reload();
  await t.page.waitForSelector('.hero', { timeout: 8000 });
  await until(async () => (await t.page.locator('.banner-offline').count()) === 1, { what: 'offline banner' });
  assert.match(await t.page.locator('.banner-offline').innerText(), /Offline/);
  await t.page.locator('.tab[data-tab="markets"]').click();
  await t.page.waitForSelector('.view-markets .card'); // not just any .card: Home's cards are still on screen until the tab switches
  const offlineCards = await t.page.locator('.card').count();
  assert.ok(offlineCards > 5, `cards render offline (got ${offlineCards}; view says: ${(await t.page.locator('#view').innerText()).slice(0, 200).replace(/\n/g, ' | ')})`);
  await t.ctx.setOffline(false);
  await t.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await until(async () => (await t.page.locator('.banner-offline').count()) === 0, { what: 'banner clears when back online', ms: 8000 });
  await t.close();
});

await test('tap targets: every button, tab and field is at least 44px tall on a phone', async () => {
  const t = await open({ token: true, hash: '#/home' });
  const small = [];
  for (const tab of ['home', 'markets', 'explore', 'organizers', 'foryou']) {
    await t.page.locator(`.tab[data-tab="${tab}"]`).click();
    await t.page.waitForTimeout(300);
    if (tab === 'markets') await expand(t.page, 'fad-holiday-dumbo-2026');
    const found = await t.page.evaluate(() => [...document.querySelectorAll('button, select, input:not([type=hidden]), summary, a.btn, a.tab, textarea')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.offsetParent !== null; })
      .filter((el) => !el.closest('.card:not(.open) .card-body'))
      .filter((el) => !el.classList.contains('inline-link') && !el.classList.contains('skip'))
      .map((el) => ({ el: `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 50), text: (el.innerText || el.value || el.getAttribute('aria-label') || '').slice(0, 24), h: Math.round(el.getBoundingClientRect().height) }))
      .filter((x) => x.h < 44));
    small.push(...found.map((x) => ({ tab, ...x })));
  }
  assert.deepEqual(small, [], `too small: ${JSON.stringify(small)}`);
  await t.close();
});

// =====================================================================
await browser.close();
appServer.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (pageErrors.length) console.log(`page errors seen:\n  ${[...new Set(pageErrors)].join('\n  ')}`);
process.exit(failed.length || pageErrors.length ? 1 : 0);
