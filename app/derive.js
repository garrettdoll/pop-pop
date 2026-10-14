// View-model logic: what to show on a card, how to sort, which list a market belongs in.
// Pure functions (no DOM) so they can be tested in Node next to dates.js.
import * as D from './dates.js';

const { INACTIVE, NOT_YET_APPLIED } = D;

/** The next event day (a recurring series counts as its next occurrence), or null. */
export function nextEventDate(m, today) {
  const days = D.eventDays(m).map((d) => d.date).filter((d) => D.diffDays(today, d) >= 0).sort();
  if (days.length) return days[0];
  if (m.recurrenceRule && !D.eventDays(m).length && !D.INACTIVE.includes(m.status) && m.status !== 'completed') {
    const occ = D.recurringOccurrences(m, today, D.addDays(today, 14))[0];
    if (occ) return occ.date;
  }
  return null;
}

/**
 * The date shown in a card's date block: always the event day, so it matches the dates in the title line.
 * Deadlines (apply by, pay by) are spelled out in the card's next-step line instead. A card turns "urgent"
 * when either the event or the next deadline is within a week. If the event is over, shows the last event day.
 */
export function headDate(m, today) {
  const key = D.nextKeyDate(m, today);
  const urgent = !!key && D.diffDays(today, key.date) <= 7 && !INACTIVE.includes(m.status);
  const next = nextEventDate(m, today);
  if (next) return { type: 'event', date: next, upcoming: true, urgent };
  const last = D.lastEventDate(m);
  if (last) return { type: 'event', date: last, upcoming: false, urgent: false };
  return null;
}

/** Where a market sits when sorting the list: 0 = dated and live, 1 = live but undated, 2 = skipped/lapsed/declined. */
export function sortGroup(m, today) {
  if (INACTIVE.includes(m.status)) return 2;
  return D.nextKeyDate(m, today) ? 0 : 1;
}

const AVAIL_RANK = { free: 0, likely: 1, unknown: 2, confirm: 3 };

/**
 * Sort by next important date. On the same date, weekend events come first, then likely-free weekdays
 * (holiday weekends), then weekdays that still need checking. `cal` is optional.
 */
export function compareMarkets(a, b, today, cal) {
  const ga = sortGroup(a, today), gb = sortGroup(b, today);
  if (ga !== gb) return ga - gb;
  if (ga === 0 || ga === 2) {
    const na = D.nextKeyDate(a, today), nb = D.nextKeyDate(b, today);
    const da = na ? na.date : D.firstEventDate(a) || '9999', db = nb ? nb.date : D.firstEventDate(b) || '9999';
    if (da !== db) return da < db ? -1 : 1;
  }
  if (cal) {
    const ra = AVAIL_RANK[D.marketAvailability(a, cal, today).level], rb = AVAIL_RANK[D.marketAvailability(b, cal, today).level];
    if (ra !== rb) return ra - rb;
  }
  return a.name.localeCompare(b.name);
}

/** Sort by when the event happens (soonest first). Undated live markets after dated ones, skipped ones last. */
export function compareByEvent(a, b, today, cal) {
  const ga = INACTIVE.includes(a.status) ? 2 : nextEventDate(a, today) ? 0 : 1;
  const gb = INACTIVE.includes(b.status) ? 2 : nextEventDate(b, today) ? 0 : 1;
  if (ga !== gb) return ga - gb;
  const da = nextEventDate(a, today) || D.firstEventDate(a) || '9999', db = nextEventDate(b, today) || D.firstEventDate(b) || '9999';
  if (da !== db) return da < db ? -1 : 1;
  if (cal) {
    const ra = AVAIL_RANK[D.marketAvailability(a, cal, today).level], rb = AVAIL_RANK[D.marketAvailability(b, cal, today).level];
    if (ra !== rb) return ra - rb;
  }
  return a.name.localeCompare(b.name);
}

export const comparePast = (a, b) => {
  const da = D.lastEventDate(a) || '0000', db = D.lastEventDate(b) || '0000';
  return da === db ? a.name.localeCompare(b.name) : da < db ? 1 : -1; // most recent first
};

/** Is this market one Garrett could still apply to right now? */
export function isOpenToApply(m, today) {
  const a = m.application;
  if (a.state !== 'open' || !NOT_YET_APPLIED.includes(m.status) || D.isPast(m, today)) return false;
  return !(a.closes && D.diffDays(today, a.closes) < 0);
}

/** Market needs something from Garrett: unknown status, an unconfirmed flag, or no date at all. */
export function needsInfo(m) {
  if (m.status === 'unknown') return true;
  if (m.flags.some((f) => f.type === 'unconfirmed')) return true;
  return m.kind !== 'recurring' && !m.dates.length && m.status !== 'skipped';
}

