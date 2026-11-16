// Boot + app controller.
import { sdk } from './sdk.js';
import { getJSON } from './data.js';
import { store } from './store.js';
import { audio } from './audio.js';
import { loadLang, t } from './i18n.js';
import { detectCountry, languageFor, countryName, LANGS } from './detect.js';
import { MapView } from './mapview.js';
import { QuestionBank } from './questions.js';
import { GameView } from './gameview.js';
import { Engine, makePlayers } from './engine.js';
import { Presenter } from './presenter.js';
import { HostSession, GuestSession, cleanCode } from './net.js';
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
      const [map] = await Promise.all([getJSON(`data/maps/${cc}.json`), loadLang(lang), this.bank.load(lang)]);
      this.cc = cc; this.lang = lang; this.map = map;
      this.mapView.setMap(map, lang); this.bank.setMap(map, cc);
      const p = store.p; p.country = cc; p.lang = lang; if (manual) p.manual = true; store.save();
      this.ui.showMenu();
    } catch (e) { console.error(e); if (cc !== 'US') { await this.ui.loadingVeil(false); return this.setCountry('US', 'en', false); } }
    await this.ui.loadingVeil(false);
  },

  async rewarded() { audio.unlock(); const ok = await sdk.rewardedAd(); this.applyAudio(); return ok; },

  // ---- matches -------------------------------------------------------------
  beginMatch(players, me, onQuit) {
    audio.unlock();
    document.querySelectorAll('.detect,.modal-wrap').forEach((e) => e.remove());
    this.ui.hideMenu();
    this.view = new GameView($('app'));
    this.view.mount(players, me, async () => { sdk.gameplayStop(); const yes = await this.view.confirm(t('leave_q'), t('yes'), t('no')); if (yes) onQuit(); else sdk.gameplayStart(); });
    $('app').classList.add('in-game');
    sdk.gameplayStart();
  },
  async endMatch(sum, opts = {}) {
    sdk.gameplayStop();
    this.mapView.clearSelectable(); this.mapView.onHover = null; this.mapView.onInfo = null;
    store.save();
    if (!sum || sum.aborted) {
      if (!sum || sum.reason === 'quit') applyQuit();
      this.view.unmount(); $('app').classList.remove('in-game');
      if (opts.restoreMap) await this.restoreMap(); else this.mapView.setMap(this.map, this.lang);
      this.ui.showMenu();
      if (sum && sum.reason && sum.reason !== 'quit') this.ui.toast(t(sum.reason === 'full' ? 'mp_full' : 'mp_host_left'));
      return 'menu';
    }
    const rw = applyResult(sum, opts.cc || this.cc);
    if (sum.place === 1) sdk.happytime();
    this.view.hint(''); this.view.setPhase('');
    const next = await this.ui.showResults(sum, rw);
    this.view.unmount(); $('app').classList.remove('in-game');
    if (opts.restoreMap) await this.restoreMap(); else this.mapView.setMap(this.map, this.lang);
    return next;
  },
  async restoreMap() { this.mapView.setMap(this.map, this.lang); this.bank.setMap(this.map, this.cc); },

  async start(mode) {
    audio.unlock();
    if (this.matches > 0) { await sdk.midgameAd(); this.applyAudio(); }
    this.matches++;
    const p = store.p; if (!p.name) p.name = t('you');
    this.mapView.setMap(this.map, this.lang);
    const players = makePlayers([{ name: p.name, color: p.color, emblem: p.emblem }], botSkill(p));
    let engine = null;
    const pr = new Presenter({ view: null, mapView: this.mapView, me: 0, profile: p, send: (m) => engine && engine.input(0, m) });
    this.beginMatch(players, 0, () => { engine.cancel(); pr.abort('quit'); });
    pr.view = this.view; pr.players = players.map((x) => ({ ...x }));
    engine = new Engine({ map: this.map, bank: this.bank, mode, players, out: (e) => pr.apply(e) });
    engine.run().catch((e) => { console.error(e); pr.abort('error'); });
    const sum = await pr.result;
    const next = await this.endMatch(sum);
    if (next === 'again') return this.start(mode);
    if (next === 'menu') { this.ui.showMenu(); if (sum && !sum.aborted) this.ui.dailyReward(); }
  },

  // ---- online ------------------------------------------------------------------
  async hostCreate(settings) { const p = store.p; return HostSession.create({ name: p.name || t('you'), color: p.color, emblem: p.emblem }, settings); },
  async guestJoin(code) { const p = store.p; return GuestSession.join(cleanCode(code), { name: p.name || t('you'), color: p.color, emblem: p.emblem }); },

  async startHost(session) {
    const p = store.p, mode = session.settings.mode;
    this.matches++;
    this.mapView.setMap(this.map, this.lang);
    const players = makePlayers(session.seats.map((s) => ({ name: s.name, color: s.color, emblem: s.emblem, peer: s.peer })), botSkill(p));
    let engine = null;
    const pr = new Presenter({ view: null, mapView: this.mapView, me: 0, profile: p, online: true, send: (m) => engine && engine.input(0, m) });
    this.beginMatch(players, 0, () => { if (engine) engine.cancel(); session.close(); pr.abort('quit'); });
    pr.view = this.view; pr.players = players.map((x) => ({ ...x }));
    this.view.hint(t('mp_loading_players'));
    await session.begin(players, { cc: this.cc, lang: this.lang, mode });
    this.view.hint('');
    engine = new Engine({ map: this.map, bank: this.bank, mode, players, out: (e) => { pr.apply(e); session.relay(e); } });
    session.engine = engine;
    engine.run().catch((e) => { console.error(e); pr.abort('error'); });
    const sum = await pr.result;
    setTimeout(() => session.close(), 1500);
    await this.endMatch(sum);
    this.ui.showMenu();
  },

  async startGuest(session, start) {
    const p = store.p;
    this.matches++;
    let map;
    try { map = start.cc === this.cc ? this.map : await getJSON(`data/maps/${start.cc}.json`); }
    catch (e) { session.close(); this.ui.showMenu(); this.ui.toast(t('mp_host_left')); return; }
    this.mapView.setMap(map, this.lang);
    const pr = new Presenter({ view: null, mapView: this.mapView, me: start.you, profile: p, online: true, send: (m) => session.input(m) });
    this.beginMatch(start.players, start.you, () => { session.close(); pr.abort('quit'); });
    pr.view = this.view; pr.players = start.players.map((x) => ({ ...x, alive: true }));
    session.onEvent = (e) => pr.apply(e);
    session.onClosed = (reason) => pr.abort(reason === 'started' ? 'full' : 'host');
    session.ready();
    const sum = await pr.result;
    session.close();
    await this.endMatch(sum, { restoreMap: true, cc: start.cc });
    this.ui.showMenu();
  },
};

