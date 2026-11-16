// Turns engine events into what one player sees and hears, and sends that player's
// picks and answers back (directly to a local engine, or over the network to the host).
import { t } from './i18n.js';
import { audio } from './audio.js';
import { COLORS } from './mapview.js';
import { sleep } from './dom.js';

export class Presenter {
  // me: this screen's player id; send(msg): deliver {req,a,v} to the engine; profile: local store profile
  constructor({ view, mapView, me, send, profile, online }) {
    this.view = view; this.mv = mapView; this.me = me; this.send = send; this.profile = profile; this.online = !!online;
    this.players = []; this.panel = null; this.ask = null; this.pickReq = 0; this.arrowOff = null; this.done = null;
    this.stats = { mcRight: 0, mcTotal: 0, numWins: 0, numTotal: 0, captures: 0, defends: 0, capitals: 0, sideline: 0, halfUsed: 0, scoutUsed: 0 };
    this.result = new Promise((r) => (this.done = r));
    this.mv.onHover = (i) => { if (i < 0) return this.view.tip(''); const o = this.mv.state[i].owner; this.view.tip(this.mv.name(i) + (o >= 0 ? ` · ${this.players[o].name} · ${this.mv.state[i].value}` : '')); };
    this.mv.onInfo = (i) => { this.mv.onHover(i); clearTimeout(this._tipT); this._tipT = setTimeout(() => this.view.tip(''), 1800); };
  }
  name(pid) { return this.players[pid] ? this.players[pid].name : '?'; }
  // vars may reference players {p:id} or regions {r:i}; resolve them for this screen's language
  vars(v) { const o = {}; for (const k in v || {}) { const x = v[k]; o[k] = x && typeof x === 'object' ? (x.p != null ? this.name(x.p) : x.r != null ? this.mv.name(x.r) : '') : x; } return o; }
  amAlive() { return this.players[this.me] && this.players[this.me].alive; }
  abort(reason) { if (this.ended) return; if (this.panel) this.panel.abort(); this.mv.clearSelectable(); this.done({ aborted: true, reason }); }

  apply(e) {
    const v = this.view, mv = this.mv;
    switch (e.t) {
      case 'init': this.players = e.players.map((p) => ({ ...p })); this.mode = e.mode; break;
      case 'banner': v.banner(t(e.key, this.vars(e.vars)), e.sub ? t(e.sub, this.vars(e.vars)) : '', e.ms, e.cls); break;
      case 'phase': v.setPhase(e.n ? `${t(e.key)} ${e.n}/${e.of}` : t(e.key)); this.mv.layoutTokens(); break;
      case 'turn': v.setTurn(e.pid); break;
      case 'scores': v.setScores(e.s); break;
      case 'sfx': audio.play(e.s); break;
      case 'reg': mv.setRegion(e.i, { owner: e.o, color: e.o >= 0 ? this.players[e.o].color : -1, value: e.v, capital: !!e.c, towers: e.w }, !!e.fx); break;
      case 'claim': audio.play('claim'); mv.float(e.i, '+' + e.v, COLORS[this.players[e.pid].color].light); break;
      case 'botify': this.players[e.pid].name = e.name; this.players[e.pid].kind = 'bot'; v.setBot(e.pid); v.toast(t('mp_player_left', { name: e.name.replace(/ \(bot\)$/, '') })); break;
      case 'pick': this.onPick(e); break;
      case 'picked':
        if (e.req === this.pickReq) { mv.clearSelectable(); v.turnTimer(0); this.pickReq = 0; }
        v.hint(''); break;
      case 'ask': this.onAsk(e); break;
      case 'answered': if (this.panel && this.ask && this.ask.req === e.req) this.panel.answered(e.pid); break;
      case 'reveal': this.onReveal(e); break;
      case 'attack': {
        const A = this.players[e.a];
        if (this.arrowOff) this.arrowOff();
        this.arrowOff = mv.arrow(e.from, e.i, COLORS[A.color].base); mv.mark(e.i, 'target'); audio.play('attack');
        v.setTurn(e.a); v.hint(t('attack_title', { a: A.name, b: this.name(e.d), r: mv.name(e.i) }), e.a === this.me || e.d === this.me);
        this.attackRegion = e.i; break;
      }
      case 'duel': this.onDuel(e); break;
      case 'attackEnd': if (this.arrowOff) { this.arrowOff(); this.arrowOff = null; } mv.clearMarks('target'); setTimeout(() => v.hint(''), 1250); break;
      case 'elim': {
        this.players[e.d].alive = false; v.setOut(e.d); audio.play('crumble'); audio.play('horn');
        if (e.a === this.me) { this.stats.capitals++; this.stats.captures++; }
        break;
      }
      case 'end': this.ended = true; this.onEnd(e); break;
      case 'abort': this.abort(e.reason || 'host'); break;
      default: break;
    }
  }

