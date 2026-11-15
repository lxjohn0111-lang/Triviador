// Validates the hand-written trivia content and emits data/q/core.json + data/q/<lang>.json
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import * as core from './content/core.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const OUT = path.join(HERE, '..', 'data', 'q');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'core.json'), JSON.stringify({ people: core.people, works: core.works, factsN: core.factsN, factsMC: core.factsMC, elements: core.elements, events: core.events }));
const en = (await import('./content/en.mjs')).default;
const langs = fs.readdirSync(path.join(HERE, 'content')).filter((f) => /^[a-z]{2}\.mjs$/.test(f)).map((f) => f.slice(0, 2));
let bad = 0;
for (const l of langs) {
  const d = (await import(`./content/${l}.mjs`)).default; const miss = [];
  for (const k of Object.keys(en.tpl)) { if (!d.tpl[k]) miss.push('tpl.' + k); else { const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(); if (ph(d.tpl[k]) !== ph(en.tpl[k])) miss.push('tpl.' + k + ' placeholders'); } }
  for (const k of Object.keys(en.continents)) if (!d.continents[k]) miss.push('continent.' + k);
  for (const k of Object.keys(en.cats)) if (!d.cats[k]) miss.push('cat.' + k);
  for (const [s] of core.elements) if (!d.elements[s]) miss.push('el.' + s);
  for (const k of core.events) if (!d.events[k]) miss.push('ev.' + k);
  for (const k of Object.keys(d.events)) if (!core.events.includes(k)) miss.push('ev.extra.' + k);
  for (const k of Object.keys(core.factsN)) if (!d.factsN[k]) miss.push('n.' + k);
  for (const k of Object.keys(d.factsN)) if (!(k in core.factsN)) miss.push('n.extra.' + k);
  for (const [k, v] of Object.entries(core.factsMC)) { const s = d.factsMC[k]; if (!s) { miss.push('mc.' + k); continue; } const parts = s.split('|'); if (v === null ? parts.length !== 5 || new Set(parts.slice(1)).size !== 4 : parts.length !== 1) miss.push('mc.format.' + k); }
  for (const k of Object.keys(d.factsMC)) if (!(k in core.factsMC)) miss.push('mc.extra.' + k);
  for (const k of Object.keys(d.works || {})) if (!core.works.find((w) => w[0] === k)) miss.push('work.unknown.' + k);
  console.log(l, miss.length ? 'PROBLEMS: ' + miss.join(', ') : 'ok', `(${Object.keys(d.works || {}).length} titles, ${Object.keys(d.names || {}).length} names)`);
  bad += miss.length;
  fs.writeFileSync(path.join(OUT, l + '.json'), JSON.stringify(d));
}
process.exit(bad ? 1 : 0);
