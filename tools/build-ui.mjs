// Validates UI translations against the bundled English strings and emits data/i18n/<lang>.json
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const OUT = path.join(HERE, '..', 'data', 'i18n');
globalThis.document = { documentElement: {} };
const { EN } = await import('../js/i18n.js');
fs.mkdirSync(OUT, { recursive: true }); let bad = 0;
const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
for (const f of fs.readdirSync(path.join(HERE, 'ui')).filter((x) => x.endsWith('.mjs'))) {
  const l = f.slice(0, 2), d = (await import('./ui/' + f)).default; const miss = [];
  for (const k of Object.keys(EN)) { if (!d[k]) miss.push(k); else if (ph(d[k]) !== ph(EN[k])) miss.push(k + ' {placeholders}'); }
  for (const k of Object.keys(d)) if (!(k in EN)) miss.push('extra:' + k);
  console.log(l, miss.length ? 'PROBLEMS: ' + miss.join(', ') : 'ok', Object.keys(d).length + '/' + Object.keys(EN).length); bad += miss.length;
  fs.writeFileSync(path.join(OUT, l + '.json'), JSON.stringify(d));
}
process.exit(bad ? 1 : 0);
