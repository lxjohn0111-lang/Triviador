# Borderwise: CrazyGames submission pack

## Files in this folder

| File | Use |
| --- | --- |
| `borderwise-crazygames.zip` | Game build: one self-contained `index.html` at the zip root, with all code, styles, fonts and data embedded. Rebuild with `node tools/build-crazygames.mjs`. |
| `borderwise-trailer-1920x1080.mp4` | Preview video: 19.6 s, 1920×1080, H.264, no audio, 7.2 MB. |
| `cover-landscape-1920x1080.png` | Landscape cover (16:9). |
| `cover-portrait-800x1200.png` | Portrait cover (2:3). |
| `cover-square-800x800.png` | Square cover (1:1). |

## Title

Borderwise

## Short description

Conquer your own country with what you know. Win quiz duels, siege castles and take the whole map.

## Description

Borderwise is a trivia strategy game played on the map of your own country. The game detects where you are playing from and builds the map from your real regions, counties or states. It asks questions in your language.

Each match has three players. Everyone builds a castle, then races for land with number questions where the closest guess picks first. Next comes the battle: attack a neighbouring territory, win the quiz duel and it is yours. Knock down all three towers of a rival's castle to take their whole realm. The highest score after the last round wins.

- 236 countries, each with its own playable map. Switch to any country at any time.
- 12 languages: English, Hungarian, German, Spanish, French, Italian, Portuguese, Polish, Turkish, Russian, Dutch and Indonesian.
- Questions are generated from real data covering geography, your home country, history, science, arts, film, music, sport and numbers, so they rarely repeat.
- Three modes: Blitz, Classic and Long Campaign. Long Campaign adds a division of free land phase and 6 battle rounds.
- Play against bots, or create a room and play online with up to 2 friends. Bots fill any empty seats.
- Climb 8 leagues from Recruit to Emperor, level up, complete daily quests, collect a daily reward and unlock achievements, emblems and map styles.

## Controls

- **Mouse or touch:** tap a territory to build your castle, claim land or attack. Tap an answer to choose it.
- **Keyboard, quiz questions:** press 1–4 or A–D to answer.
- **Keyboard, number questions:** type digits, press Backspace to delete and Enter to submit.
- **Boosters:** 50:50 removes two wrong answers. Hint shows a range for number questions.

## Suggested category and tags

- Category: Puzzle (Trivia / Quiz)
- Tags: trivia, quiz, geography, strategy, multiplayer, map, conquest, educational, 3 player, castle

## Answers for the submission form

- **Does your game save progress?** Yes. Progress is saved with the CrazyGames Data module only, for guests and signed-in players. Turn this toggle on, because the Data module is disabled otherwise. The save is a single key, `borderwise_profile_v1`, kept well under 100 KB.
- **Multiplayer:** Yes, up to 3 players in a room with bots in empty seats. Rooms use a 5-character code. The CrazyGames invite button and invite links (`roomId` parameter) are supported, and an instant-multiplayer start opens a new room. The connection is peer-to-peer WebRTC through the public PeerJS server, so no game server is needed.
- **Mobile:** Yes. Portrait and landscape, touch controls.
- **SDK integration:** HTML5 SDK v3.
  - `loadingStart` / `loadingStop` run around the boot.
  - `gameplayStart` / `gameplayStop` run around matches and pause while the quit dialog is open.
  - A midgame ad plays between matches. Rewarded ads give double coins after a match and free boosters in the shop.
  - `happytime` fires on a win.
  - Game audio is muted while an ad plays, and the platform `muteAudio` setting takes priority over the in-game sound settings.
  - The country comes from `user.systemInfo.countryCode`, and the player name from `user.getUser`.
  - Progress reloads when the player signs in or out.