/** Flags shown on a card: the ones stored in the data, plus ones worked out here (organizer account, weekday availability). */
export function cardFlags(m, org, avail, today) {
  const flags = m.flags.map((f) => ({ kind: f.type, text: f.text }));
  const live = !D.isPast(m, today) && !INACTIVE.includes(m.status) && m.status !== 'completed';
  if (live && org) {
    const s = org.account.status;
    if (s === 'not_signed_up') flags.push({ kind: 'account', text: `Not signed up with ${org.name}` });
    else if (s === 'unknown') flags.push({ kind: 'account', text: `Not sure you're in ${org.name}'s system` });
  }
  if (live && avail) {
    if (avail.level === 'confirm') flags.push({ kind: 'avail', text: avail.label });
    else if (avail.level === 'likely') flags.push({ kind: 'likely', text: `${avail.label}. Likely free` });
  }
  return flags;
}

/** Every distinct place named across the markets, for the location filter. */
export function locationOptions(markets) {
  const boroughs = new Set(), hoods = new Set();
  for (const m of markets) {
    if (m.location.borough) boroughs.add(m.location.borough);
    if (m.location.neighborhood) hoods.add(m.location.neighborhood);
  }
  return { boroughs: [...boroughs].sort(), hoods: [...hoods].sort() };
}
export const matchesLocation = (m, place) =>
  !place || m.location.borough === place || m.location.neighborhood === place;

export const fmtMoney = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** Profit only when both numbers exist. Otherwise nothing. */
export function profitOf(results) {
  const sales = Number(results.salesTotal), fee = Number(results.boothFee);
  if (results.salesTotal == null || results.boothFee == null || Number.isNaN(sales) || Number.isNaN(fee)) return null;
  return sales - fee;
}

export function hasResults(results) {
  return Object.values(results).some((v) => v != null && v !== '');
}

export const FIT_LABEL = { good: 'Good fit', maybe: 'Maybe a fit', poor: 'Poor fit', unknown: 'Fit not assessed' };
export const APP_STATE_LABEL = { open: 'Open now', upcoming: 'Opens later', closed: 'Closed', waitlisted: 'Waitlisted', unknown: 'Not confirmed' };
export const ACCOUNT_LABEL = { in_system: 'In system', not_signed_up: 'Not signed up', unknown: 'Unknown', direct: 'Direct contact' };

/** Question helpers */
export const openQuestions = (qs) => qs.filter((q) => q.type === 'question' && !q.answeredAt);
export const openIdeas = (qs) => qs.filter((q) => q.type === 'idea' && !q.answeredAt);
export const answered = (qs) => qs.filter((q) => q.answeredAt);

/** Explore items still waiting on Garrett. */
export const pendingFinds = (items) => items.filter((x) => !x.dismissed && !x.moved);

// ======================================================================
// "Less on each card": status groups, one clear next step, weekends, grouping
// ======================================================================

/** The four looks a status sticker can have. The label still says the real status. */
export const STATUS_GROUP = {
  unknown: 'need', 'to-apply': 'need',
  researching: 'wait', applied: 'wait', waitlisted: 'wait',
  accepted: 'going', paid: 'going',
  completed: 'out', skipped: 'out', declined: 'out', lapsed: 'out',
};
export const statusGroup = (s) => STATUS_GROUP[s] || 'need';

/** Flags worth showing to Garrett as a "heads-up". The rest are Claude's own notes (what still needs checking). */
export const HEADSUP_TYPES = ['fit-conflict', 'postponed', 'info', 'verify'];
export const isHeadsUp = (f) => HEADSUP_TYPES.includes(f.type);

const eventRel = (m, today) => {
  const next = D.upcomingDates(m, today).find((k) => k.type === 'event');
  return next ? D.relDays(next.date, today) : null;
};

// ---------- setup: indoor/outdoor and tent rules ----------

export const SETTINGS = ['indoor', 'outdoor', 'both'];
export const TENT_RULES = ['required', 'provided', 'optional', 'not-allowed'];
export const SETTING_LABEL = { indoor: 'Indoor', outdoor: 'Outdoor', both: 'Indoor + outdoor' };
/** Short wording for the collapsed card. */
export const TENT_LABEL = { required: 'Tent required', provided: 'Tent provided', optional: 'Tent optional', 'not-allowed': 'No tents' };
/** Longer wording for the open card. */
export const TENT_LONG = {
  required: 'Required. Bring your own.', provided: 'Provided by the organizer', optional: 'Optional. Up to you.', 'not-allowed': 'Not allowed',
};

