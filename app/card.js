// The expandable market card, used on Home, Markets, Calendar and Organizers.
import { h, icon, extLink } from './util.js';
import * as D from './dates.js';
import * as V from './derive.js';
import { sticker, accountTag, fitTag, flagChip } from './ui.js';

const MAX_CHIPS = 2;

function dateBlock(head) {
  if (!head) return h('span', { class: 'datebox datebox-tbd' }, h('small', {}, 'date'), h('b', {}, 'TBD'), h('small', {}, '?'));
  const { m, d } = D.ymd(head.date);
  return h('span', { class: `datebox ${head.urgent ? 'urgent' : ''} ${head.upcoming ? '' : 'over'}` },
    h('small', {}, D.MONTHS_SHORT[m - 1]), h('b', {}, String(d)), h('small', {}, D.DOW_SHORT[D.dow(head.date)]));
}

function kicker(m, head, today) {
  if (!head) return m.recurrence && m.kind === 'recurring' ? 'Book your own dates' : 'Date not set';
  if (!head.upcoming) return `Was ${D.fmtShort(head.date)}`;
  const label = head.recurring ? 'Weekly · next' : D.KEY_LABEL[head.type];
  return `${label} · ${D.relDays(head.date, today)}`;
}

/** "Sat, Oct 17 · 10am–5pm" / "Sat, Dec 5 + Sun, Dec 6" / "Every Saturday…" */
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

function organizerField(m, org, env) {
  if (!org) return m.organizerId ? field('Organizer', muted(`Unknown organizer (${m.organizerId})`)) : null;
  const status = org.account.status;
  const needsSignup = status === 'not_signed_up' || status === 'unknown';
  const contacts = typeof m.contact === 'string' && m.contact
    ? [h('li', {}, m.contact.includes('@') ? extLink(m.contact, `mailto:${m.contact}`, { cls: 'inline-link', showIcon: false }) : m.contact)]
    : org.contacts.map((c) => h('li', {},
      [c.name, c.role].filter(Boolean).join(' · ') || 'Contact', c.email ? [' ', extLink(c.email, `mailto:${c.email}`, { cls: 'inline-link', showIcon: false })] : null,
      c.instagram ? ` · ${c.instagram}` : null));
  return field('Organizer',
    h('div', { class: 'org-line' },
      h('button', { type: 'button', class: 'inline-link', onClick: () => env.go('organizers', org.id) }, org.name), ' ', accountTag(status)),
    org.account.note ? h('p', { class: 'small' }, org.account.note) : null,
    needsSignup ? h('div', { class: 'callout' },
      h('p', {}, status === 'not_signed_up'
        ? `⚠️ You're not signed up with ${org.name} yet. You'll need an account before applying.`
        : `⚠️ Not sure if you're in ${org.name}'s system. Tap one to set it:`),
      h('div', { class: 'row' },
        extLink('Sign up', org.account.signupUrl, { cls: 'btn btn-solid' }),
        h('button', { type: 'button', class: 'btn btn-line', onClick: () => env.act('organizer.setAccount', { id: org.id, status: 'in_system' }) }, "I'm signed up"),
        status === 'unknown' ? h('button', { type: 'button', class: 'btn btn-line', onClick: () => env.act('organizer.setAccount', { id: org.id, status: 'not_signed_up' }) }, 'Not signed up') : null)) : null,
    contacts.length ? h('ul', { class: 'plain-list' }, contacts) : null);
}

