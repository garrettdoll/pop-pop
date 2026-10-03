// Defensive shaping of data files. Claude and the app both write these files, so any card can be
// missing fields. The UI assumes the shapes below and never sees raw JSON, so a half-filled card
// can't blank the screen. Problems are collected and shown in Settings instead of thrown.
import { STATUSES, isISO } from './dates.js';

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' ? v : v == null ? null : String(v));

export function normalizeMarket(raw, problems = []) {
  const m = obj(raw);
  const id = str(m.id);
  const label = id || m.name || 'a market';
  const dates = [];
  for (const d of arr(m.dates)) {
    if (d && isISO(d.date)) dates.push({ start: null, end: null, rainDate: null, ...d, rainDate: isISO(d.rainDate) ? d.rainDate : null });
    else problems.push(`${label}: ignored a date that isn't YYYY-MM-DD`);
  }
  let status = m.status;
  if (!STATUSES.includes(status)) {
    if (status != null) problems.push(`${label}: unknown status "${status}", shown as "Needs you"`);
    status = 'unknown';
  }
  const application = { opens: null, closes: null, decisionBy: null, paymentDeadline: null, state: 'unknown', ...obj(m.application) };
  for (const k of ['opens', 'closes', 'decisionBy', 'paymentDeadline']) {
    if (application[k] != null && !isISO(application[k])) {
      problems.push(`${label}: ignored application.${k} "${application[k]}"`);
      application[k] = null;
    }
  }
  return {
    ...m,
    id, name: str(m.name) || '(untitled market)', organizerId: str(m.organizerId),
    status, kind: m.kind === 'recurring' ? 'recurring' : 'event',
    dates, recurrence: str(m.recurrence),
    location: { venue: null, address: null, neighborhood: null, borough: null, ...obj(m.location) },
    application,
    fees: { application: null, booth: null, notes: null, ...obj(m.fees) },
    requirements: arr(m.requirements).map(String),
    vendorRules: str(m.vendorRules),
    fit: { rating: 'unknown', note: null, ...obj(m.fit) },
    links: { apply: null, event: null, vendorInfo: null, ...obj(m.links) },
    contact: m.contact ?? null,
    notes: typeof m.notes === 'string' ? m.notes : '',
    flags: arr(m.flags).filter((f) => f && f.text).map((f) => ({ type: 'info', field: null, ...f })),
    source: obj(m.source),
    results: { salesTotal: null, boothFee: null, thumbs: null, bestSellers: null, footTraffic: null, notes: null, ...obj(m.results) },
    history: arr(m.history),
  };
}

export function normalizeOrganizer(raw) {
  const o = obj(raw);
  const account = { status: 'unknown', note: null, signupUrl: null, dashboardUrl: null, ...obj(o.account) };
  return {
    ...o,
    id: str(o.id), name: str(o.name) || '(unnamed organizer)',
    account,
    contacts: arr(o.contacts).map((c) => ({ role: null, name: null, email: null, instagram: null, phone: null, ...obj(c) })),
    emailSenders: arr(o.emailSenders), website: str(o.website), links: arr(o.links).filter((l) => l && l.url),
    howItWorks: str(o.howItWorks), notes: typeof o.notes === 'string' ? o.notes : '', history: arr(o.history),
  };
}

export function normalizeExplore(raw, problems = []) {
  const m = normalizeMarket(raw, problems);
  const r = obj(raw);
  return { ...m, foundBy: r.foundBy || 'search', foundAt: r.foundAt || null, worthALook: !!r.worthALook, worthReason: str(r.worthReason), dismissed: !!r.dismissed, moved: !!r.moved };
}

export function normalizeQuestion(raw) {
  const q = obj(raw);
  const related = obj(q.related);
  return {
    ...q,
    id: str(q.id), type: q.type === 'idea' ? 'idea' : 'question', text: str(q.text) || '',
    related: { marketIds: arr(related.marketIds), organizerIds: arr(related.organizerIds) },
    options: Array.isArray(q.options) && q.options.length ? q.options.map((o) => (typeof o === 'string' ? { label: o } : o)).filter((o) => o && o.label) : null,
    perMarket: !!q.perMarket, answers: obj(q.answers), answeredAt: q.answeredAt || null, answer: q.answer ?? null,
  };
}

export const emptyData = () => ({ markets: [], organizers: [], explore: [], questions: [], settings: {} });

/** Turn one raw file into the shape the UI uses (a plain array, or the settings object). */
export function normalizeFile(key, raw, problems = []) {
  const file = obj(raw);
  if (raw != null && typeof raw !== 'object') problems.push(`${key}.json isn't a JSON object`);
  const keep = (list, fn) => {
    const out = [], seen = new Set();
    for (const item of arr(list)) {
      if (!item || typeof item !== 'object' || !item.id) { problems.push(`${key}.json: skipped an entry without an id`); continue; }
      if (seen.has(item.id)) { problems.push(`${key}.json: duplicate id "${item.id}" (showing the first)`); continue; }
      seen.add(item.id);
      out.push(fn(item));
    }
    return out;
  };
  switch (key) {
    case 'markets': return keep(file.markets, (m) => normalizeMarket(m, problems));
    case 'organizers': return keep(file.organizers, normalizeOrganizer);
    case 'explore': return keep(file.items, (m) => normalizeExplore(m, problems));
    case 'questions': return keep(file.items, normalizeQuestion);
    case 'settings': return file;
    default: return raw;
  }
}
