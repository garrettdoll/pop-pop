// POP! POP! entry point: shell, routing, rendering, banners.
import { h, icon } from './util.js';
import { state, subscribe, loadAll, dispatch, bus, flush, watchLifecycle, refreshToday } from './store.js';
import { makeCalendar, isPast } from './dates.js';
import * as V from './derive.js';
import { storage } from './storage.js';
import { getToken } from './config.js';
import { toast, empty } from './ui.js';
import { renderHome } from './views/home.js';
import { renderMarkets, defaultMarketsUi } from './views/markets.js';
import { renderExplore } from './views/explore.js';
import { renderOrganizers } from './views/organizers.js';
import { renderQuestions } from './views/questions.js';
import { openSettings, showSetup } from './views/settings.js';

const TABS = [
  { key: 'home', label: 'Home', icon: 'home', render: renderHome },
  { key: 'markets', label: 'Markets', icon: 'markets', render: renderMarkets },
  { key: 'explore', label: 'Explore', icon: 'explore', render: renderExplore },
  { key: 'organizers', label: 'Organizers', icon: 'organizers', render: renderOrganizers },
  { key: 'foryou', label: 'For You', icon: 'foryou', render: renderQuestions },
];

// View state that lives only in this page, plus a few per-viewer conveniences kept in localStorage.
const PERSISTED = ['view', 'filter', 'weekends', 'avail', 'place'];
const ui = {
  tab: 'home',
  markets: { ...defaultMarketsUi(), ...pick(storage.getJSON('pop.ui.markets', {}) || {}, PERSISTED) },
  open: new Set(), // expanded market cards
  focus: null, // { kind: 'market' | 'organizers', id } to scroll to after the next render
  pop: null, // market id whose sticker should "pop" after a status change
};
function pick(obj, keys) {
  return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
}
const persistUi = () => storage.setJSON('pop.ui.markets', pick(ui.markets, PERSISTED));

const viewEl = document.getElementById('view');
const bannersEl = document.getElementById('banners');
const tabbarEl = document.getElementById('tabbar');
const topbarEl = document.getElementById('topbar');

// ---------- env handed to every view ----------

function act(name, args) {
  const result = dispatch(name, args);
  if (!result.ok) {
    toast('View-only right now. Add your GitHub token to make changes.', { action: { label: 'Set up', onClick: () => openSettings(makeEnv()) }, ms: 5000 });
    return false;
  }
  if (name === 'market.setStatus') ui.pop = args.id;
  return true;
}

function go(tab, id) {
  const next = id ? `#/${tab}/${encodeURIComponent(id)}` : `#/${tab}`;
  if (location.hash === next) route(); else location.hash = next;
}

function makeEnv() {
  const d = state.data;
  return {
    data: d, today: state.today, cal: makeCalendar(d.settings), orgMap: new Map(d.organizers.map((o) => [o.id, o])),
    open: ui.open, ui, act, go, toast, rerender: scheduleRender, persistUi,
  };
}

// ---------- routing ----------

function parseHash() {
  const [, tab, id] = location.hash.split('/');
  return { tab: TABS.some((t) => t.key === tab) ? tab : 'home', id: id ? decodeURIComponent(id) : null };
}

function route() {
  const { tab, id } = parseHash();
  const changed = tab !== ui.tab;
  ui.tab = tab;
  ui.focus = null;
  if (tab === 'markets' && id) {
    const m = state.data.markets.find((x) => x.id === id);
    if (m) {
      Object.assign(ui.markets, { view: 'list', filter: isPast(m, state.today) ? 'past' : 'upcoming', weekends: false, avail: false, place: '' });
      ui.open.add(id);
      ui.focus = { kind: 'market', id };
    }
  } else if (tab === 'organizers' && id) {
    ui.focus = { kind: 'organizers', id };
  }
  render({ enter: changed || !!ui.focus, top: !ui.focus });
}

// ---------- rendering ----------

let renderQueued = false, deferred = null;

function isEditing() {
  const a = document.activeElement;
  if (!a || !viewEl.contains(a)) return false;
  return a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(a.type));
}

/** Coalesce renders, and never wipe a half-typed note: wait until the field loses focus. */
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (isEditing()) {
      if (!deferred) deferred = setInterval(() => { if (!isEditing()) { clearInterval(deferred); deferred = null; render(); } }, 400);
      updateChrome();
      return;
    }
    render();
  });
}

function loadingView() {
  return h('div', { class: 'view loading' }, h('p', { class: 'wordmark', 'aria-hidden': 'true' }, h('span', {}, 'POP!'), h('span', { class: 'hl' }, 'POP!')), h('p', { class: 'muted' }, 'Loading your markets…'));
}

function failedView(message) {
  return h('div', { class: 'view' }, empty(message || "Couldn't load your markets.", 'Check your connection and try again. Anything you’d already loaded is saved on this phone.'),
    h('div', { class: 'row center' }, h('button', { type: 'button', class: 'btn btn-solid', onClick: () => loadAll() }, 'Try again')));
}

