// Authoritative match engine. Runs on the host (or locally in single-player) and drives every
// player's screen through plain-JSON events, so the same rules serve solo and online matches.
// Phases: capitals -> expansion -> (campaign: division of free land) -> battle -> end.
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
const best = (list, score) => { let b = null, bs = -Infinity; for (const x of list) { const s = score(x); if (s > bs) { bs = s; b = x; } } return b; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const BOT_NAMES = ['Sir Quizalot', 'Lady Lore', 'Baron Brainiac', 'Duke Datum', 'Countess Clue', 'Captain Fact', 'Professor Riddle', 'Madame Atlas', 'Lord Ledger', 'Dame Trivia', 'Marshal Mind', 'Queen Query', 'Count Cortex', 'Abbot Almanac', 'Major Memory', 'Lady Logic'];
// division: campaign splits the land phase in two (closest-guess expansion, then one-by-one division of what is left)
export const MODES = {
  blitz: { mc: 10, num: 15, pick: 12, rounds: 2, expand: 99 },
  classic: { mc: 16, num: 22, pick: 20, rounds: 4, expand: 99 },
  campaign: { mc: 16, num: 22, pick: 20, rounds: 6, expand: 3, division: true },
};
const COLOR_GROUP = [0, 1, 2, 3, 1, 1, 0, 4];
const BOT_COLOR_ORDER = [1, 3, 0, 2, 6, 4, 5, 7];
export class Cancelled extends Error {}

// humans: [{name, color, emblem, peer|null}] (index 0 = host / local player). Bots fill up to 3 seats.
export function makePlayers(humans, skill) {
  const used = []; const players = [];
  const emb = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  humans.forEach((hm, i) => {
    let color = hm.color;
    if (used.includes(COLOR_GROUP[color])) color = BOT_COLOR_ORDER.find((c) => !used.includes(COLOR_GROUP[c]));
    used.push(COLOR_GROUP[color]);
    players.push({ id: i, name: (hm.name || 'Player').slice(0, 16), color, emblem: hm.emblem, kind: i === 0 ? 'local' : 'remote', peer: hm.peer || null, alive: true, bonus: 0, skill: 1 });
  });
  const names = shuffle(BOT_NAMES);
  while (players.length < 3) {
    const color = BOT_COLOR_ORDER.find((c) => !used.includes(COLOR_GROUP[c])); used.push(COLOR_GROUP[color]);
    const e = emb.find((x) => !players.some((p) => p.emblem === x));
    players.push({ id: players.length, name: names[players.length], color, emblem: e, kind: 'bot', peer: null, alive: true, bonus: 0, skill: Math.max(0.05, Math.min(0.95, skill + (Math.random() - 0.5) * 0.16)) });
  }
  return players;
}

export class Engine {
  // out(event) delivers an event to every screen (local presenter + network)
  constructor({ map, bank, mode, players, out }) {
    this.map = map; this.bank = bank; this.mode = mode; this.cfg = MODES[mode] || MODES.classic; this.players = players; this.out = out;
    this.adj = map.regions.map(() => []); for (const [a, b] of map.adj) { this.adj[a].push(b); this.adj[b].push(a); }
    this.reg = map.regions.map(() => ({ owner: -1, value: 0, capital: false, towers: 0 }));
    this.order = shuffle(players.map((p) => p.id)); this.elim = []; this.req = 0; this.pending = null; this.cancelled = false;
  }
  emit(e) { if (!this.cancelled) this.out(e); }
  cancel() { this.cancelled = true; if (this.pending && this.pending.cancel) this.pending.cancel(); }
  async wait(ms) { await sleep(ms); if (this.cancelled) throw new Cancelled(); }
  publicPlayers() { return this.players.map(({ id, name, color, emblem, kind, alive }) => ({ id, name, color, emblem, kind, alive })); }

  // ---- inputs from screens --------------------------------------------------
  // msg: {req, a:'ans'|'pick', v}
  input(pid, msg) { const p = this.pending; if (!p || !msg || msg.req !== p.req) return; p.onInput(pid, msg); }
  // a remote player left: the seat becomes a bot from now on
  botify(pid) {
    const p = this.players[pid]; if (!p || p.kind === 'bot') return;
    p.kind = 'bot'; p.skill = 0.45; p.peer = null; p.name = p.name + ' (bot)';
    this.emit({ t: 'botify', pid, name: p.name });
    if (this.pending && this.pending.onBotify) this.pending.onBotify(pid);
  }

  // ---- helpers ----------------------------------------------------------------
  score(pid) { let s = this.players[pid].bonus; for (const r of this.reg) if (r.owner === pid) s += r.value; return s; }
  scores() { return this.players.map((p) => this.score(p.id)); }
  sync(i, fx = 1) { const r = this.reg[i]; this.emit({ t: 'reg', i, o: r.owner, v: r.value, c: r.capital ? 1 : 0, w: r.towers, fx }); }
  pushScores() { this.emit({ t: 'scores', s: this.scores() }); }
  owned(pid) { return this.reg.map((r, i) => (r.owner === pid ? i : -1)).filter((i) => i >= 0); }
  free() { return this.reg.map((r, i) => (r.owner < 0 ? i : -1)).filter((i) => i >= 0); }
  dist(from) { const d = this.reg.map(() => 99); const q = [...from]; from.forEach((i) => (d[i] = 0)); while (q.length) { const x = q.shift(); for (const y of this.adj[x]) if (d[y] > d[x] + 1) { d[y] = d[x] + 1; q.push(y); } } return d; }
  alive() { return this.players.filter((p) => p.alive); }
  humansAlive() { return this.players.some((p) => p.alive && p.kind !== 'bot'); }
  async banner(key, sub, ms = 1700, cls = '', vars) { this.emit({ t: 'banner', key, sub, ms, cls, vars }); await this.wait(ms + 300); }

  // ---- picks --------------------------------------------------------------------
  async pick(pid, cands, kind) {
    const p = this.players[pid], req = ++this.req;
    this.emit({ t: 'pick', req, pid, cands, kind, time: this.cfg.pick });
    let choice;
    if (p.kind === 'bot') { await this.wait(850 + Math.random() * 800); choice = this.botPick(pid, cands, kind); }
    else {
      choice = await new Promise((res, rej) => {
        let done = false;
        const finish = (i) => { if (done) return; done = true; clearTimeout(to); this.pending = null; res(i); };
        const to = setTimeout(() => finish(pick(cands)), this.cfg.pick * 1000 + 1500);
        this.pending = { req, onInput: (from, m) => { if (from === pid && m.a === 'pick' && cands.includes(m.v)) finish(m.v); }, onBotify: (b) => { if (b === pid) setTimeout(() => finish(this.botPick(pid, cands, kind)), 700); }, cancel: () => { done = true; clearTimeout(to); rej(new Cancelled()); } };
      });
    }
    if (this.cancelled) throw new Cancelled();
    this.emit({ t: 'picked', req, pid, i: choice, kind });
    return choice;
  }
  botPick(pid, cands, kind) {
    if (kind === 'capital') { const caps = this.reg.map((r, i) => (r.capital ? i : -1)).filter((i) => i >= 0); const d = caps.length ? this.dist(caps) : null; return best(cands, (i) => (d ? Math.min(d[i], 4) * 2 : 0) + Math.min(this.adj[i].length, 5) * 0.6 + Math.random() * 1.2); }
    if (kind === 'expand') return best(cands, (i) => this.adj[i].filter((j) => this.reg[j].owner === pid).length + this.adj[i].filter((j) => this.reg[j].owner < 0).length * 0.45 + Math.random() * 1.6);
    const sc = this.scores(); const lead = sc.indexOf(Math.max(...sc));
    return best(cands, (i) => { const r = this.reg[i]; let s = r.value / 220 + (r.owner === lead && lead !== pid ? 1.1 : 0) + Math.random() * 1.7; if (r.capital) s = (r.towers === 1 ? 3.2 : r.towers === 2 ? 1.3 : 0.2) + (this.owned(r.owner).length <= 3 ? 0.4 : 1.2) + Math.random() * 1.5; return s; });
  }

  // ---- questions -----------------------------------------------------------------
  botMC(p, q) { const ok = Math.random() < 0.4 + 0.45 * p.skill; const wrong = [0, 1, 2, 3].filter((i) => i !== q.correct); return { choice: ok ? q.correct : pick(wrong), time: +(1.6 + Math.random() * this.cfg.mc * 0.5).toFixed(2) }; }
  botNum(p, q) {
    const a = q.answer; let v;
    if (Math.random() < p.skill * 0.1) v = a;
    else if (q.kind === 'year') { let sd = 62 - 50 * p.skill; if (a < 1500) sd *= 2.6; else if (a < 1800) sd *= 1.5; v = Math.min(2026, Math.round(a + gauss() * sd)); }
    else if (a < 25) v = Math.max(1, Math.round(a + gauss() * (0.8 + a * (0.5 - 0.38 * p.skill))));
    else { v = a * Math.exp(gauss() * (0.52 - 0.4 * p.skill)); const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1)); v = Math.max(1, Math.round(v / mag) * mag); if (Math.random() < 0.5) v = Math.round(v + (Math.random() - 0.5) * mag); }
    return { value: Math.max(1, v), time: +(3 + Math.random() * this.cfg.num * 0.45).toFixed(2) };
  }
  scoutRange(q) { const a = q.answer; if (q.kind === 'year') { const w = 24, lo = a - rnd(w); return [lo, lo + w]; } const f = 0.22 + Math.random() * 0.1; return [Math.max(1, Math.floor(a * (1 - f * (0.5 + Math.random())))), Math.ceil(a * (1 + f * (0.5 + Math.random()))) + 1]; }

  // ids: participants. Every human screen also opens the panel (non-participants bet from the sideline).
  async ask(type, ids, label, roles) {
    const q = type === 'mc' ? this.bank.nextMC() : this.bank.nextNum();
    const req = ++this.req, time = type === 'mc' ? this.cfg.mc : this.cfg.num;
    const pub = { type: q.type, text: q.text, cat: q.cat, catName: q.catName, kind: q.kind, options: q.options };
    const extra = type === 'mc' ? { rm: shuffle([0, 1, 2, 3].filter((i) => i !== q.correct)).slice(0, 2) } : { range: this.scoutRange(q) };
    this.emit({ t: 'ask', req, q: pub, ids, time, label, roles, ...extra });
    const answers = {};
    await new Promise((res, rej) => {
      let done = false;
      const finish = () => { if (done) return; done = true; clearTimeout(to); timers.forEach(clearTimeout); this.pending = null; res(); };
      const to = setTimeout(finish, (time + 1.3) * 1000 + 520);
      const timers = [];
      const give = (pid, v) => {
        if (done || !ids.includes(pid) || answers[pid]) return;
        const tm = Math.max(0.2, Math.min(time, +v.time || time));
        if (type === 'mc') { if (!(Number.isInteger(v.choice) && v.choice >= 0 && v.choice < 4)) return; answers[pid] = { choice: v.choice, time: tm }; }
        else { const n = Math.round(+v.value); if (!(n >= 0 && n < 1e10)) return; answers[pid] = { value: n, time: tm }; }
        this.emit({ t: 'answered', req, pid });
        if (ids.every((i) => answers[i] || this.players[i].gone)) { timers.push(setTimeout(finish, 450)); }
      };
      const botAnswer = (pid) => { const p = this.players[pid]; const v = type === 'mc' ? this.botMC(p, q) : this.botNum(p, q); timers.push(setTimeout(() => give(pid, v), 520 + Math.min(v.time, time - 0.3) * 1000)); };
      this.pending = { req, onInput: (pid, m) => { if (m.a === 'ans' && m.v) give(pid, m.v); }, onBotify: (pid) => { if (ids.includes(pid) && !answers[pid]) botAnswer(pid); }, cancel: () => { done = true; clearTimeout(to); timers.forEach(clearTimeout); rej(new Cancelled()); } };
      for (const id of ids) if (this.players[id].kind === 'bot') botAnswer(id);
    });
    if (this.cancelled) throw new Cancelled();
    let order = null;
    if (type === 'num') order = ids.slice().sort((a, b) => { const A = answers[a], B = answers[b]; if (!A && !B) return 0; if (!A) return 1; if (!B) return -1; return Math.abs(A.value - q.answer) - Math.abs(B.value - q.answer) || A.time - B.time; });
    this.emit({ t: 'reveal', req, type, answers, correct: q.correct, answer: q.answer, order, ids });
    await this.wait(type === 'mc' ? 2450 : 3650);
    return { answers, order, q };
  }

  // ---- match flow ----------------------------------------------------------------
  async run() {
    try {
      this.emit({ t: 'init', players: this.publicPlayers(), mode: this.mode });
      this.pushScores();
      await this.capitals();
      await this.expansion();
      if (this.cfg.division) await this.division();
      await this.battle();
      return this.finish();
    } catch (e) { if (e instanceof Cancelled) return null; throw e; }
  }

  async capitals() {
    await this.banner('b_capitals', 'b_capitals_sub');
    this.emit({ t: 'phase', key: 'phase_capitals' });
    for (const pid of this.order) {
      let cands = this.free().filter((i) => !this.adj[i].some((j) => this.reg[j].capital));
      if (!cands.length) cands = this.free();
      const i = await this.pick(pid, cands, 'capital');
      Object.assign(this.reg[i], { owner: pid, value: 1000, capital: true, towers: 3 }); this.sync(i); this.emit({ t: 'sfx', s: 'claim' }); this.pushScores();
      await this.wait(650);
    }
    this.emit({ t: 'turn', pid: -1 });
  }

  async claim(pid, value = 200) {
    let cands = this.free().filter((i) => this.adj[i].some((j) => this.reg[j].owner === pid));
    if (!cands.length) cands = this.free();
    const i = await this.pick(pid, cands, 'expand');
    Object.assign(this.reg[i], { owner: pid, value }); this.sync(i); this.emit({ t: 'claim', pid, i, v: value }); this.pushScores();
    await this.wait(520);
  }

  async expansion() {
    await this.banner('b_expand', 'b_expand_sub');
    const total = Math.min(this.cfg.expand, Math.ceil(this.free().length / 3));
    for (let r = 0; r < total && this.free().length; r++) {
      this.emit({ t: 'phase', key: 'phase_expand', n: r + 1, of: total }); this.emit({ t: 'turn', pid: -1 });
      const res = await this.ask('num', this.alive().map((p) => p.id), 'closest_wins');
      const o = res.order;
      for (const pid of [o[0], o[1], o[0]]) { if (!this.free().length) break; await this.claim(pid); }
    }
    this.emit({ t: 'turn', pid: -1 });
  }

  // Long campaign: the land left after expansion is divided one territory at a time.
  async division() {
    if (!this.free().length) return;
    await this.banner('b_division', 'b_division_sub');
    let n = 0; const total = this.free().length;
    while (this.free().length) {
      n++; this.emit({ t: 'phase', key: 'phase_division', n, of: total }); this.emit({ t: 'turn', pid: -1 });
      const res = await this.ask('num', this.alive().map((p) => p.id), 'closest_wins');
      await this.claim(res.order[0]);
    }
    this.emit({ t: 'turn', pid: -1 });
  }

  async battle() {
    await this.banner('b_battle', 'b_battle_sub', 1900, 'war');
    const R = this.cfg.rounds;
    for (let r = 0; r < R; r++) {
      if (r === R - 1 && R > 1) await this.banner('b_final', 'b_final_sub', 1500, 'war');
      const ord = this.order.map((_, k) => this.order[(k + r) % this.order.length]);
      for (const pid of ord) {
        if (!this.players[pid].alive) continue;
        if (this.alive().length < 2 || !this.humansAlive()) return;
        this.emit({ t: 'phase', key: 'phase_battle', n: r + 1, of: R });
        await this.attack(pid);
      }
    }
  }

  async attack(a) {
    let cands = this.reg.map((r, i) => (r.owner >= 0 && r.owner !== a && this.adj[i].some((j) => this.reg[j].owner === a) ? i : -1)).filter((i) => i >= 0);
    if (!cands.length) cands = this.reg.map((r, i) => (r.owner >= 0 && r.owner !== a ? i : -1)).filter((i) => i >= 0);
    if (!cands.length) return;
    this.emit({ t: 'turn', pid: a });
    const target = await this.pick(a, cands, 'attack');
    const d = this.reg[target].owner;
    const from = this.adj[target].find((j) => this.reg[j].owner === a) ?? this.owned(a)[0];
    this.emit({ t: 'attack', a, d, i: target, from });
    await this.wait(1050);
    for (;;) {
      const reg = this.reg[target];
      const res = await this.ask('mc', [a, d], reg.capital ? 'siege' : 'region', ['att', 'def']);
      const ok = (p) => res.answers[p] && res.answers[p].choice === res.q.correct;
      let win = null;
      if (ok(a) && ok(d)) {
        await this.banner('tiebreak', 'tiebreak_sub', 1250);
        const r2 = await this.ask('num', [a, d], 'tiebreak');
        if (r2.answers[a] || r2.answers[d]) win = r2.order[0] === a ? 'a' : 'd';
      } else if (ok(a)) win = 'a'; else if (ok(d)) win = 'd';
      if (win === 'a' && reg.capital) {
        reg.towers--; this.sync(target, 0); this.emit({ t: 'duel', a, d, i: target, win, tower: reg.towers });
        if (reg.towers > 0) { await this.wait(1250); continue; }
        await this.wait(700); await this.eliminate(d, a, target); break;
      }
      if (win === 'a') { reg.owner = a; reg.value = Math.max(reg.value, 400); this.sync(target); }
      else if (win === 'd') this.players[d].bonus += 100;
      this.emit({ t: 'duel', a, d, i: target, win, v: reg.value });
      break;
    }
    this.emit({ t: 'attackEnd', i: target });
    this.pushScores(); await this.wait(1300); this.emit({ t: 'turn', pid: -1 });
  }

  async eliminate(d, a, capIdx) {
    const D = this.players[d];
    D.alive = false; this.elim.push(d);
    const cap = this.reg[capIdx]; cap.capital = false; cap.towers = 0; cap.owner = a; this.sync(capIdx);
    this.emit({ t: 'elim', d, a, i: capIdx });
    for (const i of this.owned(d)) { this.reg[i].owner = a; this.sync(i); await this.wait(160); }
    this.pushScores();
    await this.banner('castle_fallen', 'castle_fallen_sub', 2000, 'war', { b: { p: d }, a: { p: a } });
  }

  finish() {
    const sc = this.scores();
    const aliveRank = this.alive().map((p) => p.id).sort((x, y) => sc[y] - sc[x] || (this.players[x].kind === 'bot') - (this.players[y].kind === 'bot'));
    const ranking = [...aliveRank, ...this.elim.slice().reverse()];
    const res = { t: 'end', ranking, scores: sc, players: this.publicPlayers(), mode: this.mode };
    this.emit(res);
    return res;
  }
}
