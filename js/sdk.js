// Thin, failure-proof wrapper around the CrazyGames SDK v3.
// Every call is safe when the SDK is missing, blocked or running off-platform.
const raw = () => (typeof window !== 'undefined' && window.CrazyGames && window.CrazyGames.SDK) || null;
const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch (e) { return fallback; } };

export const sdk = {
  env: 'disabled',
  active: false,
  _playing: false,
  _loading: false,
  onMuteChange: null,
  onAdState: null,

  // The SDK <script> tag is async; wait (briefly) for it so a slow or blocked CDN never stalls the game.
  _script() {
    if (raw()) return Promise.resolve();
    const tag = document.getElementById('cg-sdk');
    if (!tag) return Promise.resolve();
    return new Promise((res) => { tag.addEventListener('load', res, { once: true }); tag.addEventListener('error', res, { once: true }); setTimeout(res, 3500); });
  },
  async init() {
    await this._script();
    const s = raw();
    if (!s) return;
    try {
      await Promise.race([s.init(), new Promise((_, rej) => setTimeout(() => rej(new Error('sdk init timeout')), 4000))]);
      this.env = safe(() => s.environment, 'disabled');
      this.active = this.env === 'crazygames' || this.env === 'local';
      if (this.active) {
        safe(() => s.game.addSettingsChangeListener((st) => this.onMuteChange && this.onMuteChange(!!st.muteAudio)));
      }
    } catch (e) { this.active = false; }
  },

  get platformMuted() { return this.active ? !!safe(() => raw().game.settings.muteAudio, false) : false; },
  systemInfo() { return this.active ? safe(() => raw().user.systemInfo, null) : null; },
  async username() {
    if (!this.active) return null;
    try { const u = await raw().user.getUser(); return u && u.username ? u.username : null; } catch (e) { return null; }
  },

  loadingStart() { if (this.active && !this._loading) { this._loading = true; safe(() => raw().game.loadingStart()); } },
  loadingStop() { if (this.active && this._loading) { this._loading = false; safe(() => raw().game.loadingStop()); } },
  gameplayStart() { if (this.active && !this._playing) { this._playing = true; safe(() => raw().game.gameplayStart()); } },
  gameplayStop() { if (this.active && this._playing) { this._playing = false; safe(() => raw().game.gameplayStop()); } },
  happytime() { if (this.active) safe(() => raw().game.happytime()); },

  // Resolves true when the ad was shown to the end, false otherwise. Never rejects.
  _ad(type) {
    return new Promise((resolve) => {
      if (!this.active) return resolve(false);
      let done = false;
      const finish = (ok) => { if (done) return; done = true; this.onAdState && this.onAdState(false); resolve(ok); };
      try {
        raw().ad.requestAd(type, {
          adStarted: () => this.onAdState && this.onAdState(true),
          adFinished: () => finish(true),
          adError: () => finish(false),
        });
      } catch (e) { finish(false); }
      setTimeout(() => finish(false), 120000);
    });
  },
  midgameAd() { return this._ad('midgame'); },
  rewardedAd() { return this._ad('rewarded'); },
  get rewardedAvailable() { return this.active; },

  // Storage: CrazyGames cloud-synced data module when on-platform, localStorage otherwise.
  getItem(k) {
    if (this.active) { const v = safe(() => raw().data.getItem(k), null); if (v != null) return v; }
    return safe(() => window.localStorage.getItem(k), null);
  },
  setItem(k, v) {
    if (this.active) safe(() => raw().data.setItem(k, v));
    safe(() => window.localStorage.setItem(k, v));
  },
};
