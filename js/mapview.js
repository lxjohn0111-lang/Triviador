// SVG map renderer: ocean, neighbouring land, 15 territories, tokens (castles / values), selection + battle effects.
import { countryName } from './detect.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent = null) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
export const COLORS = [
  { id: 'sapphire', base: '#3d8bff', light: '#8fc0ff', dark: '#1d4fbf' },
  { id: 'ember', base: '#ff7a2f', light: '#ffb884', dark: '#c2470d' },
  { id: 'orchid', base: '#b167f5', light: '#d9b3ff', dark: '#7430bd' },
  { id: 'jade', base: '#1fc48a', light: '#86ecc4', dark: '#0d8259' },
  { id: 'rose', base: '#ff4f79', light: '#ffa3b9', dark: '#bd1f47' },
  { id: 'sun', base: '#f5c21b', light: '#ffe58a', dark: '#b3860a' },
  { id: 'lagoon', base: '#19c3d8', light: '#93ecf5', dark: '#0b8394' },
  { id: 'slate', base: '#8493ad', light: '#c3cde0', dark: '#4d5a73' },
];

export class MapView {
  constructor(svg) {
    this.svg = svg; this.map = null; this.scale = 1; this.onPick = null; this.selectable = new Set(); this.state = [];
    this.pads = { top: 96, bottom: 76, left: 12, right: 12 };
    this._resize = () => this.fit();
    window.addEventListener('resize', this._resize);
    if (window.ResizeObserver) new ResizeObserver(this._resize).observe(svg);
  }

