// In-match presentation layer: HUD, banners, multiple-choice and number-guess panels.
import { h, sleep, avatar, ICON, fmt } from './dom.js';
import { t } from './i18n.js';
import { audio } from './audio.js';
import { COLORS } from './mapview.js';

export class Cancelled extends Error {}

export class GameView {
  constructor(root) { this.root = root; this.cancelled = false; this.cards = []; this._keys = null; }

  mount(players, onQuit) {
    this.players = players; this.cancelled = false;
    this.hud = h('div', { class: 'hud' },
      h('button', { class: 'icon-btn hud-quit', title: t('leave'), html: ICON.menu, onclick: () => { audio.play('click'); onQuit(); } }),
      this.cardsEl = h('div', { class: 'pcards' }),
      this.phaseEl = h('div', { class: 'phase-pill' }),
    );
    this.cards = players.map((p) => {
      const c = h('div', { class: 'pcard' + (p.human ? ' me' : ''), style: `--c:${COLORS[p.color].base};--cl:${COLORS[p.color].light};--cd:${COLORS[p.color].dark}` },
        avatar(p.emblem, COLORS[p.color]),
        h('div', { class: 'pinfo' }, h('div', { class: 'pname', text: p.name }), h('div', { class: 'pscore', text: '0' })),
        h('div', { class: 'pstatus' }));
      this.cardsEl.appendChild(c); return c;
    });
    this.hintEl = h('div', { class: 'hint-pill hidden' });
    this.tipEl = h('div', { class: 'region-tip hidden' });
    this.timerEl = h('div', { class: 'turn-timer hidden' }, h('i'));
    this.layer = h('div', { class: 'game-layer' }, this.hud, this.hintEl, this.tipEl, this.timerEl);
    this.root.appendChild(this.layer);
  }
  unmount() { this.cancelled = true; this._unkeys(); if (this.layer) this.layer.remove(); this.layer = null; document.querySelectorAll('.qpanel-wrap,.banner').forEach((e) => e.remove()); }
  cancel() { this.cancelled = true; if (this._cancelFn) this._cancelFn(); }
  async wait(ms) { await sleep(ms); if (this.cancelled) throw new Cancelled(); }
  _unkeys() { if (this._keys) { window.removeEventListener('keydown', this._keys); this._keys = null; } }

