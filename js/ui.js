// Menus and meta screens: main menu, country/language picker, shop, profile, quests, settings, results.
import { h, sleep, avatar, ICON, EMBLEMS, fmt } from './dom.js';
import { t } from './i18n.js';
import { audio } from './audio.js';
import { sdk } from './sdk.js';
import { store, leagueOf, levelInfo, LEAGUES } from './store.js';
import { COLORS } from './mapview.js';
import { LANGS, countryName, languageFor } from './detect.js';
import { ACHIEVEMENTS, achValue, PRICES, DAILY, ensureQuests, dailyAvailable, claimDaily } from './meta.js';

const click = (fn) => (e) => { audio.unlock(); audio.play('click'); fn(e); };

export class UI {
  constructor(app) { this.app = app; this.root = document.getElementById('app'); this.mode = 'classic'; }
  get p() { return store.p; }

  // ---------- main menu ----------
  showMenu() {
    this.hideMenu(); const p = this.p, app = this.app; const lv = levelInfo(p.xp), lg = leagueOf(p.trophies);
    const quests = ensureQuests(); const openQuests = quests.filter((q) => !q.done).length;
    const modeBtn = (m) => h('button', { class: 'mode' + (this.mode === m ? ' on' : ''), onclick: click(() => { this.mode = m; this.showMenu(); }) }, h('b', { text: t('mode_' + m) }), h('small', { text: t(`mode_${m}_d`) }));
    this.menu = h('div', { class: 'menu' },
      h('div', { class: 'topbar' },
        h('button', { class: 'pchip', onclick: click(() => this.openProfile()) }, avatar(p.emblem, COLORS[p.color]), h('span', { class: 'pchip-t' }, h('b', { text: p.name || t('you') }), h('small', {}, t('level', { n: lv.lvl }), h('i', { class: 'xpbar' }, h('i', { style: `width:${Math.round((lv.cur / lv.need) * 100)}%` }))))),
        h('div', { class: 'cur' }, h('span', { class: 'curchip league l' + lg, html: `${ICON.trophy}<b>${fmt(p.trophies)}</b><small>${t('league' + lg)}</small>` }), h('button', { class: 'curchip', onclick: click(() => this.openShop()), html: `${ICON.coin}<b>${fmt(p.coins)}</b>` })),
      ),
      h('div', { class: 'menu-main' },
        h('div', { class: 'logo' }, h('div', { class: 'logo-mark', html: '<svg viewBox="0 0 64 64"><path d="M32 4l22 8v18c0 14-9.5 24-22 30C19.500 54 10 44 10 30V12z" fill="url(#lg)" stroke="#fff3c4" stroke-width="3" stroke-linejoin="round"/><path d="M22 40V26h-2v-6h4v3h4v-3h8v3h4v-3h4v6h-2v14z" fill="#fff3c4"/><rect x="29" y="31" width="6" height="9" rx="3" fill="#1b2a52"/><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5aa2ff"/><stop offset="1" stop-color="#2b4fc4"/></linearGradient></defs></svg>' }), h('div', { class: 'logo-text' }, h('span', { text: 'Border' }), h('span', { class: 'accent', text: 'wise' }))),
        h('div', { class: 'tagline', text: t('tagline', { country: app.countryLabel() }) }),
        h('button', { class: 'country-chip', onclick: click(() => this.openPicker()) }, h('span', { class: 'cc-globe', html: ICON.globe }), h('span', { class: 'cc-name', text: app.countryLabel() }), h('span', { class: 'cc-lang', text: LANGS[app.lang] }), h('span', { class: 'cc-caret', text: '▾' })),
        h('div', { class: 'modes' }, modeBtn('classic'), modeBtn('blitz')),
        h('button', { class: 'btn play', onclick: click(() => { this.hideMenu(); app.start(this.mode); }) }, h('span', { html: ICON.play }), t('play')),
      ),
      h('div', { class: 'dock' },
        this._dock(ICON.cart, t('shop'), () => this.openShop()),
        this._dock(ICON.list, t('quests'), () => this.openQuests(), openQuests),
        this._dock(ICON.user, t('profile'), () => this.openProfile(), ACHIEVEMENTS.some((a) => p.ach[a.id] === undefined && achValue(a, p) >= a.n) ? '!' : 0),
        this._dock(ICON.book, t('howto'), () => this.openHowTo()),
        this._dock(ICON.gear, t('settings'), () => this.openSettings()),
      ));
    this.root.appendChild(this.menu); this.root.classList.add('in-menu');
  }
  _dock(icon, label, fn, badge) { return h('button', { class: 'dock-btn', onclick: click(fn) }, h('span', { class: 'dock-ic', html: icon }), h('span', { class: 'dock-l', text: label }), badge ? h('em', { class: 'badge', text: String(badge) }) : null); }
  hideMenu() { if (this.menu) { this.menu.remove(); this.menu = null; } this.root.classList.remove('in-menu'); }
  refreshMenu() { if (this.menu) this.showMenu(); }

