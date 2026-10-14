// The market card, used on Home, Markets, Calendar and Organizers.
//
// Collapsed it says four things: when, what, the status, and the one next step.
// Everything else lives behind a tap, grouped so the open card is easy to scan too.
import { h, icon, extLink } from './util.js';
import * as D from './dates.js';
import * as V from './derive.js';
import { sticker, accountTag, fitTag, flagChip } from './ui.js';

function dateBlock(head) {
  if (!head) return h('span', { class: 'datebox datebox-tbd' }, h('small', {}, 'date'), h('b', {}, 'TBD'), h('small', {}, '?'));
  const { m, d } = D.ymd(head.date);
  return h('span', { class: `datebox ${head.urgent ? 'urgent' : ''} ${head.upcoming ? '' : 'over'}` },
    h('small', {}, D.MONTHS_SHORT[m - 1]), h('b', {}, String(d)), h('small', {}, D.DOW_SHORT[D.dow(head.date)]));
}

/** "Sat, Oct 17 · 10am–5pm" / "Sat, Dec 5 + Sun, Dec 6 · 10am–5:30pm" / the recurrence text. Used by Explore. */
export function summarizeDates(m) {
  if (m.kind === 'recurring' && m.recurrence) return m.recurrence;
  const days = m.dates;
  if (!days.length) return 'Date not set';
  if (days.length === 1) {
    const t = D.fmtTimeRange(days[0].start, days[0].end);
    return `${D.fmtDay(days[0].date)}${t ? ` · ${t}` : ''}`;
  }
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const t = D.fmtTimeRange(sorted[0].start, sorted[0].end);
  return `${sorted.map((d) => D.fmtDay(d.date)).join(' + ')}${t ? ` · ${t}` : ''}`;
}

const place = (m) => m.location.neighborhood || m.location.borough || m.location.venue || null;

function field(label, ...content) {
  const kids = content.flat(Infinity).filter((c) => c != null && c !== false && c !== '');
  if (!kids.length) return null;
  return h('div', { class: 'field' }, h('div', { class: 'field-label' }, label), h('div', { class: 'field-value' }, kids));
}

const muted = (text) => h('span', { class: 'muted' }, text);

/** A collapsible group inside an open card. Returns null when there is nothing to show. */
function more(title, ...children) {
  const kids = children.flat(Infinity).filter(Boolean);
  if (!kids.length) return null;
  return h('details', { class: 'more' }, h('summary', {}, title), h('div', { class: 'more-body' }, kids));
}

function whenField(m, env) {
  const rows = [];
  for (const d of [...m.dates].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const t = D.fmtTimeRange(d.start, d.end);
    const live = D.diffDays(env.today, d.rainDate || d.date) >= 0;
    const a = live ? D.availabilityFor(d.date, env.cal) : null;
    rows.push(h('li', {},
      h('span', { class: 'when-day' }, D.fmtFull(d.date).replace(/, \d{4}$/, '')),
      t ? ` · ${t}` : null,
      d.rainDate ? muted(` · rain date ${D.fmtDay(d.rainDate)}`) : null,
      a && a.level === 'confirm' ? flagChip({ kind: 'avail', text: a.label }) : null,
      a && a.level === 'likely' ? flagChip({ kind: 'likely', text: `${a.label}. Likely free` }) : null));
  }
  const recurring = m.kind === 'recurring' && m.recurrence ? h('p', { class: 'recurrence' }, m.recurrence) : null;
  if (!rows.length && !recurring) return field('When', muted('Date not set yet'));
  return field('When', recurring, rows.length ? h('ul', { class: 'when-list' }, rows) : null);
}

function whereField(m) {
  const { venue, address, neighborhood, borough } = m.location;
  const line2 = address || [neighborhood, borough].filter(Boolean).join(', ');
  if (!venue && !line2) return null;
  const query = [venue, address || [neighborhood, borough].filter(Boolean).join(' ')].filter(Boolean).join(' ');
  return field('Where',
    venue ? h('div', { class: 'strong' }, venue) : null,
    line2 ? h('div', {}, line2) : null,
    h('a', { class: 'inline-link', href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, target: '_blank', rel: 'noopener noreferrer' }, 'Open in Maps ↗'));
}

