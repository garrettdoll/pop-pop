// Month calendar: event days, application deadlines and decision dates as distinct marker shapes.
import { h, icon } from '../util.js';
import * as D from '../dates.js';
import { marketCard } from '../card.js';

// Shape + word for each marker kind, so color is never the only signal.
const KINDS = {
  event: { cls: 'mk-event', word: 'Event', legend: 'Event day' },
  appCloses: { cls: 'mk-deadline', word: 'Apply by', legend: 'Apply-by / pay-by' },
  paymentBy: { cls: 'mk-deadline', word: 'Pay by' },
  decisionBy: { cls: 'mk-decision', word: 'Decision', legend: 'Decision date' },
  recurring: { cls: 'mk-weekly', word: 'Weekly market', legend: 'Weekly market' },
};

const monthKey = (iso) => iso.slice(0, 7);
const shiftMonth = (key, delta) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export function renderCalendar(env) {
  const st = env.ui.markets;
  const today = env.today;
  if (!st.month) st.month = monthKey(today);
  const [y, mo] = st.month.split('-').map(Number);
  const first = `${st.month}-01`;
  const last = `${st.month}-${String(D.daysInMonth(y, mo)).padStart(2, '0')}`;

  const markers = D.calendarMarkers(env.data.markets, first, last);
  const byDate = new Map();
  for (const k of markers) {
    if (!byDate.has(k.date)) byDate.set(k.date, []);
    byDate.get(k.date).push(k);
  }

  const go = (patch) => { Object.assign(st, patch); env.persistUi(); env.rerender(); };

  const nav = h('div', { class: 'cal-nav' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous month', onClick: () => go({ month: shiftMonth(st.month, -1), day: null }) }, icon('left')),
    h('h2', { class: 'cal-title', 'aria-live': 'polite' }, `${D.MONTHS[mo - 1]} ${y}`),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next month', onClick: () => go({ month: shiftMonth(st.month, 1), day: null }) }, icon('right')),
    st.month !== monthKey(today) ? h('button', { type: 'button', class: 'btn btn-line btn-sm', onClick: () => go({ month: monthKey(today), day: null }) }, 'Today') : null);

  const cells = [];
  for (const name of D.DOW_SHORT) cells.push(h('div', { class: 'cal-dow', 'aria-hidden': 'true' }, name[0]));
  for (let i = 0; i < D.dow(first); i++) cells.push(h('div', { class: 'cal-blank', 'aria-hidden': 'true' }));
  for (let d = 1; d <= D.daysInMonth(y, mo); d++) {
    const iso = `${st.month}-${String(d).padStart(2, '0')}`;
    const items = byDate.get(iso) || [];
    const kinds = [...new Set(items.map((k) => k.type === 'paymentBy' ? 'appCloses' : k.type))];
    const label = `${D.fmtDay(iso)}${items.length ? `: ${items.map((k) => `${KINDS[k.type].word}`).join(', ')}` : ''}`;
    const cls = ['cal-day', iso === today ? 'is-today' : '', iso === st.day ? 'is-selected' : '', items.length ? 'has-items' : '', D.isWeekend(iso) ? 'is-weekend' : ''].filter(Boolean).join(' ');
    cells.push(h('button', {
      type: 'button', class: cls, 'aria-label': label, 'aria-pressed': String(iso === st.day), disabled: !items.length && iso !== st.day ? true : null,
      onClick: () => go({ day: st.day === iso ? null : iso }),
    }, h('span', { class: 'cal-num' }, String(d)),
    h('span', { class: 'cal-marks', 'aria-hidden': 'true' }, kinds.slice(0, 3).map((k) => h('i', { class: `mk ${KINDS[k].cls}` })))));
  }

  const legend = h('ul', { class: 'cal-legend', 'aria-label': 'Legend' },
    ['event', 'appCloses', 'decisionBy', 'recurring'].map((k) => h('li', {}, h('i', { class: `mk ${KINDS[k].cls}`, 'aria-hidden': 'true' }), KINDS[k].legend)));

  const root = h('div', { class: 'calendar' }, nav, h('div', { class: 'cal-grid', role: 'group', 'aria-label': `${D.MONTHS[mo - 1]} ${y}` }, cells), legend);

  // Day panel: the cards for whatever is on the selected day.
  if (st.day && monthKey(st.day) === st.month) {
    const items = byDate.get(st.day) || [];
    const ids = [...new Set(items.map((k) => k.marketId))];
    const panel = h('section', { class: 'day-panel', 'aria-label': D.fmtFull(st.day) },
      h('h3', {}, D.fmtFull(st.day).replace(/, \d{4}$/, '')));
    if (!ids.length) panel.append(h('p', { class: 'muted' }, 'Nothing on this day.'));
    for (const id of ids) {
      const m = env.data.markets.find((x) => x.id === id);
      if (!m) continue;
      const kinds = items.filter((k) => k.marketId === id).map((k) => KINDS[k.type].word);
      panel.append(h('div', { class: 'day-item' }, h('p', { class: 'day-kind' }, kinds.join(' + ')), marketCard(m, env, { scope: 'day' })));
    }
    root.append(panel);
  } else {
    root.append(h('p', { class: 'cal-hint' }, 'Tap a marked day to see what’s on it.'));
  }
  return root;
}
