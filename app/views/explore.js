// Explore: finds from the scheduled web search, kept apart from the hub until Garrett moves them in.
import { h, extLink } from '../util.js';
import * as D from '../dates.js';
import * as V from '../derive.js';
import { summarizeDates } from '../card.js';
import { pageTitle, empty, fitTag } from '../ui.js';

function findCard(item, env) {
  const place = [item.location.venue, item.location.neighborhood || item.location.borough].filter(Boolean).join(', ');
  const fees = [item.fees.booth != null ? `Booth ${typeof item.fees.booth === 'number' ? V.fmtMoney(item.fees.booth) : item.fees.booth}` : null,
    item.fees.application != null ? `Application ${typeof item.fees.application === 'number' ? V.fmtMoney(item.fees.application) : item.fees.application}` : null].filter(Boolean);
  const upcoming = item.dates.find((d) => D.diffDays(env.today, d.date) >= 0);
  const soon = upcoming ? D.relDays(upcoming.date, env.today) : null;
  return h('article', { class: `find${item.worthALook ? ' starred' : ''}`, dataset: { id: item.id } },
    item.worthALook ? h('p', { class: 'find-flag' }, h('span', { 'aria-hidden': 'true' }, '★ '), 'Worth a look') : null,
    h('h3', { class: 'card-title' }, item.name),
    h('p', { class: 'card-meta' }, [summarizeDates(item), soon ? `(${soon})` : null, place].filter(Boolean).join(' · ')),
    item.worthReason ? h('p', { class: 'find-why' }, item.worthReason) : null,
    h('div', { class: 'card-tags' },
      h('span', { class: 'tag verify' }, 'found by search, verify'),
      item.fit.rating !== 'unknown' ? fitTag(item.fit.rating) : null),
    fees.length ? h('p', { class: 'small' }, fees.join(' · ')) : null,
    item.vendorRules ? h('p', { class: 'small' }, item.vendorRules) : null,
    item.notes ? h('p', { class: 'small' }, item.notes) : null,
    item.application.closes ? h('p', { class: 'small' }, `Applications close ${D.fmtDay(item.application.closes)}`) : null,
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn btn-solid', onClick: () => env.act('explore.addToHub', { item: JSON.parse(JSON.stringify(item)) }) }, 'Add to hub'),
      h('button', { type: 'button', class: 'btn btn-line', onClick: () => env.act('explore.dismiss', { id: item.id }) }, 'Dismiss'),
      extLink('Event page', item.links.event || item.links.apply || item.links.vendorInfo)));
}

export function renderExplore(env) {
  const finds = V.pendingFinds(env.data.explore);
  const starred = finds.filter((f) => f.worthALook);
  const rest = finds.filter((f) => !f.worthALook);
  const root = h('div', { class: 'view view-explore' });
  root.append(pageTitle('Explore', 'Markets the web search turned up. They stay here until you add them to the hub or dismiss them.'));
  if (!finds.length) {
    root.append(empty('Nothing found yet.', 'The search runs every few days and only adds markets that aren’t already in your hub.'));
    return root;
  }
  if (starred.length) root.append(h('div', { class: 'cards' }, starred.map((f) => findCard(f, env))));
  if (rest.length) {
    root.append(h('h2', { class: 'subhead' }, starred.length ? 'Also found' : 'Found'), h('div', { class: 'cards' }, rest.map((f) => findCard(f, env))));
  }
  return root;
}