async function boot() {
  progress(0.08);
  await sdk.init(); sdk.loadingStart(); progress(0.25);
  sdk.onMuteChange = () => app.applyAudio();
  sdk.onAdState = (on) => { app._adMute = on; app.applyAudio(); };
  const p = store.load(); app.applyTheme(); app.applyAudio();
  // a player who signs in or out on CrazyGames gets that account's progress
  sdk.onAuthChange(async (user) => {
    store.load();
    if (user && user.username && !store.p.name) { store.p.name = user.username.slice(0, 16); store.save(); }
    app.applyTheme(); app.applyAudio();
    if (app.ui.menu) app.ui.showMenu();
  });
  window.addEventListener('pagehide', () => store.flush());
  document.addEventListener('visibilitychange', () => { if (document.hidden) store.flush(); });
  app.mapView = new MapView($('map')); app.ui = new UI(app);
  app.countries = await getJSON('data/maps/index.json'); progress(0.45);
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
  const invite = cleanCode(sdk.inviteParam('roomId'));
  if (invite) setTimeout(() => app.ui.openMultiplayer({ join: invite }), 600);
  else if (sdk.isInstantMultiplayer) setTimeout(() => app.ui.openMultiplayer({ create: true }), 600);
  else setTimeout(() => { if (app.ui.menu) app.ui.dailyReward(); }, detected ? 1400 : 500);
}

// platform hygiene: no page scroll / context menu / text selection side effects inside the game frame
window.addEventListener('keydown', (e) => { if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !/input|textarea/i.test(e.target.tagName)) e.preventDefault(); });
window.addEventListener('contextmenu', (e) => { if (!/input/i.test(e.target.tagName)) e.preventDefault(); });
window.addEventListener('pointerdown', () => audio.unlock(), { once: false, passive: true });
document.addEventListener('visibilitychange', () => audio.set({ muted: document.hidden || sdk.platformMuted || !!app._adMute }));
window.__app = app;
boot().catch((e) => {
  console.error('boot failed', e);
  try { sdk.loadingStop(); } catch (x) { /* ignore */ }
  const b = document.getElementById('boot');
  if (b) { const m = document.createElement('p'); m.className = 'boot-error'; m.textContent = 'Borderwise could not start: ' + (e && e.message ? e.message : e) + '. Please reload the page.'; b.querySelector('.boot-in').appendChild(m); }
});