  setScores(scores, lead = true) {
    const max = Math.max(...scores);
    this.cards.forEach((c, i) => {
      const el = c.querySelector('.pscore'), prev = +el.dataset.v || 0, v = scores[i]; el.dataset.v = v;
      if (prev !== v) { const t0 = performance.now(); const step = (now) => { const k = Math.min(1, (now - t0) / 500); el.textContent = fmt(Math.round(prev + (v - prev) * k)); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      c.classList.toggle('lead', lead && v === max && max > 0 && scores.filter((x) => x === max).length === 1);
    });
  }
  setTurn(pid) { this.cards.forEach((c, i) => c.classList.toggle('turn', i === pid)); }
  setOut(pid) { this.cards[pid].classList.add('out'); }
  setStatus(pid, s) { const e = this.cards[pid].querySelector('.pstatus'); e.className = 'pstatus ' + (s || ''); e.innerHTML = s === 'done' ? ICON.check : s === 'think' ? '<i></i><i></i><i></i>' : s === 'att' ? ICON.swords : s === 'def' ? ICON.shield : ''; }
  clearStatus() { this.players.forEach((_, i) => this.setStatus(i, '')); }
  setPhase(text) { this.phaseEl.textContent = text; this.phaseEl.classList.toggle('hidden', !text); }
  hint(text, mine = false) { this.hintEl.textContent = text || ''; this.hintEl.classList.toggle('hidden', !text); this.hintEl.classList.toggle('mine', mine); }
  tip(text) { this.tipEl.textContent = text || ''; this.tipEl.classList.toggle('hidden', !text); }
  turnTimer(sec) { const e = this.timerEl; if (!sec) { e.classList.add('hidden'); return; } e.classList.remove('hidden'); const i = e.firstChild; i.style.transition = 'none'; i.style.transform = 'scaleX(1)'; void i.offsetWidth; i.style.transition = `transform ${sec}s linear`; i.style.transform = 'scaleX(0)'; }

  async banner(title, sub, ms = 1700, cls = '') {
    const b = h('div', { class: 'banner ' + cls }, h('div', { class: 'banner-in' }, h('div', { class: 'banner-title', text: title }), sub ? h('div', { class: 'banner-sub', text: sub }) : null));
    this.root.appendChild(b); audio.play('open');
    await sleep(ms); b.classList.add('out'); await sleep(280); b.remove();
    if (this.cancelled) throw new Cancelled();
  }

  _chip(p, extra = '') { return h('div', { class: 'qchip ' + extra, 'data-pid': p.id, style: `--c:${COLORS[p.color].base};--cd:${COLORS[p.color].dark}` }, avatar(p.emblem, COLORS[p.color], 'sm'), h('span', { text: p.name }), h('em', { class: 'qchip-state' })); }
  _panel(q, cfg) {
    const ps = cfg.participants.map((id) => this.players[id]);
    const head = h('div', { class: 'qhead' },
      h('span', { class: 'qcat cat-' + q.cat, text: q.catName }),
      cfg.label ? h('span', { class: 'qlabel', text: cfg.label }) : null,
      h('span', { class: 'qtime' }, h('b', { text: String(cfg.time) })));
    const duel = h('div', { class: 'qduel' + (ps.length === 2 ? ' two' : '') }, ...ps.map((p, i) => [i > 0 && ps.length === 2 ? h('span', { class: 'vs', html: ICON.swords }) : null, this._chip(p, cfg.roles ? cfg.roles[i] : '')]).flat());
    const bar = h('div', { class: 'qbar' }, h('i'));
    const panel = h('div', { class: 'qpanel ' + q.type }, head, bar, duel, h('div', { class: 'qtext' + (q.text.length > 110 ? ' long' : ''), text: q.text }));
    const wrap = h('div', { class: 'qpanel-wrap' }, panel);
    if (cfg.sideline) panel.appendChild(h('div', { class: 'qside', text: t('sideline') }));
    return { wrap, panel, bar: bar.firstChild, timeEl: head.querySelector('.qtime b'), chips: Object.fromEntries(ps.map((p) => [p.id, duel.querySelector(`[data-pid="${p.id}"]`)])) };
  }
  // shared countdown; resolves when all expected answers are in or time is up
  _run(ui, cfg, isDone) {
    return new Promise((resolve, reject) => {
      const t0 = performance.now(); let lastSec = cfg.time, raf = 0, finished = false; const timers = [];
      const end = (err) => { if (finished) return; finished = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout); this._cancelFn = null; err ? reject(err) : resolve(); };
      this._cancelFn = () => end(new Cancelled());
      ui.elapsed = () => (performance.now() - t0) / 1000;
      ui.check = () => { if (isDone()) setTimeout(() => end(), 450); };
      ui.later = (ms, fn) => timers.push(setTimeout(() => { if (!finished) fn(); }, ms));
      const tick = () => {
        const el = ui.elapsed(), left = Math.max(0, cfg.time - el); ui.bar.style.transform = `scaleX(${left / cfg.time})`;
        const sec = Math.ceil(left); if (sec !== lastSec) { lastSec = sec; ui.timeEl.textContent = sec; if (sec <= 5 && sec > 0) { audio.play(sec <= 3 ? 'urgent' : 'tick'); ui.panel.classList.add('hurry'); } }
        if (left <= 0) return end(); raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
  }

  // cfg: {participants:[pid], human: pid|-1, sideline:boolean, bots:{pid:{choice,time}}, time, half:int, roles, label}
  async askMC(q, cfg) {
    const ui = this._panel(q, cfg); const answers = {}; let usedHalf = false;
    const letters = ['A', 'B', 'C', 'D'];
    const grid = h('div', { class: 'qopts' + (q.options.some((o) => o.length > 34) ? ' wide' : '') });
    const btns = q.options.map((o, i) => { const b = h('button', { class: 'qopt', disabled: true }, h('span', { class: 'ql', text: letters[i] }), h('span', { class: 'qo', text: o }), h('span', { class: 'qmarks' })); grid.appendChild(b); return b; });
    ui.panel.appendChild(grid);
    const canAnswer = cfg.human >= 0;
    let halfBtn = null;
    if (canAnswer && !cfg.sideline) {
      halfBtn = h('button', { class: 'booster', disabled: !(cfg.half > 0), html: `${ICON.half}<span>${t('booster_half')}</span><b>${cfg.half}</b>` });
      ui.panel.appendChild(h('div', { class: 'qfoot' }, halfBtn));
    }
    this.root.appendChild(ui.wrap); audio.play('open');
    await sleep(520); if (this.cancelled) { ui.wrap.remove(); throw new Cancelled(); }
    const choose = (i) => { if (answers[cfg.human] || btns[i].disabled) return; answers[cfg.human] = { choice: i, time: ui.elapsed() }; btns.forEach((b) => (b.disabled = true)); btns[i].classList.add('mine'); audio.play('select'); if (halfBtn) halfBtn.disabled = true; if (ui.chips[cfg.human]) ui.chips[cfg.human].classList.add('done'); if (!cfg.sideline) this.setStatus(cfg.human, 'done'); ui.check(); };
    if (canAnswer) {
      btns.forEach((b, i) => { b.disabled = false; b.addEventListener('click', () => choose(i)); });
      this._keys = (e) => { const k = e.key.toLowerCase(); const i = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'abcd'.indexOf(k); if (i >= 0 && k.length === 1) choose(i); };
      window.addEventListener('keydown', this._keys);
      if (halfBtn) halfBtn.addEventListener('click', () => { if (usedHalf || answers[cfg.human]) return; usedHalf = true; halfBtn.disabled = true; audio.play('pop'); const wrong = [0, 1, 2, 3].filter((i) => i !== q.correct).sort(() => Math.random() - 0.5).slice(0, 2); wrong.forEach((i) => { btns[i].disabled = true; btns[i].classList.add('gone'); }); });
    }
    const need = cfg.participants.concat(cfg.sideline ? [cfg.human] : []);
    const run = this._run(ui, cfg, () => need.every((id) => answers[id]));
    for (const id of cfg.participants) { if (id === cfg.human) continue; const b = cfg.bots[id]; this.setStatus(id, 'think'); ui.later(Math.min(b.time, cfg.time - 0.3) * 1000, () => { answers[id] = { choice: b.choice, time: b.time }; ui.chips[id].classList.add('done'); this.setStatus(id, 'done'); audio.play('pop'); ui.check(); }); }
    try { await run; } catch (e) { ui.wrap.remove(); this._unkeys(); throw e; }
    this._unkeys(); btns.forEach((b) => (b.disabled = true)); if (halfBtn) halfBtn.disabled = true;
    // reveal
    btns[q.correct].classList.add('right');
    const all = cfg.sideline ? [...cfg.participants, cfg.human] : cfg.participants;
    for (const id of all) { const a = answers[id]; const p = this.players[id]; if (a) { if (a.choice !== q.correct) btns[a.choice].classList.add('wrong'); btns[a.choice].querySelector('.qmarks').appendChild(avatar(p.emblem, COLORS[p.color], 'xs')); } if (ui.chips[id]) ui.chips[id].classList.add(a && a.choice === q.correct ? 'ok' : 'bad'); }
    const mine = answers[cfg.human];
    if (canAnswer) audio.play(mine && mine.choice === q.correct ? 'correct' : 'wrong'); else audio.play('pop');
    await sleep(cfg.revealMs || 2100);
    ui.wrap.classList.add('out'); await sleep(240); ui.wrap.remove(); this.clearStatus();
    if (this.cancelled) throw new Cancelled();
    return { answers, usedHalf };
  }

  // cfg: {participants, human, sideline, bots:{pid:{value,time}}, time, scout:int, label}
  async askNum(q, cfg) {
    const ui = this._panel(q, cfg); const answers = {}; let usedScout = false; let value = '';
    const disp = h('div', { class: 'ndisp empty', text: t('enter_number') });
    const keys = h('div', { class: 'npad' });
    const canAnswer = cfg.human >= 0;
    const refresh = () => { disp.textContent = value ? fmt(+value) : t('enter_number'); disp.classList.toggle('empty', !value); okBtn.disabled = !value || !!answers[cfg.human]; };
    const press = (k) => { if (!canAnswer || answers[cfg.human]) return; if (k === 'back') value = value.slice(0, -1); else if (k === 'ok') return submit(); else if (value.length < 9 && !(value === '' && k === '0')) value += k; audio.play('click'); refresh(); };
    const submit = () => { if (!value || answers[cfg.human]) return; answers[cfg.human] = { value: +value, time: ui.elapsed() }; audio.play('select'); keys.classList.add('locked'); disp.classList.add('locked'); okBtn.disabled = true; if (ui.chips[cfg.human]) ui.chips[cfg.human].classList.add('done'); if (!cfg.sideline) this.setStatus(cfg.human, 'done'); ui.check(); };
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0'].forEach((k) => keys.appendChild(h('button', { class: 'nkey' + (k === 'back' ? ' back' : ''), html: k === 'back' ? ICON.back : k, onclick: () => press(k) })));
    const okBtn = h('button', { class: 'nkey ok', disabled: true, html: ICON.check, onclick: () => press('ok') }); keys.appendChild(okBtn);
    let scoutBtn = null; const scoutOut = h('div', { class: 'scout-out' });
    const body = h('div', { class: 'nbody' }, h('div', { class: 'nleft' }, disp, scoutOut), keys);
    ui.panel.appendChild(body);
    if (canAnswer && !cfg.sideline) { scoutBtn = h('button', { class: 'booster', disabled: !(cfg.scout > 0), html: `${ICON.scout}<span>${t('booster_scout')}</span><b>${cfg.scout}</b>` }); ui.panel.appendChild(h('div', { class: 'qfoot' }, scoutBtn)); }
    if (!canAnswer) keys.classList.add('locked');
    this.root.appendChild(ui.wrap); audio.play('open');
    await sleep(520); if (this.cancelled) { ui.wrap.remove(); throw new Cancelled(); }
    if (canAnswer) {
      this._keys = (e) => { if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') { e.preventDefault(); press('back'); } else if (e.key === 'Enter') press('ok'); };
      window.addEventListener('keydown', this._keys);
      if (scoutBtn) scoutBtn.addEventListener('click', () => { if (usedScout || answers[cfg.human]) return; usedScout = true; scoutBtn.disabled = true; audio.play('pop'); const a = q.answer; let lo, hi; if (q.kind === 'year') { const w = 24, off = Math.floor(Math.random() * w); lo = a - off; hi = lo + w; } else { const f = 0.22 + Math.random() * 0.1; lo = Math.max(1, Math.floor(a * (1 - f * (0.5 + Math.random())))); hi = Math.ceil(a * (1 + f * (0.5 + Math.random()))) + 1; } scoutOut.textContent = t('scout_range', { a: q.kind === 'year' ? lo : fmt(lo), b: q.kind === 'year' ? hi : fmt(hi) }); scoutOut.classList.add('show'); });
    }
    const need = cfg.participants.concat(cfg.sideline ? [cfg.human] : []);
    const run = this._run(ui, cfg, () => need.every((id) => answers[id]));
    for (const id of cfg.participants) { if (id === cfg.human) continue; const b = cfg.bots[id]; this.setStatus(id, 'think'); ui.later(Math.min(b.time, cfg.time - 0.3) * 1000, () => { answers[id] = { value: b.value, time: b.time }; ui.chips[id].classList.add('done'); this.setStatus(id, 'done'); audio.play('pop'); ui.check(); }); }
    try { await run; } catch (e) { ui.wrap.remove(); this._unkeys(); throw e; }
    this._unkeys();
    if (canAnswer && !answers[cfg.human] && value) answers[cfg.human] = { value: +value, time: cfg.time }; // typed but not confirmed still counts
    const rank = (ids) => ids.slice().sort((a, b) => { const A = answers[a], B = answers[b]; if (!A && !B) return 0; if (!A) return 1; if (!B) return -1; const da = Math.abs(A.value - q.answer), db = Math.abs(B.value - q.answer); return da - db || A.time - B.time; });
    const order = rank(cfg.participants);
    const shown = cfg.sideline && answers[cfg.human] ? rank([...cfg.participants, cfg.human]) : order;
    const yr = q.kind === 'year'; const f = (n) => (yr ? String(n) : fmt(n));
    const rows = shown.map((id) => { const a = answers[id], p = this.players[id]; const pos = order.indexOf(id); return h('div', { class: 'nrow' + (pos === 0 ? ' win' : '') + (pos < 0 ? ' side' : ''), style: `--c:${COLORS[p.color].base}` }, h('span', { class: 'npos', text: pos >= 0 ? String(pos + 1) : '•' }), avatar(p.emblem, COLORS[p.color], 'sm'), h('span', { class: 'nname', text: p.name }), h('span', { class: 'nval', text: a ? f(a.value) : '—' }), h('span', { class: 'ndiff', text: a ? (a.value === q.answer ? '✓' : (a.value > q.answer ? '+' : '−') + f(Math.abs(a.value - q.answer))) : '' }), h('span', { class: 'ntime', text: a ? a.time.toFixed(1) + 's' : '' })); });
    const res = h('div', { class: 'nresult' }, h('div', { class: 'nanswer' }, h('small', { text: t('correct_answer') }), h('b', { text: f(q.answer) })), h('div', { class: 'nrows' }, ...rows));
    body.replaceWith(res); const foot = ui.panel.querySelector('.qfoot'); if (foot) foot.remove();
    const humanIn = cfg.participants.includes(cfg.human);
    audio.play(humanIn ? (order[0] === cfg.human ? 'correct' : 'wrong') : 'pop');
    await sleep(cfg.revealMs || 3300);
    ui.wrap.classList.add('out'); await sleep(240); ui.wrap.remove(); this.clearStatus();
    if (this.cancelled) throw new Cancelled();
    return { answers, order, usedScout };
  }

  async confirm(text, yes, no) {
    return new Promise((res) => {
      const close = (v) => { m.remove(); res(v); };
      const m = h('div', { class: 'modal-wrap top' }, h('div', { class: 'modal small' }, h('p', { class: 'confirm-text', text }), h('div', { class: 'row' }, h('button', { class: 'btn ghost', text: no, onclick: () => { audio.play('click'); close(false); } }), h('button', { class: 'btn danger', text: yes, onclick: () => { audio.play('click'); close(true); } }))));
      document.getElementById('app').appendChild(m);
    });
  }
}
