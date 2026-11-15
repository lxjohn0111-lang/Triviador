// Dev helper: renders a contact sheet of generated maps. node preview.mjs out.png [lang] CC...
import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const [out, lang, ...ccs] = process.argv.slice(2);
const list = ccs.length ? ccs : JSON.parse(fs.readFileSync('../data/maps/index.json')).map((x) => x.c);
const cols = ['#e6194b','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4','#46f0f0','#f032e6','#bcf60c','#fabebe','#008080','#e6beff','#9a6324','#aaffc3','#808000'];
let html = '<body style="margin:0;background:#123;display:flex;flex-wrap:wrap;font-family:sans-serif">';
for (const cc of list) {
  const m = JSON.parse(fs.readFileSync(`../data/maps/${cc}.json`)); const pad = 150;
  html += `<div style="width:480px;height:400px;position:relative"><svg viewBox="${-pad} ${-pad} ${m.w + 2 * pad} ${m.h + 2 * pad}" width="480" height="400" style="background:#2a6f97">
  <path d="${m.bg}" fill="#b7b7a4" stroke="#888" stroke-width="2"/>
  ${m.regions.map((r, i) => `<path d="${r.d}" fill="${cols[i]}" stroke="#222" stroke-width="3" fill-rule="evenodd"/>`).join('')}
  ${m.adj.map(([a, b]) => `<line x1="${m.regions[a].c[0]}" y1="${m.regions[a].c[1]}" x2="${m.regions[b].c[0]}" y2="${m.regions[b].c[1]}" stroke="#0006" stroke-width="3"/>`).join('')}
  ${m.sea.map((s) => `<line x1="${s[2]}" y1="${s[3]}" x2="${s[4]}" y2="${s[5]}" stroke="#fff" stroke-width="6" stroke-dasharray="10 8"/>`).join('')}
  ${m.regions.map((r) => `<text x="${r.c[0]}" y="${r.c[1]}" font-size="${Math.max(m.w, m.h) / 42}" text-anchor="middle" fill="#000" stroke="#fff" stroke-width="5" paint-order="stroke">${r.n[lang] || r.n._}</text>`).join('')}
  </svg><b style="position:absolute;left:4px;top:2px;color:#fff">${cc} ${m.name._}</b></div>`;
}
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 400 * Math.ceil(list.length / 4) } });
await p.setContent(html); await p.screenshot({ path: out, fullPage: true }); await b.close();