function render({ enter = false, top = false } = {}) {
  const tab = TABS.find((t) => t.key === ui.tab) || TABS[0];
  const y = window.scrollY;
  let node;
  if (!state.ready) node = state.loading ? loadingView() : failedView();
  else {
    try { node = tab.render(makeEnv()); } catch (err) {
      console.error(err);
      node = failedView('Something went wrong drawing this tab.');
    }
  }
  if (enter) node.classList.add('enter');
  viewEl.replaceChildren(node, updatedFooter());
  updateChrome();
  if (top) window.scrollTo(0, 0); else window.scrollTo(0, y);
  afterRender();
}

function updatedFooter() {
  if (!state.ready) return document.createComment('');
  const when = state.loadedAt ? new Date(state.loadedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
  return h('p', { class: 'updated' }, when ? `Updated ${when} · ` : '', h('button', { type: 'button', class: 'inline-link', onClick: async () => { await loadAll(); toast('Up to date'); } }, 'Refresh'));
}

function afterRender() {
  if (ui.pop) {
    const sticker = viewEl.querySelector(`.card[data-id="${CSS.escape(ui.pop)}"] .sticker`);
    if (sticker) sticker.classList.add('pop');
    ui.pop = null;
  }
  if (ui.focus) {
    const { kind, id } = ui.focus;
    const target = viewEl.querySelector(kind === 'market' ? `.card[data-id="${CSS.escape(id)}"]` : `.org-card[data-id="${CSS.escape(id)}"]`);
    ui.focus = null;
    if (target) {
      target.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      target.classList.add('flash');
    }
  }
}

// ---------- chrome: top bar, tab bar, banners ----------

function buildChrome() {
  topbarEl.replaceChildren(
    h('a', { class: 'brand', href: '#/home', 'aria-label': 'POP! POP! home' }, 'POP!', h('span', { class: 'hl' }, 'POP!')),
    h('span', { class: 'topbar-gap' }),
    h('button', { type: 'button', id: 'ro-pill', class: 'pill', hidden: true, onClick: () => openSettings(makeEnv()) }, 'View-only'),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Settings', onClick: () => openSettings(makeEnv()) }, icon('gear')));

  tabbarEl.replaceChildren(...TABS.map((t) => h('a', { class: 'tab', href: `#/${t.key}`, dataset: { tab: t.key } },
    h('span', { class: 'tab-icon' }, icon(t.icon, { size: 24 }), h('span', { class: 'badge', hidden: true })),
    h('span', { class: 'tab-label' }, t.label))));
}

function badgeCounts() {
  return { explore: V.pendingFinds(state.data.explore).length, foryou: V.openQuestions(state.data.questions).length };
}

function updateChrome() {
  const counts = badgeCounts();
  for (const a of tabbarEl.querySelectorAll('.tab')) {
    const key = a.dataset.tab;
    const active = key === ui.tab;
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    const badge = a.querySelector('.badge');
    const n = counts[key] || 0;
    badge.hidden = !n;
    badge.textContent = n > 99 ? '99+' : String(n);
    a.setAttribute('aria-label', n ? `${TABS.find((t) => t.key === key).label}, ${n} waiting` : TABS.find((t) => t.key === key).label);
  }
  const pill = document.getElementById('ro-pill');
  if (pill) pill.hidden = !!getToken() || !state.ready;

  const items = [];
  if (state.saveError) {
    items.push(banner('error', `Couldn't save: ${state.saveError.message} Your change is kept on this phone.`, { label: 'Retry', onClick: () => flush() }));
  } else if (state.saving && state.pending.length) {
    items.push(banner('info', 'Saving…'));
  } else if (state.pending.length) {
    items.push(banner('info', `${state.pending.length} change${state.pending.length === 1 ? '' : 's'} not saved yet.`, { label: 'Save now', onClick: () => flush() }));
  }
  if (state.authError) items.push(banner('warn', 'GitHub didn’t accept your token, so you’re seeing the public site.', { label: 'Fix', onClick: () => openSettings(makeEnv()) }));
  if (state.offline) items.push(banner('offline', 'Offline. Showing last saved data.'));
  bannersEl.replaceChildren(...items);
}

function banner(kind, text, action) {
  return h('div', { class: `banner banner-${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    h('span', {}, text),
    action ? h('button', { type: 'button', class: 'banner-action', onClick: action.onClick }, action.label) : null);
}

// ---------- boot ----------

async function boot() {
  buildChrome();
  window.addEventListener('hashchange', route);
  subscribe(scheduleRender);
  bus.addEventListener('saved', () => toast('Saved'));
  watchLifecycle();
  setInterval(refreshToday, 60000);
  route(); // draws the loading view straight away
  await loadAll();
  render();
  flush(); // anything left unsaved from last time
  if (!getToken() && !storage.get('pop.setupSeen') && state.ready) showSetup(makeEnv());
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* the app works fine without it */ });
}

boot();