function applicationField(m) {
  const a = m.application;
  const bits = [];
  if (a.state && a.state !== 'unknown') bits.push(h('div', {}, h('span', { class: 'strong' }, V.APP_STATE_LABEL[a.state] || a.state)));
  else bits.push(h('div', {}, muted('Application status not confirmed')));
  const dates = [];
  if (a.opens) dates.push(`Opens ${D.fmtDay(a.opens)}`);
  if (a.closes) dates.push(`Closes ${D.fmtDay(a.closes)}`);
  if (a.decisionBy) dates.push(`Decision by ${D.fmtDay(a.decisionBy)}`);
  if (a.paymentDeadline) dates.push(`Pay by ${D.fmtDay(a.paymentDeadline)}`);
  if (dates.length) bits.push(h('ul', { class: 'plain-list' }, dates.map((t) => h('li', {}, t))));
  return field('Application', bits);
}

function feesField(m) {
  const f = m.fees;
  const rows = [];
  if (f.application != null) rows.push(`Application: ${typeof f.application === 'number' ? V.fmtMoney(f.application) : f.application}`);
  if (f.booth != null) rows.push(`Booth: ${typeof f.booth === 'number' ? (f.booth === 0 ? 'Waived' : V.fmtMoney(f.booth)) : f.booth}`);
  return field('Fees', rows.length ? h('ul', { class: 'plain-list' }, rows.map((t) => h('li', {}, t))) : null, f.notes ? h('p', { class: 'small' }, f.notes) : null);
}

/** The "you need an account first" box. Shown at the top of an open card when it blocks you. */
function signupCallout(org, env) {
  const status = org.account.status;
  return h('div', { class: 'callout' },
    h('p', {}, status === 'not_signed_up'
      ? `⚠️ You're not signed up with ${org.name} yet. You'll need an account before applying.`
      : `⚠️ Not sure if you're in ${org.name}'s system. Tap one to set it:`),
    h('div', { class: 'row' },
      extLink('Sign up', org.account.signupUrl, { cls: 'btn btn-solid' }),
      h('button', { type: 'button', class: 'btn btn-line', onClick: () => env.act('organizer.setAccount', { id: org.id, status: 'in_system' }) }, "I'm signed up"),
      status === 'unknown' ? h('button', { type: 'button', class: 'btn btn-line', onClick: () => env.act('organizer.setAccount', { id: org.id, status: 'not_signed_up' }) }, 'Not signed up') : null));
}

function organizerField(m, org, env) {
  if (!org) return m.organizerId ? field('Organizer', muted(`Unknown organizer (${m.organizerId})`)) : null;
  const contacts = typeof m.contact === 'string' && m.contact
    ? [h('li', {}, m.contact.includes('@') ? extLink(m.contact, `mailto:${m.contact}`, { cls: 'inline-link', showIcon: false }) : m.contact)]
    : org.contacts.map((c) => h('li', {},
      [c.name, c.role].filter(Boolean).join(' · ') || 'Contact', c.email ? [' ', extLink(c.email, `mailto:${c.email}`, { cls: 'inline-link', showIcon: false })] : null,
      c.instagram ? ` · ${c.instagram}` : null));
  return field('Organizer',
    h('div', { class: 'org-line' },
      h('button', { type: 'button', class: 'inline-link', onClick: () => env.go('organizers', org.id) }, org.name), ' ', accountTag(org.account.status)),
    org.account.note ? h('p', { class: 'small' }, org.account.note) : null,
    contacts.length ? h('ul', { class: 'plain-list' }, contacts) : null);
}