  onPick(e) {
    const v = this.view;
    v.setTurn(e.pid);
    if (e.pid === this.me) {
      this.pickReq = e.req;
      v.hint(t('hint_' + e.kind), true); v.turnTimer(e.time); audio.play('horn');
      this.mv.setSelectable(e.cands, (i) => { this.send({ req: e.req, a: 'pick', v: i }); v.turnTimer(0); }, e.kind);
    } else {
      v.hint(t(e.kind === 'attack' ? 'hint_attack_wait' : 'hint_wait', { name: this.name(e.pid) }));
    }
  }

  onAsk(e) {
    const p = this.profile, me = this.me;
    const inIt = e.ids.includes(me), side = !inIt && this.amAlive();
    const label = e.label === 'closest_wins' || e.label === 'tiebreak' ? t(e.label) : e.label === 'siege' ? t('siege', { n: this.mv.state[this.attackRegion] ? this.mv.state[this.attackRegion].towers : 3 }) : e.label === 'region' ? this.mv.name(this.attackRegion) : '';
    const cfg = { ids: e.ids, time: e.time, label, roles: e.roles, sideline: side, canAnswer: inIt || side, half: p.boosters.half, scout: p.boosters.scout, rm: e.rm, range: e.range };
    this.ask = e;
    const ctl = e.q.type === 'mc' ? this.view.openMC(e.q, cfg) : this.view.openNum(e.q, cfg);
    this.panel = ctl;
    ctl.answer.then((ans) => { if (ans && inIt && !ctl.revealing) this.send({ req: e.req, a: 'ans', v: ans }); });
  }

  async onReveal(e) {
    const ctl = this.panel, ask = this.ask; if (!ctl || !ask || ask.req !== e.req) return;
    const me = this.me, inIt = e.ids.includes(me), p = this.profile;
    if (e.type === 'mc' && ctl.usedHalf()) { p.boosters.half = Math.max(0, p.boosters.half - 1); this.stats.halfUsed++; }
    if (e.type === 'num' && ctl.usedScout()) { p.boosters.scout = Math.max(0, p.boosters.scout - 1); this.stats.scoutUsed++; }
    if (e.type === 'mc') {
      const mine = inIt ? e.answers[me] : ctl.local;
      const ok = mine && mine.choice === e.correct;
      if (inIt) { this.stats.mcTotal++; if (ok) this.stats.mcRight++; } else if (ok) this.stats.sideline++;
      await ctl.reveal(e.answers, e.correct);
    } else {
      if (inIt) { this.stats.numTotal++; if (e.order[0] === me && e.answers[me]) this.stats.numWins++; }
      else if (ctl.local) { const d0 = Math.abs(ctl.local.value - e.answer); if (e.ids.every((i) => !e.answers[i] || Math.abs(e.answers[i].value - e.answer) >= d0)) this.stats.sideline++; }
      await ctl.reveal(e.answers, e.order, e.answer);
    }
    if (this.panel === ctl) this.panel = null;
  }

  onDuel(e) {
    const v = this.view, mv = this.mv, A = this.players[e.a], D = this.players[e.d];
    const mine = e.a === this.me || e.d === this.me;
    if (e.win === 'a' && e.tower != null) {
      mv.shake(e.i); audio.play('crumble'); mv.float(e.i, t('tower_down'), '#ffd9a8');
      if (e.tower > 0) v.hint(t('siege_on', { a: A.name, n: e.tower }), mine);
    } else if (e.win === 'a') {
      audio.play('claim'); mv.float(e.i, '+' + e.v, COLORS[A.color].light);
      v.hint(t('res_captured', { a: A.name, r: mv.name(e.i) }), e.a === this.me);
      if (e.a === this.me) this.stats.captures++;
    } else if (e.win === 'd') {
      audio.play('shield'); mv.float(e.i, '+100', COLORS[D.color].light); mv.shake(e.i);
      v.hint(t('res_defended', { b: D.name, r: mv.name(e.i) }), e.d === this.me);
      if (e.d === this.me) this.stats.defends++;
    } else { v.hint(t('res_nobody')); audio.play('wrong'); }
  }

  async onEnd(e) {
    await sleep(400);
    this.mv.clearSelectable();
    const me = this.me;
    this.done({ ranking: e.ranking, place: e.ranking.indexOf(me) + 1, scores: e.scores, myScore: e.scores[me], players: e.players, me, stats: this.stats, mode: e.mode, eliminated: !e.players[me].alive, online: this.online });
  }
}
