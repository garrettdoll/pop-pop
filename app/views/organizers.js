// Organizers: which systems Garrett is already in, and how each one works.
import { h, extLink } from '../util.js';
import * as D from '../dates.js';
import * as V from '../derive.js';
import { miniRow } from '../card.js';
import { pageTitle, accountTag, empty } from '../ui.js';

const ORDER = { not_signed_up: 0, unknown: 1, in_system: 2, direct: 3 };
const CHOICES = [['in_system', 'In system'], ['not_signed_up', 'Not signed up'], ['unknown', 'Unknown']];

function organizerCard(o, env) {
  const mine = env.data.markets.filter((m) => m.organizerId === o.id);
  const live = mine.filter((m) => !D.isPast(m, env.today)).sort((a, b) => V.compareMarkets(a, b, env.today, env.cal));
  const past = mine.length - live.length;
  const status = o.account.status;
  const needsSignup = status === 'not_signed_up' || status === 'unknown';

  const links = [
    extLink(status === 'in_system' ? 'Dashboard' : null, o.account.dashboardUrl, { cls: 'btn btn-solid' }),
    needsSignup ? extLink('Sign up', o.account.signupUrl, { cls: 'btn btn-solid' }) : extLink('Sign-up page', o.account.signupUrl),
    extLink('Website', o.website),
    ...o.links.map((l) => extLink(l.label || 'Link', l.url)),
  ].filter(Boolean);

  return h('article', { class: `org-card${needsSignup ? ' needs-signup' : ''}`, id: `org-${o.id}`, dataset: { id: o.id } },
    h('header', { class: 'org-head' }, h('h3', { class: 'card-title' }, o.name), accountTag(status)),
    needsSignup ? h('p', { class: 'org-warn' }, status === 'not_signed_up' ? `⚠️ You're not signed up here yet. You'll need an account before you can apply.` : `⚠️ Not sure if you have an account here.`) : null,
    o.account.note ? h('p', { class: 'small' }, o.account.note) : null,
    o.howItWorks ? h('div', { class: 'field' }, h('div', { class: 'field-label' }, 'How it works'), h('p', { class: 'field-value' }, o.howItWorks)) : null,
    links.length ? h('div', { class: 'row' }, links) : null,
    o.contacts.length ? h('div', { class: 'field' }, h('div', { class: 'field-label' }, 'Contacts'),
      h('ul', { class: 'plain-list field-value' }, o.contacts.map((c) => h('li', {},
        [c.name, c.role].filter(Boolean).join(' · ') || 'Contact', ' ',
        c.email ? extLink(c.email, `mailto:${c.email}`, { cls: 'inline-link', showIcon: false }) : null,
        c.instagram ? ` · ${c.instagram}` : null)))) : null,
    o.notes ? h('p', { class: 'small' }, o.notes) : null,
    h('div', { class: 'field' }, h('div', { class: 'field-label' }, 'Account status'),
      h('div', { class: 'segmented small', role: 'group', 'aria-label': `Account status with ${o.name}` },
        status === 'direct' ? h('button', { type: 'button', class: 'active', 'aria-pressed': 'true' }, 'Direct contact') : null,
        CHOICES.map(([value, label]) => h('button', { type: 'button', class: status === value ? 'active' : '', 'aria-pressed': String(status === value), onClick: () => { if (status !== value) env.act('organizer.setAccount', { id: o.id, status: value }); } }, label)))),
    h('div', { class: 'field' }, h('div', { class: 'field-label' }, `Markets they run (${mine.length})`),
      live.length ? h('div', { class: 'minis tight' }, live.map((m) => miniRow(m, env))) : h('p', { class: 'muted' }, mine.length ? 'Nothing coming up.' : 'None in the hub yet.'),
      past ? h('p', { class: 'small muted' }, `${past} past`) : null));
}

export function renderOrganizers(env) {
  const orgs = [...env.data.organizers].sort((a, b) => (ORDER[a.account.status] ?? 9) - (ORDER[b.account.status] ?? 9) || a.name.localeCompare(b.name));
  const inSystem = orgs.filter((o) => o.account.status === 'in_system').length;
  const root = h('div', { class: 'view view-organizers' });
  root.append(pageTitle('Organizers', orgs.length ? `You're in ${inSystem} of ${orgs.length} systems. The ones that need you come first.` : null));
  if (!orgs.length) root.append(empty('No organizers yet.', 'They appear as markets get added.'));
  else root.append(h('div', { class: 'cards org-list' }, orgs.map((o) => organizerCard(o, env))));
  return root;
}
