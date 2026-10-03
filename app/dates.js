// Date helpers, holiday logic, availability and key-date rules.
// Pure functions only (no DOM) so they can be unit-tested in Node.
// All dates are ISO strings ("2026-10-17") meaning America/New_York wall-clock days.

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---------- basic date math (UTC arithmetic, so no DST/timezone surprises) ----------

export const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const toISO = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
export const addDays = (iso, n) => toISO(parseISO(iso) + n * DAY);
export const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / DAY); // b - a
export const dow = (iso) => new Date(parseISO(iso)).getUTCDay(); // 0 = Sunday
export const isWeekend = (iso) => dow(iso) === 0 || dow(iso) === 6;
export const ymd = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
};
export const isISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12

/** Today in New York. `override` (an ISO string) lets tests and ?today= pin the date. */
export function todayISO(override) {
  if (isISO(override)) return override;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts; // en-CA formats as YYYY-MM-DD
}

// ---------- formatting ----------

export const fmtShort = (iso) => {
  const { m, d } = ymd(iso);
  return `${MONTHS_SHORT[m - 1]} ${d}`;
};
export const fmtDay = (iso) => `${DOW_SHORT[dow(iso)]}, ${fmtShort(iso)}`;
export const fmtFull = (iso) => `${DOW_LONG[dow(iso)]}, ${MONTHS[ymd(iso).m - 1]} ${ymd(iso).d}, ${ymd(iso).y}`;

