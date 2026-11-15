// Persistent player profile (cloud-synced through the CrazyGames data module when available).
import { sdk } from './sdk.js';
const KEY = 'borderwise_profile_v1';
const defaults = () => ({
  v: 1, name: '', emblem: 0, color: 0, theme: 0,
  country: null, lang: null, manual: false,
  coins: 150, xp: 0, trophies: 0,
  boosters: { half: 2, scout: 2 },
  stats: { games: 0, wins: 0, second: 0, third: 0, mcRight: 0, mcTotal: 0, numWins: 0, numTotal: 0, captures: 0, defends: 0, capitals: 0, streak: 0, bestStreak: 0, bestScore: 0, sideline: 0 },
  won: {},
  owned: { emblems: [0, 1, 2], themes: [0] },
  ach: {},
  daily: { last: null, streak: 0 },
  quests: { day: null, list: [] },
  seen: [],
  settings: { sfx: true, music: true },
  tutorial: false,
});
const merge = (base, saved) => {
  for (const k of Object.keys(saved || {})) {
    if (saved[k] && typeof saved[k] === 'object' && !Array.isArray(saved[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], saved[k]);
    else base[k] = saved[k];
  }
  return base;
};

export const store = {
  p: defaults(),
  load() {
    try { const raw = sdk.getItem(KEY); if (raw) this.p = merge(defaults(), JSON.parse(raw)); } catch (e) { this.p = defaults(); }
    return this.p;
  },
  _t: null,
  save() { clearTimeout(this._t); this._t = setTimeout(() => { try { sdk.setItem(KEY, JSON.stringify(this.p)); } catch (e) { /* ignore */ } }, 150); },
  markSeen(id) { const s = this.p.seen; s.push(id); if (s.length > 2500) s.splice(0, s.length - 2500); },
  seenSet() { return new Set(this.p.seen); },
};

export const LEAGUES = [0, 80, 200, 400, 700, 1100, 1600, 2300];
export const leagueOf = (tr) => { let i = 0; while (i + 1 < LEAGUES.length && tr >= LEAGUES[i + 1]) i++; return i; };
export const xpForLevel = (lvl) => 60 + (lvl - 1) * 45;
export function levelInfo(xp) { let lvl = 1, rest = xp; while (rest >= xpForLevel(lvl)) { rest -= xpForLevel(lvl); lvl++; } return { lvl, cur: rest, need: xpForLevel(lvl) }; }
export const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
