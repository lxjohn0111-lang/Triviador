// Build-time generator: language-neutral geography facts + per-language name tables
// used by the procedural question generator.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { geoArea } from 'd3-geo';
import * as topoServer from 'topojson-server'; import * as topoClient from 'topojson-client';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const CACHE = path.join(HERE, '.cache'); const OUT = path.join(HERE, '..', 'data', 'geo');
const LANGS = ['en', 'hu', 'de', 'es', 'fr', 'it', 'pt', 'pl', 'tr', 'ru', 'nl', 'id'];
const load = (f) => JSON.parse(fs.readFileSync(path.join(CACHE, f)));
const A0 = load('ne_10m_admin_0_countries.geojson').features, A50 = load('ne_50m_admin_0_countries.geojson'), PP = load('ne_10m_populated_places.geojson').features, EL = load('ne_10m_geography_regions_elevation_points.geojson').features;
const iso2 = (p) => (p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2 !== '-99' ? p.ISO_A2 : null);
const CONT = { 'Europe': 'EU', 'Asia': 'AS', 'Africa': 'AF', 'North America': 'NA', 'South America': 'SA', 'Oceania': 'OC' };
const nm = (p, l, up) => (up ? p['NAME_' + l.toUpperCase()] : p['name_' + l]) || null;

// neighbours from the 50m topology
const topo = topoServer.topology({ c: A50 }); const geoms = topo.objects.c.geometries; const nbIdx = topoClient.neighbors(geoms);
const nbBy = {}; geoms.forEach((g, i) => { const c = iso2(g.properties); if (c) nbBy[c] = [...new Set([...(nbBy[c] || []), ...nbIdx[i].map((j) => iso2(geoms[j].properties)).filter((x) => x && x !== c)])]; });

const countries = []; const a3to2 = {};
for (const f of A0) {
  const p = f.properties, c = iso2(p);
  if (!c || !['Sovereign country', 'Country'].includes(p.TYPE) || !CONT[p.CONTINENT] || p.POP_EST < 1000) continue;
  if (countries.find((x) => x.c === c)) continue;
  let a = geoArea(f); if (a > 2 * Math.PI) a = 4 * Math.PI - a;
  a3to2[p.ADM0_A3] = c;
  countries.push({ c, a3: p.ADM0_A3, pop: Math.round(p.POP_EST), area: Math.round(a * 6371 * 6371), ct: CONT[p.CONTINENT], sub: p.SUBREGION, nb: [], names: Object.fromEntries(LANGS.map((l) => [l, nm(p, l, true) || p.NAME])) });
}
const cset = new Set(countries.map((x) => x.c));
for (const x of countries) x.nb = (nbBy[x.c] || []).filter((n) => cset.has(n));

const cities = []; const capCount = {};
const ppSorted = PP.slice().sort((a, b) => b.properties.POP_MAX - a.properties.POP_MAX);
for (const f of ppSorted) {
  const p = f.properties, c = a3to2[p.ADM0_A3]; if (!c) continue;
  const cap = p.FEATURECLA === 'Admin-0 capital';
  if (!cap && p.POP_MAX < 900000) continue;
  if (cap) capCount[c] = (capCount[c] || 0) + 1;
  cities.push({ c, pop: p.POP_MAX, lat: +p.LATITUDE.toFixed(2), lon: +p.LONGITUDE.toFixed(2), cap, names: Object.fromEntries(LANGS.map((l) => [l, nm(p, l, true) || p.NAME])) });
}
countries.forEach((x) => { x.cap = capCount[x.c] === 1 ? cities.findIndex((ct) => ct.cap && ct.c === x.c) : -1; });

const mountains = EL.filter((f) => f.properties.featurecla === 'mountain' && f.properties.name && f.properties.elevation > 1500 && f.properties.scalerank <= 3 && f.properties.name_en)
  .map((f) => ({ h: Math.round(f.properties.elevation), names: Object.fromEntries(LANGS.map((l) => [l, nm(f.properties, l) || f.properties.name_en])) }));

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'base.json'), JSON.stringify({
  countries: countries.map((x) => ({ c: x.c, p: x.pop, a: x.area, t: x.ct, n: x.nb, k: x.cap })),
  cities: cities.map((x) => ({ c: x.c, p: x.pop, y: x.lat, x: x.lon, ...(x.cap ? { k: 1 } : {}) })),
  mountains: mountains.map((m) => m.h),
}));
for (const l of LANGS) fs.writeFileSync(path.join(OUT, `names-${l}.json`), JSON.stringify({ countries: Object.fromEntries(countries.map((x) => [x.c, x.names[l]])), cities: cities.map((x) => x.names[l]), mountains: mountains.map((m) => m.names[l]) }));
console.log('countries', countries.length, 'cities', cities.length, 'caps', countries.filter((x) => x.cap >= 0).length, 'mountains', mountains.length);
console.log(countries.filter((x) => x.cap < 0).map((x) => x.c).join(','));
const s = (c) => { const x = countries.find((y) => y.c === c); console.log(c, x.pop, x.area, x.nb.join(','), cities[x.cap]?.names.hu); }; s('HU'); s('FR'); s('US'); s('RU');
console.log(mountains.slice(0, 12).map((m) => m.names.en + ' ' + m.h).join('; '));