/** The main button: apply (or open the organizer's dashboard when there is no direct link). */
function primaryLink(m, org) {
  if (m.links.apply) return extLink('Apply', m.links.apply, { cls: 'btn btn-solid' });
  if (org && org.account.dashboardUrl && D.NOT_YET_APPLIED.includes(m.status)) return extLink(`Open ${org.name.split(' (')[0]} dashboard`, org.account.dashboardUrl, { cls: 'btn btn-solid' });
  return null;
}

function otherLinks(m) {
  const buttons = [extLink('Event page', m.links.event), extLink('Vendor info', m.links.vendorInfo)].filter(Boolean);
  return buttons.length ? field('Links', h('div', { class: 'row' }, buttons)) : null;
}

function resultsBlock(m) {
  const r = m.results;
  const profit = V.profitOf(r);
  const items = [];
  if (r.salesTotal != null) items.push(['Sales', V.fmtMoney(Number(r.salesTotal))]);
  if (r.boothFee != null) items.push(['Booth fee', V.fmtMoney(Number(r.boothFee))]);
  if (profit != null) items.push(['Profit', V.fmtMoney(profit)]);
  if (r.thumbs != null) items.push(['Overall', r.thumbs ? '👍' : '👎']);
  if (r.footTraffic) items.push(['Foot traffic', String(r.footTraffic)]);
  if (r.bestSellers) items.push(['Best sellers', String(r.bestSellers)]);
  if (!items.length && !r.notes) return null;
  return field('Results',
    items.length ? h('dl', { class: 'results-grid' }, items.map(([k, v]) => [h('dt', {}, k), h('dd', { class: k === 'Profit' ? 'profit' : '' }, v)])) : null,
    r.notes ? h('p', { class: 'small' }, r.notes) : null);
}

