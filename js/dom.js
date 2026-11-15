// Tiny DOM helpers + emblem art shared by all UI modules.
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k]; if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'style') e.style.cssText = v; else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) { if (c == null || c === false) continue; e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); }
  return e;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const fmt = (n) => { try { return Number(n).toLocaleString(document.documentElement.lang || undefined); } catch (e) { return String(n); } };
export const EMBLEMS = [
  'M3 18h18l1.5-10-5.5 4L12 5 7 12 1.5 8z', // crown
  'M6 21h12v-2l-1.5-1.5V10H18V4h-3v2h-2V4h-2v2H9V4H6v6h1.5v7.5L6 19z', // rook
  'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z', // shield
  'M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21.1l1.5-7L2 9.3l7-.8z', // star
  'M13 2L4 14h6l-1 8 9-12h-6z', // bolt
  'M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 2 3 4 1-2 1-5 1-9z', // flame
  'M6 3h12l4 6-10 12L2 9z', // gem
  'M12 21C5 15 2 12 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 4-3 7-10 13z', // heart
  'M20 3C10 3 4 8 4 15c0 2 .5 3.5 1 5 2-6 6-10 11-12-4 3-7 7-8.5 13 8 0 13-6 12.5-18z', // leaf
  'M20 14A9 9 0 1 1 10 3a7 7 0 0 0 10 11z', // moon
  'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z', // compass star
  'M19 2h3v3L11.5 15.5l2 2L12 19l-2.5-2.5-4 4L4 19l4-4L5.5 12.5 7 11l2 2z', // sword
];
export function avatar(emblem, color, cls = '') {
  const d = EMBLEMS[emblem % EMBLEMS.length];
  return h('span', { class: 'avatar ' + cls, style: `--c:${color.base};--cl:${color.light};--cd:${color.dark}`, html: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>` });
}
export const ICON = {
  coin: '<svg viewBox="0 0 24 24" class="ic ic-coin"><circle cx="12" cy="12" r="10" fill="#ffd34d" stroke="#b77a00" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="none" stroke="#b77a00" stroke-width="1.5" opacity=".6"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" class="ic"><path d="M7 3h10v2h4v3a5 5 0 0 1-4.4 5A5.5 5.5 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A5.5 5.5 0 0 1 7.4 13 5 5 0 0 1 3 8V5h4zm-2 4v1a3 3 0 0 0 2 2.8V7zm14 0h-2v3.8A3 3 0 0 0 19 8z" fill="#ffd34d" stroke="#8a5a00" stroke-width="1"/></svg>',
  sound: '<svg viewBox="0 0 24 24" class="ic"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 24 24" class="ic"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  music: '<svg viewBox="0 0 24 24" class="ic"><path d="M9 18V5l11-2v13" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="3" fill="currentColor"/><circle cx="17.5" cy="16" r="3" fill="currentColor"/></svg>',
  close: '<svg viewBox="0 0 24 24" class="ic"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  globe: '<svg viewBox="0 0 24 24" class="ic"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  swords: '<svg viewBox="0 0 24 24" class="ic"><path d="M3 3h4l9 9-3 3-9-9zM21 3h-4l-3.5 3.5 3 3L21 6zM5 16l3 3-3 2-2-2zM19 16l-3 3 3 2 2-2zM9.5 13.5l-3 3M14.5 13.5l3 3" stroke="currentColor" stroke-width="1.6" fill="currentColor" fill-opacity=".25" stroke-linejoin="round"/></svg>',
  shield: '<svg viewBox="0 0 24 24" class="ic"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" class="ic"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" class="ic"><path d="M20 7v10H9l-6-5 6-5zM16 10l-4 4m0-4l4 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24" class="ic"><path d="M9 4H5v16h4M15 8l4 4-4 4M19 12H9" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24" class="ic"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.5 3.5l2-1.5-2-3.4-2.4.9a7 7 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.4-.9-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-.9a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4.9 2-3.4-2-1.5a7 7 0 0 0 0-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  star: '<svg viewBox="0 0 24 24" class="ic"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21.1l1.5-7L2 9.3l7-.8z" fill="#ffd34d" stroke="#b77a00" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  half: '<svg viewBox="0 0 24 24" class="ic"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg>',
  scout: '<svg viewBox="0 0 24 24" class="ic"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" class="ic"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>',
  gift: '<svg viewBox="0 0 24 24" class="ic"><path d="M3 9h18v4H3zM5 13h14v8H5zM12 9v12M12 9c-2-4-7-4-6-1 .6 1.6 3 1 6 1zm0 0c2-4 7-4 6-1-.6 1.6-3 1-6 1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  video: '<svg viewBox="0 0 24 24" class="ic"><rect x="2" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 10l6-3v10l-6-3z" fill="currentColor"/></svg>',
  book: '<svg viewBox="0 0 24 24" class="ic"><path d="M4 5c3-1.5 5-1.5 8 0 3-1.5 5-1.5 8 0v14c-3-1.5-5-1.5-8 0-3-1.5-5-1.5-8 0zM12 5v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  cart: '<svg viewBox="0 0 24 24" class="ic"><path d="M2 4h3l2.5 11h10L20 7H6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="9" cy="19" r="1.8" fill="currentColor"/><circle cx="17" cy="19" r="1.8" fill="currentColor"/></svg>',
  list: '<svg viewBox="0 0 24 24" class="ic"><path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  user: '<svg viewBox="0 0 24 24" class="ic"><circle cx="12" cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 21c1-5 4.5-7 8.5-7s7.5 2 8.5 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  clock: '<svg viewBox="0 0 24 24" class="ic"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
};