  setMap(map, lang) {
    this.map = map; this.lang = lang; const svg = this.svg; svg.innerHTML = '';
    const defs = el('defs', {}, svg);
    COLORS.forEach((c, i) => {
      const g = el('linearGradient', { id: 'own' + i, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      el('stop', { offset: 0, 'stop-color': c.light }, g); el('stop', { offset: 0.45, 'stop-color': c.base }, g); el('stop', { offset: 1, 'stop-color': c.dark }, g);
    });
    for (let i = 0; i < 3; i++) { const g = el('linearGradient', { id: 'free' + i, x1: 0, y1: 0, x2: 0, y2: 1 }, defs); el('stop', { offset: 0, class: `free-a f${i}` }, g); el('stop', { offset: 1, class: `free-b f${i}` }, g); }
    const og = el('radialGradient', { id: 'ocean', cx: '50%', cy: '42%', r: '75%' }, defs); el('stop', { offset: 0, class: 'ocean-a' }, og); el('stop', { offset: 1, class: 'ocean-b' }, og);
    const wp = el('pattern', { id: 'waves', width: 120, height: 60, patternUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: 'M0 20q15-10 30 0t30 0 30 0 30 0M-30 50q15-10 30 0t30 0 30 0 30 0 30 0', class: 'wave-line' }, wp);
    el('animateTransform', { attributeName: 'patternTransform', type: 'translate', from: '0 0', to: '120 0', dur: '14s', repeatCount: 'indefinite' }, wp);
    map.regions.forEach((r, i) => { const cp = el('clipPath', { id: 'clip' + i }, defs); el('path', { d: r.d, 'clip-rule': 'evenodd' }, cp); });
    const mk = el('marker', { id: 'arrowhead', viewBox: '0 0 10 10', refX: 6, refY: 5, markerWidth: 4.2, markerHeight: 4.2, orient: 'auto-start-reverse' }, defs); el('path', { d: 'M0 0L10 5L0 10z', class: 'arrow-head' }, mk);

    const B = 20000;
    el('rect', { x: -B, y: -B, width: 2 * B, height: 2 * B, fill: 'url(#ocean)' }, svg);
    el('rect', { x: -B, y: -B, width: 2 * B, height: 2 * B, fill: 'url(#waves)', class: 'waves' }, svg);
    el('path', { d: map.bg, class: 'bg-land-shadow', transform: 'translate(0 10)' }, svg);
    el('path', { d: map.bg, class: 'bg-land' }, svg);
    this.gNb = el('g', { class: 'nb-labels' }, svg);
    for (const [cc, x, y, sz] of map.nb) { const t = el('text', { x, y, 'data-sz': sz, class: 'nb-label' }, this.gNb); t.textContent = countryName(cc, lang, cc).toUpperCase(); }
    const all = map.regions.map((r) => r.d).join('');
    el('path', { d: all, class: 'land-depth', transform: 'translate(0 16)' }, svg);
    el('path', { d: all, class: 'land-glow' }, svg);
    this.gRegions = el('g', { class: 'regions' }, svg);
    this.gInner = el('g', { class: 'inner' }, svg);
    this.gSea = el('g', { class: 'sea-links' }, svg);
    this.gLabels = el('g', { class: 'labels' }, svg);
    this.gTokens = el('g', { class: 'tokens' }, svg);
    this.gFx = el('g', { class: 'fx' }, svg);
    for (const s of map.sea) el('line', { x1: s[2], y1: s[3], x2: s[4], y2: s[5], class: 'sea-link' }, this.gSea);

    this.paths = []; this.inner = []; this.tokens = []; this.labels = [];
    this.state = map.regions.map(() => ({ owner: -1, color: -1, value: 0, capital: false, towers: 0 }));
    map.regions.forEach((r, i) => {
      const p = el('path', { d: r.d, class: 'region free', 'fill-rule': 'evenodd', fill: `url(#free${i % 3})`, 'data-i': i }, this.gRegions);
      p.addEventListener('click', () => this._click(i));
      p.addEventListener('pointerenter', () => this._hover(i, true)); p.addEventListener('pointerleave', () => this._hover(i, false));
      this.paths.push(p);
      this.inner.push(el('path', { d: r.d, class: 'region-inner', 'clip-path': `url(#clip${i})`, 'fill-rule': 'evenodd' }, this.gInner));
      const lb = el('text', { class: 'region-label', x: r.c[0], y: r.c[1] }, this.gLabels); lb.textContent = r.n[lang] || r.n._; this.labels.push(lb);
      const tk = el('g', { class: 'token', 'data-i': i }, this.gTokens); tk.addEventListener('click', () => this._click(i)); this.tokens.push(tk);
    });
    this.adj = map.regions.map(() => []); for (const [a, b] of map.adj) { this.adj[a].push(b); this.adj[b].push(a); }
    this.fit();
  }

  name(i) { const n = this.map.regions[i].n; return n[this.lang] || n._; }

  fit() {
    if (!this.map) return; const r = this.svg.getBoundingClientRect(); if (!r.width || !r.height) return;
    const { w, h } = this.map, P = this.pads; const small = r.width < 640 || r.height < 480;
    const top = small ? P.top * 0.78 : P.top, bottom = small ? P.bottom * 0.8 : P.bottom;
    const uw = Math.max(50, r.width - P.left - P.right), uh = Math.max(50, r.height - top - bottom);
    const s = Math.min(uw / (w * 1.06), uh / (h * 1.08)); this.scale = s;
    const vw = r.width / s, vh = r.height / s;
    const x = -(P.left / s) - (uw / s - w) / 2, y = -(top / s) - (uh / s - h) / 2;
    this.svg.setAttribute('viewBox', `${x} ${y} ${vw} ${vh}`);
    this.svg.style.setProperty('--u', 1 / s);
    this.unit = 1 / s;
    for (const t of this.gNb.children) { const px = Math.max(9, Math.min(22, (+t.dataset.sz * s) / 9)); t.setAttribute('font-size', px / s); t.setAttribute('letter-spacing', (px / s) * 0.28); }
    this.layoutTokens();
  }

  layoutTokens() {
    const s = this.scale; if (!this.map) return;
    this.map.regions.forEach((r, i) => {
      const st = this.state[i], rpx = r.r * s; // inscribed radius in px
      const base = st.capital ? 30 : 17; const size = Math.max(st.capital ? 17 : 10, Math.min(base, rpx * (st.capital ? 1.05 : 0.8)));
      const tk = this.tokens[i]; tk.setAttribute('transform', `translate(${r.c[0]} ${r.c[1]}) scale(${size / s / 20})`); tk.dataset.size = size;
      const lb = this.labels[i]; const fs = Math.max(9.5, Math.min(13.5, rpx * 0.3)); const name = lb.textContent;
      const fits = rpx > 26 && name.length * fs * 0.56 < rpx * 3.4;
      lb.style.display = fits ? '' : 'none'; lb.setAttribute('font-size', fs / s);
      const hasToken = st.owner >= 0; lb.setAttribute('y', r.c[1] + (hasToken ? ((st.capital ? size * 1.34 : size * 0.86) + fs * 0.95) / s : fs * 0.35 / s));
      lb.setAttribute('stroke-width', 3 / s);
    });
  }

  _tokenMarkup(st) {
    if (st.owner < 0) return '';
    const c = COLORS[st.color];
    if (st.capital) {
      const tw = (x, alive) => `<g class="tower ${alive ? '' : 'down'}" transform="translate(${x} 0)"><path d="M-5 9V-6h-1.6v-5h2.4v2.4h2V-11h2.4v2.4h2V-11h2.4v5H5V9z" fill="${alive ? '#f4ead2' : '#6b6f7a'}" stroke="#3a2c1c" stroke-width="1.3" stroke-linejoin="round"/>${alive ? `<path d="M0-11v-9" stroke="#3a2c1c" stroke-width="1.3"/><path d="M0.4-20l7 2.6-7 2.6z" fill="${c.base}" stroke="#3a2c1c" stroke-width="0.9" stroke-linejoin="round"/><rect x="-1.5" y="-2" width="3" height="5" rx="1.5" fill="#3a2c1c"/>` : '<path d="M-5-3l3 2 2-3 3 3 2-2" stroke="#3a2c1c" stroke-width="1.2" fill="none"/>'}</g>`;
      return `<ellipse cx="0" cy="11" rx="22" ry="6.5" fill="rgba(0,0,0,.32)"/><circle r="21" cy="-1" fill="${c.dark}" opacity=".0"/>
        ${tw(-12, st.towers >= 3)}${tw(12, st.towers >= 2)}
        <g transform="translate(0 2) scale(1.18)">${tw(0, st.towers >= 1).replace('class="tower', 'class="tower mid')}</g>
        <path d="M-18 12h36v-4h-36z" fill="#d9c9a3" stroke="#3a2c1c" stroke-width="1.3" stroke-linejoin="round"/>
        <g class="cap-val"><rect x="-15" y="13.5" width="30" height="11" rx="5.5" fill="#1b2238" stroke="${c.light}" stroke-width="1.2"/><text y="22" class="tok-num small">${st.value}</text></g>`;
    }
    return `<ellipse cx="0" cy="13" rx="15" ry="4.5" fill="rgba(0,0,0,.3)"/><circle r="15" fill="${c.dark}" cy="2.2"/><circle r="15" fill="#fff8e6" stroke="${c.dark}" stroke-width="2.2"/><circle r="11.2" fill="none" stroke="${c.base}" stroke-width="1.6" opacity=".7"/><text y="4.6" class="tok-num" fill="${c.dark}">${st.value}</text>`;
  }

  setRegion(i, patch, fx = true) {
    const st = this.state[i], prevOwner = st.owner; Object.assign(st, patch);
    const p = this.paths[i];
    if (st.owner >= 0) { p.setAttribute('fill', `url(#own${st.color})`); p.classList.remove('free'); } else { p.setAttribute('fill', `url(#free${i % 3})`); p.classList.add('free'); }
    this.tokens[i].innerHTML = this._tokenMarkup(st);
    this.layoutTokens();
    if (fx && st.owner !== prevOwner && st.owner >= 0) this.burst(i, COLORS[st.color].light);
  }

  burst(i, color = '#fff') {
    const r = this.map.regions[i], p = this.paths[i], u = this.unit;
    p.classList.remove('pop'); void p.getBoundingClientRect(); p.classList.add('pop');
    const fl = el('path', { d: r.d, class: 'flash', 'fill-rule': 'evenodd' }, this.gFx); setTimeout(() => fl.remove(), 700);
    for (let k = 0; k < 2; k++) { const ring = el('circle', { cx: r.c[0], cy: r.c[1], r: 8 * u, class: 'ring', stroke: color, 'stroke-width': 4 * u, style: `--to:${(60 + k * 34)}; animation-delay:${k * 0.12}s` }, this.gFx); ring.animate([{ r: 8 * u, opacity: 0.95 }, { r: (64 + k * 36) * u, opacity: 0 }], { duration: 750, delay: k * 120, easing: 'ease-out', fill: 'forwards' }); setTimeout(() => ring.remove(), 1000); }
    for (let k = 0; k < 10; k++) { const a = (Math.PI * 2 * k) / 10 + Math.random() * 0.4, d = (40 + Math.random() * 40) * u; const s = el('circle', { cx: r.c[0], cy: r.c[1], r: (2.5 + Math.random() * 2.5) * u, fill: k % 2 ? color : '#fff6c9' }, this.gFx); s.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d - 10 * u}px)`, opacity: 0 }], { duration: 650 + Math.random() * 250, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }); setTimeout(() => s.remove(), 950); }
  }
  shake(i) { const t = this.tokens[i]; t.classList.remove('shake'); void t.getBoundingClientRect(); t.classList.add('shake'); }

  setSelectable(list, cb, mode = 'pick') {
    this.clearSelectable(); this.onPick = cb; this.selectable = new Set(list); this.svg.dataset.mode = mode;
    for (const i of list) { this.paths[i].classList.add('sel'); this.inner[i].classList.add('sel'); this.tokens[i].classList.add('sel'); }
    this.svg.classList.add('picking');
  }
  clearSelectable() { for (const i of this.selectable) { this.paths[i].classList.remove('sel'); this.inner[i].classList.remove('sel'); this.tokens[i].classList.remove('sel'); } this.selectable = new Set(); this.onPick = null; this.svg.classList.remove('picking'); }
  _click(i) { if (this.selectable.has(i) && this.onPick) { const cb = this.onPick; this.clearSelectable(); cb(i); } else if (this.onInfo) this.onInfo(i); }
  _hover(i, on) { if (this.onHover) this.onHover(on ? i : -1); }

  mark(i, cls, on = true) { this.paths[i].classList.toggle(cls, on); this.inner[i].classList.toggle(cls, on); }
  clearMarks(cls) { this.paths.forEach((p, i) => { p.classList.remove(cls); this.inner[i].classList.remove(cls); }); }

  // curved attack arrow from region a to region b; returns a remover
  arrow(a, b, color) {
    const A = this.map.regions[a].c, Bc = this.map.regions[b].c, u = this.unit;
    const dx = Bc[0] - A[0], dy = Bc[1] - A[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, bend = Math.min(len * 0.22, 90 * u);
    const mx = (A[0] + Bc[0]) / 2 + nx * bend, my = (A[1] + Bc[1]) / 2 + ny * bend - 10 * u;
    const ex = Bc[0] - (dx / len) * 20 * u, ey = Bc[1] - (dy / len) * 20 * u;
    const g = el('g', { class: 'attack-arrow' }, this.gFx);
    const d = `M${A[0]} ${A[1]}Q${mx} ${my} ${ex} ${ey}`;
    el('path', { d, class: 'arrow-shadow', 'stroke-width': 11 * u, transform: `translate(0 ${4 * u})` }, g);
    const p = el('path', { d, class: 'arrow-line', stroke: color, 'stroke-width': 8 * u, 'marker-end': 'url(#arrowhead)' }, g);
    const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; p.style.color = color;
    p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 520, easing: 'cubic-bezier(.3,.8,.3,1)', fill: 'forwards' });
    return () => g.remove();
  }
  float(i, text, color = '#fff') {
    const r = this.map.regions[i], u = this.unit; const t = el('text', { x: r.c[0], y: r.c[1] - 26 * u, class: 'float-text', 'font-size': 22 * u, fill: color, 'stroke-width': 4 * u }, this.gFx); t.textContent = text;
    t.animate([{ transform: 'translate(0,0)', opacity: 0 }, { transform: `translate(0,${-12 * u}px)`, opacity: 1, offset: 0.2 }, { transform: `translate(0,${-46 * u}px)`, opacity: 0 }], { duration: 1500, easing: 'ease-out', fill: 'forwards' }); setTimeout(() => t.remove(), 1600);
  }
}