function resultsForm(m, env, close) {
  let thumbs = m.results.thumbs;
  const num = (name, label, value, ph) => h('label', { class: 'form-field' }, h('span', {}, label),
    h('input', { name, type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: ph || '', value: value ?? '' }));
  const sales = num('salesTotal', 'Sales total ($)', m.results.salesTotal);
  const fee = num('boothFee', 'Booth fee ($)', m.results.boothFee ?? (typeof m.fees.booth === 'number' ? m.fees.booth : null));
  const best = h('label', { class: 'form-field' }, h('span', {}, 'Best sellers'), h('input', { name: 'bestSellers', type: 'text', autocomplete: 'off', value: m.results.bestSellers ?? '' }));
  const traffic = h('label', { class: 'form-field' }, h('span', {}, 'Foot traffic'),
    h('select', { name: 'footTraffic' }, ['', 'Slow', 'OK', 'Busy', 'Packed'].map((o) => h('option', { value: o, selected: (m.results.footTraffic || '') === o }, o || 'Not sure'))));
  const notes = h('label', { class: 'form-field' }, h('span', {}, 'Notes'), h('textarea', { name: 'notes', rows: 2 }, m.results.notes ?? ''));
  const up = h('button', { type: 'button', class: 'btn btn-line thumb', 'aria-pressed': String(thumbs === true), onClick: () => setThumbs(true) }, icon('thumbUp', { size: 18 }), 'Good day');
  const down = h('button', { type: 'button', class: 'btn btn-line thumb', 'aria-pressed': String(thumbs === false), onClick: () => setThumbs(false) }, icon('thumbDown', { size: 18 }), 'Rough day');
  function setThumbs(v) {
    thumbs = thumbs === v ? null : v;
    up.setAttribute('aria-pressed', String(thumbs === true));
    down.setAttribute('aria-pressed', String(thumbs === false));
  }
  const parse = (el) => { const t = el.querySelector('input').value.replace(/[$,\s]/g, ''); return t === '' || Number.isNaN(Number(t)) ? null : Number(t); };
  return h('form', { class: 'inline-form', onSubmit: (e) => {
    e.preventDefault();
    const results = {
      salesTotal: parse(sales), boothFee: parse(fee), thumbs,
      bestSellers: best.querySelector('input').value.trim() || null,
      footTraffic: traffic.querySelector('select').value || null,
      notes: notes.querySelector('textarea').value.trim() || null,
    };
    if (Object.values(results).every((v) => v == null)) { close(); return; } // nothing entered, nothing saved
    if (env.act('market.setResults', { id: m.id, results })) close();
  } },
  h('p', { class: 'form-hint' }, 'Everything here is optional. Fill in what you feel like.'),
  h('div', { class: 'form-grid' }, sales, fee), h('div', { class: 'row' }, up, down), best, traffic, notes,
  h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn btn-solid' }, 'Save results'), h('button', { type: 'button', class: 'btn btn-line', onClick: close }, 'Cancel')));
}

function noteForm(m, env, close) {
  const ta = h('textarea', { rows: 3, 'aria-label': 'Note', placeholder: 'Add a note…' });
  return h('form', { class: 'inline-form', onSubmit: (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) { close(); return; }
    if (env.act('market.addNote', { id: m.id, text })) close();
  } }, ta, h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn btn-solid' }, 'Save note'), h('button', { type: 'button', class: 'btn btn-line', onClick: close }, 'Cancel')));
}

function claudeNotes(m) {
  const notes = m.flags.filter((f) => !V.isHeadsUp(f));
  const hist = [...m.history].reverse().slice(0, 12);
  const src = [];
  if (m.lastVerified) src.push(`Last verified ${D.fmtShort(m.lastVerified)}`);
  if (m.source && m.source.type) src.push(`from ${m.source.type}`);
  return more(`Claude's notes${m.history.length ? ` & history (${m.history.length})` : ''}`,
    notes.length ? h('div', { class: 'field' }, h('div', { class: 'field-label' }, 'Still to check'), h('ul', { class: 'flag-list' }, notes.map((f) => h('li', {}, flagChip({ kind: f.type, text: f.text }))))) : null,
    hist.length ? h('div', { class: 'field' }, h('div', { class: 'field-label' }, 'History'),
      h('ul', { class: 'plain-list' }, hist.map((e) => h('li', {}, h('span', { class: 'muted' }, `${e.at ? D.fmtShort(e.at) : ''} · ${e.by || ''}: `), e.change)))) : null,
    src.length ? h('p', { class: 'source-line' }, src.join(' · ')) : null);
}

function controls(m, env, org) {
  const select = h('select', { class: 'status-select', 'aria-label': `Status of ${m.name}`, onChange: (e) => {
    if (!env.act('market.setStatus', { id: m.id, status: e.target.value })) e.target.value = m.status; // read-only: snap back
  } }, D.STATUSES.map((s) => h('option', { value: s, selected: s === m.status }, D.STATUS_LABEL[s])));
  const form = h('div', { class: 'form-slot' });
  const open = (kind) => {
    form.replaceChildren(kind === 'note' ? noteForm(m, env, () => form.replaceChildren()) : resultsForm(m, env, () => form.replaceChildren()));
    const first = form.querySelector('textarea, input');
    if (first) first.focus({ preventScroll: false });
  };
  const primary = primaryLink(m, org);
  return h('div', { class: 'controls' },
    h('div', { class: 'row first' },
      primary,
      D.NOT_YET_APPLIED.includes(m.status) ? h('button', { type: 'button', class: primary ? 'btn btn-line' : 'btn btn-solid', onClick: () => env.act('market.setStatus', { id: m.id, status: 'applied' }) }, 'Mark applied') : null),
    h('label', { class: 'status-control' }, h('span', { class: 'field-label' }, 'Status'), select),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn btn-line', onClick: () => open('note') }, 'Add note'),
      h('button', { type: 'button', class: 'btn btn-line', onClick: () => open('results') }, V.hasResults(m.results) ? 'Edit results' : 'Add results')),
    form);
}

/** The line under the title: the status sticker, the one next step, and a weekday chip when it matters. */
function statusLine(m, org, env, avail, live) {
  const step = V.nextStep(m, org, env.today);
  const chip = live && avail.level === 'confirm' ? flagChip({ kind: 'avail', text: 'Weekday' })
    : live && avail.level === 'likely' ? flagChip({ kind: 'likely', text: 'Likely free' }) : null;
  return h('span', { class: 'card-status' },
    sticker(m.status, m.id),
    step.text ? h('span', { class: `step${step.urgent ? ' urgent' : ''}` }, step.text) : null,
    chip);
}