/**
 * What the card says about indoor/outdoor and tents. Vendors are often vague, so "not stated" is its own answer:
 * unknown is never shown as "no tent needed". Indoor markets don't nag about a tent that's rarely relevant.
 * parts: [{ text, kind }] where kind is 'strong' (a rule to act on), 'known' or 'unknown'.
 */
export function setupInfo(m) {
  const { setting = null, tent = null, note = null } = m.setup || {};
  const parts = [];
  if (setting) parts.push({ text: SETTING_LABEL[setting], kind: 'known' });
  if (tent) parts.push({ text: TENT_LABEL[tent], kind: tent === 'required' || tent === 'not-allowed' ? 'strong' : 'known' });
  else if (setting !== 'indoor') parts.push({ text: setting ? 'Tent not stated' : 'Setup not stated', kind: 'unknown' });
  return {
    setting, tent, note, parts,
    text: parts.map((x) => x.text).join(' · '),
    known: !!(setting || tent),
  };
}

/**
 * The one thing to do about a market, in plain words.
 * Returns { text, urgent } where urgent means "do this within a week" (or it's blocked on something).
 */
export function nextStep(m, org, today) {
  const a = m.application;
  const st = m.status;
  const closeness = (iso) => `${D.fmtShort(iso)} · ${D.relDays(iso, today)}`;
  const within7 = (iso) => D.diffDays(today, iso) <= 7;

  if (st === 'skipped') return { text: 'Not going', urgent: false };
  if (st === 'declined') return { text: 'Declined', urgent: false };
  if (st === 'lapsed') return { text: 'Spot lapsed (payment missed)', urgent: false };
  if (st === 'completed') return { text: 'Done', urgent: false };
  if (D.isPast(m, today)) return { text: st === 'unknown' ? 'Did you vend this one?' : 'Over', urgent: false };

  if (D.NOT_YET_APPLIED.includes(st)) {
    if (org && org.account.status === 'not_signed_up') return { text: `Sign up with ${org.name} first`, urgent: true };
    if (a.state === 'open') {
      if (a.closes && D.diffDays(today, a.closes) >= 0) return { text: `Apply by ${closeness(a.closes)}`, urgent: within7(a.closes) };
      return { text: 'Apply (no deadline listed)', urgent: false };
    }
    if (a.state === 'upcoming' && a.opens) return { text: `Applications open ${closeness(a.opens)}`, urgent: false };
    if (a.state === 'closed') return { text: st === 'unknown' ? 'Closed. Did you apply?' : 'Applications closed', urgent: false };
    return { text: st === 'unknown' ? 'Have you applied?' : st === 'to-apply' ? 'Ready to apply' : 'Still deciding', urgent: false };
  }
  if (st === 'applied') {
    if (a.decisionBy && D.diffDays(today, a.decisionBy) >= 0) return { text: `Decision by ${closeness(a.decisionBy)}`, urgent: within7(a.decisionBy) };
    return { text: 'Waiting to hear back', urgent: false };
  }
  if (st === 'waitlisted') return { text: 'On the waitlist', urgent: false };
  if (st === 'accepted') {
    if (a.paymentDeadline && D.diffDays(today, a.paymentDeadline) >= 0) return { text: `Pay by ${closeness(a.paymentDeadline)}`, urgent: within7(a.paymentDeadline) };
    const rel = eventRel(m, today);
    return { text: rel ? `Accepted · ${rel}` : 'Accepted · date not set', urgent: false };
  }
  if (st === 'paid') {
    const rel = eventRel(m, today);
    return { text: rel ? `Paid · ${rel}` : 'Paid · date not set', urgent: false };
  }
  return { text: '', urgent: false };
}

/** Markets that need Garrett to do something (not past, not skipped). */
export function needsAction(m, today) {
  if (D.isPast(m, today) || D.INACTIVE.includes(m.status)) return false;
  if (isOpenToApply(m, today)) return true;
  if (m.status === 'accepted' && m.application.paymentDeadline && D.diffDays(today, m.application.paymentDeadline) >= 0) return true;
  return m.status === 'unknown';
}

/** Open applications, soonest deadline first (no deadline last). */
export function applyFor(markets, today) {
  return markets.filter((m) => isOpenToApply(m, today)).sort((a, b) => {
    const ca = a.application.closes || '9999', cb = b.application.closes || '9999';
    return ca === cb ? compareMarkets(a, b, today) : ca < cb ? -1 : 1;
  });
}

/**
 * Due soon: payments and decisions in the next `days`, plus event days within a week for events you're going to.
 * Application deadlines are left out (they live under "Apply for"). One row per market.
 */