export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${pad(m)}${suffix}` : `${h12}${suffix}`;
}
export function fmtTimeRange(start, end) {
  if (start && end) return `${fmtTime(start)}–${fmtTime(end)}`;
  return fmtTime(start || end) || '';
}

/** "today", "tomorrow", "in 5 days", "3 days ago" */
export function relDays(iso, today) {
  const n = diffDays(today, iso);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1) return `in ${n} days`;
  return `${-n} days ago`;
}

// ---------- US federal holidays ----------

/** nth weekday of a month. month is 1-12, weekday 0-6, n >= 1, or n = -1 for the last one. */
export function nthWeekday(year, month, weekday, n) {
  if (n > 0) {
    const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const day = 1 + ((weekday - firstDow + 7) % 7) + 7 * (n - 1);
    return `${year}-${pad(month)}-${pad(day)}`;
  }
  const last = daysInMonth(year, month);
  const lastDow = new Date(Date.UTC(year, month - 1, last)).getUTCDay();
  const day = last - ((lastDow - weekday + 7) % 7);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Federal holidays for one year, each with its observed date (Sat → Fri, Sun → Mon). */
export function federalHolidays(year) {
  const fixed = (month, day, name, short) => ({ date: `${year}-${pad(month)}-${pad(day)}`, name, short, fixed: true });
  const floating = (month, weekday, n, name, short) => ({ date: nthWeekday(year, month, weekday, n), name, short, fixed: false });
  const list = [
    fixed(1, 1, "New Year's Day", "New Year's Day"),
    floating(1, 1, 3, 'Martin Luther King Jr. Day', 'MLK Day'),
    floating(2, 1, 3, "Washington's Birthday (Presidents' Day)", "Presidents' Day"),
    floating(5, 1, -1, 'Memorial Day', 'Memorial Day'),
    fixed(6, 19, 'Juneteenth', 'Juneteenth'),
    fixed(7, 4, 'Independence Day', 'Fourth of July'),
    floating(9, 1, 1, 'Labor Day', 'Labor Day'),
    floating(10, 1, 2, "Columbus Day / Indigenous Peoples' Day", 'Columbus Day'),
    fixed(11, 11, 'Veterans Day', 'Veterans Day'),
    floating(11, 4, 4, 'Thanksgiving', 'Thanksgiving'),
    fixed(12, 25, 'Christmas Day', 'Christmas'),
  ];
  return list.map((h) => {
    let observed = h.date;
    if (h.fixed) {
      const d = dow(h.date);
      if (d === 6) observed = addDays(h.date, -1);
      else if (d === 0) observed = addDays(h.date, 1);
    }
    return { ...h, observed };
  });
}

const holidayCache = new Map();
function holidaysAround(year) {
  // Include neighbouring years: Jan 1 on a Saturday is observed on Dec 31 of the year before.
  const out = [];
  for (const y of [year - 1, year, year + 1]) {
    if (!holidayCache.has(y)) holidayCache.set(y, federalHolidays(y));
    out.push(...holidayCache.get(y));
  }
  return out;
}

export const DEFAULT_HOLIDAY_RULES = { adjacentDays: 1, bridgeDays: true };

/**
 * Normalise settings.companyLongWeekends. Each entry may be an ISO string or
 * { start, end?, label? }. Returns a Map of ISO date → label.
 */
export function companyDayMap(list) {
  const map = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    if (isISO(item)) { map.set(item, 'Company long weekend'); continue; }
    if (!item || !isISO(item.start)) continue;
    const end = isISO(item.end) ? item.end : item.start;
    for (let d = item.start; diffDays(d, end) >= 0 && diffDays(item.start, d) < 31; d = addDays(d, 1)) {
      map.set(d, item.label || 'Company long weekend');
    }
  }
  return map;
}

/** Build the day-classifier used by availability checks. */
export function makeCalendar(settings = {}) {
  const rules = { ...DEFAULT_HOLIDAY_RULES, ...(settings.holidayRules || {}) };
  const company = companyDayMap(settings.companyLongWeekends);

  const holidayOn = (iso) => {
    const year = ymd(iso).y;
    for (const h of holidaysAround(year)) if (h.observed === iso) return h;
    return null;
  };
  const isHolidayOff = (iso) => !!holidayOn(iso) || company.has(iso);
  const isBridge = (iso) => {
    if (!rules.bridgeDays || isWeekend(iso) || isHolidayOff(iso)) return false;
    const prev = addDays(iso, -1), next = addDays(iso, 1);
    // A workday squeezed between a holiday and a weekend (Friday after Thanksgiving, Monday before a Tuesday holiday).
    return (isWeekend(prev) && isHolidayOff(next)) || (isHolidayOff(prev) && isWeekend(next));
  };
  const isOff = (iso) => isWeekend(iso) || isHolidayOff(iso) || isBridge(iso);

  /** The run of consecutive days off that contains `iso`, or null if `iso` isn't a day off. */
  const blockAround = (iso) => {
    if (!isOff(iso)) return null;
    let start = iso, end = iso;
    while (isOff(addDays(start, -1))) start = addDays(start, -1);
    while (isOff(addDays(end, 1))) end = addDays(end, 1);
    return { start, end, length: diffDays(start, end) + 1 };
  };

  const blockLabel = (block) => {
    let federal = null, comp = null;
    for (let d = block.start; diffDays(d, block.end) >= 0; d = addDays(d, 1)) {
      const h = holidayOn(d);
      if (h && !federal) federal = h.short;
      if (company.has(d) && !comp) comp = company.get(d);
    }
    // Federal holidays read "Columbus Day weekend"; a company label is Garrett's own wording, used as given.
    if (federal) return `${federal} weekend`;
    return comp || 'long weekend';
  };

  /** A long weekend is 3+ days off in a row (so it includes at least one weekday). */
  const longWeekendAt = (iso) => {
    const block = blockAround(iso);
    return block && block.length >= 3 ? { ...block, label: blockLabel(block) } : null;
  };

  return { rules, holidayOn, isHolidayOff, isBridge, isOff, blockAround, longWeekendAt };
}

// ---------- availability ----------

/**
 * Availability for one day. level:
 *   free     Saturday or Sunday (no flag)
 *   likely   a weekday on, or next to, a long weekend. Probably free, still worth confirming
 *   confirm  an ordinary weekday: ⚠️ Availability to confirm
 * Never returns "unavailable". If unsure, flag.
 */
export function availabilityFor(iso, cal) {
  if (isWeekend(iso)) return { level: 'free', label: null, date: iso };
  const lw = cal.longWeekendAt(iso);
  if (lw) return { level: 'likely', label: `Falls on ${lw.label}`, note: 'Probably free. Confirm with your schedule.', date: iso };
  for (let i = 1; i <= cal.rules.adjacentDays; i++) {
    const before = cal.longWeekendAt(addDays(iso, i));
    if (before) return { level: 'likely', label: `Next to ${before.label}`, note: 'Probably free. Confirm with your schedule.', date: iso };
    const after = cal.longWeekendAt(addDays(iso, -i));
    if (after) return { level: 'likely', label: `Next to ${after.label}`, note: 'Probably free. Confirm with your schedule.', date: iso };
  }
  return { level: 'confirm', label: 'Availability to confirm', note: `${DOW_LONG[dow(iso)]}. You work 9-5 on weekdays.`, date: iso };
}

const LEVEL_RANK = { free: 0, likely: 1, confirm: 2 };

/** Every concrete event day for a market (explicit dates only; recurring series are handled via rules). */
export function eventDays(m) {
  return (m.dates || []).filter((d) => d && isISO(d.date));
}

/** Market-level availability: the most-flagged upcoming day wins. */
export function marketAvailability(m, cal, today) {
  const days = eventDays(m);
  if (!days.length) {
    const wk = m.recurrenceRule && Array.isArray(m.recurrenceRule.weekdays) ? m.recurrenceRule.weekdays : null;
    if (wk && wk.length) {
      const allWeekend = wk.every((d) => d === 0 || d === 6);
      return { level: allWeekend ? 'free' : 'confirm', weekendOnly: allWeekend, perDate: [], label: allWeekend ? null : 'Availability to confirm' };
    }
    return { level: 'unknown', weekendOnly: false, perDate: [], label: null };
  }
  let list = days.map((d) => availabilityFor(d.date, cal));
  const upcoming = list.filter((a) => !today || diffDays(today, a.date) >= 0);
  if (upcoming.length) list = upcoming;
  const worst = list.reduce((a, b) => (LEVEL_RANK[b.level] > LEVEL_RANK[a.level] ? b : a));
  return { level: worst.level, label: worst.label, note: worst.note, weekendOnly: list.every((a) => a.level === 'free'), perDate: list };
}

// ---------- statuses ----------

export const STATUSES = ['unknown', 'researching', 'to-apply', 'applied', 'waitlisted', 'accepted', 'paid', 'declined', 'lapsed', 'completed', 'skipped'];
export const STATUS_LABEL = {
  unknown: 'Needs you', researching: 'Researching', 'to-apply': 'To apply', applied: 'Applied', waitlisted: 'Waitlisted',
  accepted: 'Accepted', paid: 'Paid', declined: 'Declined', lapsed: 'Lapsed', completed: 'Completed', skipped: 'Skipped',
};
export const NOT_YET_APPLIED = ['unknown', 'researching', 'to-apply'];
export const INACTIVE = ['declined', 'lapsed', 'skipped'];
export const CONFIRMED = ['accepted', 'paid'];

// ---------- key dates ----------

/** Next `count` Saturday/Sunday-style occurrences of a recurring market from `from`. */
export function recurringOccurrences(m, from, to) {
  const rule = m.recurrenceRule;
  if (!rule || !Array.isArray(rule.weekdays) || !rule.weekdays.length) return [];
  const out = [];
  const start = rule.from && isISO(rule.from) && diffDays(from, rule.from) > 0 ? rule.from : from;
  const limit = rule.until && isISO(rule.until) && diffDays(to, rule.until) < 0 ? rule.until : to;
  for (let d = start; diffDays(d, limit) >= 0; d = addDays(d, 1)) {
    if (rule.weekdays.includes(dow(d))) out.push({ date: d, start: rule.start || null, end: rule.end || null });
  }
  return out;
}

/**
 * Every dated moment on a market's calendar.
 * type: event | rain | appOpens | appCloses | decisionBy | paymentBy
 */
export function keyDates(m) {
  const out = [];
  for (const d of eventDays(m)) {
    out.push({ type: 'event', date: d.date, start: d.start || null, end: d.end || null });
    if (isISO(d.rainDate)) out.push({ type: 'rain', date: d.rainDate });
  }
  const a = m.application || {};
  if (isISO(a.opens)) out.push({ type: 'appOpens', date: a.opens });
  if (isISO(a.closes)) out.push({ type: 'appCloses', date: a.closes });
  if (isISO(a.decisionBy)) out.push({ type: 'decisionBy', date: a.decisionBy });
  if (isISO(a.paymentDeadline)) out.push({ type: 'paymentBy', date: a.paymentDeadline });
  return out;
}

export const KEY_LABEL = {
  event: 'Event', rain: 'Rain date', appOpens: 'Apps open', appCloses: 'Apply by', decisionBy: 'Decision by', paymentBy: 'Pay by',
};

/** Is this kind of date still meaningful given the market's status? */
export function isRelevant(type, m) {
  const status = m.status || 'unknown';
  const state = (m.application && m.application.state) || 'unknown';
  switch (type) {
    case 'event': return true;
    case 'rain': return !INACTIVE.includes(status);
    case 'appOpens': return NOT_YET_APPLIED.includes(status) && state === 'upcoming';
    case 'appCloses': return NOT_YET_APPLIED.includes(status) && state !== 'closed';
    case 'decisionBy': return status === 'applied' || status === 'waitlisted';
    case 'paymentBy': return status === 'accepted';
    default: return false;
  }
}

const TYPE_PRIORITY = { appCloses: 0, paymentBy: 1, decisionBy: 2, appOpens: 3, event: 4, rain: 5 };

/** Upcoming relevant dates for a market, soonest first. Includes next recurring occurrence. */
export function upcomingDates(m, today) {
  const list = keyDates(m).filter((k) => isRelevant(k.type, m) && k.type !== 'rain' && diffDays(today, k.date) >= 0);
  if (m.recurrenceRule && !eventDays(m).length) {
    const status = m.status || 'unknown';
    if (!INACTIVE.includes(status) && status !== 'completed') {
      const occ = recurringOccurrences(m, today, addDays(today, 14))[0];
      if (occ) list.push({ type: 'event', date: occ.date, start: occ.start, end: occ.end, recurring: true });
    }
  }
  // ISO dates sort lexicographically; ties go to the most actionable type.
  return list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type]));
}

export const nextKeyDate = (m, today) => upcomingDates(m, today)[0] || null;

/** True when every event day is behind us (recurring series never count as past unless they ended). */
export function isPast(m, today) {
  if (m.archived) return true; // hand-marked history card (dates unknown but clearly over)
  if (m.kind === 'recurring' && m.recurrenceRule) {
    const until = m.recurrenceRule.until;
    return isISO(until) ? diffDays(today, until) < 0 : false;
  }
  const days = eventDays(m);
  if (!days.length) return m.status === 'completed';
  return days.every((d) => diffDays(today, d.rainDate && isISO(d.rainDate) && d.rainDate > d.date ? d.rainDate : d.date) < 0);
}

/** The date to show on a card when there's nothing coming up (most recent event day). */
export function lastEventDate(m) {
  const days = eventDays(m).map((d) => d.date).sort();
  return days.length ? days[days.length - 1] : null;
}
export function firstEventDate(m) {
  const days = eventDays(m).map((d) => d.date).sort();
  return days.length ? days[0] : null;
}

/** Calendar markers inside [from, to] (inclusive). Recurring series expand into one marker per day. */
export function calendarMarkers(markets, from, to) {
  const out = [];
  for (const m of markets) {
    if (INACTIVE.includes(m.status)) continue; // skipped / lapsed / declined don't belong on the schedule
    for (const k of keyDates(m)) {
      if (k.type === 'rain') continue;
      if (diffDays(from, k.date) < 0 || diffDays(k.date, to) < 0) continue;
      if (k.type !== 'event' && !isRelevant(k.type, m)) continue;
      out.push({ marketId: m.id, type: k.type, date: k.date });
    }
    if (m.recurrenceRule && !eventDays(m).length && !INACTIVE.includes(m.status)) {
      for (const occ of recurringOccurrences(m, from, to)) out.push({ marketId: m.id, type: 'recurring', date: occ.date });
    }
  }
  return out;
}