/** Inside a group the market's name is already on the row above, so each date card leads with its own date. */
const nestedTitle = (m) => (D.eventDays(m).length ? D.fmtDay(D.eventDays(m)[0].date) : m.name);
const nestedMeta = (m) => {
  const d = D.eventDays(m)[0];
  return (d && D.fmtTimeRange(d.start, d.end)) || '';
};

/**
 * One market card.
 * opts.quick: show "Applied / Not yet / Skip" under the header (for markets whose status is unknown).
 * opts.openByDefault: start expanded (calendar day panel).
 * opts.scope: keeps DOM ids unique when the same market appears twice on a page.
 */
export function marketCard(m, env, opts = {}) {
  const org = env.orgMap.get(m.organizerId) || null;
  const avail = D.marketAvailability(m, env.cal, env.today);
  const head = V.headDate(m, env.today);
  const wantOpen = opts.openByDefault ? true : env.open.has(m.id);
  if (opts.openByDefault) env.open.add(m.id);
  const bodyId = `body-${opts.scope || 'c'}-${m.id}`;
  const past = D.isPast(m, env.today);
  const out = V.statusGroup(m.status) === 'out';
  const live = !past && !out;

  const card = h('article', {
    class: `card${wantOpen ? ' open' : ''}${past ? ' is-past' : ''}${out ? ' is-out' : ''}${head && head.urgent && live ? ' is-urgent' : ''}${opts.nested ? ' nested' : ''}`,
    dataset: { id: m.id },
  });
  const button = h('button', { type: 'button', class: 'card-head', 'aria-expanded': String(wantOpen), 'aria-controls': bodyId, onClick: toggle },
    dateBlock(head),
    h('span', { class: 'card-main' },
      h('span', { class: 'card-title' }, opts.nested ? nestedTitle(m) : m.name),
      h('span', { class: 'card-meta' }, opts.nested ? nestedMeta(m) : [V.shortDates(m), place(m)].filter(Boolean).join(' · ')),
      statusLine(m, org, env, avail, live)),
    h('span', { class: 'chev' }, icon('chevron', { size: 20 })));

  function toggle() {
    const open = !card.classList.contains('open');
    card.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
    if (open) env.open.add(m.id); else env.open.delete(m.id);
  }

  const quick = opts.quick && m.status === 'unknown' ? h('div', { class: 'quick' },
    h('span', { class: 'quick-q' }, 'Have you applied?'),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn btn-line btn-sm', onClick: () => env.act('market.setStatus', { id: m.id, status: 'applied' }) }, 'Yes, applied'),
      h('button', { type: 'button', class: 'btn btn-line btn-sm', onClick: () => env.act('market.setStatus', { id: m.id, status: 'to-apply' }) }, 'Not yet'),
      h('button', { type: 'button', class: 'btn btn-line btn-sm', onClick: () => env.act('market.setStatus', { id: m.id, status: 'skipped' }) }, 'Skip it'))) : null;

  const headsUp = m.flags.filter(V.isHeadsUp);
  const blockedBySignup = org && org.account.status === 'not_signed_up' && D.NOT_YET_APPLIED.includes(m.status);
  const detail = h('div', { class: 'card-body-inner' },
    headsUp.length ? h('div', { class: 'headsup' }, headsUp.map((f) => h('p', {}, '⚠️ ', f.text))) : null,
    blockedBySignup ? signupCallout(org, env) : null,
    controls(m, env, org),
    whenField(m, env),
    whereField(m),
    more('Application, fees & rules',
      applicationField(m), feesField(m),
      m.requirements.length ? field('Requirements', h('ul', { class: 'plain-list' }, m.requirements.map((r) => h('li', {}, r)))) : null,
      field('Vendor rules', m.vendorRules),
      field('Streetwear fit', fitTag(m.fit.rating), m.fit.note ? h('p', { class: 'small' }, m.fit.note) : null)),
    more('Organizer & links', organizerField(m, org, env), org && org.account.status === 'unknown' && !blockedBySignup && D.NOT_YET_APPLIED.includes(m.status) ? signupCallout(org, env) : null, otherLinks(m)),
    m.notes ? field('Notes', h('p', { class: 'notes' }, m.notes)) : null,
    resultsBlock(m),
    claudeNotes(m));

  card.append(button);
  if (quick) card.append(quick);
  card.append(h('div', { class: 'card-body', id: bodyId, role: 'region', 'aria-label': `${m.name} details` }, detail));
  return card;
}