  // ---------- generic modal ----------
  modal(title, body, opts = {}) {
    const close = () => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 180); opts.onClose && opts.onClose(); };
    const wrap = h('div', { class: 'modal-wrap', onclick: (e) => { if (e.target === wrap && !opts.sticky) { audio.play('click'); close(); } } },
      h('div', { class: 'modal ' + (opts.cls || '') }, h('div', { class: 'modal-head' }, h('h2', { text: title }), opts.sticky ? null : h('button', { class: 'icon-btn', html: ICON.close, title: t('close'), onclick: click(close) })), h('div', { class: 'modal-body' }, body)));
    this.root.appendChild(wrap); audio.play('open');
    return { close, wrap };
  }
  toast(text, icon = '') { const e = h('div', { class: 'toast', html: icon + `<span></span>` }); e.querySelector('span').textContent = text; let box = document.getElementById('toasts'); box.appendChild(e); setTimeout(() => { e.classList.add('out'); setTimeout(() => e.remove(), 300); }, 2600); }

  // ---------- detection notice (always English, as it runs before the player confirms a language) ----------
  detectNotice(cc, lang) {
    const name = countryName(cc, 'en', cc);
    const n = h('button', { class: 'detect', onclick: click(() => { n.remove(); this.openPicker(); }) },
      h('span', { class: 'detect-ic', html: ICON.globe }),
      h('span', { class: 'detect-t' }, h('b', { text: `We detected you are playing from ${name}` }), h('small', { text: `Map: ${name} · Questions: ${LANGS[lang]} — tap here to change country or language` })));
    this.root.appendChild(n); setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 400); }, 9000);
  }

  // ---------- country + language picker ----------
  openPicker() {
    const app = this.app; let lang = app.lang, cc = app.cc; let langTouched = false;
    const names = app.countries.map((c) => ({ c: c.c, n: countryName(c.c, app.lang, c.n), en: c.n })).sort((a, b) => a.n.localeCompare(b.n, app.lang));
    const list = h('div', { class: 'clist' }); const langs = h('div', { class: 'langs' });
    const drawLangs = () => { langs.innerHTML = ''; for (const l in LANGS) langs.appendChild(h('button', { class: 'lang' + (l === lang ? ' on' : ''), text: LANGS[l], onclick: click(() => { lang = l; langTouched = true; drawLangs(); }) })); };
    const draw = (f = '') => {
      list.innerHTML = ''; f = f.trim().toLowerCase();
      for (const c of names) {
        if (f && !c.n.toLowerCase().includes(f) && !c.en.toLowerCase().includes(f) && c.c.toLowerCase() !== f) continue;
        const won = this.p.won[c.c];
        list.appendChild(h('button', { class: 'citem' + (c.c === cc ? ' on' : ''), 'data-cc': c.c, onclick: click(() => { cc = c.c; if (!langTouched) { lang = languageFor(cc, navigator.languages || []); drawLangs(); } list.querySelectorAll('.on').forEach((e) => e.classList.remove('on')); list.querySelector(`[data-cc="${cc}"]`).classList.add('on'); }) }, h('span', { class: 'ccode', text: c.c }), h('span', { class: 'cname', text: c.n }), won ? h('span', { class: 'cwon', html: ICON.trophy + `<b>${won}</b>` }) : null));
      }
    };
    drawLangs(); draw();
    const search = h('input', { class: 'search', type: 'search', placeholder: t('search'), oninput: (e) => draw(e.target.value) });
    const m = this.modal(t('pick_country'), h('div', { class: 'picker' }, search, list, h('h3', { text: t('language') }), langs, h('p', { class: 'muted', text: t('pick_hint') }),
      h('button', { class: 'btn primary', html: ICON.check, onclick: click(async () => { m.close(); await app.setCountry(cc, lang, true); }) })), { cls: 'tall' });
    setTimeout(() => { const on = list.querySelector('.on'); if (on) on.scrollIntoView({ block: 'center' }); }, 60);
  }

  // ---------- shop ----------
  openShop() {
    const p = this.p; const body = h('div', { class: 'shop' });
    const buy = (cost, fn) => { if (p.coins < cost) { audio.play('wrong'); this.toast(t('not_enough'), ICON.coin); return; } p.coins -= cost; fn(); store.save(); audio.play('coin'); draw(); this.refreshMenu(); };
    const price = (n) => h('span', { class: 'price', html: `${ICON.coin}<b>${n}</b>` });
    const draw = () => {
      body.innerHTML = '';
      body.appendChild(h('div', { class: 'wallet', html: `${ICON.coin}<b>${fmt(p.coins)}</b>` }));
      body.appendChild(h('h3', { text: t('shop_boosters') }));
      const bo = h('div', { class: 'cards2' });
      for (const [k, icon] of [['half', ICON.half], ['scout', ICON.scout]]) bo.appendChild(h('div', { class: 'scard' }, h('span', { class: 'sicon', html: icon }), h('b', { text: t('booster_' + k) + ' ×3' }), h('small', { text: t(`shop_${k}_d`) }), h('em', { class: 'have', text: '×' + p.boosters[k] }), h('button', { class: 'btn small', onclick: click(() => buy(PRICES[k], () => { p.boosters[k] += 3; })) }, price(PRICES[k]))));
      if (sdk.rewardedAvailable) bo.appendChild(h('div', { class: 'scard free' }, h('span', { class: 'sicon', html: ICON.gift }), h('b', { text: t('shop_free') }), h('small', { text: t('shop_free_d') }), h('button', { class: 'btn small gold', html: ICON.video, onclick: click(async () => { const ok = await this.app.rewarded(); if (ok) { p.boosters.half++; p.boosters.scout++; store.save(); audio.play('coin'); draw(); } }) })));
      body.appendChild(bo);
      body.appendChild(h('h3', { text: t('shop_emblems') }));
      const em = h('div', { class: 'grid6' });
      EMBLEMS.forEach((_, i) => { const own = p.owned.emblems.includes(i); em.appendChild(h('button', { class: 'pick' + (p.emblem === i ? ' on' : '') + (own ? '' : ' locked'), onclick: click(() => { if (own) { p.emblem = i; store.save(); draw(); this.refreshMenu(); } else buy(PRICES.emblem, () => { p.owned.emblems.push(i); p.emblem = i; }); }) }, avatar(i, COLORS[p.color]), own ? null : price(PRICES.emblem))); });
      body.appendChild(em);
      body.appendChild(h('h3', { text: t('shop_themes') }));
      const th = h('div', { class: 'cards3' });
      [0, 1, 2].forEach((i) => { const own = p.owned.themes.includes(i); th.appendChild(h('button', { class: `tcard theme-prev-${i}` + (p.theme === i ? ' on' : ''), onclick: click(() => { if (own) { p.theme = i; store.save(); this.app.applyTheme(); draw(); } else buy(PRICES.theme, () => { p.owned.themes.push(i); p.theme = i; this.app.applyTheme(); }); }) }, h('i'), h('b', { text: t('theme' + i) }), own ? h('small', { text: p.theme === i ? t('in_use') : t('use') }) : price(PRICES.theme))); });
      body.appendChild(th);
    };
    draw(); this.modal(t('shop'), body, { cls: 'tall' });
  }

  // ---------- profile + stats + achievements ----------
  openProfile() {
    const p = this.p; const body = h('div', { class: 'profile' });
    const draw = () => {
      body.innerHTML = ''; const st = p.stats, lg = leagueOf(p.trophies), lv = levelInfo(p.xp);
      const name = h('input', { class: 'search', maxlength: 16, value: p.name, placeholder: t('p_name'), onchange: (e) => { p.name = e.target.value.trim().slice(0, 16); store.save(); this.refreshMenu(); } });
      body.appendChild(h('div', { class: 'prof-head' }, avatar(p.emblem, COLORS[p.color], 'lg'), h('div', {}, name, h('div', { class: 'prof-sub', html: `${ICON.trophy}<b>${fmt(p.trophies)}</b> ${t('league' + lg)} · ${t('level', { n: lv.lvl })}` }), lg + 1 < LEAGUES.length ? h('div', { class: 'xpbar wide' }, h('i', { style: `width:${Math.round(((p.trophies - LEAGUES[lg]) / (LEAGUES[lg + 1] - LEAGUES[lg])) * 100)}%` })) : null)));
      body.appendChild(h('h3', { text: t('p_color') }));
      const cols = h('div', { class: 'grid8' }); COLORS.forEach((c, i) => cols.appendChild(h('button', { class: 'swatch' + (p.color === i ? ' on' : ''), style: `--c:${c.base};--cd:${c.dark}`, onclick: click(() => { p.color = i; store.save(); draw(); this.refreshMenu(); }) }))); body.appendChild(cols);
      body.appendChild(h('h3', { text: t('p_emblem') }));
      const em = h('div', { class: 'grid6' }); p.owned.emblems.forEach((i) => em.appendChild(h('button', { class: 'pick' + (p.emblem === i ? ' on' : ''), onclick: click(() => { p.emblem = i; store.save(); draw(); this.refreshMenu(); }) }, avatar(i, COLORS[p.color])))); body.appendChild(em);
      body.appendChild(h('h3', { text: t('stats') }));
      const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
      const sg = h('div', { class: 'statgrid' }); [[t('s_games'), st.games], [t('s_wins'), st.wins], [t('s_winrate'), pct(st.wins, st.games)], [t('s_accuracy'), pct(st.mcRight, st.mcTotal)], [t('s_best_streak'), st.bestStreak], [t('s_best_score'), fmt(st.bestScore)], [t('s_captures'), st.captures], [t('s_countries'), Object.keys(p.won).length]].forEach(([l, v]) => sg.appendChild(h('div', { class: 'stat' }, h('b', { text: String(v) }), h('small', { text: l })))); body.appendChild(sg);
      body.appendChild(h('h3', { text: t('achievements') }));
      const al = h('div', { class: 'achs' });
      for (const a of ACHIEVEMENTS) { const v = achValue(a, p), done = v >= a.n, got = !!p.ach[a.id]; const label = a.type === 'league' ? t('a_league', { name: t('league' + a.n) }) : t('a_' + a.type, { n: fmt(a.n) });
        al.appendChild(h('div', { class: 'ach' + (done ? ' done' : '') }, h('span', { class: 'ach-ic', html: ICON.star }), h('div', { class: 'ach-t' }, h('b', { text: label }), h('i', { class: 'xpbar' }, h('i', { style: `width:${Math.min(100, Math.round((v / a.n) * 100))}%` }))), got ? h('span', { class: 'got', html: ICON.check }) : done ? h('button', { class: 'btn small gold', onclick: click(() => { p.ach[a.id] = 1; p.coins += a.r; store.save(); audio.play('coin'); draw(); this.refreshMenu(); }) }, h('span', { class: 'price', html: `${ICON.coin}<b>+${a.r}</b>` })) : h('span', { class: 'price dim', html: `${ICON.coin}<b>${a.r}</b>` }))); }
      body.appendChild(al);
    };
    draw(); this.modal(t('profile'), body, { cls: 'tall' });
  }

  openQuests() {
    const body = h('div', { class: 'quests' });
    for (const q of ensureQuests()) body.appendChild(h('div', { class: 'quest' + (q.done ? ' done' : '') }, h('div', { class: 'ach-t' }, h('b', { text: t('q_' + q.k) }), h('i', { class: 'xpbar' }, h('i', { style: `width:${Math.round((q.p / q.n) * 100)}%` }))), h('span', { class: 'qprog', text: `${q.p}/${q.n}` }), q.done ? h('span', { class: 'got', html: ICON.check }) : h('span', { class: 'price', html: `${ICON.coin}<b>${q.r}</b>` })));
    body.appendChild(h('p', { class: 'muted', html: `${ICON.clock} ` + t('quests_reset') }));
    this.modal(t('quests_title'), body);
  }

  openSettings() {
    const p = this.p; const toggle = (key, label, icon) => { const b = h('button', { class: 'toggle' + (p.settings[key] ? ' on' : ''), onclick: click(() => { p.settings[key] = !p.settings[key]; b.classList.toggle('on', p.settings[key]); store.save(); this.app.applyAudio(); }) }, h('span', { html: icon }), h('b', { text: label }), h('i')); return b; };
    let m; m = this.modal(t('settings'), h('div', { class: 'settings' }, toggle('sfx', t('set_sound'), ICON.sound), toggle('music', t('set_music'), ICON.music), h('button', { class: 'toggle link', onclick: click(() => { m.close(); this.openPicker(); }) }, h('span', { html: ICON.globe }), h('b', { text: t('set_country') }), h('small', { text: `${this.app.countryLabel()} · ${LANGS[this.app.lang]}` }))));
  }

  openHowTo() {
    const icons = [EMBLEMS[1], EMBLEMS[10], EMBLEMS[11], EMBLEMS[0]];
    this.modal(t('howto'), h('div', { class: 'howto' }, ...[1, 2, 3, 4].map((i) => h('div', { class: 'how' }, h('span', { class: 'how-n', html: `<svg viewBox="0 0 24 24"><path d="${icons[i - 1]}"/></svg>` }), h('div', {}, h('b', { text: t(`how${i}_t`) }), h('p', { text: t(`how${i}_d`) }))))));
  }

  async dailyReward() {
    if (!dailyAvailable()) return;
    const next = (this.p.daily.streak % 7) + 1; // preview; real streak is computed on claim
    await new Promise((res) => {
      let m; const tiles = h('div', { class: 'daily' }, ...DAILY.map((d, i) => h('div', { class: 'dtile' + (i + 1 === next ? ' today' : i + 1 < next ? ' past' : '') }, h('small', { text: t('daily_day', { n: i + 1 }) }), h('span', { html: ICON.coin }), h('b', { text: String(d.c) }), d.half || d.scout ? h('em', { html: (d.half ? ICON.half : '') + (d.scout ? ICON.scout : '') }) : null)));
      m = this.modal(t('daily_title'), h('div', {}, tiles, h('p', { class: 'muted', text: t('daily_sub') }), h('button', { class: 'btn primary gold', text: t('claim'), onclick: click(() => { claimDaily(); audio.play('coin'); m.close(); this.refreshMenu(); res(); }) })), { sticky: true });
    });
  }

  // ---------- results ----------
  showResults(sum, rw) {
    return new Promise((res) => {
      const p = this.p; const win = sum.place === 1; const title = win ? t('r_win') : sum.eliminated ? t('r_elim') : sum.place === 2 ? t('r_second') : t('r_third');
      const rows = sum.ranking.map((id, i) => { const pl = sum.players[id]; return h('div', { class: 'rrow' + (id === 0 ? ' me' : '') + (pl.alive ? '' : ' out'), style: `--c:${COLORS[pl.color].base};--cd:${COLORS[pl.color].dark};animation-delay:${0.25 + i * 0.15}s` }, h('span', { class: 'rpos', text: String(i + 1) }), avatar(pl.emblem, COLORS[pl.color]), h('b', { text: pl.name }), h('span', { class: 'rscore', text: fmt(sum.scores[id]) })); });
      const coinEl = h('b', { text: '+' + rw.coins });
      const chips = h('div', { class: 'rchips' }, h('span', { class: 'rchip', html: ICON.coin }, coinEl), h('span', { class: 'rchip', html: ICON.star + `<b>+${rw.xp} XP</b>` }), h('span', { class: 'rchip ' + (rw.tro >= 0 ? 'up' : 'down'), html: ICON.trophy + `<b>${rw.tro >= 0 ? '+' : ''}${rw.tro}</b>` }));
      const extras = h('div', { class: 'rextras' });
      const s = sum.stats; [[t('r_correct'), `${s.mcRight}/${s.mcTotal}`], [t('r_captures'), s.captures], [t('r_defends'), s.defends], s.sideline ? [t('r_sideline'), s.sideline] : null].filter(Boolean).forEach(([l, v]) => extras.appendChild(h('span', { class: 'rstat' }, h('b', { text: String(v) }), h('small', { text: l }))));
      const notes = h('div', { class: 'rnotes' });
      if (rw.streak >= 2) notes.appendChild(h('div', { class: 'rnote fire', text: t('r_streak', { n: rw.streak }) }));
      if (rw.levelUp) notes.appendChild(h('div', { class: 'rnote', html: `${ICON.star}<span>${t('r_levelup', { n: rw.levelUp })}</span>${ICON.coin}<b>+${rw.levelCoins}</b>` }));
      if (rw.leagueUp >= 0) notes.appendChild(h('div', { class: 'rnote league', html: `${ICON.trophy}<span>${t('r_league', { name: t('league' + rw.leagueUp) })}</span>` }));
      for (const q of rw.questsDone) notes.appendChild(h('div', { class: 'rnote', html: `${ICON.check}<span>${t('quest_done')} ${t('q_' + q.k)}</span>${ICON.coin}<b>+${q.r}</b>` }));
      for (const a of rw.newAch) notes.appendChild(h('div', { class: 'rnote', html: `${ICON.star}<span>${t('r_newach')}</span>${ICON.coin}<b>+${a.r}</b>` }));
      let doubled = false;
      const dbl = sdk.rewardedAvailable ? h('button', { class: 'btn gold', html: `${ICON.video}<span>${t('r_double')}</span>`, onclick: click(async () => { if (doubled) return; const ok = await this.app.rewarded(); if (ok) { doubled = true; p.coins += rw.coins; store.save(); coinEl.textContent = '+' + rw.coins * 2; audio.play('coin'); dbl.remove(); } }) }) : null;
      const done = (v) => { wrap.remove(); res(v); };
      const wrap = h('div', { class: 'results ' + (win ? 'win' : 'lose') }, h('div', { class: 'results-in' }, h('div', { class: 'rtitle', text: title }), h('div', { class: 'rrows' }, ...rows), chips, extras, notes,
        h('div', { class: 'row' }, dbl, h('button', { class: 'btn ghost', text: t('r_menu'), onclick: click(() => done('menu')) }), h('button', { class: 'btn primary', text: t('r_again'), onclick: click(() => done('again')) }))));
      this.root.appendChild(wrap);
      if (win) { audio.play('victory'); this.confetti(wrap); } else audio.play('defeat');
      if (rw.levelUp || rw.leagueUp >= 0) setTimeout(() => audio.play('levelup'), 1200);
    });
  }
  confetti(parent) {
    const box = h('div', { class: 'confetti' }); parent.appendChild(box); const cols = ['#ffd34d', '#5aa2ff', '#ff7a2f', '#1fc48a', '#ff4f79', '#fff'];
    for (let i = 0; i < 70; i++) { const c = h('i', { style: `left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-delay:${Math.random() * 0.9}s;animation-duration:${2.2 + Math.random() * 1.8}s;transform:rotate(${Math.random() * 360}deg);width:${6 + Math.random() * 7}px;height:${9 + Math.random() * 9}px` }); box.appendChild(c); }
    setTimeout(() => box.remove(), 5200);
  }
  async loadingVeil(on, text) { let v = document.getElementById('veil'); if (on) { if (!v) { v = h('div', { id: 'veil', class: 'veil' }, h('div', { class: 'spinner' }), h('span', { text: text || t('loading') })); this.root.appendChild(v); } } else if (v) { v.classList.add('out'); await sleep(200); v.remove(); } }
}
