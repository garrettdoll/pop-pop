// View-model logic: what to show on a card, how to sort, which list a market belongs in.
// Pure functions (no DOM) so they can be tested in Node next to dates.js.
import * as D from './dates.js';

const { INACTIVE, NOT_YET_APPLIED } = D;

/** The date shown in a card's date block: the next important date, or the last event date if it's over. */
export function headDate(m, today) {
  const next = D.nextKeyDate(m, today);
  if (next) return { ...next, upcoming: true, urgent: D.diffDays(today, next.date) <= 7 && !INACTIVE.includes(m.status) };
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
