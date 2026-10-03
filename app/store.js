// App state: loading data, applying taps instantly, and saving them to GitHub safely.
import { FILES, FILE_KEYS, getConfig, getToken } from './config.js';
import * as gh from './github.js';
import { OPS } from './ops.js';
import { normalizeFile, emptyData } from './normalize.js';
import { todayISO } from './dates.js';
import { storage } from './storage.js';

const CACHE_KEY = 'pop.cache.v1';
const PENDING_KEY = 'pop.pending.v1';
const MAX_ATTEMPTS = 4;

export const bus = new EventTarget(); // 'change', 'saved', 'save-error'
const todayParam = new URLSearchParams(location.search).get('today'); // ?today=2026-10-12 pins the date for testing

export const state = {
  data: emptyData(),
  loading: false,
  ready: false, // true once there is something to show
  source: null, // 'api' | 'static' | 'cache'
  offline: false,
  authError: null,
  problems: [],
  loadedAt: null,
  pending: storage.getJSON(PENDING_KEY, []) || [],
  saving: false,
  saveError: null,
  today: todayISO(todayParam),
};

const emit = () => bus.dispatchEvent(new Event('change'));
export const subscribe = (fn) => {
  bus.addEventListener('change', fn);
  return () => bus.removeEventListener('change', fn);
};

export const canWrite = () => !!getToken();
export const refreshToday = () => {
  const next = todayISO(todayParam);
  if (next !== state.today) { state.today = next; emit(); }
};

const persistPending = () => storage.setJSON(PENDING_KEY, state.pending);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- loading ----------