function linksField(m, org) {
  const l = m.links;
  const buttons = [
    extLink('Apply', l.apply, { cls: 'btn btn-solid' }),
    extLink('Event page', l.event),
    extLink('Vendor info', l.vendorInfo),
    org && !l.apply && org.account.dashboardUrl ? extLink(`${org.name} dashboard`, org.account.dashboardUrl) : null,
  ].filter(Boolean);
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

function historyField(m) {
  if (!m.history.length) return null;
  const items = [...m.history].reverse().slice(0, 12);
  return h('details', { class: 'history' }, h('summary', {}, `History (${m.history.length})`),
    h('ul', { class: 'plain-list' }, items.map((e) => h('li', {}, h('span', { class: 'muted' }, `${e.at ? D.fmtShort(e.at) : ''} · ${e.by || ''}: `), e.change))));
}

function sourceLine(m) {
  const bits = [];
  if (m.lastVerified) bits.push(`Last verified ${D.fmtShort(m.lastVerified)}`);
  if (m.source && m.source.type) bits.push(`from ${m.source.type}`);
  return bits.length ? h('p', { class: 'source-line' }, bits.join(' · ')) : null;
}

function controls(m, env) {
  const select = h('select', { class: 'status-select', 'aria-label': `Status of ${m.name}`, onChange: (e) => {
    if (!env.act('market.setStatus', { id: m.id, status: e.target.value })) e.target.value = m.status; // read-only: snap back
  } }, D.STATUSES.map((s) => h('option', { value: s, selected: s === m.status }, D.STATUS_LABEL[s])));
  const form = h('div', { class: 'form-slot' });
  const open = (kind) => {
    form.replaceChildren(kind === 'note' ? noteForm(m, env, () => form.replaceChildren()) : resultsForm(m, env, () => form.replaceChildren()));
    const first = form.querySelector('textarea, input');
    if (first) first.focus({ preventScroll: false });
  };
  return h('div', { class: 'controls' },
    h('label', { class: 'status-control' }, h('span', { class: 'field-label' }, 'Status'), select),
    h('div', { class: 'row' },
      D.NOT_YET_APPLIED.includes(m.status) ? h('button', { type: 'button', class: 'btn btn-solid', onClick: () => env.act('market.setStatus', { id: m.id, status: 'applied' }) }, 'Mark applied') : null,
      h('button', { type: 'button', class: 'btn btn-line', onClick: () => open('note') }, 'Add note'),
      h('button', { type: 'button', class: 'btn btn-line', onClick: () => open('results') }, V.hasResults(m.results) ? 'Edit results' : 'Add results')),
    form);
}

/**
 * Build one market card.
 * opts.quick: show "Applied / Not yet / Skip" buttons under the header (for markets whose status is unknown).
 * opts.openByDefault: start expanded (calendar day panel).
 */
export function marketCard(m, env, opts = {}) {
  const org = env.orgMap.get(m.organizerId) || null;
  const avail = D.marketAvailability(m, env.cal, env.today);
  const flags = V.cardFlags(m, org, avail, env.today);
  const head = V.headDate(m, env.today);
  const wantOpen = opts.openByDefault ? true : env.open.has(m.id);
  if (opts.openByDefault) env.open.add(m.id);
  const bodyId = `body-${opts.scope || 'c'}-${m.id}`;
  const past = D.isPast(m, env.today);

  const chips = flags.slice(0, MAX_CHIPS).map(flagChip);
  const more = flags.length > MAX_CHIPS ? h('span', { class: 'flag flag-more' }, `+${flags.length - MAX_CHIPS} more`) : null;

  const card = h('article', {
    class: `card${wantOpen ? ' open' : ''}${past ? ' is-past' : ''}${D.INACTIVE.includes(m.status) ? ' is-inactive' : ''}${head && head.urgent ? ' is-urgent' : ''}`,
    dataset: { id: m.id },
  });
  const button = h('button', { type: 'button', class: 'card-head', 'aria-expanded': String(wantOpen), 'aria-controls': bodyId, onClick: toggle },
    dateBlock(head),
    h('span', { class: 'card-main' },
      h('span', { class: 'card-kicker' }, kicker(m, head, env.today)),
      h('span', { class: 'card-title' }, m.name),
      h('span', { class: 'card-meta' }, [summarizeDates(m), place(m)].filter(Boolean).join(' · ')),
      h('span', { class: 'card-tags' }, sticker(m.status, m.id), chips, more)),
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

  const detail = h('div', { class: 'card-body-inner' },
    controls(m, env),
    whenField(m, env),
    whereField(m),
    applicationField(m),
    feesField(m),
    m.requirements.length ? field('Requirements', h('ul', { class: 'plain-list' }, m.requirements.map((r) => h('li', {}, r)))) : null,
    field('Vendor rules', m.vendorRules),
    field('Streetwear fit', fitTag(m.fit.rating), m.fit.note ? h('p', { class: 'small' }, m.fit.note) : null),
    organizerField(m, org, env),
    linksField(m, org),
    m.flags.length ? field('Flags', h('ul', { class: 'flag-list' }, m.flags.map((f) => h('li', {}, flagChip({ kind: f.type, text: f.text }))))) : null,
    m.notes ? field('Notes', h('p', { class: 'notes' }, m.notes)) : null,
    resultsBlock(m),
    historyField(m),
    sourceLine(m));

  card.append(button);
  if (quick) card.append(quick);
  card.append(h('div', { class: 'card-body', id: bodyId, role: 'region', 'aria-label': `${m.name} details` }, detail));
  return card;
}

/** A compact, non-expanding row (used for deadlines and on Organizers). */
export function miniRow(m, env, { label, date } = {}) {
  const head = date ? { date, upcoming: true, urgent: D.diffDays(env.today, date) <= 7 } : V.headDate(m, env.today);
  return h('button', { type: 'button', class: 'mini', onClick: () => env.go('markets', m.id) },
    dateBlock(head),
    h('span', { class: 'mini-main' },
      label ? h('span', { class: 'card-kicker' }, `${label}${date ? ` · ${D.relDays(date, env.today)}` : ''}`) : null,
      h('span', { class: 'mini-title' }, m.name)),
    sticker(m.status, m.id));
}

