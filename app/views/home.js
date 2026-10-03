// Home: action first. What to apply for, what's due this week, what's next.
import { h, icon, pluralize } from '../util.js';
import * as D from '../dates.js';
import * as V from '../derive.js';
import { marketCard, miniRow } from '../card.js';
import { sectionHead, empty } from '../ui.js';

const WEEK = 7;
const CONFIRMED_OR_APPLIED = ['applied', 'waitlisted', 'accepted', 'paid'];

/** Dated things coming up soon, one per market per kind, soonest first. */
function upcomingItems(markets, today, windowDays) {
  const end = D.addDays(today, windowDays);
  const out = [];
  for (const m of markets) {
    if (D.isPast(m, today) || D.INACTIVE.includes(m.status)) continue;
    const seen = new Set();
    for (const k of D.upcomingDates(m, today)) {
      if (D.diffDays(k.date, end) < 0 || seen.has(k.type)) continue;
      if (k.type === 'appOpens') continue; // not a deadline
      if (k.recurring && !CONFIRMED_OR_APPLIED.includes(m.status)) continue; // a weekly market you're not in isn't "due"
      seen.add(k.type);
      out.push({ m, k });
    }
  }
  return out.sort((a, b) => (a.k.date < b.k.date ? -1 : a.k.date > b.k.date ? 1 : 0));
}

export function renderHome(env) {
  const { markets, explore, questions } = env.data;
  const { today } = env;
  const live = markets.filter((m) => !D.isPast(m, today));

  const toApply = live.filter((m) => V.isOpenToApply(m, today)).sort((a, b) => {
    const ca = a.application.closes || '9999', cb = b.application.closes || '9999';
    return ca === cb ? V.compareMarkets(a, b, today) : ca < cb ? -1 : 1;
  });
  const week = upcomingItems(live, today, WEEK);
  const finds = V.pendingFinds(explore).filter((x) => x.worthALook).slice(0, 3);
  const waiting = V.openQuestions(questions);
  const nextUp = live.filter((m) => D.CONFIRMED.includes(m.status))
    .sort((a, b) => V.compareMarkets(a, b, today)).slice(0, 4);

  const bits = [];
  if (toApply.length) bits.push(`${toApply.length} to apply`);
  if (week.length) bits.push(`${week.length} due this week`);
  if (waiting.length) bits.push(`${waiting.length} for you`);

  const root = h('div', { class: 'view view-home' });
  root.append(h('section', { class: 'hero' },
    h('h1', { class: 'wordmark', 'aria-label': 'POP! POP!' }, h('span', {}, 'POP!'), h('span', { class: 'hl' }, 'POP!')),
    h('p', { class: 'hero-date' }, D.fmtFull(today).replace(/, \d{4}$/, '')),
    h('p', { class: 'hero-sub' }, bits.length ? bits.join(' · ') : "You're all caught up.")));

  // 1. Apply now
  root.append(h('section', { class: 'block' },
    sectionHead('Apply now', { count: toApply.length || null, sub: toApply.length ? 'Applications open that you haven’t sent yet. Soonest deadline first.' : null }),
    toApply.length
      ? h('div', { class: 'cards' }, toApply.map((m) => marketCard(m, env, { quick: true, scope: 'apply' })))
      : empty('Nothing open to apply for.', 'When a market opens applications, it shows up here.')));

  // 2. Deadlines this week
  const nextAny = week.length ? null : upcomingItems(live, today, 400)[0];
  root.append(h('section', { class: 'block' },
    sectionHead('Due this week', { count: week.length || null }),
    week.length
      ? h('div', { class: 'minis' }, week.map(({ m, k }) => miniRow(m, env, { label: D.KEY_LABEL[k.type], date: k.date })))
      : empty('Nothing due in the next 7 days.', nextAny ? `Next is ${nextAny.m.name}. ${D.KEY_LABEL[nextAny.k.type]} ${D.fmtDay(nextAny.k.date)} (${D.relDays(nextAny.k.date, today)}).` : null)));

  // 3. Worth a look
  if (finds.length) {
    root.append(h('section', { class: 'block' },
      sectionHead('Worth a look', { sub: 'Starred finds from the web search. Not in your hub yet.' }),
      h('div', { class: 'finds' }, finds.map((f) => h('button', { type: 'button', class: 'find-row', onClick: () => env.go('explore') },
        h('span', { class: 'find-star', 'aria-hidden': 'true' }, '★'),
        h('span', { class: 'find-main' }, h('span', { class: 'mini-title' }, f.name), h('span', { class: 'card-meta' }, [f.dates[0] ? D.fmtDay(f.dates[0].date) : null, f.worthReason].filter(Boolean).join(' · '))),
        icon('right', { size: 18 }))))));
  }

  // 4. Questions waiting
  if (waiting.length) {
    root.append(h('button', { type: 'button', class: 'nudge', onClick: () => env.go('foryou') },
      h('span', { class: 'nudge-count' }, String(waiting.length)),
      h('span', { class: 'nudge-text' }, `${pluralize(waiting.length, 'question')} waiting for you`),
      icon('right', { size: 20 })));
  }

  // 5. Next up
  root.append(h('section', { class: 'block' },
    sectionHead('Next up', { sub: nextUp.length ? 'Your accepted and paid events.' : null }),
    nextUp.length
      ? h('div', { class: 'cards' }, nextUp.map((m) => marketCard(m, env, { scope: 'next' })))
      : empty('No confirmed events yet.', 'Accepted and paid markets show up here, in date order.')));

  return root;
}

