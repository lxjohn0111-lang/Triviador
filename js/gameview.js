// In-match presentation layer: HUD, banners, and the multiple-choice / number-guess panels.
// Panels are "controllers": the match engine (local or remote) opens them, marks who answered
// and later reveals the result, so the same UI works for solo and online matches.
import { h, sleep, avatar, ICON, fmt } from './dom.js';
import { t } from './i18n.js';
import { audio } from './audio.js';
import { COLORS } from './mapview.js';

export class Cancelled extends Error {}

export class GameView {
  constructor(root) { this.root = root; this.cards = []; this._keys = null; this.panel = null; }

  mount(players, me, onQuit) {
    this.players = players; this.me = me;
    this.hud = h('div', { class: 'hud' },
      h('button', { class: 'icon-btn hud-quit', title: t('leave'), 'aria-label': t('leave'), html: ICON.menu, onclick: () => { audio.play('click'); onQuit(); } }),
      this.cardsEl = h('div', { class: 'pcards' }),
      this.phaseEl = h('div', { class: 'phase-pill hidden' }),
    );
    this.cards = players.map((p) => {
      const c = h('div', { class: 'pcard' + (p.id === me ? ' me' : ''), style: `--c:${COLORS[p.color].base};--cl:${COLORS[p.color].light};--cd:${COLORS[p.color].dark}` },
        avatar(p.emblem, COLORS[p.color]),
        h('div', { class: 'pinfo' }, h('div', { class: 'pname', text: p.name }), h('div', { class: 'pscore', text: '0' })),
        h('div', { class: 'pstatus' }));
      this.cardsEl.appendChild(c); return c;
    });
    this.hintEl = h('div', { class: 'hint-pill hidden' });
    this.tipEl = h('div', { class: 'region-tip hidden' });
    this.timerEl = h('div', { class: 'turn-timer hidden' }, h('i'));
    this.toastEl = h('div', { class: 'game-toast hidden' });
    this.layer = h('div', { class: 'game-layer' }, this.hud, h('div', { class: 'bstack' }, this.toastEl, this.tipEl, this.hintEl, this.timerEl));
    this.root.appendChild(this.layer);
  }
  unmount() { this._unkeys(); if (this.panel) this.panel.abort(); if (this.layer) this.layer.remove(); this.layer = null; document.querySelectorAll('.qpanel-wrap,.banner').forEach((e) => e.remove()); }
  _unkeys() { if (this._keys) { window.removeEventListener('keydown', this._keys); this._keys = null; } }