/**
 * The same market on several dates, as one row ("Monsta House · Nov 14 & 21").
 * Open it to see each date as its own card.
 */
export function marketGroup(items, env, opts = {}) {
  const first = items[0];
  const gid = `grp:${first.organizerId}|${first.name}`;
  const org = env.orgMap.get(first.organizerId) || null;
  const wantOpen = env.open.has(gid) || items.some((m) => env.open.has(m.id));
  const heads = items.map((m) => V.headDate(m, env.today));
  const head = heads.find((x) => x && x.upcoming) || heads[0];
  const run = V.datesRun(items.map((m) => D.eventDays(m)[0].date));
  const steps = items.map((m) => V.nextStep(m, org, env.today));
  const sameStatus = items.every((m) => m.status === first.status);
  const sameStep = steps.every((s) => s.text === steps[0].text);
  const out = items.every((m) => V.statusGroup(m.status) === 'out');
  const bodyId = `body-${opts.scope || 'g'}-${gid.replace(/[^a-z0-9]/gi, '-')}`;

  const card = h('article', { class: `card group${wantOpen ? ' open' : ''}${out ? ' is-out' : ''}${head && head.urgent && !out ? ' is-urgent' : ''}`, dataset: { id: gid } });
  const button = h('button', { type: 'button', class: 'card-head', 'aria-expanded': String(wantOpen), 'aria-controls': bodyId, onClick: toggle },
    dateBlock(head),
    h('span', { class: 'card-main' },
      h('span', { class: 'card-title' }, first.name),
      h('span', { class: 'card-meta' }, [run, place(first)].filter(Boolean).join(' · ')),
      h('span', { class: 'card-status' },
        sameStatus ? sticker(first.status, first.id) : null,
        h('span', { class: `step${sameStep && steps[0].urgent ? ' urgent' : ''}` }, sameStep ? steps[0].text : `${items.length} dates, each on its own`))),
    h('span', { class: 'chev' }, icon('chevron', { size: 20 })));

  function toggle() {
    const open = !card.classList.contains('open');
    card.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
    if (open) env.open.add(gid); else env.open.delete(gid);
  }

  card.append(button, h('div', { class: 'card-body', id: bodyId },
    h('div', { class: 'card-body-inner group-inner' }, items.map((m) => marketCard(m, env, { nested: true, scope: 'in', quick: opts.quick })))));
  return card;
}

/** A single entry from V.groupSeries(): a card, or a group row. */
export const entryCard = (entry, env, opts = {}) => (entry.type === 'group' ? marketGroup(entry.items, env, opts) : marketCard(entry.m, env, opts));

/** A compact, non-expanding row (used for deadlines and on Organizers). */
export function miniRow(m, env, { label, date } = {}) {
  const head = date ? { date, upcoming: true, urgent: D.diffDays(env.today, date) <= 7 } : V.headDate(m, env.today);
  return h('button', { type: 'button', class: 'mini', onClick: () => env.go('markets', m.id) },
    dateBlock(head),
    h('span', { class: 'mini-main' },
      h('span', { class: 'mini-title' }, m.name),
      label ? h('span', { class: 'card-meta' }, `${label}${date ? ` ${D.fmtShort(date)} · ${D.relDays(date, env.today)}` : ''}`) : null),
    sticker(m.status, m.id));
}
