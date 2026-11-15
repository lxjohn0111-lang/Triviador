// Boot + app controller.
import { sdk } from './sdk.js';
import { store } from './store.js';
import { audio } from './audio.js';
import { loadLang, t } from './i18n.js';
import { detectCountry, languageFor, countryName, LANGS } from './detect.js';
import { MapView } from './mapview.js';
import { QuestionBank } from './questions.js';
import { GameView } from './gameview.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { applyResult, applyQuit, botSkill } from './meta.js';

const $ = (id) => document.getElementById(id);
const progress = (v) => { const f = $('boot-fill'); if (f) f.style.width = Math.round(v * 100) + '%'; };

const app = {
  cc: 'US', lang: 'en', countries: [], map: null, matches: 0, game: null,
  mapView: null, bank: new QuestionBank(), ui: null, view: null,

  countryLabel() { return this.map ? (this.map.name[this.lang] || countryName(this.cc, this.lang, this.map.name._)) : this.cc; },
  applyTheme() { $('app').dataset.theme = store.p.theme; },
  applyAudio() { audio.set({ sfx: store.p.settings.sfx, music: store.p.settings.music, muted: sdk.platformMuted || this._adMute }); },

  async setCountry(cc, lang, manual = false) {
    await this.ui.loadingVeil(true);
    try {
      if (!this.countries.find((c) => c.c === cc)) cc = 'US';
      if (!LANGS[lang]) lang = 'en';
      const [map] = await Promise.all([fetch(`data/maps/${cc}.json`).then((r) => r.json()), loadLang(lang), this.bank.load(lang)]);
      this.cc = cc; this.lang = lang; this.map = map;
      this.mapView.setMap(map, lang); this.bank.setMap(map, cc);
      const p = store.p; p.country = cc; p.lang = lang; if (manual) p.manual = true; store.save();
      this.ui.showMenu();
    } catch (e) { console.error(e); if (cc !== 'US') { await this.ui.loadingVeil(false); return this.setCountry('US', 'en', false); } }
    await this.ui.loadingVeil(false);
  },

  async rewarded() { audio.unlock(); const ok = await sdk.rewardedAd(); this.applyAudio(); return ok; },

  async start(mode) {
    audio.unlock();
    if (this.matches > 0) { await sdk.midgameAd(); this.applyAudio(); }
    this.matches++;
    const p = store.p; if (!p.name) p.name = t('you');
    this.mapView.setMap(this.map, this.lang); // reset board
    this.view = new GameView($('app'));
    const game = new Game({ map: this.map, mapView: this.mapView, view: this.view, bank: this.bank, mode, profile: p, skill: botSkill(p) });
    this.game = game;
    this.view.mount(game.players, async () => { const yes = await this.view.confirm(t('leave_q'), t('yes'), t('no')); if (yes) this.view.cancel(); });
    $('app').classList.add('in-game');
    sdk.gameplayStart();
    let sum = null;
    try { sum = await game.run(); } catch (e) { console.error(e); }
    sdk.gameplayStop();
    this.mapView.clearSelectable(); this.mapView.onHover = null; this.mapView.onInfo = null;
    store.save();
    if (!sum) { applyQuit(); this.view.unmount(); $('app').classList.remove('in-game'); this.mapView.setMap(this.map, this.lang); this.ui.showMenu(); return; }
    const rw = applyResult(sum, this.cc);
    if (sum.place === 1) sdk.happytime();
    this.view.hint(''); this.view.setPhase('');
    const next = await this.ui.showResults(sum, rw);
    this.view.unmount(); $('app').classList.remove('in-game');
    if (next === 'again') return this.start(mode);
    this.mapView.setMap(this.map, this.lang); this.ui.showMenu(); this.ui.dailyReward();
  },
};

async function boot() {
  progress(0.08);
  await sdk.init(); sdk.loadingStart(); progress(0.25);
  sdk.onMuteChange = () => app.applyAudio();
  sdk.onAdState = (on) => { app._adMute = on; app.applyAudio(); };
  const p = store.load(); app.applyTheme(); app.applyAudio();
  app.mapView = new MapView($('map')); app.ui = new UI(app);
  app.countries = await fetch('data/maps/index.json').then((r) => r.json()); progress(0.45);
  const has = (cc) => app.countries.some((c) => c.c === cc);
  let cc, lang, detected = null;
  if (p.manual && p.country && has(p.country)) { cc = p.country; lang = p.lang || 'en'; }
  else { detected = await detectCountry(sdk.systemInfo(), has); cc = detected.cc; lang = languageFor(cc, navigator.languages || [navigator.language]); }
  progress(0.6);
  if (!p.name) { const u = await sdk.username(); if (u) { p.name = u.slice(0, 16); store.save(); } }
  await app.setCountry(cc, lang, false); progress(1);
  sdk.loadingStop();
  const b = $('boot'); b.classList.add('out'); setTimeout(() => b.remove(), 500);
  if (detected) app.ui.detectNotice(cc, lang);
  setTimeout(() => { if (app.ui.menu) app.ui.dailyReward(); }, detected ? 1400 : 500);
}

// platform hygiene: no page scroll / context menu / text selection side effects inside the game frame
window.addEventListener('keydown', (e) => { if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !/input|textarea/i.test(e.target.tagName)) e.preventDefault(); });
window.addEventListener('contextmenu', (e) => { if (!/input/i.test(e.target.tagName)) e.preventDefault(); });
window.addEventListener('pointerdown', () => audio.unlock(), { once: false, passive: true });
document.addEventListener('visibilitychange', () => audio.set({ muted: document.hidden || sdk.platformMuted || !!app._adMute }));
window.__app = app;
boot().catch((e) => { console.error('boot failed', e); });