  setScores(scores) {
    const max = Math.max(...scores), leaders = scores.filter((x) => x === max).length;
    this.cards.forEach((c, i) => {
      const el = c.querySelector('.pscore'), prev = +el.dataset.v || 0, v = scores[i]; el.dataset.v = v;
      if (prev !== v) { const t0 = performance.now(); const step = (now) => { const k = Math.min(1, (now - t0) / 500); el.textContent = fmt(Math.round(prev + (v - prev) * k)); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      c.classList.toggle('lead', v === max && max > 0 && leaders === 1);
    });
  }
  setTurn(pid) { this.cards.forEach((c, i) => c.classList.toggle('turn', i === pid)); }
  setOut(pid) { this.cards[pid].classList.add('out'); }
  setBot(pid) { const p = this.players[pid]; this.cards[pid].querySelector('.pname').textContent = p.name; this.cards[pid].classList.add('botified'); }
  setStatus(pid, s) { const e = this.cards[pid] && this.cards[pid].querySelector('.pstatus'); if (!e) return; e.className = 'pstatus ' + (s || ''); e.innerHTML = s === 'done' ? ICON.check : s === 'think' ? '<i></i><i></i><i></i>' : ''; }
  clearStatus() { this.players.forEach((_, i) => this.setStatus(i, '')); }
  setPhase(text) { this.phaseEl.textContent = text || ''; this.phaseEl.classList.toggle('hidden', !text); }
  hint(text, mine = false) { this.hintEl.textContent = text || ''; this.hintEl.classList.toggle('hidden', !text); this.hintEl.classList.toggle('mine', mine); this.root.classList.toggle('has-hint', !!text); }
  tip(text) { this.tipEl.textContent = text || ''; this.tipEl.classList.toggle('hidden', !text); }
  toast(text) { const e = this.toastEl; e.textContent = text; e.classList.remove('hidden'); clearTimeout(this._toastT); this._toastT = setTimeout(() => e.classList.add('hidden'), 3200); }
  turnTimer(sec) { const e = this.timerEl; if (!sec) { e.classList.add('hidden'); return; } e.classList.remove('hidden'); const i = e.firstChild; i.style.transition = 'none'; i.style.transform = 'scaleX(1)'; void i.offsetWidth; i.style.transition = `transform ${sec}s linear`; i.style.transform = 'scaleX(0)'; }

  async banner(title, sub, ms = 1700, cls = '') {
    document.querySelectorAll('.banner').forEach((e) => e.remove());
    const b = h('div', { class: 'banner ' + cls }, h('div', { class: 'banner-in' }, h('div', { class: 'banner-title', text: title }), sub ? h('div', { class: 'banner-sub', text: sub }) : null));
    this.root.appendChild(b); audio.play('open');
    await sleep(ms); b.classList.add('out'); await sleep(280); b.remove();
  }

  _chip(p, extra = '') { return h('div', { class: 'qchip ' + extra, 'data-pid': p.id, style: `--c:${COLORS[p.color].base};--cd:${COLORS[p.color].dark}` }, avatar(p.emblem, COLORS[p.color], 'sm'), h('span', { class: 'qchip-name', text: p.name }), h('em', { class: 'qchip-state' })); }
  _panel(q, cfg) {
    const ps = cfg.ids.map((id) => this.players[id]);
    const head = h('div', { class: 'qhead' },
      h('span', { class: 'qcat cat-' + q.cat, text: q.catName }),
      h('span', { class: 'qlabel', text: cfg.label || '' }),
      h('span', { class: 'qtime' }, h('b', { text: String(cfg.time) })));
    const duel = h('div', { class: 'qduel' + (ps.length === 2 ? ' two' : '') }, ...ps.map((p, i) => [i > 0 && ps.length === 2 ? h('span', { class: 'vs', html: ICON.swords }) : null, this._chip(p, cfg.roles ? cfg.roles[i] : '')]).flat());
    const bar = h('div', { class: 'qbar' }, h('i'));
    const panel = h('div', { class: 'qpanel ' + q.type }, head, bar, duel, h('div', { class: 'qtext' + (q.text.length > 110 ? ' long' : ''), text: q.text }));
    const wrap = h('div', { class: 'qpanel-wrap' }, panel);
    if (cfg.sideline) panel.appendChild(h('div', { class: 'qside', text: t('sideline') }));
    return { wrap, panel, bar: bar.firstChild, timeEl: head.querySelector('.qtime b'), chips: Object.fromEntries(ps.map((p) => [p.id, duel.querySelector(`[data-pid="${p.id}"]`)])) };
  }
  // Generic controller shared by both question types.
  _controller(ui, cfg, onTimeUp) {
    const ctl = { closed: false, local: null, _res: null };
    ctl.answer = new Promise((r) => (ctl._res = r));
    let raf = 0, lastSec = cfg.time, t0 = 0, started = false;
    const tick = () => {
      if (ctl.closed || ctl.revealing) return;
      const el = (performance.now() - t0) / 1000, left = Math.max(0, cfg.time - el); ui.bar.style.transform = `scaleX(${left / cfg.time})`;
      const sec = Math.ceil(left); if (sec !== lastSec) { lastSec = sec; ui.timeEl.textContent = sec; if (sec <= 5 && sec > 0) { audio.play(sec <= 3 ? 'urgent' : 'tick'); ui.panel.classList.add('hurry'); } }
      if (left <= 0) { onTimeUp(); return; }
      raf = requestAnimationFrame(tick);
    };
    ctl.elapsed = () => (started ? (performance.now() - t0) / 1000 : 0);
    ctl.start = () => { started = true; t0 = performance.now(); raf = requestAnimationFrame(tick); };
    ctl.stopTimer = () => cancelAnimationFrame(raf);
    ctl.answered = (pid) => { const c = ui.chips[pid]; if (c) c.classList.add('done'); if (pid !== this.me || !cfg.sideline) this.setStatus(pid, 'done'); if (pid !== this.me) audio.play('pop'); };
    ctl.give = (v) => { if (ctl.local) return; ctl.local = v; ctl._res(v); };
    ctl.close = async () => { if (ctl.closed) return; ctl.closed = true; cancelAnimationFrame(raf); this._unkeys(); ctl._res(ctl.local); ui.wrap.classList.add('out'); await sleep(240); ui.wrap.remove(); this.clearStatus(); if (this.panel === ctl) this.panel = null; };
    ctl.abort = () => { if (ctl.closed) return; ctl.closed = true; cancelAnimationFrame(raf); this._unkeys(); ctl._res(ctl.local); ui.wrap.remove(); if (this.panel === ctl) this.panel = null; };
    for (const id of cfg.ids) if (id !== this.me) this.setStatus(id, 'think');
    this.panel = ctl;
    return ctl;
  }

  // cfg: {ids, time, label, roles, sideline, canAnswer, half}
  openMC(q, cfg) {
    if (this.panel) this.panel.abort();
    const ui = this._panel(q, cfg); let usedHalf = false;
    const letters = ['A', 'B', 'C', 'D'];
    const grid = h('div', { class: 'qopts' + (q.options.some((o) => o.length > 30) ? ' wide' : '') });
    const btns = q.options.map((o, i) => { const b = h('button', { class: 'qopt', disabled: true }, h('span', { class: 'ql', text: letters[i] }), h('span', { class: 'qo', text: o }), h('span', { class: 'qmarks' })); grid.appendChild(b); return b; });
    ui.panel.appendChild(grid);
    let halfBtn = null;
    if (cfg.canAnswer && !cfg.sideline) { halfBtn = h('button', { class: 'booster', disabled: !(cfg.half > 0), html: `${ICON.half}<span>${t('booster_half')}</span><b>${cfg.half}</b>` }); ui.panel.appendChild(h('div', { class: 'qfoot' }, halfBtn)); }
    const lock = () => { btns.forEach((b) => (b.disabled = true)); if (halfBtn) halfBtn.disabled = true; this._unkeys(); };
    const ctl = this._controller(ui, cfg, lock);
    ctl.usedHalf = () => usedHalf;
    this.root.appendChild(ui.wrap); audio.play('open');
    const choose = (i) => { if (ctl.local || btns[i].disabled) return; ctl.give({ choice: i, time: +ctl.elapsed().toFixed(2) }); lock(); btns[i].classList.add('mine'); audio.play('select'); ctl.answered(this.me); };
    setTimeout(() => {
      if (ctl.closed) return; ctl.start();
      if (!cfg.canAnswer) return;
      btns.forEach((b, i) => { b.disabled = false; b.addEventListener('click', () => choose(i)); });
      this._keys = (e) => { const k = e.key.toLowerCase(); const i = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'abcd'.indexOf(k); if (i >= 0 && k.length === 1) choose(i); };
      window.addEventListener('keydown', this._keys);
      if (halfBtn) halfBtn.addEventListener('click', () => { if (usedHalf || ctl.local || !cfg.rm) return; usedHalf = true; halfBtn.disabled = true; audio.play('pop'); cfg.rm.forEach((i) => { btns[i].disabled = true; btns[i].classList.add('gone'); }); });
    }, 520);
    // answers: {pid:{choice}}, correct index
    ctl.reveal = async (answers, correct, ms = 2100) => {
      if (ctl.closed) return; ctl.revealing = true; ctl.stopTimer(); lock();
      btns[correct].classList.add('right');
      const shown = [...cfg.ids]; if (cfg.sideline && ctl.local) shown.push(this.me);
      for (const id of shown) {
        const a = id === this.me && cfg.sideline ? ctl.local : answers[id]; const p = this.players[id];
        if (a && btns[a.choice]) { if (a.choice !== correct) btns[a.choice].classList.add('wrong'); btns[a.choice].querySelector('.qmarks').appendChild(avatar(p.emblem, COLORS[p.color], 'xs')); }
        if (ui.chips[id]) ui.chips[id].classList.add(a && a.choice === correct ? 'ok' : 'bad');
      }
      const mine = cfg.sideline ? ctl.local : answers[this.me];
      if (cfg.canAnswer) audio.play(mine && mine.choice === correct ? 'correct' : 'wrong'); else audio.play('pop');
      await sleep(ms); await ctl.close();
    };
    return ctl;
  }

  openNum(q, cfg) {
    if (this.panel) this.panel.abort();
    const ui = this._panel(q, cfg); let usedScout = false; let value = '';
    const disp = h('div', { class: 'ndisp empty', text: t('enter_number') });
    const keys = h('div', { class: 'npad' });
    const okBtn = h('button', { class: 'nkey ok', disabled: true, 'aria-label': 'OK', html: ICON.check });
    let locked = !cfg.canAnswer;
    const refresh = () => { disp.textContent = value ? fmt(+value) : t('enter_number'); disp.classList.toggle('empty', !value); okBtn.disabled = !value || locked; };
    const lock = () => { locked = true; keys.classList.add('locked'); okBtn.disabled = true; this._unkeys(); };
    const ctl = this._controller(ui, cfg, () => { if (!ctl.local && value && cfg.canAnswer) ctl.give({ value: +value, time: cfg.time }); lock(); });
    const submit = () => { if (!value || ctl.local || locked) return; ctl.give({ value: +value, time: +ctl.elapsed().toFixed(2) }); audio.play('select'); lock(); disp.classList.add('locked'); ctl.answered(this.me); };
    const press = (k) => { if (locked) return; if (k === 'back') value = value.slice(0, -1); else if (k === 'ok') return submit(); else if (value.length < 9 && !(value === '' && k === '0')) value += k; audio.play('click'); refresh(); };
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0'].forEach((k) => keys.appendChild(h('button', { class: 'nkey' + (k === 'back' ? ' back' : ''), 'aria-label': k === 'back' ? 'Delete' : k, html: k === 'back' ? ICON.back : k, onclick: () => press(k) })));
    okBtn.addEventListener('click', () => press('ok')); keys.appendChild(okBtn);
    let scoutBtn = null; const scoutOut = h('div', { class: 'scout-out' });
    const body = h('div', { class: 'nbody' }, h('div', { class: 'nleft' }, disp, scoutOut), keys);
    ui.panel.appendChild(body);
    if (cfg.canAnswer && !cfg.sideline) { scoutBtn = h('button', { class: 'booster', disabled: !(cfg.scout > 0), html: `${ICON.scout}<span>${t('booster_scout')}</span><b>${cfg.scout}</b>` }); ui.panel.appendChild(h('div', { class: 'qfoot' }, scoutBtn)); }
    if (!cfg.canAnswer) keys.classList.add('locked');
    ctl.usedScout = () => usedScout;
    this.root.appendChild(ui.wrap); audio.play('open');
    setTimeout(() => {
      if (ctl.closed) return; ctl.start();
      if (!cfg.canAnswer) return;
      this._keys = (e) => { if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') { e.preventDefault(); press('back'); } else if (e.key === 'Enter') press('ok'); };
      window.addEventListener('keydown', this._keys);
      if (scoutBtn) scoutBtn.addEventListener('click', () => { if (usedScout || ctl.local || !cfg.range) return; usedScout = true; scoutBtn.disabled = true; audio.play('pop'); const [lo, hi] = cfg.range; scoutOut.textContent = t('scout_range', { a: q.kind === 'year' ? lo : fmt(lo), b: q.kind === 'year' ? hi : fmt(hi) }); scoutOut.classList.add('show'); });
    }, 520);
    // answers {pid:{value,time}}, order [pid...] (closest first), answer
    ctl.reveal = async (answers, order, answer, ms = 3300) => {
      if (ctl.closed) return; ctl.revealing = true; ctl.stopTimer(); lock();
      if (!ctl.local && value && cfg.canAnswer) ctl.give({ value: +value, time: cfg.time });
      const yr = q.kind === 'year'; const f = (n) => (yr ? String(n) : fmt(n));
      const all = { ...answers }; let shown = order;
      if (cfg.sideline && ctl.local) { all[this.me] = ctl.local; shown = [...order, this.me].sort((a, b) => { const A = all[a], B = all[b]; if (!A) return 1; if (!B) return -1; return Math.abs(A.value - answer) - Math.abs(B.value - answer) || A.time - B.time; }); }
      const rows = shown.map((id) => { const a = all[id], p = this.players[id]; const pos = order.indexOf(id); return h('div', { class: 'nrow' + (pos === 0 ? ' win' : '') + (pos < 0 ? ' side' : ''), style: `--c:${COLORS[p.color].base}` }, h('span', { class: 'npos', text: pos >= 0 ? String(pos + 1) : '•' }), avatar(p.emblem, COLORS[p.color], 'sm'), h('span', { class: 'nname', text: p.name }), h('span', { class: 'nval', text: a ? f(a.value) : '—' }), h('span', { class: 'ndiff', text: a ? (a.value === answer ? '✓' : (a.value > answer ? '+' : '−') + f(Math.abs(a.value - answer))) : '' }), h('span', { class: 'ntime', text: a ? (+a.time).toFixed(1) + 's' : '' })); });
      const res = h('div', { class: 'nresult' }, h('div', { class: 'nanswer' }, h('small', { text: t('correct_answer') }), h('b', { text: f(answer) })), h('div', { class: 'nrows' }, ...rows));
      body.replaceWith(res); const foot = ui.panel.querySelector('.qfoot'); if (foot) foot.remove();
      audio.play(cfg.ids.includes(this.me) ? (order[0] === this.me ? 'correct' : 'wrong') : 'pop');
      await sleep(ms); await ctl.close();
    };
    return ctl;
  }

  confirm(text, yes, no) {
    return new Promise((res) => {
      const close = (v) => { m.remove(); res(v); };
      const m = h('div', { class: 'modal-wrap top' }, h('div', { class: 'modal small' }, h('p', { class: 'confirm-text', text }), h('div', { class: 'row' }, h('button', { class: 'btn ghost', text: no, onclick: () => { audio.play('click'); close(false); } }), h('button', { class: 'btn danger', text: yes, onclick: () => { audio.play('click'); close(true); } }))));
      document.getElementById('app').appendChild(m);
    });
  }
}
