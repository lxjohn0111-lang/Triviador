// Match engine: capitals -> expansion (closest guess picks land) -> battle (duels, sieges) -> results.
import { t } from './i18n.js';
import { audio } from './audio.js';
import { COLORS } from './mapview.js';
import { Cancelled } from './gameview.js';

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
const best = (list, score) => { let b = null, bs = -Infinity; for (const x of list) { const s = score(x); if (s > bs) { bs = s; b = x; } } return b; };

export const BOT_NAMES = ['Sir Quizalot', 'Lady Lore', 'Baron Brainiac', 'Duke Datum', 'Countess Clue', 'Captain Fact', 'Professor Riddle', 'Madame Atlas', 'Lord Ledger', 'Dame Trivia', 'Marshal Mind', 'Queen Query', 'Count Cortex', 'Abbot Almanac', 'Major Memory', 'Lady Logic'];
export const MODES = { classic: { mc: 16, num: 22, pick: 20, rounds: 4 }, blitz: { mc: 10, num: 15, pick: 12, rounds: 2 } };
const COLOR_GROUP = [0, 1, 2, 3, 1, 1, 0, 4];
const BOT_COLOR_ORDER = [1, 3, 0, 2, 6, 4, 5, 7];

export class Game {
  constructor({ map, mapView, view, bank, mode, profile, skill }) {
    this.map = map; this.mv = mapView; this.view = view; this.bank = bank; this.cfg = MODES[mode] || MODES.classic; this.mode = mode; this.profile = profile;
    const names = shuffle(BOT_NAMES).slice(0, 2); const used = [COLOR_GROUP[profile.color]]; const botColors = [];
    for (const c of BOT_COLOR_ORDER) { if (botColors.length < 2 && !used.includes(COLOR_GROUP[c])) { botColors.push(c); used.push(COLOR_GROUP[c]); } }
    const emb = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((e) => e !== profile.emblem));
    this.players = [
      { id: 0, name: profile.name || t('you'), color: profile.color, emblem: profile.emblem, human: true, alive: true, bonus: 0, skill: 1 },
      { id: 1, name: names[0], color: botColors[0], emblem: emb[0], human: false, alive: true, bonus: 0, skill: Math.max(0.05, Math.min(0.95, skill + (Math.random() - 0.5) * 0.16)) },
      { id: 2, name: names[1], color: botColors[1], emblem: emb[1], human: false, alive: true, bonus: 0, skill: Math.max(0.05, Math.min(0.95, skill + (Math.random() - 0.5) * 0.16)) },
    ];
    this.reg = map.regions.map(() => ({ owner: -1, value: 0, capital: false, towers: 0 }));
    this.adj = mapView.adj; this.order = shuffle([0, 1, 2]); this.elim = [];
    this.stats = { mcRight: 0, mcTotal: 0, numWins: 0, numTotal: 0, captures: 0, defends: 0, capitals: 0, sideline: 0, halfUsed: 0, scoutUsed: 0 };
    mapView.onHover = (i) => { if (i < 0) return view.tip(''); const r = this.reg[i]; view.tip(mapView.name(i) + (r.owner >= 0 ? ` · ${this.players[r.owner].name} · ${r.value}` : '')); };
    mapView.onInfo = (i) => { mapView.onHover(i); clearTimeout(this._tipT); this._tipT = setTimeout(() => view.tip(''), 1800); };
  }

  score(pid) { let s = this.players[pid].bonus; for (const r of this.reg) if (r.owner === pid) s += r.value; return s; }
  scores() { return this.players.map((p) => this.score(p.id)); }
  sync(i, fx = true) { const r = this.reg[i]; this.mv.setRegion(i, { owner: r.owner, color: r.owner >= 0 ? this.players[r.owner].color : -1, value: r.value, capital: r.capital, towers: r.towers }, fx); }
  refresh() { this.view.setScores(this.scores()); }
  owned(pid) { return this.reg.map((r, i) => (r.owner === pid ? i : -1)).filter((i) => i >= 0); }
  free() { return this.reg.map((r, i) => (r.owner < 0 ? i : -1)).filter((i) => i >= 0); }
  dist(from) { const d = this.reg.map(() => 99); const q = [...from]; from.forEach((i) => (d[i] = 0)); while (q.length) { const x = q.shift(); for (const y of this.adj[x]) if (d[y] > d[x] + 1) { d[y] = d[x] + 1; q.push(y); } } return d; }
  alive() { return this.players.filter((p) => p.alive); }

  async pick(pid, cands, kind) {
    const p = this.players[pid], v = this.view; v.setTurn(pid);
    let choice;
    if (p.human) {
      v.hint(t('hint_' + kind), true); v.turnTimer(this.cfg.pick); audio.play('horn');
      choice = await new Promise((res, rej) => {
        const to = setTimeout(() => { this.mv.clearSelectable(); res(pick(cands)); }, this.cfg.pick * 1000);
        v._cancelFn = () => { clearTimeout(to); this.mv.clearSelectable(); rej(new Cancelled()); };
        this.mv.setSelectable(cands, (i) => { clearTimeout(to); res(i); }, kind);
      });
      v._cancelFn = null; v.turnTimer(0);
    } else {
      v.hint(t(kind === 'attack' ? 'hint_attack_wait' : 'hint_wait', { name: p.name }));
      await v.wait(850 + Math.random() * 800);
      choice = this.botPick(pid, cands, kind);
    }
    v.hint('');
    return choice;
  }
  botPick(pid, cands, kind) {
    if (kind === 'capital') { const caps = this.reg.map((r, i) => (r.capital ? i : -1)).filter((i) => i >= 0); const d = caps.length ? this.dist(caps) : null; return best(cands, (i) => (d ? Math.min(d[i], 4) * 2 : 0) + Math.min(this.adj[i].length, 5) * 0.6 + Math.random() * 1.2); }
    if (kind === 'expand') return best(cands, (i) => this.adj[i].filter((j) => this.reg[j].owner === pid).length + this.adj[i].filter((j) => this.reg[j].owner < 0).length * 0.45 + Math.random() * 1.6);
    const sc = this.scores(); const lead = sc.indexOf(Math.max(...sc));
    return best(cands, (i) => { const r = this.reg[i]; let s = r.value / 220 + (r.owner === lead && lead !== pid ? 1.1 : 0) + Math.random() * 1.7; if (r.capital) s = (r.towers === 1 ? 3.2 : r.towers === 2 ? 1.3 : 0.2) + (this.owned(r.owner).length <= 3 ? 0.4 : 1.2) + Math.random() * 1.5; return s; });
  }
  botMC(pid, q) { const p = this.players[pid]; const ok = Math.random() < 0.4 + 0.45 * p.skill; const wrong = [0, 1, 2, 3].filter((i) => i !== q.correct); return { choice: ok ? q.correct : pick(wrong), time: 1.6 + Math.random() * this.cfg.mc * 0.5 }; }
  botNum(pid, q) {
    const p = this.players[pid], a = q.answer; let v;
    if (Math.random() < p.skill * 0.1) v = a;
    else if (q.kind === 'year') { let sd = 62 - 50 * p.skill; if (a < 1500) sd *= 2.6; else if (a < 1800) sd *= 1.5; v = Math.min(2026, Math.round(a + gauss() * sd)); }
    else if (a < 25) v = Math.max(1, Math.round(a + gauss() * (0.8 + a * (0.5 - 0.38 * p.skill))));
    else { v = a * Math.exp(gauss() * (0.52 - 0.4 * p.skill)); const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1)); v = Math.max(1, Math.round(v / mag) * mag); if (Math.random() < 0.5) v = Math.round(v + (Math.random() - 0.5) * mag); }
    return { value: Math.max(1, v), time: 3 + Math.random() * this.cfg.num * 0.45 };
  }

  async askNum(q, ids, label) {
    const human = this.players[0]; const inIt = ids.includes(0); const side = !inIt && human.alive;
    const bots = {}; ids.filter((i) => i !== 0).forEach((i) => (bots[i] = this.botNum(i, q)));
    const res = await this.view.askNum(q, { participants: ids, human: inIt || side ? 0 : -1, sideline: side, bots, time: this.cfg.num, scout: this.profile.boosters.scout, label });
    if (res.usedScout) { this.profile.boosters.scout = Math.max(0, this.profile.boosters.scout - 1); this.stats.scoutUsed++; }
    if (inIt) { this.stats.numTotal++; if (res.order[0] === 0 && res.answers[0]) this.stats.numWins++; }
    else if (side && res.answers[0]) { const d0 = Math.abs(res.answers[0].value - q.answer); if (ids.every((i) => !res.answers[i] || Math.abs(res.answers[i].value - q.answer) >= d0)) this.stats.sideline++; }
    return res;
  }
  async askMC(q, ids, roles, label) {
    const human = this.players[0]; const inIt = ids.includes(0); const side = !inIt && human.alive;
    const bots = {}; ids.filter((i) => i !== 0).forEach((i) => (bots[i] = this.botMC(i, q)));
    const res = await this.view.askMC(q, { participants: ids, human: inIt || side ? 0 : -1, sideline: side, bots, time: this.cfg.mc, half: this.profile.boosters.half, roles, label });
    if (res.usedHalf) { this.profile.boosters.half = Math.max(0, this.profile.boosters.half - 1); this.stats.halfUsed++; }
    const ok = res.answers[0] && res.answers[0].choice === q.correct;
    if (inIt) { this.stats.mcTotal++; if (ok) this.stats.mcRight++; } else if (side && ok) this.stats.sideline++;
    return res;
  }

  async run() {
    try {
      this.refresh();
      await this.capitals();
      await this.expansion();
      await this.battle();
      return this.finish();
    } catch (e) { if (e instanceof Cancelled) return null; throw e; }
  }

  async capitals() {
    const v = this.view; await v.banner(t('b_capitals'), t('b_capitals_sub'));
    v.setPhase(t('phase_capitals'));
    for (const pid of this.order) {
      let cands = this.free().filter((i) => !this.adj[i].some((j) => this.reg[j].capital));
      if (!cands.length) cands = this.free();
      const i = await this.pick(pid, cands, 'capital');
      Object.assign(this.reg[i], { owner: pid, value: 1000, capital: true, towers: 3 }); this.sync(i); audio.play('claim'); this.refresh();
      await v.wait(650);
    }
    v.setTurn(-1);
  }

  async expansion() {
    const v = this.view; await v.banner(t('b_expand'), t('b_expand_sub'));
    const rounds = Math.ceil(this.free().length / 3);
    for (let r = 0; r < rounds && this.free().length; r++) {
      v.setPhase(`${t('phase_expand')} ${r + 1}/${rounds}`); v.setTurn(-1);
      const q = this.bank.nextNum();
      const res = await this.askNum(q, [0, 1, 2], t('closest_wins'));
      const o = res.order; const seq = [o[0], o[1], o[0]];
      for (const pid of seq) {
        if (!this.free().length) break;
        let cands = this.free().filter((i) => this.adj[i].some((j) => this.reg[j].owner === pid));
        if (!cands.length) cands = this.free();
        const i = await this.pick(pid, cands, 'expand');
        Object.assign(this.reg[i], { owner: pid, value: 200 }); this.sync(i); audio.play('claim'); this.mv.float(i, '+200', COLORS[this.players[pid].color].light); this.refresh();
        await v.wait(520);
      }
    }
    v.setTurn(-1);
  }

  async battle() {
    const v = this.view; await v.banner(t('b_battle'), t('b_battle_sub'), 1900, 'war');
    const R = this.cfg.rounds;
    for (let r = 0; r < R; r++) {
      if (r === R - 1 && R > 1) await v.banner(t('b_final'), t('b_final_sub'), 1500, 'war');
      const ord = this.order.map((_, k) => this.order[(k + r) % 3]);
      for (const pid of ord) {
        if (!this.players[pid].alive) continue;
        if (this.alive().length < 2 || !this.players[0].alive) return;
        v.setPhase(`${t('phase_battle')} ${r + 1}/${R}`);
        await this.attack(pid);
      }
    }
  }

  async attack(a) {
    const v = this.view, A = this.players[a];
    let cands = this.reg.map((r, i) => (r.owner >= 0 && r.owner !== a && this.adj[i].some((j) => this.reg[j].owner === a) ? i : -1)).filter((i) => i >= 0);
    if (!cands.length) cands = this.reg.map((r, i) => (r.owner >= 0 && r.owner !== a ? i : -1)).filter((i) => i >= 0);
    if (!cands.length) return;
    const target = await this.pick(a, cands, 'attack');
    const d = this.reg[target].owner, D = this.players[d];
    const from = this.adj[target].find((j) => this.reg[j].owner === a) ?? this.owned(a)[0];
    const removeArrow = this.mv.arrow(from, target, COLORS[A.color].base); this.mv.mark(target, 'target'); audio.play('attack');
    v.setTurn(a); v.hint(t('attack_title', { a: A.name, b: D.name, r: this.mv.name(target) }), a === 0 || d === 0);
    await v.wait(1050);
    try {
      for (;;) {
        const reg = this.reg[target];
        const q = this.bank.nextMC();
        const label = reg.capital ? t('siege', { n: reg.towers }) : this.mv.name(target);
        const res = await this.askMC(q, [a, d], ['att', 'def'], label);
        const aOK = res.answers[a] && res.answers[a].choice === q.correct, dOK = res.answers[d] && res.answers[d].choice === q.correct;
        let win = null;
        if (aOK && dOK) {
          await v.banner(t('tiebreak'), t('tiebreak_sub'), 1250);
          const q2 = this.bank.nextNum(); const r2 = await this.askNum(q2, [a, d], t('tiebreak'));
          if (r2.answers[a] || r2.answers[d]) win = r2.order[0] === a ? 'a' : 'd';
        } else if (aOK) win = 'a'; else if (dOK) win = 'd';
        if (win === 'a') {
          if (reg.capital) {
            reg.towers--; this.sync(target, false); this.mv.shake(target); audio.play('crumble'); this.mv.float(target, t('tower_down'), '#ffd9a8');
            if (reg.towers > 0) { v.hint(t('siege_on', { a: A.name, n: reg.towers }), a === 0 || d === 0); await v.wait(1250); continue; }
            await v.wait(700); await this.eliminate(d, a, target);
          } else {
            reg.owner = a; reg.value = Math.max(reg.value, 400); this.sync(target); audio.play('claim'); this.mv.float(target, '+' + reg.value, COLORS[A.color].light);
            v.hint(t('res_captured', { a: A.name, r: this.mv.name(target) }), a === 0);
            if (a === 0) this.stats.captures++;
          }
        } else if (win === 'd') {
          D.bonus += 100; audio.play('shield'); this.mv.float(target, '+100', COLORS[D.color].light); this.mv.shake(target);
          v.hint(t('res_defended', { b: D.name, r: this.mv.name(target) }), d === 0);
          if (d === 0) this.stats.defends++;
        } else { v.hint(t('res_nobody')); audio.play('wrong'); }
        break;
      }
    } finally { removeArrow(); this.mv.clearMarks('target'); }
    this.refresh(); await v.wait(1300); v.hint(''); v.setTurn(-1);
  }

  async eliminate(d, a, capIdx) {
    const v = this.view, D = this.players[d], A = this.players[a];
    audio.play('crumble'); audio.play('horn');
    D.alive = false; this.elim.push(d); v.setOut(d);
    const cap = this.reg[capIdx]; cap.capital = false; cap.towers = 0; cap.owner = a; this.sync(capIdx);
    if (a === 0) { this.stats.capitals++; this.stats.captures++; }
    for (const i of this.owned(d)) { this.reg[i].owner = a; this.sync(i); audio.play('claim'); await v.wait(160); }
    this.refresh();
    await v.banner(t('castle_fallen', { b: D.name }), t('castle_fallen_sub', { a: A.name }), 2000, 'war');
  }

  finish() {
    const sc = this.scores();
    const aliveRank = this.alive().map((p) => p.id).sort((x, y) => sc[y] - sc[x] || (x === 0 ? -1 : 1));
    const ranking = [...aliveRank, ...this.elim.slice().reverse()];
    return { ranking, place: ranking.indexOf(0) + 1, scores: sc, players: this.players, stats: this.stats, mode: this.mode, eliminated: !this.players[0].alive };
  }
}
