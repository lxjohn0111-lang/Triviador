// Question engine: mixes hand-written facts with procedurally generated questions
// (geography, the player's own country, history, science, culture, numbers) so that
// the pool is practically endless. Remembers what the player has already seen.
import { store } from './store.js';

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function wpick(items, w) { let tot = 0; const ws = items.map((x) => { const v = Math.max(0, w(x)); tot += v; return v; }); if (tot <= 0) return null; let r = Math.random() * tot; for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; } return items[items.length - 1]; }
function sample(items, n, w) { const pool = items.slice(), out = []; while (out.length < n && pool.length) { const x = w ? wpick(pool, w) : pick(pool); if (x == null) break; out.push(x); pool.splice(pool.indexOf(x), 1); } return out; }
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
const sig = (n, d) => { if (n === 0) return 0; const m = Math.pow(10, Math.floor(Math.log10(Math.abs(n))) - d + 1); return Math.round(n / m) * m; };
const toRoman = (n) => { const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, r] of t) while (n >= v) { s += r; n -= v; } return s; };
const hav = (a, b) => { const R = 6371, p = Math.PI / 180, dLat = (b.y - a.y) * p, dLon = (b.x - a.x) * p; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.y * p) * Math.cos(b.y * p) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

const CAT_N = { geo: ['everest', 'mariana', 'nile', 'amazon_len', 'great_wall', 'angel_falls', 'eu_members', 'un_members', 'us_states', 'germany_borders', 'russia_tz', 'kilimanjaro', 'mont_blanc', 'aconcagua', 'denali', 'elbrus', 'k2', 'matterhorn', 'vesuvius', 'fuji', 'olympus', 'danube', 'volga', 'mississippi', 'yangtze', 'rhine', 'baikal_depth', 'grand_canyon', 'barrier_reef', 'panama_canal', 'suez_canal', 'channel_tunnel', 'transsib', 'un_langs', 'us_stripes', 'eu_stars'],
  hist: ['henry_wives', 'hundred_war', 'berlin_wall_years', 'www_year', 'rubik_year', 'boeing747', 'moon_walkers', 'titanic_len'],
  cul: ['beethoven_sym', 'mozart_sym', 'piano_keys', 'eiffel', 'burj', 'liberty', 'pisa', 'eiffel_steps', 'golden_gate', 'hp_books', 'dalmatians'],
  spo: ['marathon', 'snooker', 'darts', 'golf_holes', 'goal_width', 'hoop_height', 'olympic_pool', 'brazil_wc', 'chess_squares', 'cards', 'dominoes'],
  mat: ['minutes_day', 'seconds_hour', 'primes_100', 'sum_100', 'kilobyte', 'mile_m', 'pound_g'] };
const CAT_MC = { geo: ['largest_ocean', 'longest_river_eu', 'largest_desert', 'largest_country', 'smallest_country', 'most_people', 'largest_island', 'most_countries', 'driest_continent', 'river_paris', 'river_budapest', 'sea_eu_af', 'biggest_lake', 'deepest_lake', 'tallest_building', 'giza', 'machu_picchu', 'taj_mahal', 'colosseum', 'sagrada', 'angkor', 'petra', 'lang_brazil', 'currency_japan', 'currency_uk', 'most_native'],
  hist: ['inv_press', 'south_pole', 'everest_first', 'circumnav', 'america_1492', 'india_sea', 'us_first_pres', 'moon_first', 'space_first', 'wonder_standing', 'god_sea', 'olympics_origin', 'invaded_1939', 'first_woman_nobel'],
  cul: ['sistine', 'cubism', 'cut_ear', 'ode_joy', 'sherlock', 'cogito', 'psychoanalysis', 'keys_88', 'sushi', 'paella', 'pizza_city', 'guacamole', 'hummus'],
  spo: ['cassius_clay', 'hand_of_god', 'record_100m', 'most_golds', 'volleyball', 'basketball', 'rugby', 'baseball', 'handball', 'wimbledon', 'tour_de_france', 'chess_l', 'sumo'],
  ent: ['ms_founder', 'apple_founder', 'fb_founder', 'amazon_founder', 'www'],
  mat: ['pi', 'binary10', 'roman50', 'roman1000'] };
