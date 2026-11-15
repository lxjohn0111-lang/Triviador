// Build-time generator: turns Natural Earth admin-1 data into playable 15-territory maps.
// Usage: node build-maps.mjs [CC CC ...]   (no args = all countries)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { geoAzimuthalEqualArea, geoArea, geoDistance } from 'd3-geo';
import * as topoServer from 'topojson-server';
import * as topoClient from 'topojson-client';
import * as topoSimplify from 'topojson-simplify';
import polygonClipping from 'polygon-clipping';
import polylabel from 'polylabel';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '.cache');
const OUT = path.join(HERE, '..', 'data', 'maps');
export const LANGS = ['en', 'hu', 'de', 'es', 'fr', 'it', 'pt', 'pl', 'tr', 'ru', 'nl', 'id'];
const TARGET = 15;
const SIZE = 2000;
const R_KM = 6371;

const load = (f) => JSON.parse(fs.readFileSync(path.join(CACHE, f)));

// ---------- geometry helpers ----------
const ringArea = (r) => { let a = 0; for (let i = 0, n = r.length, j = n - 1; i < n; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; };
const polyArea = (p) => { let a = Math.abs(ringArea(p[0])); for (let i = 1; i < p.length; i++) a -= Math.abs(ringArea(p[i])); return Math.max(a, 0); };
const mpArea = (mp) => mp.reduce((s, p) => s + polyArea(p), 0);
function pointInMP(x, y, mp) {
  let inside = false;
  for (const poly of mp) for (const r of poly) {
    for (let i = 0, n = r.length, j = n - 1; i < n; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
const mpBBox = (mp) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of mp) for (const [x, y] of p[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hashStr = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function dpSimplify(pts, tol) {
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let md = 0, mi = -1;
    const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1e-12;
    for (let i = a + 1; i < b; i++) {
      let t = ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / len2; t = Math.max(0, Math.min(1, t));
      const ex = pts[i][0] - (ax + t * dx), ey = pts[i][1] - (ay + t * dy), d = ex * ex + ey * ey;
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol * tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function ringsToPath(mp) {
  let d = '';
  for (const poly of mp) for (const ring of poly) {
    const pts = []; let px = null, py = null;
    for (const [x0, y0] of ring) { const x = Math.round(x0), y = Math.round(y0); if (x !== px || y !== py) { pts.push([x, y]); px = x; py = y; } }
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3) continue;
    d += `M${pts[0][0]} ${pts[0][1]}l`;
    const seg = [];
    for (let i = 1; i < pts.length; i++) seg.push(`${pts[i][0] - pts[i - 1][0]} ${pts[i][1] - pts[i - 1][1]}`);
    d += seg.join(' ').replace(/ -/g, '-') + 'z';
  }
  return d;
}
const explode = (geom) => (geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []);
const sphArea = (poly) => { let a = geoArea({ type: 'Polygon', coordinates: poly }); if (a > 2 * Math.PI) a = 4 * Math.PI - a; return a * R_KM * R_KM; };
const subsample = (ring, n) => { const step = Math.max(1, Math.floor(ring.length / n)); const o = []; for (let i = 0; i < ring.length; i += step) o.push(ring[i]); return o; };
const minDistKm = (A, B) => { let m = Infinity; for (const a of A) for (const b of B) { const d = geoDistance(a, b); if (d < m) m = d; } return m * R_KM; };

// ---------- name cleanup ----------
const CLEAN = {
  en: [/ (County|Prefecture|Province|Department|Governorate|Voivodeship|Municipality|Oblast|District)$/i],
  de: [/^(Komitat|Präfektur|Département|Provinz|Oblast|Bezirk|Kanton|Gespanschaft|Woiwodschaft|Kreis|Gouvernement|Departamento) /i],
  hu: [/ (megye|prefektúra|megyei jogú város)$/i],
  es: [/^(Provincia|Departamento|Prefectura|Condado|Región|Estado|Óblast|Voivodato|Gobernación) (de |del |de la |d')?/i],
  fr: [/^(Département|Préfecture|Province|Comitat|Oblast|Voïvodie|Gouvernorat|Comté) (de la |de l'|de |du |des |d')?/i],
  it: [/^(Provincia|Prefettura|Contea|Dipartimento|Regione|Oblast'?|Voivodato|Governatorato|Distretto) (di |del |della |dell'|d')?/i],
  pt: [/^(Província|Prefeitura|Condado|Departamento|Oblast|Voivodia|Distrito) (de |do |da |d')?/i],
  pl: [/^(Prefektura|Komitat|Prowincja|Departament|Dystrykt|Hrabstwo|Okręg) /i],
  tr: [/ (ili|İli|Prefektörlüğü|Eyaleti|Vilayeti|İdari Bölgesi|Bölgesi)$/],
  nl: [/^(Prefectuur|Provincie|Comitaat|Departement|Oblast|District|Gouvernement) /i],
  id: [/^(Prefektur|Provinsi|Kabupaten|Oblast|Departemen|Distrik|Kegubernuran|County|Provinsi) /i],
  ru: [],
};
const clean = (s, lang) => { if (!s) return s; let o = String(s).trim(); for (const re of CLEAN[lang] || []) { const t = o.replace(re, '').trim(); if (t.length >= 2) o = t; } return o; };
function nameObj(get) { // get(lang|null) -> string
  const base = clean(get('en'), 'en') || get(null) || '?';
  const o = { _: base };
  for (const l of LANGS) { if (l === 'en') continue; const v = clean(get(l), l); if (v && v !== base) o[l] = v; }
  return o;
}
const COMPASS = {
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], hu: ['É', 'ÉK', 'K', 'DK', 'D', 'DNy', 'Ny', 'ÉNy'], de: ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'],
  es: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'], fr: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'], it: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
  pt: ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'], pl: ['Pn', 'Pn-Wsch', 'Wsch', 'Pd-Wsch', 'Pd', 'Pd-Zach', 'Zach', 'Pn-Zach'], tr: ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'],
  ru: ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'], nl: ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'], id: ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL'],
};

// ---------- per-country overrides ----------
const BBOX = { // [lonMin, latMin, lonMax, latMax] applied to polygon centroids
  US: [-128, 23, -65, 50.5], NO: [0, 55, 35, 72], NL: [0, 50, 10, 55], ES: [-10.5, 35, 5, 44.5], PT: [-10.5, 36, -5, 43],
  FR: [-6, 41, 10.5, 52], EC: [-82, -6, -74, 3], CL: [-78, -57, -65, -16], NZ: [165, -48.5, 180, -33], ZA: [15, -36, 34, -21],
  AU: [110, -45, 156, -9], DK: [7, 54, 16, 58.5], GB: [-9.5, 49, 3, 61.5], CO: [-80, -5, -66, 13.5], VE: [-74, 0, -59, 13],
  BR: [-75, -35, -34, 6], IN: [67, 5.5, 98, 37.5], JP: [128, 30, 147, 46], KR: [124.5, 33, 130.5, 39], CR: [-86.5, 8, -82, 11.5],
  HN: [-90, 12.5, -83, 16.6], YE: [42, 12, 54, 19.5], GQ: [8.5, 0.8, 11.5, 4], TZ: [29, -12, 41, -0.5], MU: [57, -20.7, 58, -19.8],
  SC: [55.1, -4.9, 55.9, -4.2], FJ: [176.5, -19.5, 180, -15.5], TO: [-175.5, -21.6, -174.8, -20.9], KI: [172.8, 1.2, 173.2, 2.1],
  PF: [-150, -18, -149, -17.3], MH: [171, 7, 171.5, 7.3], MV: [73.3, 4, 73.7, 4.5], FM: [158, 6.7, 158.4, 7.1], SB: [155, -12, 163, -5],
  TF: [68.5, -50.1, 70.7, -48.5], SH: [-5.9, -16.1, -5.5, -15.8], CV: [-25.5, 14.7, -22.5, 17.3], BS: [-79.5, 22.5, -73.5, 27.5],
  TV: [179, -8.7, 179.3, -8.4], CK: [-160, -21.4, -159.6, -21.1], PN: [-130.2, -25.1, -130, -25], UM: [-177.5, 28.1, -177.2, 28.3],
};

// ---------- data ----------
console.log('loading data…');
const A0 = load('ne_10m_admin_0_countries.geojson').features;
const A1 = load('ne_10m_admin_1_states_provinces.geojson').features;
const PP = load('ne_10m_populated_places.geojson').features;
const CITIES = require('all-the-cities');
const a1ByA3 = {}; for (const f of A1) (a1ByA3[f.properties.adm0_a3] ||= []).push(f);
const ppByA3 = {}; for (const f of PP) (ppByA3[f.properties.ADM0_A3] ||= []).push(f);
const cityByCC = {}; for (const c of CITIES) (cityByCC[c.country] ||= []).push(c);

for (const f of A0) { const pts = explode(f.geometry).flatMap((poly) => subsample(poly[0], 12)); let X = 0, Y = 0, Z = 0; for (const [lo, la] of pts) { const a = la * Math.PI / 180, b = lo * Math.PI / 180; X += Math.cos(a) * Math.cos(b); Y += Math.cos(a) * Math.sin(b); Z += Math.sin(a); } f._c = [Math.atan2(Y, X) * 180 / Math.PI, Math.atan2(Z, Math.hypot(X, Y)) * 180 / Math.PI]; f._r = Math.max(...pts.map((q) => geoDistance(q, f._c))); }
const iso2 = (p) => (p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2 !== '-99' ? p.ISO_A2 : null);
const countries = {};
for (const f of A0) {
  const p = f.properties, cc = iso2(p);
  if (!cc || cc === 'AQ' || !['Sovereign country', 'Country', 'Dependency', 'Disputed', 'Sovereignty'].includes(p.TYPE)) continue;
  if (!countries[cc] || p.POP_EST > countries[cc].properties.POP_EST) countries[cc] = f;
}

function bisect(mp, rnd) {
  const [x0, y0, x1, y1] = mpBBox(mp), w = x1 - x0, h = y1 - y0, diag = Math.hypot(w, h);
  const pts = []; const n = 70, sx = w / n, sy = h / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const x = x0 + (i + 0.5) * sx, y = y0 + (j + 0.5) * sy; if (pointInMP(x, y, mp)) pts.push([x, y]); }
  if (pts.length < 8) return null;
  let mx = 0, my = 0; for (const p of pts) { mx += p[0]; my += p[1]; } mx /= pts.length; my /= pts.length;
  let sxx = 0, sxy = 0, syy = 0; for (const p of pts) { const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy) + (rnd() - 0.5) * 0.35;
  const ux = Math.cos(th), uy = Math.sin(th), vx = -uy, vy = ux;
  const ts = pts.map((p) => (p[0] - mx) * ux + (p[1] - my) * uy).sort((a, b) => a - b);
  const med = ts[ts.length >> 1], px = mx + ux * med, py = my + uy * med;
  // wiggly cut line through (px,py) along v
  const half = diag * 0.75;
  const size = Math.sqrt(mpArea(mp)), ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const line = [];
  for (let i = 0; i <= 90; i++) {
    const s = -half + (2 * half * i) / 90, q = (s / size) * 6.283;
    line.push([s, size * (0.05 * Math.sin(q * 0.9 + ph[0]) + 0.034 * Math.sin(q * 2.1 + ph[1]) + 0.02 * Math.sin(q * 4.3 + ph[2]) + 0.011 * Math.sin(q * 8.7 + ph[3]))]);
  }
  const L = diag * 3;
  const world = (s, o) => [px + vx * s + ux * o, py + vy * s + uy * o];
  const cut = line.map(([s, o]) => world(s, o));
  const A = [[world(-L, 0), ...cut, world(L, 0), world(L, L), world(-L, L), world(-L, 0)]];
  const B = [[world(-L, 0), ...cut, world(L, 0), world(L, -L), world(-L, -L), world(-L, 0)]];
  let pa, pb;
  try { pa = polygonClipping.intersection(mp, [A]); pb = polygonClipping.intersection(mp, [B]); } catch (e) { return null; }
  if (!pa.length || !pb.length) return null;
  // move tiny detached fragments to the other side when they touch it
  const fix = (from, to) => {
    const tot = mpArea(from); const keep = []; let other = to;
    for (const poly of from) {
      if (from.length > 1 && polyArea(poly) < tot * 0.04) {
        try { const u = polygonClipping.union(other, [poly]); if (u.length <= other.length) { other = u; continue; } } catch (e) { /* keep */ }
      }
      keep.push(poly);
    }
    return [keep, other];
  };
  [pa, pb] = fix(pa, pb); [pb, pa] = fix(pb, pa);
  if (!pa.length || !pb.length) return null;
  return [pa, pb];
}

function buildCountry(cc) {
  const f0 = countries[cc], p0 = f0.properties, a3 = p0.ADM0_A3;
  const rnd = mulberry32(hashStr(cc));
  let units = (a1ByA3[a3] || []).filter((f) => f.geometry);
  if (!units.length) units = [{ properties: { name: p0.NAME, ...Object.fromEntries(LANGS.map((l) => ['name_' + l, p0['NAME_' + l.toUpperCase()]])) }, geometry: f0.geometry }];

  // 1. explode to pieces
  let pieces = [];
  units.forEach((u, ui) => { for (const poly of explode(u.geometry)) { const area = sphArea(poly); pieces.push({ ui, poly, area }); } });
  const bb = BBOX[cc];
  for (const pc of pieces) { let x = 0, y = 0; for (const [a, b] of pc.poly[0]) { x += a; y += b; } pc.cen = [x / pc.poly[0].length, y / pc.poly[0].length]; }
  if (bb) { const f = pieces.filter((pc) => pc.cen[0] >= bb[0] && pc.cen[0] <= bb[2] && pc.cen[1] >= bb[1] && pc.cen[1] <= bb[3]); if (f.length) pieces = f; }
  const largest = Math.max(...pieces.map((p) => p.area));
  pieces = pieces.filter((p) => p.area >= largest * 0.0004);

  // 2. landmasses (pieces sharing vertices) and clustering
  const parent = pieces.map((_, i) => i); const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const seen = new Map();
  pieces.forEach((pc, i) => { for (const [x, y] of pc.poly[0]) { const k = x.toFixed(5) + ',' + y.toFixed(5); const j = seen.get(k); if (j === undefined) seen.set(k, i); else parent[find(i)] = find(j); } });
  const lmMap = new Map();
  pieces.forEach((pc, i) => { const r = find(i); if (!lmMap.has(r)) lmMap.set(r, { pieces: [], area: 0, pts: [] }); const lm = lmMap.get(r); lm.pieces.push(pc); lm.area += pc.area; });
  const lms = [...lmMap.values()].sort((a, b) => b.area - a.area);
  for (const lm of lms) { const per = Math.max(6, Math.floor(240 / lm.pieces.length)); for (const pc of lm.pieces) lm.pts.push(...subsample(pc.poly[0], per)); if (lm.pts.length > 400) lm.pts = subsample(lm.pts, 400); }
  let keptPieces = null, projected = null, W = 0, H = 0, proj = null;
  for (let gapScale = 1; ; gapScale *= 0.5) {
    const kept = new Set([lms[0]]); let changed = true;
    while (changed) {
      changed = false;
      for (const lm of lms) {
        if (kept.has(lm)) continue;
        for (const k of kept) { const lim = (k.area >= lms[0].area * 0.003 ? 650 : 250) * gapScale; if (minDistKm(lm.pts, k.pts) <= lim) { kept.add(lm); changed = true; break; } }
      }
    }
    keptPieces = [...kept].flatMap((lm) => lm.pieces);
    // 3. projection
    let X = 0, Y = 0, Z = 0;
    for (const pc of keptPieces) { const la = pc.cen[1] * Math.PI / 180, lo = pc.cen[0] * Math.PI / 180; X += Math.cos(la) * Math.cos(lo) * pc.area; Y += Math.cos(la) * Math.sin(lo) * pc.area; Z += Math.sin(la) * pc.area; }
    const lon0 = Math.atan2(Y, X) * 180 / Math.PI, lat0 = Math.atan2(Z, Math.hypot(X, Y)) * 180 / Math.PI;
    proj = geoAzimuthalEqualArea().rotate([-lon0, -lat0]).scale(1).translate([0, 0]).clipAngle(null).precision(0);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    projected = keptPieces.map((pc) => ({ ui: pc.ui, poly: pc.poly.map((r) => r.map((c) => { const q = proj(c); if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; return q; })) }));
    const s = SIZE / Math.max(x1 - x0, y1 - y0);
    W = Math.round((x1 - x0) * s); H = Math.round((y1 - y0) * s);
    for (const pc of projected) pc.poly = pc.poly.map((r) => r.map(([x, y]) => [(x - x0) * s, (y - y0) * s]));
    proj.scale(s).translate([-x0 * s, -y0 * s]);
    const land = projected.reduce((a, pc) => a + polyArea(pc.poly), 0);
    if (land / (W * H) >= 0.07 || kept.size === 1 || gapScale < 0.01) break;
  }

  // 4. topology + simplify
  const byUnit = new Map(); for (const pc of projected) { if (!byUnit.has(pc.ui)) byUnit.set(pc.ui, []); byUnit.get(pc.ui).push(pc.poly); }
  const unitIdx = [...byUnit.keys()];
  const fc = { type: 'FeatureCollection', features: unitIdx.map((ui) => ({ type: 'Feature', properties: { ui }, geometry: { type: 'MultiPolygon', coordinates: byUnit.get(ui) } })) };
  let topo = topoServer.topology({ u: fc });
  topo = topoSimplify.presimplify(topo);
  topo = topoSimplify.simplify(topo, 1.6);
  topo = topoSimplify.filter(topo, topoSimplify.filterAttachedWeight(topo, 14));
  let geoms = topo.objects.u.geometries.filter((g) => g.type && g.arcs && g.arcs.length);
  topo.objects.u.geometries = geoms;
  const feats = geoms.map((g) => topoClient.feature(topo, g));
  const uArea = feats.map((f) => mpArea(explode(f.geometry)));
  const total = uArea.reduce((a, b) => a + b, 0);
  // shared border lengths
  const arcLen = topo.arcs.map((a) => { let l = 0; for (let i = 1; i < a.length; i++) l += Math.hypot(a[i][0] - a[i - 1][0], a[i][1] - a[i - 1][1]); return l; });
  const arcUsers = new Map();
  const walk = (arcs, gi) => { for (const a of arcs) { if (Array.isArray(a)) walk(a, gi); else { const k = a < 0 ? ~a : a; if (!arcUsers.has(k)) arcUsers.set(k, new Set()); arcUsers.get(k).add(gi); } } };
  geoms.forEach((g, gi) => walk(g.arcs, gi));
  const shared = geoms.map(() => new Map());
  for (const [k, us] of arcUsers) { if (us.size === 2) { const [a, b] = [...us]; shared[a].set(b, (shared[a].get(b) || 0) + arcLen[k]); shared[b].set(a, (shared[b].get(a) || 0) + arcLen[k]); } }
  const uPts = feats.map((f) => { const o = []; for (const poly of explode(f.geometry)) o.push(...subsample(poly[0], 24)); return o; });
  const ptsDist = (A, B) => { let m = Infinity; for (const a of A) for (const b of B) { const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2; if (d < m) m = d; } return Math.sqrt(m); };

  // 5. merge
  let groups = geoms.map((g, i) => ({ units: [i], area: uArea[i], main: i }));
  const gShared = (g, h) => { let s = 0; for (const a of g.units) for (const b of h.units) s += shared[a].get(b) || 0; return s; };
  const minFrac = 0.017;
  while (groups.length > 1) {
    groups.sort((a, b) => a.area - b.area);
    const g = groups[0];
    if (groups.length <= TARGET && g.area >= total * minFrac) break;
    let best = null, bestScore = Infinity, per = 0;
    const sh = groups.map((h) => (h === g ? 0 : gShared(g, h))); per = sh.reduce((a, b) => a + b, 0);
    if (per > 0) { groups.forEach((h, i) => { if (sh[i] > 0) { const sc = h.area / (0.2 + sh[i] / per); if (sc < bestScore) { bestScore = sc; best = h; } } }); }
    else { const gp = g.units.flatMap((u) => uPts[u]); groups.forEach((h) => { if (h === g) return; const d = ptsDist(gp, h.units.flatMap((u) => uPts[u])); if (d < bestScore) { bestScore = d; best = h; } }); }
    if (uArea[g.main] > uArea[best.main]) best.main = g.main;
    best.units.push(...g.units); best.area += g.area; groups.shift();
  }
  let regions = groups.map((g) => ({ mp: g.units.length === 1 ? explode(feats[g.units[0]].geometry) : topoClient.merge(topo, g.units.map((u) => geoms[u])).coordinates, src: units[geoms[g.main].properties.ui].properties, split: false }));
  for (const r of regions) r.area = mpArea(r.mp);

  // 6. split
  let guard = 0;
  while (regions.length < TARGET && guard++ < 200) {
    regions.sort((a, b) => b.area - a.area);
    let done = false;
    for (let k = 0; k < regions.length && !done; k++) {
      const r = regions[k];
      for (let attempt = 0; attempt < 4 && !done; attempt++) {
        const res = bisect(r.mp, rnd);
        if (!res) continue;
        const [a, b] = res, aa = mpArea(a), ab = mpArea(b);
        if (Math.min(aa, ab) < r.area * 0.25) continue;
        regions.splice(k, 1, { mp: a, src: r.src, split: true, area: aa }, { mp: b, src: r.src, split: true, area: ab });
        done = true;
      }
    }
    if (!done) break;
  }
  if (regions.length !== TARGET) throw new Error(`could not reach ${TARGET} regions (${regions.length})`);
  // stable ordering: north-west to south-east
  for (const r of regions) { r.mp = r.mp.map((p) => p.map((ring) => ring.map(([x, y]) => [Math.round(x), Math.round(y)]))).filter((p) => p[0].length >= 4); r.bbox = mpBBox(r.mp); }

  // 7. raster adjacency
  const G = 640, gs = G / Math.max(W, H), gw = Math.ceil(W * gs) + 2, gh = Math.ceil(H * gs) + 2;
  const grid = new Int8Array(gw * gh).fill(-1);
  regions.forEach((r, ri) => {
    for (let gy = 0; gy < gh; gy++) {
      const y = (gy + 0.5) / gs; if (y < r.bbox[1] || y > r.bbox[3]) continue;
      const xs = [];
      for (const poly of r.mp) for (const ring of poly) for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) { const yi = ring[i][1], yj = ring[j][1]; if ((yi > y) !== (yj > y)) xs.push(ring[i][0] + ((y - yi) / (yj - yi)) * (ring[j][0] - ring[i][0])); }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) { const a = Math.max(0, Math.ceil(xs[k] * gs - 0.5)), b = Math.min(gw - 1, Math.floor(xs[k + 1] * gs - 0.5)); for (let gx = a; gx <= b; gx++) grid[gy * gw + gx] = ri; }
    }
  });
  const cnt = {}; const border = regions.map(() => []);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const a = grid[y * gw + x]; if (a < 0) continue; let edge = false;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const nx = x + dx, ny = y + dy; const b = nx < 0 || ny < 0 || nx >= gw || ny >= gh ? -1 : grid[ny * gw + nx]; if (b !== a) { edge = true; if (b > a) { const k = a + '_' + b; cnt[k] = (cnt[k] || 0) + 1; } } }
    if (edge) border[a].push([x, y]);
  }
  const adjSet = new Set(Object.entries(cnt).filter(([, c]) => c >= 5).map(([k]) => k));
  const key = (a, b) => (a < b ? a + '_' + b : b + '_' + a);
  const sea = [];
  const closest = (i, j) => { let m = Infinity, pa = null, pb = null; const A = border[i], B = border[j], sa = Math.max(1, A.length >> 7), sb = Math.max(1, B.length >> 7); for (let a = 0; a < A.length; a += sa) for (let b = 0; b < B.length; b += sb) { const d = (A[a][0] - B[b][0]) ** 2 + (A[a][1] - B[b][1]) ** 2; if (d < m) { m = d; pa = A[a]; pb = B[b]; } } return [Math.sqrt(m), pa, pb]; };
  const waterOnly = (pa, pb, i, j) => { const n = Math.ceil(Math.hypot(pb[0] - pa[0], pb[1] - pa[1])) * 2; for (let t = 1; t < n; t++) { const x = Math.round(pa[0] + ((pb[0] - pa[0]) * t) / n), y = Math.round(pa[1] + ((pb[1] - pa[1]) * t) / n); const v = grid[y * gw + x]; if (v >= 0 && v !== i && v !== j) return false; } return true; };
  const pairInfo = {};
  for (let i = 0; i < TARGET; i++) for (let j = i + 1; j < TARGET; j++) { if (adjSet.has(key(i, j)) || !border[i].length || !border[j].length) continue; pairInfo[key(i, j)] = closest(i, j); }
  const addSea = (i, j) => { const [, pa, pb] = pairInfo[key(i, j)]; adjSet.add(key(i, j)); sea.push([i, j, Math.round(pa[0] / gs), Math.round(pa[1] / gs), Math.round(pb[0] / gs), Math.round(pb[1] / gs)]); };
  for (const [k, [d, pa, pb]] of Object.entries(pairInfo)) { const [i, j] = k.split('_').map(Number); if (d > 1.5 && d < G * 0.045 && waterOnly(pa, pb, i, j)) addSea(i, j); }
  // connect components
  for (;;) {
    const comp = regions.map((_, i) => i); const cf = (i) => (comp[i] === i ? i : (comp[i] = cf(comp[i])));
    for (const k of adjSet) { const [i, j] = k.split('_').map(Number); comp[cf(i)] = cf(j); }
    let best = null, bd = Infinity;
    for (const [k, [d]] of Object.entries(pairInfo)) { const [i, j] = k.split('_').map(Number); if (cf(i) !== cf(j) && d < bd) { bd = d; best = [i, j]; } }
    if (!best) break; addSea(best[0], best[1]);
  }
  const adj = [...adjSet].map((k) => k.split('_').map(Number));
  const deg = regions.map(() => 0); for (const [a, b] of adj) { deg[a]++; deg[b]++; }
  // give lonely leaf regions a second neighbour when one is close (keeps the game from stalling)
  // (left as-is: leaves are allowed)

  // 8. labels
  for (const r of regions) { const big = r.mp.slice().sort((a, b) => polyArea(b) - polyArea(a))[0]; const pl = polylabel(big, 2); r.c = [Math.round(pl[0]), Math.round(pl[1])]; r.r = Math.round(pl.distance); }

  // 9. names + cities
  const ppList = (ppByA3[a3] || []).map((f) => { const p = f.properties; const q = proj([p.LONGITUDE, p.LATITUDE]); return { n: nameObj((l) => (l ? p['NAME_' + l.toUpperCase()] : p.NAME)), pop: p.POP_MAX || 0, x: q[0], y: q[1], cap: p.FEATURECLA === 'Admin-0 capital' }; });
  const seenCity = new Set(ppList.map((c) => c.n._.toLowerCase()));
  const extra = (cityByCC[cc] || []).filter((c) => !seenCity.has(c.name.toLowerCase())).sort((a, b) => b.population - a.population).slice(0, 400).map((c) => { const q = proj(c.loc.coordinates); return { n: { _: c.name }, pop: c.population, x: q[0], y: q[1], cap: false }; });
  const allCities = [...ppList, ...extra].sort((a, b) => b.pop - a.pop);
  for (const c of allCities) { c.r = -1; for (let i = 0; i < regions.length; i++) { const b = regions[i].bbox; if (c.x >= b[0] && c.x <= b[2] && c.y >= b[1] && c.y <= b[3] && pointInMP(c.x, c.y, regions[i].mp)) { c.r = i; break; } } }
  const used = new Set();
  for (const r of regions) if (!r.split) { r.n = nameObj((l) => (l ? r.src['name_' + l] : r.src.name)); used.add(r.n._.toLowerCase()); }
  for (const c of allCities) { if (c.r < 0) continue; const r = regions[c.r]; if (r.n || used.has(c.n._.toLowerCase())) continue; r.n = c.n; used.add(c.n._.toLowerCase()); }
  for (const r of regions) { // nearest unused town as a second choice
    if (r.n) continue; let best = null, bd = 240 * 240;
    for (const c of allCities) { if (used.has(c.n._.toLowerCase())) continue; const d = (c.x - r.c[0]) ** 2 + (c.y - r.c[1]) ** 2; if (d < bd) { bd = d; best = c; } }
    if (best) { r.n = best.n; used.add(best.n._.toLowerCase()); }
  }
  const cx = W / 2, cy = H / 2;
  const fallbackCount = {};
  let fallbacks = 0;
  for (const r of regions) {
    if (r.n) continue; fallbacks++;
    const base = nameObj((l) => (l ? r.src['name_' + l] : r.src.name));
    const sibs = regions.filter((q) => q.src === r.src); let sx = 0, sy = 0; for (const q of sibs) { sx += q.c[0]; sy += q.c[1]; } sx /= sibs.length; sy /= sibs.length;
    const ang = Math.atan2(r.c[0] - sx, -(r.c[1] - sy)); const oct = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
    const k = base._ + oct; fallbackCount[k] = (fallbackCount[k] || 0) + 1; const suffix = fallbackCount[k] > 1 ? ' ' + fallbackCount[k] : '';
    r.n = { _: `${base._} (${COMPASS.en[oct]}${suffix})` };
    for (const l of LANGS) { if (l === 'en') continue; const v = `${base[l] || base._} (${COMPASS[l][oct]}${suffix})`; if (v !== r.n._) r.n[l] = v; }
  }
  void cx; void cy;

  // 10. background land
  const mxg = Math.round((Math.max(W, 2.4 * H) * 1.15 - W) / 2), myg = Math.round((Math.max(H, 2 * W) * 1.15 - H) / 2);
  const bgProj = geoAzimuthalEqualArea().rotate(proj.rotate()).scale(proj.scale()).translate(proj.translate()).clipAngle(105).clipExtent([[-mxg, -myg], [W + mxg, H + myg]]).precision(0.5);
  const bgRings = []; const nb = [];
  const viewRad = 2 * Math.asin(Math.min(1, Math.hypot(W / 2 + mxg, H / 2 + myg) / proj.scale() / 2));
  const viewC = proj.invert([W / 2, H / 2]);
  for (const f of A0) {
    if (geoDistance(viewC, f._c) > viewRad + f._r + 0.02) continue;
    const rings = []; let cur = null;
    const stream = bgProj.stream({ point(x, y) { cur.push([x, y]); }, lineStart() { cur = []; }, lineEnd() { if (cur.length > 2) rings.push(cur); cur = null; }, polygonStart() {}, polygonEnd() {}, sphere() {} });
    for (const poly of explode(f.geometry)) { stream.polygonStart(); for (const ring of poly) { stream.lineStart(); for (let i = 0; i < ring.length - 1; i++) stream.point(ring[i][0], ring[i][1]); stream.lineEnd(); } stream.polygonEnd(); }
    let area = 0;
    for (const r of rings) { const a = Math.abs(ringArea(r)); if (a < 30) continue; const s = dpSimplify([...r, r[0]], 1.8); if (s.length >= 4) { bgRings.push(s); area += a; } }
    const p = f.properties, c2 = iso2(p);
    if (c2 && c2 !== cc && area > 9000 && p.LABEL_X != null) { const q = proj([p.LABEL_X, p.LABEL_Y]); if (q[0] > -mxg * 0.9 && q[0] < W + mxg * 0.9 && q[1] > -myg * 0.9 && q[1] < H + myg * 0.9) nb.push([c2, Math.round(q[0]), Math.round(q[1]), Math.round(Math.sqrt(area))]); }
  }
  const bg = ringsToPath([bgRings]);

  const cityOut = allCities.filter((c) => c.r >= 0 && c.pop > 0).slice(0, 30).map((c) => ({ n: c.n, p: c.pop, r: c.r, x: Math.round(c.x), y: Math.round(c.y), ...(c.cap ? { cap: 1 } : {}) }));
  const out = {
    cc, w: W, h: H, mx: mxg, my: myg,
    name: nameObj((l) => (l ? p0['NAME_' + l.toUpperCase()] : p0.NAME)),
    regions: regions.map((r) => ({ n: r.n, d: ringsToPath(r.mp), c: r.c, r: r.r, a: Math.round(r.area) })),
    adj, sea, bg, nb, cities: cityOut,
  };
  const minA = Math.min(...regions.map((r) => r.area)) / regions.reduce((a, r) => a + r.area, 0);
  const minR = Math.min(...regions.map((r) => r.r));
  return { out, stats: { units: units.length, minA: +(minA * 100).toFixed(2), minR, leaves: deg.filter((d) => d === 1).length, sea: sea.length, fallbacks, splits: regions.filter((r) => r.split).length } };
}

const only = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const index = []; const problems = [];
const list = Object.keys(countries).sort();
let totalBytes = 0;
for (const cc of list) {
  if (only.length && !only.includes(cc)) continue;
  try {
    const { out, stats } = buildCountry(cc);
    const json = JSON.stringify(out);
    fs.writeFileSync(path.join(OUT, cc + '.json'), json); totalBytes += json.length;
    index.push({ c: cc, n: out.name._, a: +(out.w / out.h).toFixed(2) });
    const flag = stats.minA < 1.2 || stats.minR < 14 ? ' <-- CHECK' : '';
    console.log(cc.padEnd(3), out.name._.padEnd(28), JSON.stringify(stats), (json.length / 1024).toFixed(0) + 'KB', flag);
    if (flag) problems.push(cc);
  } catch (e) { console.log(cc, 'FAILED', e.message); problems.push(cc + '!'); }
}
if (!only.length) fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
console.log('done', index.length, 'countries', (totalBytes / 1048576).toFixed(1) + 'MB', 'problems:', problems.join(' '));
