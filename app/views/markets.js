// Markets tab: list (with filters) or calendar.
import { h } from '../util.js';
import * as D from '../dates.js';
import * as V from '../derive.js';
import { marketCard } from '../card.js';
import { pageTitle, empty } from '../ui.js';
import { renderCalendar } from './calendar.js';

const FILTERS = [
  { key: 'upcoming', label: 'Upcoming', test: (m, env) => !D.isPast(m, env.today), none: 'Nothing coming up. Screenshots you send land here.' },
  { key: 'open', label: 'Open', test: (m, env) => V.isOpenToApply(m, env.today), none: 'No applications open right now.' },
  { key: 'applied', label: 'Applied', test: (m, env) => ['applied', 'waitlisted'].includes(m.status) && !D.isPast(m, env.today), none: "Nothing waiting on a decision." },
  { key: 'confirmed', label: 'Accepted/Paid', test: (m, env) => D.CONFIRMED.includes(m.status) && !D.isPast(m, env.today), none: 'No accepted or paid events yet.' },
  { key: 'needs', label: 'Needs info', test: (m) => V.needsInfo(m), none: 'Nothing needs your input. Nice.' },
  { key: 'past', label: 'Past', test: (m, env) => D.isPast(m, env.today), none: 'No past events yet.' },
];

export const defaultMarketsUi = () => ({ view: 'list', filter: 'upcoming', weekends: false, avail: false, place: '', month: null, day: null });

function applyConstraints(markets, st, env, { skipFilter } = {}) {
  const filter = FILTERS.find((f) => f.key === st.filter) || FILTERS[0];
  return markets.filter((m) => {
    if (!skipFilter && !filter.test(m, env)) return false;
    if (!V.matchesLocation(m, st.place)) return false;
    if (st.weekends || st.avail) {
      const a = D.marketAvailability(m, env.cal, env.today);
      if (st.weekends && !(a.weekendOnly && a.level !== 'unknown')) return false;
      if (st.avail && !(a.level === 'confirm' || a.level === 'likely')) return false;
    }
    return true;
  });
}

function chip(label, { active, count, onClick, toggle }) {
  return h('button', { type: 'button', class: `chip${active ? ' active' : ''}${toggle ? ' chip-toggle' : ''}`, 'aria-pressed': String(!!active), onClick },
    label, count != null ? h('span', { class: 'chip-count' }, String(count)) : null);
}

function viewSwitch(st, env) {
  const btn = (key, label) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(st.view === key), class: st.view === key ? 'active' : '', onClick: () => { st.view = key; env.persistUi(); env.rerender(); } }, label);
  return h('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Markets view' }, btn('list', 'List'), btn('calendar', 'Calendar'));
}

function listView(env) {
  const st = env.ui.markets;
  const { markets } = env.data;
  const filter = FILTERS.find((f) => f.key === st.filter) || FILTERS[0];
  const loc = V.locationOptions(markets);

  const set = (patch) => { Object.assign(st, patch); env.persistUi(); env.rerender(); };

  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter markets' },
    FILTERS.map((f) => chip(f.label, { active: st.filter === f.key, count: applyConstraints(markets, st, env, { skipFilter: true }).filter((m) => f.test(m, env)).length, onClick: () => set({ filter: f.key }) })),
    h('span', { class: 'chips-sep', 'aria-hidden': 'true' }),
    chip('Weekends only', { active: st.weekends, toggle: true, onClick: () => set({ weekends: !st.weekends }) }),
    chip('Needs availability check', { active: st.avail, toggle: true, onClick: () => set({ avail: !st.avail }) }));

  const select = h('label', { class: 'place-filter' }, h('span', { class: 'sr-only' }, 'Location'),
    h('select', { onChange: (e) => set({ place: e.target.value }) },
      h('option', { value: '' }, 'All locations'),
      loc.boroughs.length ? h('optgroup', { label: 'Borough' }, loc.boroughs.map((b) => h('option', { value: b, selected: st.place === b }, b))) : null,
      loc.hoods.length ? h('optgroup', { label: 'Neighborhood' }, loc.hoods.map((n) => h('option', { value: n, selected: st.place === n }, n))) : null));

  const list = applyConstraints(markets, st, env);
  list.sort(st.filter === 'past' ? V.comparePast : (a, b) => V.compareMarkets(a, b, env.today, env.cal));

  const body = list.length
    ? h('div', { class: 'cards' }, list.map((m) => marketCard(m, env, { scope: 'list' })))
    : empty(filter.none, st.weekends || st.avail || st.place ? 'Try clearing the extra filters.' : null);

  return [h('div', { class: 'filters' }, chips, select), body];
}

export function renderMarkets(env) {
  const st = env.ui.markets;
  const root = h('div', { class: 'view view-markets' });
  root.append(pageTitle('Markets'), viewSwitch(st, env));
  if (st.view === 'calendar') root.append(renderCalendar(env));
  else root.append(...listView(env));
  return root;
}