const catOf = (table, key, def) => { for (const c in table) if (table[c].includes(key)) return c; return def; };
const FIELD_CAT = { art: 'cul', mus: 'cul', lit: 'cul', sci: 'sci', exp: 'hist', pol: 'hist', phi: 'hist', film: 'ent', spo: 'spo' };

export class QuestionBank {
  constructor() { this.lang = null; this.core = null; this.geo = null; }

  async load(lang) {
    const j = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u); return r.json(); };
    if (!this.core) [this.core, this.geo] = await Promise.all([j('data/q/core.json'), j('data/geo/base.json')]);
    if (this.lang !== lang) {
      let L, N;
      try { [L, N] = await Promise.all([j(`data/q/${lang}.json`), j(`data/geo/names-${lang}.json`)]); }
      catch (e) { [L, N] = await Promise.all([j('data/q/en.json'), j('data/geo/names-en.json')]); }
      this.L = L; this.N = N; this.lang = lang;
    }
    // country names: CLDR short names when the browser has them ("China", not "People's Republic of China")
    this.cnames = { ...this.N.countries };
    try { const dn = new Intl.DisplayNames([lang], { type: 'region' }); for (const c of this.geo.countries) { const n = dn.of(c.c); if (n && n !== c.c) this.cnames[c.c] = n; } } catch (e) { /* keep dataset names */ }
    this.seen = store.seenSet();
    this.byCode = Object.fromEntries(this.geo.countries.map((c) => [c.c, c]));
  }

  setMap(map, cc) {
    this.map = map; this.home = this.byCode[cc] || null; this.cc = cc;
    const regionNames = new Set(map.regions.map((r) => this.rn(r.n).toLowerCase()));
    const junk = /\d|\b[IVXL]{1,5}\.|kerület|arrondissement|district|bezirk|distrito|dzielnica/i; const capital = (map.cities.find((c) => c.cap) || {}).n;
    map.cities = map.cities.filter((c) => !junk.test(c.n._) && !(capital && c.n !== capital && c.n._.startsWith(capital._ + ' ')));
    this.localCities = map.cities.filter((c) => !regionNames.has(this.rn(c.n).toLowerCase()));
  }
  rn(n) { return n[this.lang] || n._; }
  cn(code) { return this.cnames[code] || code; }
  pn(name) { return (this.L.names && this.L.names[name]) || name; }
  wt(title) { return (this.L.works && this.L.works[title]) || title; }
  cat(c) { return this.L.cats[c] || c; }
  fame(c) { let w = Math.pow(c.p / 1e6, 0.42) + 0.6; if (this.home) { if (c.t === this.home.t) w += 3; if (this.home.n.includes(c.c)) w += 6; if (c === this.home) w += 8; } return w; }
  mc(id, cat, text, correct, wrong) {
    const opts = shuffle([correct, ...wrong.slice(0, 3)]).map(String);
    if (new Set(opts).size !== 4) return null;
    return { type: 'mc', id, cat, catName: this.cat(cat), text, options: opts, correct: opts.indexOf(String(correct)) };
  }
  num(id, cat, text, answer, kind = 'num') { if (!(answer > 0)) return null; return { type: 'num', id, cat, catName: this.cat(cat), text, answer: Math.round(answer), kind }; }

  // ---------------- multiple choice generators ----------------
  // capital named after its country (Monaco, Kuwait City, Ciudad de México…) would give the answer away
  _capGiveaway(c) { const a = this.N.cities[c.k].toLowerCase(), b = this.cn(c.c).toLowerCase(); return a.includes(b) || b.includes(a) || a.slice(0, 5) === b.slice(0, 5) || a.split(/[\s-]/).some((w) => w.length > 3 && b.includes(w)); }
  g_capOf() { const T = this.L.tpl, cs = this.geo.countries.filter((c) => c.k >= 0 && !this._capGiveaway(c)); const c = wpick(cs, (x) => this.fame(x)); const others = sample(cs.filter((x) => x !== c && x.t === c.t), 3, (x) => this.fame(x)); return this.mc('capOf:' + c.c, 'geo', fill(T.capOf, { x: this.cn(c.c) }), this.N.cities[c.k], others.map((o) => this.N.cities[o.k])); }
  g_capIn() { const T = this.L.tpl, cs = this.geo.countries.filter((c) => c.k >= 0 && !this._capGiveaway(c)); const c = wpick(cs, (x) => this.fame(x)); const others = sample(cs.filter((x) => x !== c && x.t === c.t), 3, (x) => this.fame(x)); return this.mc('capIn:' + c.c, 'geo', fill(T.capIn, { x: this.N.cities[c.k] }), this.cn(c.c), others.map((o) => this.cn(o.c))); }
  g_contOf() { const T = this.L.tpl; const c = wpick(this.geo.countries.filter((x) => x !== this.home), (x) => 1 / (0.5 + this.fame(x))); const conts = shuffle(Object.keys(this.L.continents).filter((k) => k !== c.t)).slice(0, 3); return this.mc('cont:' + c.c, 'geo', fill(T.contOf, { x: this.cn(c.c) }), this.L.continents[c.t], conts.map((k) => this.L.continents[k])); }
  _biggest(key, tplKey, idp) { const four = sample(this.geo.countries, 4, (x) => this.fame(x)).sort((a, b) => b[key] - a[key]); if (four.length < 4 || four[0][key] < four[1][key] * 1.3) return null; return this.mc(idp + four.map((c) => c.c).sort().join(''), 'geo', this.L.tpl[tplKey], this.cn(four[0].c), four.slice(1).map((c) => this.cn(c.c))); }
  g_bigPop() { return this._biggest('p', 'bigPop', 'bigPop:'); }
  g_bigArea() { return this._biggest('a', 'bigArea', 'bigArea:'); }
  g_cityIn() { const T = this.L.tpl; const idx = this.geo.cities.map((c, i) => i).filter((i) => !this.geo.cities[i].k && this.byCode[this.geo.cities[i].c]); const i = wpick(idx, (j) => Math.pow(this.geo.cities[j].p / 1e6, 0.5) + (this.home && this.byCode[this.geo.cities[j].c].t === this.home.t ? 2 : 0)); const city = this.geo.cities[i], c = this.byCode[city.c], name = this.N.cities[i]; if (name.includes(this.cn(c.c)) || this.cn(c.c).includes(name)) return null; const others = sample(this.geo.countries.filter((x) => x !== c && x.t === c.t), 3, (x) => this.fame(x)); return this.mc('cityIn:' + i, 'geo', fill(T.cityIn, { x: name }), this.cn(c.c), others.map((o) => this.cn(o.c))); }
  g_bigCity() { const idx = sample(this.geo.cities.map((c, i) => i), 4, (j) => Math.pow(this.geo.cities[j].p / 1e6, 0.6)).sort((a, b) => this.geo.cities[b].p - this.geo.cities[a].p); if (this.geo.cities[idx[0]].p < this.geo.cities[idx[1]].p * 1.35) return null; return this.mc('bigCity:' + idx.slice().sort().join('.'), 'geo', this.L.tpl.bigCity, this.N.cities[idx[0]], idx.slice(1).map((i) => this.N.cities[i])); }
  _near(c) { const s = new Set(); for (const n of c.n) for (const m of (this.byCode[n] ? this.byCode[n].n : [])) if (m !== c.c && !c.n.includes(m)) s.add(m); return [...s].map((x) => this.byCode[x]).filter(Boolean); }
  g_border(force) { const T = this.L.tpl; const c = force || wpick(this.geo.countries.filter((x) => x.n.length >= 1), (x) => this.fame(x)); if (!c || !c.n.length) return null; const right = this.byCode[pick(c.n)]; let wrong = sample(this._near(c), 3); if (wrong.length < 3) wrong = wrong.concat(sample(this.geo.countries.filter((x) => x.t === c.t && x !== c && !c.n.includes(x.c) && !wrong.includes(x)), 3 - wrong.length)); if (wrong.length < 3) return null; return this.mc(`border:${c.c}:${right.c}`, force ? 'loc' : 'geo', fill(T.border, { x: this.cn(c.c) }), this.cn(right.c), wrong.map((o) => this.cn(o.c))); }
  g_noBorder(force) { const T = this.L.tpl; const c = force || wpick(this.geo.countries.filter((x) => x.n.length >= 3), (x) => this.fame(x)); if (!c || c.n.length < 3) return null; const near = this._near(c); if (!near.length) return null; const right = pick(near); return this.mc(`noBorder:${c.c}:${right.c}`, force ? 'loc' : 'geo', fill(T.noBorder, { x: this.cn(c.c) }), this.cn(right.c), sample(c.n, 3).map((o) => this.cn(o))); }
  g_regionOf() { if (!this.map || this.localCities.length < 2) return null; const c = wpick(this.localCities, (x) => Math.sqrt(x.p)); const right = this.rn(this.map.regions[c.r].n); const wrong = sample(this.map.regions.filter((_, i) => i !== c.r), 3).map((r) => this.rn(r.n)); return this.mc(`reg:${this.cc}:${c.n._}`, 'loc', fill(this.L.tpl.regionOf, { x: this.rn(c.n) }), right, wrong); }
  g_localBig() { if (!this.map || this.map.cities.length < 6) return null; const four = sample(this.map.cities, 4, (x) => Math.sqrt(x.p)).sort((a, b) => b.p - a.p); if (four.length < 4 || four[0].p < four[1].p * 1.3) return null; return this.mc(`lbig:${this.cc}:` + four.map((c) => c.n._).sort().join('.'), 'loc', this.L.tpl.bigCity, this.rn(four[0].n), four.slice(1).map((c) => this.rn(c.n))); }
  g_homeMC() { if (!this.home) return null; return Math.random() < 0.5 ? this.g_border(this.home) : this.g_noBorder(this.home); }
  g_bornFirst() { const four = sample(this.core.people, 4).sort((a, b) => a[1] - b[1]); if (four[1][1] - four[0][1] < 18) return null; return this.mc('bf:' + four.map((p) => p[0]).sort().join('|'), 'hist', this.L.tpl.bornFirst, this.pn(four[0][0]), four.slice(1).map((p) => this.pn(p[0]))); }
  g_field() { const p = pick(this.core.people), f = p[2]; const wrong = sample(this.core.people.filter((q) => q[2] !== f), 3); return this.mc('fld:' + p[0], FIELD_CAT[f], this.L.tpl['f_' + f], this.pn(p[0]), wrong.map((q) => this.pn(q[0]))); }
  g_who() { const w = pick(this.core.works), k = w[3]; const pool = [...new Set(this.core.works.filter((x) => (x[3] === k || (k === 's' && x[3] === 'p')) && x[1] !== w[1]).map((x) => x[1]))]; const wrong = sample(pool, 3); if (wrong.length < 3) return null; return this.mc('who:' + w[0], k === 'g' || k === 'f' ? 'ent' : 'cul', fill(this.L.tpl['who_' + k], { x: this.wt(w[0]) }), this.pn(w[1]), wrong.map((x) => this.pn(x))); }
  g_evFirst() { const four = sample(this.core.events, 4).sort((a, b) => parseInt(a) - parseInt(b)); if (parseInt(four[1]) - parseInt(four[0]) < 12) return null; if (four.some((k) => this.L.events[k].length > 62)) return null; return this.mc('ef:' + four.join('.'), 'hist', this.L.tpl.evFirst, this.L.events[four[0]], four.slice(1).map((k) => this.L.events[k])); }
  g_factMC() { const keys = Object.keys(this.core.factsMC).filter((k) => this.L.factsMC[k]); const k = pick(keys), neutral = this.core.factsMC[k], s = this.L.factsMC[k]; const cat = catOf(CAT_MC, k, 'sci'); if (neutral) return this.mc('mc:' + k, cat, s, this.pn(neutral[0]), neutral.slice(1).map((x) => this.pn(x))); const parts = s.split('|'); return this.mc('mc:' + k, cat, parts[0], parts[1], parts.slice(2)); }
  g_elSymbol() { const e = pick(this.core.elements); const wrong = sample(this.core.elements.filter((x) => x !== e), 3, (x) => (x[0][0] === e[0][0] ? 4 : 1)); return this.mc('els:' + e[0], 'sci', fill(this.L.tpl.elSymbol, { x: this.L.elements[e[0]] }), e[0], wrong.map((x) => x[0])); }
  g_elName() { const e = pick(this.core.elements); const wrong = sample(this.core.elements.filter((x) => x !== e), 3); return this.mc('eln:' + e[0], 'sci', fill(this.L.tpl.elName, { x: e[0] }), this.L.elements[e[0]], wrong.map((x) => this.L.elements[x[0]])); }
  g_math() {
    const T = this.L.tpl, r = Math.random();
    if (r < 0.4) { const a = 12 + rnd(38), b = 3 + rnd(17), v = a * b; const wrong = [...new Set([v + 10, v - 10, v + a, v - b, v + 2 * b, v + 20])].filter((x) => x !== v && x > 0); return this.mc(`m:${a}x${b}`, 'mat', fill(T.calc, { x: `${a} × ${b}` }), v, shuffle(wrong)); }
    if (r < 0.7) { const n = 14 + rnd(2010), wrong = [...new Set([n + 10, n - 10, n + 100, n + 5, n - 5, n + 50, n + 1, n - 1])].filter((x) => x !== n && x > 0); return this.mc('rom:' + n, 'mat', fill(T.roman, { x: toRoman(n) }), n, shuffle(wrong)); }
    const p = pick([5, 15, 20, 25, 30, 35, 40, 45, 60, 75, 80]), n = (2 + rnd(48)) * 20, v = (p * n) / 100; const wrong = [...new Set([v + n / 20, v - n / 20, v + n / 10, v * 2, v + 5, v + 10])].filter((x) => x !== v && x > 0 && Number.isInteger(x)); return this.mc(`pct:${p}:${n}`, 'mat', fill(T.percent, { p, n }), v, shuffle(wrong));
  }

  // ---------------- numeric (closest guess wins) generators ----------------
  n_pop(force) { const T = this.L.tpl, c = force || wpick(this.geo.countries, (x) => this.fame(x)); return c.p >= 2e6 ? this.num('pop:' + c.c, force ? 'loc' : 'geo', fill(T.popM, { x: this.cn(c.c) }), c.p / 1e6) : this.num('pop:' + c.c, force ? 'loc' : 'geo', fill(T.popK, { x: this.cn(c.c) }), c.p / 1e3); }
  n_area(force) { const T = this.L.tpl, c = force || wpick(this.geo.countries, (x) => this.fame(x)); return c.a >= 1e5 ? this.num('area:' + c.c, force ? 'loc' : 'geo', fill(T.areaK, { x: this.cn(c.c) }), c.a / 1e3) : this.num('area:' + c.c, force ? 'loc' : 'geo', fill(T.area, { x: this.cn(c.c) }), sig(c.a, 3)); }
  n_cityPop() { const T = this.L.tpl, i = wpick(this.geo.cities.map((c, j) => j), (j) => Math.pow(this.geo.cities[j].p / 1e6, 0.5) + (this.geo.cities[j].k ? 1 : 0)); const c = this.geo.cities[i]; if (c.p < 50000) return null; return c.p >= 3e6 ? this.num('cpop:' + i, 'geo', fill(T.cityM, { x: this.N.cities[i] }), c.p / 1e6) : this.num('cpop:' + i, 'geo', fill(T.cityK, { x: this.N.cities[i] }), c.p / 1e3); }
  n_borders(force) { const c = force || wpick(this.geo.countries.filter((x) => x.n.length >= 2), (x) => this.fame(x)); if (!c || c.n.length < 2) return null; return this.num('borders:' + c.c, force ? 'loc' : 'geo', fill(this.L.tpl.borders, { x: this.cn(c.c) }), c.n.length); }
  n_dist() { const caps = this.geo.countries.filter((c) => c.k >= 0); const [a, b] = sample(caps, 2, (x) => this.fame(x) * this.fame(x)); const d = hav(this.geo.cities[a.k], this.geo.cities[b.k]); if (d < 150) return null; return this.num('dist:' + [a.c, b.c].sort().join(''), 'geo', fill(this.L.tpl.dist, { a: this.N.cities[a.k], b: this.N.cities[b.k] }), sig(d, 3)); }
  n_mountain() { const i = rnd(this.geo.mountains.length); return this.num('mt:' + i, 'geo', fill(this.L.tpl.mountain, { x: this.N.mountains[i] }), this.geo.mountains[i]); }
  n_localPop() { if (!this.map) return null; const cs = this.map.cities.filter((c) => c.p >= 15000); if (!cs.length) return null; const c = wpick(cs, (x) => Math.sqrt(x.p)); return c.p >= 3e6 ? this.num(`lpop:${this.cc}:${c.n._}`, 'loc', fill(this.L.tpl.cityM, { x: this.rn(c.n) }), c.p / 1e6) : this.num(`lpop:${this.cc}:${c.n._}`, 'loc', fill(this.L.tpl.cityK, { x: this.rn(c.n) }), c.p / 1e3); }
  n_home() { if (!this.home) return null; const r = Math.random(); return r < 0.4 ? this.n_pop(this.home) : r < 0.75 ? this.n_area(this.home) : this.n_borders(this.home); }
  n_born() { const p = pick(this.core.people); return this.num('born:' + p[0], FIELD_CAT[p[2]], fill(this.L.tpl.born, { x: this.pn(p[0]) }), p[1], 'year'); }
  n_workYear() { const w = pick(this.core.works.filter((x) => x[2] > 0 && this.L.tpl['year_' + x[3]])); return this.num('wy:' + w[0], w[3] === 'g' || w[3] === 'f' ? 'ent' : 'cul', fill(this.L.tpl['year_' + w[3]], { x: this.wt(w[0]) }), w[2], 'year'); }
  n_evYear() { const k = pick(this.core.events); return this.num('ev:' + k, 'hist', fill(this.L.tpl.evYear, { x: this.L.events[k] }), parseInt(k), 'year'); }
  n_fact() { const k = pick(Object.keys(this.core.factsN).filter((x) => this.L.factsN[x])); return this.num('n:' + k, catOf(CAT_N, k, 'sci'), this.L.factsN[k], this.core.factsN[k], /_year$|boeing747/.test(k) ? 'year' : 'num'); }
  n_elNumber() { const e = pick(this.core.elements); return this.num('elz:' + e[0], 'sci', fill(this.L.tpl.elNumber, { x: this.L.elements[e[0]] }), e[1]); }

  _draw(table) {
    let fallback = null;
    for (let tries = 0; tries < 60; tries++) {
      const g = wpick(table, (x) => x[1]); let q = null;
      try { q = this[g[0]](); } catch (e) { q = null; }
      if (!q) continue;
      if (!this.seen.has(q.id)) { this.seen.add(q.id); store.markSeen(q.id); if (typeof window !== 'undefined' && window.__TEST__) window.__lastQ = q; return q; }
      fallback = fallback || q;
    }
    if (!fallback) fallback = this.g_math();
    if (typeof window !== 'undefined' && window.__TEST__) window.__lastQ = fallback;
    return fallback;
  }
  nextMC() { return this._draw(MC_TABLE); }
  nextNum() { return this._draw(NUM_TABLE); }
}
const MC_TABLE = [['g_capOf', 9], ['g_capIn', 6], ['g_contOf', 3], ['g_bigPop', 4], ['g_bigArea', 4], ['g_cityIn', 6], ['g_bigCity', 3], ['g_border', 5], ['g_noBorder', 3], ['g_regionOf', 7], ['g_localBig', 2], ['g_homeMC', 3], ['g_bornFirst', 5], ['g_field', 6], ['g_who', 17], ['g_evFirst', 5], ['g_factMC', 17], ['g_elSymbol', 3], ['g_elName', 3], ['g_math', 4]];
const NUM_TABLE = [['n_pop', 8], ['n_area', 5], ['n_cityPop', 6], ['n_borders', 3], ['n_dist', 8], ['n_mountain', 1], ['n_localPop', 5], ['n_home', 2], ['n_born', 14], ['n_workYear', 9], ['n_evYear', 14], ['n_fact', 15], ['n_elNumber', 2]];
