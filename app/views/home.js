// Home: what to apply for, what's due, what's next, and which weekends are free. Overview first, details second.
import { h, icon } from '../util.js';
import * as D from '../dates.js';
import * as V from '../derive.js';
import { entryCard, miniRow } from '../card.js';
import { sectionHead, empty } from '../ui.js';

const jump = (id) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
};

/** One big number you can tap. Yellow when it's something you need to do. */
function stat(n, label, { need, onClick }) {
  return h('button', { type: 'button', class: `stat${need && n ? ' need' : ''}`, onClick, 'aria-label': `${n} ${label}` },
    h('b', {}, String(n)), h('span', {}, label));
}

const REL = (i) => (i === 0 ? 'This weekend' : i === 1 ? 'Next weekend' : `In ${i} weeks`);

function weekendTile(w, i, env) {
  const first = (list) => (list.length ? `${list[0].name}${list.length > 1 ? ` +${list.length - 1}` : ''}` : '');
  const word = w.state === 'going' ? 'Going' : w.state === 'waiting' ? 'Waiting' : 'Free';
  const sub = w.state === 'going' ? first(w.going)
    : w.state === 'waiting' ? first(w.waiting)
      : w.options ? `${w.options} to consider` : 'Nothing yet';
  return h('button', { type: 'button', class: `wk wk-${w.state}`, 'aria-label': `${REL(i)}, ${V.weekendLabel(w.sat)}: ${word.toLowerCase()}. ${sub}`, onClick: () => env.openWeekend(w.sat) },
    h('span', { class: 'wk-rel' }, REL(i)),
    h('span', { class: 'wk-date' }, V.weekendLabel(w.sat)),
    h('span', { class: 'wk-word' }, word),
    h('span', { class: 'wk-sub' }, sub));
}

export function renderHome(env) {
  const { markets, explore, questions } = env.data;
  const { today } = env;
  const live = markets.filter((m) => !D.isPast(m, today));

  const applyEntries = V.groupSeries(V.applyFor(live, today));
  const due = V.dueSoon(live, today, 14);
  const nextUp = V.groupSeries(live.filter((m) => D.CONFIRMED.includes(m.status)).sort((a, b) => V.compareByEvent(a, b, today, env.cal)).slice(0, 3));
  const weekends = V.weekendsAhead(markets, today, 8);
  const free = weekends.filter((w) => w.state === 'free').length;
  const finds = V.pendingFinds(explore).filter((x) => x.worthALook).slice(0, 3);
  const waiting = V.openQuestions(questions);

  const root = h('div', { class: 'view view-home' });
  root.append(
    h('p', { class: 'today-line' }, D.fmtFull(today).replace(/, \d{4}$/, '')),
    h('div', { class: 'stats' },
      stat(applyEntries.length, 'To apply', { need: true, onClick: () => jump('sec-apply') }),
      stat(due.length, 'Due soon', { onClick: () => jump('sec-due') }),
      stat(free, 'Free weekends', { onClick: () => jump('sec-weekends') }),
      stat(waiting.length, 'Questions', { onClick: () => env.go('foryou') })));

  // The next 8 weekends, one tile each: going (black), waiting (outline), free (dashed)
  root.append(h('section', { class: 'block', id: 'sec-weekends' },
    sectionHead('Next 8 weekends'),
    h('div', { class: 'weekends', role: 'list' }, weekends.map((w, i) => weekendTile(w, i, env))),
    h('ul', { class: 'legend', 'aria-label': 'Legend' },
      h('li', {}, h('i', { class: 'lg lg-going' }), 'Going'), h('li', {}, h('i', { class: 'lg lg-waiting' }), 'Waiting to hear'), h('li', {}, h('i', { class: 'lg lg-free' }), 'Free'))));

  root.append(h('section', { class: 'block', id: 'sec-apply' },
    sectionHead('Apply for', { count: applyEntries.length || null }),
    applyEntries.length
      ? h('div', { class: 'cards' }, applyEntries.map((e) => entryCard(e, env, { quick: true, scope: 'apply' })))
      : empty('Nothing open to apply for.', 'When a market opens applications, it shows up here.')));

  root.append(h('section', { class: 'block', id: 'sec-due' },
    sectionHead('Due soon', { count: due.length || null }),
    due.length
      ? h('div', { class: 'minis' }, due.map(({ m, k }) => miniRow(m, env, { label: D.KEY_LABEL[k.type], date: k.date })))
      : empty('Nothing due in the next 2 weeks.')));

  root.append(h('section', { class: 'block', id: 'sec-next' },
    sectionHead('Next up'),
    nextUp.length
      ? h('div', { class: 'cards' }, nextUp.map((e) => entryCard(e, env, { scope: 'next' })))
      : empty('No confirmed events yet.', 'Accepted and paid markets show up here, in date order.')));

  if (finds.length) {
    root.append(h('section', { class: 'block' },
      sectionHead('Worth a look'),
      h('div', { class: 'finds' }, finds.map((f) => h('button', { type: 'button', class: 'find-row', onClick: () => env.go('explore') },
        h('span', { class: 'find-star', 'aria-hidden': 'true' }, '★'),
        h('span', { class: 'find-main' }, h('span', { class: 'mini-title' }, f.name), h('span', { class: 'card-meta' }, [f.dates[0] ? D.fmtDay(f.dates[0].date) : null, f.worthReason].filter(Boolean).join(' · '))),
        icon('right', { size: 18 }))))));
  }
  return root;
}
