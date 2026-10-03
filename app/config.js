// Where the data lives and how to reach it.
import { storage } from './storage.js';

// On GitHub Pages the site is https://<owner>.github.io/<repo>/, so owner and repo can be read
// from the address bar. Anything else (localhost, a custom domain) falls back to these values.
const FALLBACK = { owner: 'garrettdoll', repo: 'pop-pop' };

function fromLocation() {
  const host = location.hostname;
  if (host.endsWith('.github.io')) {
    const owner = host.split('.')[0];
    const repo = location.pathname.split('/').filter(Boolean)[0];
    if (owner && repo) return { owner, repo };
  }
  return FALLBACK;
}

export const DEFAULT_CONFIG = {
  ...fromLocation(),
  branch: 'main', // the branch GitHub Pages serves; the app reads and writes this branch
  apiBase: 'https://api.github.com',
};

export function getConfig() {
  const saved = storage.getJSON('pop.config', {}) || {};
  return { ...DEFAULT_CONFIG, ...saved };
}
export function setConfig(patch) {
  const next = { ...(storage.getJSON('pop.config', {}) || {}), ...patch };
  for (const k of Object.keys(next)) if (next[k] == null || next[k] === '') delete next[k];
  storage.setJSON('pop.config', next);
}

export const getToken = () => storage.get('pop.token');
export const setToken = (t) => storage.set('pop.token', t.trim());
export const clearToken = () => storage.del('pop.token');

/**
 * The data files. `listKey` is the array inside each file; settings is a plain object.
 * Both the app and Claude read and write these exact paths.
 */
export const FILES = {
  markets: { path: 'data/markets.json', listKey: 'markets' },
  organizers: { path: 'data/organizers.json', listKey: 'organizers' },
  explore: { path: 'data/explore.json', listKey: 'items' },
  questions: { path: 'data/questions.json', listKey: 'items' },
  settings: { path: 'data/settings.json', listKey: null },
};
export const FILE_KEYS = Object.keys(FILES);
