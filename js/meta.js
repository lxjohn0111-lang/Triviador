// Progression: match rewards, leagues, daily quests, achievements, daily login reward, shop prices.
import { store, leagueOf, levelInfo, todayKey } from './store.js';

export const QUEST_POOL = [
  { k: 'win', n: 1, r: 60 }, { k: 'play', n: 3, r: 50 }, { k: 'mc', n: 12, r: 50 }, { k: 'capture', n: 4, r: 60 },
  { k: 'defend', n: 3, r: 60 }, { k: 'guess', n: 3, r: 50 }, { k: 'capital', n: 1, r: 90 }, { k: 'win', n: 2, r: 110 }, { k: 'mc', n: 20, r: 80 },
];
export const ACHIEVEMENTS = [
  { id: 'w1', type: 'wins', n: 1, r: 50 }, { id: 'w10', type: 'wins', n: 10, r: 120 }, { id: 'w50', type: 'wins', n: 50, r: 350 },
  { id: 's3', type: 'streak', n: 3, r: 100 }, { id: 's5', type: 'streak', n: 5, r: 220 },
  { id: 'c100', type: 'correct', n: 100, r: 100 }, { id: 'c500', type: 'correct', n: 500, r: 300 },
  { id: 'q25', type: 'captures', n: 25, r: 100 }, { id: 'q100', type: 'captures', n: 100, r: 260 },
  { id: 'd10', type: 'defends', n: 10, r: 100 }, { id: 'k3', type: 'castles', n: 3, r: 150 },
  { id: 'g3', type: 'countries', n: 3, r: 150 }, { id: 'g10', type: 'countries', n: 10, r: 400 },
  { id: 'l3', type: 'league', n: 3, r: 200 }, { id: 'l6', type: 'league', n: 6, r: 500 }, { id: 'p4', type: 'score', n: 4000, r: 150 },
];
export const achValue = (a, p) => ({ wins: p.stats.wins, streak: p.stats.bestStreak, correct: p.stats.mcRight, captures: p.stats.captures, defends: p.stats.defends, castles: p.stats.capitals, countries: Object.keys(p.won).length, league: leagueOf(p.trophies), score: p.stats.bestScore }[a.type] || 0);
export const PRICES = { half: 100, scout: 100, emblem: 250, theme: 400 };
export const DAILY = [{ c: 40 }, { c: 50 }, { c: 60, half: 1 }, { c: 80 }, { c: 100, scout: 1 }, { c: 120 }, { c: 200, half: 2, scout: 2 }];

export function ensureQuests() {
  const p = store.p, day = todayKey();
  if (p.quests.day !== day) {
    const pool = QUEST_POOL.slice().sort(() => Math.random() - 0.5); const list = []; const kinds = new Set();
    for (const q of pool) { if (list.length < 3 && !kinds.has(q.k)) { kinds.add(q.k); list.push({ ...q, p: 0, done: false }); } }
    p.quests = { day, list }; store.save();
  }
  return p.quests.list;
}
export function dailyAvailable() { return store.p.daily.last !== todayKey(); }
export function claimDaily() {
  const p = store.p, d = new Date(); d.setDate(d.getDate() - 1); const yesterday = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  p.daily.streak = p.daily.last === yesterday ? (p.daily.streak % 7) + 1 : 1; p.daily.last = todayKey();
  const r = DAILY[p.daily.streak - 1]; p.coins += r.c; p.boosters.half += r.half || 0; p.boosters.scout += r.scout || 0; store.save();
  return { day: p.daily.streak, reward: r };
}
export const botSkill = (p) => (p.stats.games < 2 ? 0.12 : p.stats.games < 5 ? 0.25 : Math.min(0.9, 0.3 + leagueOf(p.trophies) * 0.085));

// Applies a finished match to the profile and returns everything the results screen shows.
export function applyResult(sum, cc) {
  const p = store.p, s = sum.stats, pl = sum.place, blitz = sum.mode === 'blitz', k = blitz ? 0.6 : 1;
  const before = { level: levelInfo(p.xp).lvl, league: leagueOf(p.trophies), trophies: p.trophies };
  const coins = Math.round(([70, 35, 15][pl - 1] + s.mcRight * 3 + s.numWins * 4 + s.captures * 5 + s.defends * 3 + s.sideline * 4) * k);
  const xp = Math.round(([50, 30, 18][pl - 1] + s.mcRight * 3 + s.numWins * 3) * k);
  const tro = Math.round([26, 4, -14][pl - 1] * (blitz ? 0.55 : 1));
  p.coins += coins; p.xp += xp; p.trophies = Math.max(0, p.trophies + tro);
  const st = p.stats; st.games++; if (pl === 1) { st.wins++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak); p.won[cc] = (p.won[cc] || 0) + 1; } else { st.streak = 0; if (pl === 2) st.second++; else st.third++; }
  st.mcRight += s.mcRight; st.mcTotal += s.mcTotal; st.numWins += s.numWins; st.numTotal += s.numTotal; st.captures += s.captures; st.defends += s.defends; st.capitals += s.capitals; st.sideline += s.sideline;
  st.bestScore = Math.max(st.bestScore, sum.scores[0]);
  const inc = { win: pl === 1 ? 1 : 0, play: 1, mc: s.mcRight, capture: s.captures, defend: s.defends, guess: s.numWins, capital: s.capitals };
  const questsDone = [];
  for (const q of ensureQuests()) { if (q.done) continue; q.p = Math.min(q.n, q.p + (inc[q.k] || 0)); if (q.p >= q.n) { q.done = true; p.coins += q.r; questsDone.push(q); } }
  const after = levelInfo(p.xp); let levelCoins = 0; if (after.lvl > before.level) { levelCoins = (after.lvl - before.level) * 50; p.coins += levelCoins; }
  const newAch = []; for (const a of ACHIEVEMENTS) { if (!p.ach[a.id] && achValue(a, p) >= a.n) { p.ach[a.id] = 1; p.coins += a.r; newAch.push(a); } }
  store.save();
  return { coins, xp, tro, levelUp: after.lvl > before.level ? after.lvl : 0, levelCoins, leagueUp: leagueOf(p.trophies) > before.league ? leagueOf(p.trophies) : -1, questsDone, newAch, streak: st.streak };
}
export function applyQuit() { const p = store.p; p.trophies = Math.max(0, p.trophies - 10); p.stats.games++; p.stats.third++; p.stats.streak = 0; store.save(); }