export function dueSoon(markets, today, days = 14) {
  const end = D.addDays(today, days);
  const out = [];
  for (const m of markets) {
    if (D.isPast(m, today) || D.INACTIVE.includes(m.status)) continue;
    for (const k of D.upcomingDates(m, today)) {
      if (k.date > end || k.type === 'appCloses' || k.type === 'appOpens') continue;
      if (k.type === 'event' && (!D.CONFIRMED.includes(m.status) || D.diffDays(today, k.date) > 7)) continue;
      out.push({ m, k });
      break;
    }
  }
  return out.sort((a, b) => (a.k.date < b.k.date ? -1 : a.k.date > b.k.date ? 1 : 0));
}

/** "Sat, Oct 24" · "Sat–Sun, Oct 24–25" · "Oct 24 · Nov 7". */
export function shortDates(m) {
  if (m.kind === 'recurring' && m.recurrenceRule && Array.isArray(m.recurrenceRule.weekdays) && !m.dates.length) {
    const wk = m.recurrenceRule.weekdays;
    if (wk.length === 1) return `Every ${D.DOW_LONG[wk[0]]}`;
  }
  const days = D.eventDays(m).map((d) => d.date).sort();
  if (!days.length) return m.recurrence ? m.recurrence : 'Date not set';
  if (days.length === 1) return D.fmtDay(days[0]);
  if (days.length === 2 && D.diffDays(days[0], days[1]) === 1) {
    const a = D.ymd(days[0]), b = D.ymd(days[1]);
    const end = a.m === b.m ? `${b.d}` : D.fmtShort(days[1]);
    return `${D.DOW_SHORT[D.dow(days[0])]}–${D.DOW_SHORT[D.dow(days[1])]}, ${D.fmtShort(days[0])}–${end}`;
  }
  return days.slice(0, 3).map(D.fmtShort).join(' · ');
}

/** "Nov 14 & 21" / "Oct 31 & Nov 7" for a run of dates. */
export function datesRun(dates) {
  const sorted = [...dates].sort();
  const parts = sorted.map((d) => D.ymd(d));
  return sorted.map((d, i) => (i > 0 && parts[i].m === parts[i - 1].m ? `${parts[i].d}` : D.fmtShort(d))).join(' & ');
}

/**
 * Collapse the same market on several dates into one entry ("Monsta House · Nov 14 & 21").
 * Only single-date events from the same organizer with the same name are merged.
 * Returns [{ type: 'single', m } | { type: 'group', items: [m, m, ...] }] in the original order.
 */
export function groupSeries(list) {
  const groups = new Map();
  const out = [];
  for (const m of list) {
    const single = m.kind === 'event' && m.dates.length === 1 && m.organizerId;
    const key = single ? `${m.organizerId}|${m.name.trim().toLowerCase()}` : null;
    if (!key) { out.push({ type: 'single', m }); continue; }
    if (!groups.has(key)) { const g = { type: 'group', key, items: [] }; groups.set(key, g); out.push(g); }
    groups.get(key).items.push(m);
  }
  return out.map((e) => (e.type === 'group' && e.items.length === 1 ? { type: 'single', m: e.items[0] } : e));
}

/**
 * The next `n` weekends (Sat + Sun), each marked:
 *   going    a confirmed (accepted / paid) market falls on it
 *   waiting  you've applied, are waitlisted, or plan to apply
 *   free     nothing committed. `options` counts markets you could still consider
 * Weekly series without explicit dates (like Fort Greene Saturdays) are ignored on purpose.
 */
export function weekendsAhead(markets, today, n = 8) {
  const d = D.dow(today);
  const firstSat = d === 6 ? today : d === 0 ? D.addDays(today, -1) : D.addDays(today, 6 - d);
  const out = [];
  for (let i = 0; i < n; i++) {
    const sat = D.addDays(firstSat, i * 7), sun = D.addDays(sat, 1);
    const here = markets.filter((m) => !D.INACTIVE.includes(m.status) && m.status !== 'completed'
      && D.eventDays(m).some((e) => e.date === sat || e.date === sun));
    const going = here.filter((m) => D.CONFIRMED.includes(m.status));
    const waiting = here.filter((m) => ['applied', 'waitlisted', 'to-apply'].includes(m.status));
    const options = here.length - going.length - waiting.length;
    out.push({ sat, sun, state: going.length ? 'going' : waiting.length ? 'waiting' : 'free', going, waiting, options, here });
  }
  return out;
}

export const weekendLabel = (sat) => {
  const a = D.ymd(sat), b = D.ymd(D.addDays(sat, 1));
  return a.m === b.m ? `${D.MONTHS_SHORT[a.m - 1]} ${a.d}–${b.d}` : `${D.fmtShort(sat)}–${D.fmtShort(D.addDays(sat, 1))}`;
};
