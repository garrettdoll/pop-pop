// Tiny DOM helper, icons and URL safety. No framework.

/** h('div', { class: 'x', onClick: fn }, 'text', childNode, [more, children]) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') {
        for (const [prop, val] of Object.entries(v)) {
          if (prop.startsWith('--')) el.style.setProperty(prop, val);
          else el.style[prop] = val;
        }
      }
      else if (k.length > 2 && k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

// ---------- icons (24px grid, 2px strokes) ----------

const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5.5h4V20"/>',
  markets: '<rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17.5h2"/>',
  explore: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  organizers: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5c0 1.7 1.3 3 2.7 3S9.3 11.2 9.3 9.5c0 1.7 1.3 3 2.7 3s2.7-1.3 2.7-3c0 1.7 1.3 3 2.7 3S20 11.2 20 9.5"/><path d="M5.5 12.5V20h13v-7.5"/><path d="M10 20v-4h4v4"/>',
  foryou: '<path d="M4 5h16v11H9.5L5 20v-4H4z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  out: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  warn: '<path d="M12 3.5 22 20H2z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="m3.5 7 8.5 6.5L20.5 7"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  thumbUp: '<path d="M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1 2.5 2.5V9H19a1.5 1.5 0 0 1 1.5 1.8l-1.3 7A2 2 0 0 1 17.2 19.5H7"/>',
  thumbDown: '<path d="M7 13V4H4v9zM7 13l4 7c1.5 0 2.5-1 2.5-2.5V15H19a1.5 1.5 0 0 0 1.5-1.8l-1.3-7A2 2 0 0 0 17.2 4.5H7"/>',
  star: '<path d="m12 3.5 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.9l6.1-.8z"/>',
};

export function icon(name, { size = 22, label } = {}) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${ICONS[name] || ''}</svg>`;
  return span;
}

// ---------- links ----------

/** Only http(s) and mailto links are ever rendered as links (the data files are editable by anyone with the token). */
export function safeUrl(u) {
  if (!u || typeof u !== 'string') return null;
  let s = u.trim();
  if (!s) return null;
  if (/^mailto:/i.test(s)) return s;
  if (!/^https?:\/\//i.test(s)) {
    if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(s)) s = `https://${s}`; // bare "fadmarket.co/faq"
    else return null;
  }
  try { return new URL(s).href; } catch { return null; }
}

export function extLink(label, url, { cls = 'btn btn-line', showIcon = true } = {}) {
  const href = safeUrl(url);
  if (!href) return null;
  const mail = href.startsWith('mailto:');
  return h('a', { class: cls, href, ...(mail ? {} : { target: '_blank', rel: 'noopener noreferrer' }) }, label, showIcon && !mail ? icon('out', { size: 16 }) : null);
}

export const pluralize = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Stable small number from a string (for the slightly different tilt on each sticker). */
export function hashInt(s) {
  let x = 0;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(x);
}
