// Markets: three tabs, one Filter button, and a calendar. Finished or skipped markets are tucked away.
import { h } from '../util.js';
import * as D from '../dates.js';
import * as V from '../derive.js';
import { entryCard } from '../card.js';
import { pageTitle, empty } from '../ui.js';
import { renderCalendar } from './calendar.js';

const TABS = [
  { key: 'coming', label: 'Upcoming', test: (m, env) => !D.isPast(m, env.today), none: 'Nothing coming up. Screenshots you send land here.' },
  { key: 'action', label: 'To do', test: (m, env) => V.needsAction(m, env.today), none: 'Nothing needs you right now. Nice.' },
  { key: 'past', label: 'Past', test: (m, env) => D.isPast(m, env.today), none: 'No past events yet.' },
];

const STATUS_CHOICES = [['', 'Any status'], ['need', 'Needs you'], ['wait', 'Waiting'], ['going', 'Going']];

export const defaultMarketsUi = () => ({ view: 'list', filter: 'coming', status: '', weekends: false, avail: false, place: '', filterOpen: false, showOut: false, month: null, day: null });

/** Keep a saved choice from an older version of the app from breaking the screen. */
export function sanitizeMarketsUi(st) {
  if (!TABS.some((t) => t.key === st.filter)) st.filter = 'coming';
  if (!STATUS_CHOICES.some(([v]) => v === st.status)) st.status = '';
  return st;
}

function applyConstraints(markets, st, env, { skipTab } = {}) {
  const tab = TABS.find((t) => t.key === st.filter) || TABS[0];
  return markets.filter((m) => {
    if (!skipTab && !tab.test(m, env)) return false;
    if (!V.matchesLocation(m, st.place)) return false;
    if (st.status && V.statusGroup(m.status) !== st.status) return false;
    if (st.weekends || st.avail) {
      const a = D.marketAvailability(m, env.cal, env.today);
      if (st.weekends && !(a.weekendOnly && a.level !== 'unknown')) return false;
      if (st.avail && !(a.level === 'confirm' || a.level === 'likely')) return false;
    }
    return true;
  });
}

const activeFilters = (st) => [st.status, st.place, st.weekends, st.avail].filter(Boolean).length;

function viewSwitch(st, env) {
  const btn = (key, label) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(st.view === key), class: st.view === key ? 'active' : '', onClick: () => { st.view = key; env.persistUi(); env.rerender(); } }, label);
  return h('div', { class: 'segmented small', role: 'tablist', 'aria-label': 'Markets view' }, btn('list', 'List'), btn('calendar', 'Calendar'));
}

function tabsBar(st, env, markets) {
  const base = applyConstraints(markets, st, env, { skipTab: true });
  return h('div', { class: 'segmented wide', role: 'tablist', 'aria-label': 'Show' },
    TABS.map((t) => {
      const n = base.filter((m) => t.test(m, env)).length;
      return h('button', { type: 'button', role: 'tab', 'aria-selected': String(st.filter === t.key), class: st.filter === t.key ? 'active' : '', onClick: () => { st.filter = t.key; env.persistUi(); env.rerender(); } },
        t.label, h('span', { class: 'chip-count' }, String(n)));
    }));
}

function filterControls(st, env, markets) {
  const set = (patch) => { Object.assign(st, patch); env.persistUi(); env.rerender(); };
  const loc = V.locationOptions(markets);
  const n = activeFilters(st);
  const toggle = (label, key) => h('button', { type: 'button', class: `chip chip-toggle${st[key] ? ' active' : ''}`, 'aria-pressed': String(!!st[key]), onClick: () => set({ [key]: !st[key] }) }, label);
  const button = h('button', { type: 'button', class: 'btn btn-line btn-sm filter-btn', 'aria-expanded': String(st.filterOpen), onClick: () => { st.filterOpen = !st.filterOpen; env.rerender(); } },
    'Filter', n ? h('span', { class: 'chip-count' }, String(n)) : null);
  const panel = h('div', { class: 'filter-panel', hidden: !st.filterOpen },
    h('label', { class: 'form-field' }, h('span', {}, 'Status'),
      h('select', { onChange: (e) => set({ status: e.target.value }) }, STATUS_CHOICES.map(([v, label]) => h('option', { value: v, selected: st.status === v }, label)))),
    h('label', { class: 'form-field' }, h('span', {}, 'Location'),
      h('select', { onChange: (e) => set({ place: e.target.value }) },
        h('option', { value: '' }, 'All locations'),
        loc.boroughs.length ? h('optgroup', { label: 'Borough' }, loc.boroughs.map((b) => h('option', { value: b, selected: st.place === b }, b))) : null,
        loc.hoods.length ? h('optgroup', { label: 'Neighborhood' }, loc.hoods.map((x) => h('option', { value: x, selected: st.place === x }, x))) : null)),
    h('div', { class: 'row' }, toggle('Weekends only', 'weekends'), toggle('Needs availability check', 'avail')),
    n ? h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-line btn-sm', onClick: () => set({ status: '', place: '', weekends: false, avail: false }) }, 'Clear filters')) : null);
  return { button, panel };
}

function listView(env) {
  const st = env.ui.markets;
  const { markets } = env.data;
  const tab = TABS.find((t) => t.key === st.filter) || TABS[0];
  const { button, panel } = filterControls(st, env, markets);

  let list = applyConstraints(markets, st, env);
  list.sort(st.filter === 'past' ? V.comparePast : st.filter === 'action' ? (a, b) => V.compareMarkets(a, b, env.today, env.cal) : (a, b) => V.compareByEvent(a, b, env.today, env.cal));

  const body = [];
  if (st.filter === 'coming') {
    const out = list.filter((m) => V.statusGroup(m.status) === 'out');
    list = list.filter((m) => V.statusGroup(m.status) !== 'out');
    body.push(list.length
      ? h('div', { class: 'cards' }, V.groupSeries(list).map((e) => entryCard(e, env, { scope: 'list' })))
      : empty(tab.none, activeFilters(st) ? 'Try clearing the filters.' : null));
    if (out.length) {
      const details = h('details', { class: 'more notgoing', open: st.showOut || null },
        h('summary', {}, `Not going (${out.length})`),
        h('div', { class: 'cards' }, V.groupSeries(out).map((e) => entryCard(e, env, { scope: 'out' }))));
      details.addEventListener('toggle', () => { st.showOut = details.open; });
      body.push(details);
    }
  } else {
    body.push(list.length
      ? h('div', { class: 'cards' }, V.groupSeries(list).map((e) => entryCard(e, env, { scope: 'list' })))
      : empty(tab.none, activeFilters(st) ? 'Try clearing the filters.' : null));
  }
  return [h('div', { class: 'tabs-row' }, tabsBar(st, env, markets), button), panel, ...body];
}

export function renderMarkets(env) {
  const st = sanitizeMarketsUi(env.ui.markets);
  const root = h('div', { class: 'view view-markets' });
  root.append(h('div', { class: 'page-row' }, pageTitle('Markets'), viewSwitch(st, env)));
  if (st.view === 'calendar') root.append(renderCalendar(env));
  else root.append(...listView(env));
  return root;
}