async function fetchStatic(path) {
  const res = await fetch(new URL(`${path}?t=${Date.now()}`, document.baseURI), { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  const fromCache = res.headers.get('x-pop-cache') === '1'; // set by the service worker when it had to use its saved copy
  return { data: await res.json(), fromCache };
}

let loadPromise = null;
export function loadAll() {
  if (!loadPromise) {
    loadPromise = doLoad().finally(() => { loadPromise = null; });
  }
  return loadPromise;
}

async function doLoad() {
  state.loading = true;
  emit();
  const token = getToken();
  const cfg = getConfig();
  const raw = {};
  let viaApi = 0, staleCopies = 0, failures = 0, authFail = null;

  await Promise.all(FILE_KEYS.map(async (key) => {
    const { path } = FILES[key];
    if (token) {
      try {
        raw[key] = (await gh.getFile({ cfg, token, path })).data;
        viaApi++;
        return;
      } catch (e) {
        if (e.status === 401 || e.status === 403) authFail = e; // keep reading from the public site
      }
    }
    try {
      const { data, fromCache } = await fetchStatic(path);
      raw[key] = data;
      if (fromCache) staleCopies++;
    } catch {
      failures++;
    }
  }));

  const cached = storage.getJSON(CACHE_KEY, null);
  const problems = [];
  for (const key of FILE_KEYS) {
    if (key in raw) state.data[key] = normalizeFile(key, raw[key], problems);
    else if (cached && cached.data && cached.data[key] && !state.ready) state.data[key] = cached.data[key];
  }
  state.problems = problems;
  state.source = viaApi ? 'api' : failures === FILE_KEYS.length ? 'cache' : 'static';
  state.offline = failures > 0 || staleCopies > 0 || (typeof navigator !== 'undefined' && navigator.onLine === false);
  state.authError = authFail ? authFail.message : null;
  state.today = todayISO(todayParam);
  if (failures < FILE_KEYS.length) {
    state.loadedAt = Date.now();
    storage.setJSON(CACHE_KEY, { savedAt: state.loadedAt, data: state.data });
  }
  state.ready = failures < FILE_KEYS.length || !!cached || state.ready;
  reapplyPending(); // unsaved taps must stay visible on top of fresh data
  state.loading = false;
  emit();
}

// ---------- saving ----------

function applyLocal(op) {
  const def = OPS[op.name];
  if (!def) return;
  const ctx = { opId: op.id, today: op.at };
  for (const step of def.steps(op.args)) {
    if (state.data[step.file]) step.apply(state.data[step.file], ctx);
  }
}
function reapplyPending() {
  for (const op of state.pending) applyLocal(op);
}

/** Make a change. Returns { ok:false, reason:'readonly' } when there's no token. */
export function dispatch(name, args) {
  const def = OPS[name];
  if (!def) throw new Error(`Unknown op ${name}`);
  if (!canWrite()) return { ok: false, reason: 'readonly' };
  const op = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name, args, at: state.today, msg: def.msg(args, state.data),
  };
  applyLocal(op); // optimistic
  state.pending.push(op);
  persistPending();
  emit();
  flush();
  return { ok: true, op };
}

const listOf = (data, key) => {
  const lk = FILES[key].listKey;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (!Array.isArray(data[lk])) data[lk] = [];
  return data[lk];
};

/** Save one op: for each file it touches, re-fetch the latest, apply only this change, PUT with the sha. */
async function saveRemote(op) {
  const token = getToken();
  const cfg = getConfig();
  const def = OPS[op.name];
  if (!def) return; // an op from an older version of the app: nothing sensible to do, drop it
  const ctx = { opId: op.id, today: op.at };
  for (const step of def.steps(op.args)) {
    const { path } = FILES[step.file];
    let lastError = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { data, sha } = await gh.getFile({ cfg, token, path }); // always the latest, never a stale copy
      const list = listOf(data, step.file);
      if (!list) throw new gh.GitHubError(`${path} isn't shaped the way the app expects`, 0);
      const snapshot = JSON.stringify(data);
      step.apply(list, ctx);
      if (JSON.stringify(data) === snapshot) { // already applied (a retry after a half-finished save): don't make an empty commit
        state.data[step.file] = normalizeFile(step.file, data);
        lastError = null;
        break;
      }
      try {
        await gh.putFile({ cfg, token, path, data, sha, message: op.msg });
        state.data[step.file] = normalizeFile(step.file, data); // now equals GitHub plus our change
        lastError = null;
        break;
      } catch (e) {
        if (!gh.isConflict(e)) throw e;
        lastError = e;
        await sleep(200 * (attempt + 1));
      }
    }
    if (lastError) throw lastError;
  }
}

let flushing = false;
export async function flush() {
  if (flushing || !state.pending.length) return;
  if (!canWrite()) return;
  flushing = true;
  state.saving = true;
  state.saveError = null;
  emit();
  let savedAny = false;
  try {
    while (state.pending.length) {
      const op = state.pending[0];
      try {
        await saveRemote(op);
        state.pending.shift();
        persistPending();
        savedAny = true;
        reapplyPending();
        emit();
      } catch (e) {
        state.saveError = {
          message: e instanceof gh.GitHubError ? e.message : 'Something went wrong while saving.',
          offline: e && e.status === 0,
          conflict: gh.isConflict(e),
        };
        bus.dispatchEvent(new CustomEvent('save-error', { detail: state.saveError }));
        break; // keep this change (and the rest) queued so it can be retried
      }
    }
  } finally {
    flushing = false;
    state.saving = false;
    emit();
  }
  if (savedAny && !state.saveError) {
    state.offline = false;
    bus.dispatchEvent(new Event('saved'));
  }
}

export function discardPending() {
  state.pending = [];
  state.saveError = null;
  persistPending();
  emit();
}

// ---------- lifecycle ----------

/** Reload when the app comes back to the foreground or the network returns. */
export function watchLifecycle() {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    refreshToday();
    if (Date.now() - hiddenAt > 3000 || !state.loadedAt) loadAll().then(flush);
  });
  window.addEventListener('online', () => { loadAll().then(flush); });
  window.addEventListener('offline', () => { state.offline = true; emit(); });
}
