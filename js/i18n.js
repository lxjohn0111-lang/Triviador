// UI strings. English is bundled (always-available fallback); other languages load from data/i18n/<lang>.json.
export const EN = {
  play: 'Play', mode_classic: 'Classic', mode_blitz: 'Blitz', mode_classic_d: '4 battle rounds', mode_blitz_d: '2 rounds · fast timers',
  shop: 'Shop', quests: 'Quests', profile: 'Profile', settings: 'Settings', howto: 'How to play', close: 'Close', you: 'You',
  leave: 'Leave match', leave_q: 'Leave this match? It will count as a defeat.', yes: 'Leave', no: 'Stay', loading: 'Loading…', level: 'Level {n}',
  tagline: 'Conquer {country} with what you know',
  pick_country: 'Choose your battlefield', search: 'Search country…', language: 'Language', pick_hint: 'Questions are asked in the language you choose.', won_times: 'Won ×{n}',
  phase_capitals: 'Capitals', phase_expand: 'Expansion', phase_battle: 'Battle',
  b_capitals: 'Found your realm', b_capitals_sub: 'Each player builds a castle', b_expand: 'Expansion', b_expand_sub: 'The closest guess picks land first',
  b_battle: 'To battle!', b_battle_sub: 'Attack your neighbours. Defend your land.', b_final: 'Final round', b_final_sub: 'Last chance to turn the tide',
  hint_capital: 'Tap a territory to build your castle', hint_expand: 'Pick a territory to claim', hint_attack: 'Choose an enemy territory to attack',
  hint_wait: '{name} is choosing…', hint_attack_wait: '{name} is planning an attack…', closest_wins: 'Closest guess wins',
  attack_title: '{a} attacks {b} — {r}', siege: 'Castle siege · towers left: {n}', siege_on: '{a} storms on! Towers left: {n}',
  tiebreak: 'Tiebreak', tiebreak_sub: 'Both were right — the closest guess wins', tower_down: 'Tower down!',
  res_captured: '{a} conquers {r}', res_defended: '{b} defends {r}', res_nobody: 'Nobody was right — the attack fails',
  castle_fallen: '{b}’s castle has fallen!', castle_fallen_sub: '{a} takes the whole realm',
  sideline: 'Sideline bet — answer right for bonus coins', booster_half: '50:50', booster_scout: 'Hint', scout_range: 'Between {a} and {b}',
  enter_number: 'Type a number', correct_answer: 'Correct answer',
  r_win: 'Victory!', r_second: 'Second place', r_third: 'Defeated', r_elim: 'Your castle has fallen', r_rewards: 'Rewards', r_double: 'Double coins',
  r_again: 'Play again', r_menu: 'Menu', r_levelup: 'Level up! Level {n}', r_league: 'Promoted to {name}', r_newach: 'Achievement unlocked',
  r_correct: 'Correct answers', r_captures: 'Conquests', r_defends: 'Defences', r_streak: 'Win streak ×{n}', r_sideline: 'Sideline bets won',
  league0: 'Recruit', league1: 'Squire', league2: 'Knight', league3: 'Baron', league4: 'Count', league5: 'Duke', league6: 'King', league7: 'Emperor',
  shop_boosters: 'Boosters', shop_half_d: 'Removes two wrong answers', shop_scout_d: 'Shows a range for the number', shop_emblems: 'Emblems', shop_themes: 'Map styles',
  theme0: 'Atlas', theme1: 'Midnight', theme2: 'Blossom', shop_free: 'Free boosters', shop_free_d: 'Watch a short video: +1 of each', owned: 'Owned', use: 'Use', in_use: 'In use', not_enough: 'Not enough coins',
  p_name: 'Your name', p_color: 'Colour', p_emblem: 'Emblem', stats: 'Statistics', s_games: 'Matches', s_wins: 'Wins', s_winrate: 'Win rate', s_accuracy: 'Accuracy',
  s_best_streak: 'Best streak', s_best_score: 'Best score', s_captures: 'Conquests', s_countries: 'Countries won', achievements: 'Achievements',
  a_wins: 'Win {n} matches', a_streak: 'Win {n} matches in a row', a_correct: 'Give {n} correct answers', a_captures: 'Conquer {n} territories', a_defends: 'Repel {n} attacks',
  a_castles: 'Destroy {n} castles', a_countries: 'Win in {n} different countries', a_league: 'Reach the {name} league', a_score: 'Score {n} points in one match', claim: 'Claim', claimed: 'Claimed',
  quests_title: 'Daily quests', quests_reset: 'New quests every day', q_win: 'Win matches', q_play: 'Play matches', q_mc: 'Answer quiz questions correctly', q_capture: 'Conquer territories in battle',
  q_defend: 'Repel attacks', q_guess: 'Win guess rounds', q_capital: 'Destroy a castle', quest_done: 'Quest complete!',
  daily_title: 'Daily reward', daily_day: 'Day {n}', daily_sub: 'Come back tomorrow for a bigger reward',
  set_sound: 'Sound effects', set_music: 'Music', set_country: 'Country & language',
  how1_t: 'Build your castle', how1_d: 'Pick a territory for your capital. It is worth 1000 points and is protected by three towers.',
  how2_t: 'Expand', how2_d: 'Everyone answers a number question. The closest guess claims two territories, the runner-up one.',
  how3_t: 'Battle', how3_d: 'Attack a neighbouring territory and win the quiz duel to conquer it. If both are right, a guess decides.',
  how4_t: 'Win', how4_d: 'Knock down all three towers to take a rival’s whole realm. The highest score after the last round wins.',
};
let cur = EN; let lang = 'en';
export async function loadLang(l) {
  lang = l;
  if (l === 'en') { cur = EN; }
  else { try { const r = await fetch(`data/i18n/${l}.json`); cur = r.ok ? { ...EN, ...(await r.json()) } : EN; } catch (e) { cur = EN; } }
  document.documentElement.lang = l;
}
export const t = (k, v) => { let s = cur[k] ?? EN[k] ?? k; if (v) s = s.replace(/\{(\w+)\}/g, (_, n) => (v[n] ?? '')); return s; };
export const getLang = () => lang;
