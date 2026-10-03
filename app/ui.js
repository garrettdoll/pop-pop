// Small shared components: stickers, flag chips, section headers, empty states, toasts.
import { h, hashInt } from './util.js';
import { STATUS_LABEL } from './dates.js';
import { ACCOUNT_LABEL, FIT_LABEL } from './derive.js';

const STATUS_GLYPH = {
  unknown: '?', researching: '…', 'to-apply': '!', applied: '✓', waitlisted: '~', accepted: '★',
  paid: '$', declined: '✕', lapsed: '✕', completed: '✓', skipped: '–',
};

/** The sticker-style status tag. The label is always text (never color alone); the tilt is stable per card. */
export function sticker(status, seed = '') {
  const tilt = ((hashInt(`${status}${seed}`) % 5) - 2) * 0.8;
  return h('span', { class: `sticker st-${status}`, style: { '--tilt': `${tilt}deg` } },
    h('span', { class: 'st-glyph', 'aria-hidden': 'true' }, STATUS_GLYPH[status] || '?'),
    STATUS_LABEL[status] || status);
}

export function accountTag(status) {
  return h('span', { class: `tag acct acct-${status}` }, ACCOUNT_LABEL[status] || status);
}

export function fitTag(rating) {
  return h('span', { class: `tag fit fit-${rating}` }, FIT_LABEL[rating] || FIT_LABEL.unknown);
}

/** ⚠️ chip. `likely` flags (probably free) get a check instead, since they aren't a problem. */
export function flagChip(f) {
  const glyph = f.kind === 'likely' ? '✓' : '⚠️';
  return h('span', { class: `flag flag-${f.kind}` },
    h('span', { class: 'flag-glyph', 'aria-label': f.kind === 'likely' ? 'Likely' : 'Warning', role: 'img' }, glyph),
    h('span', { class: 'flag-text' }, f.text));
}

export function sectionHead(title, { count, sub, action } = {}) {
  return h('header', { class: 'section-head' },
    h('h2', {}, title, count != null ? h('span', { class: 'count' }, String(count)) : null),
    action || null,
    sub ? h('p', { class: 'section-sub' }, sub) : null);
}

export function empty(title, text) {
  return h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, title), text ? h('p', { class: 'empty-text' }, text) : null);
}

export function pageTitle(text, sub) {
  return h('div', { class: 'page-title' }, h('h1', {}, h('span', { class: 'hl' }, text)), sub ? h('p', {}, sub) : null);
}

// ---------- toast ----------

let toastTimer = null;
export function toast(message, { action, ms = 3200, kind } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  clearTimeout(toastTimer);
  el.className = `toast show ${kind ? `toast-${kind}` : ''}`;
  el.replaceChildren(h('span', {}, message));
  if (action) {
    el.append(h('button', { type: 'button', class: 'toast-action', onClick: () => { el.classList.remove('show'); action.onClick(); } }, action.label));
  }
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
