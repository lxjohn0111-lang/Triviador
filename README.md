# Borderwise — Trivia Conquest

A three-player trivia strategy game built for **CrazyGames**: conquer the map of your own country by answering questions. It runs entirely in the browser and needs no server or build step.

## How a match plays

1. **Capitals.** Each player places a castle worth 1000 points. Three towers protect it.
2. **Expansion.** Everyone answers a number question. The closest guess claims two free territories and the runner-up claims one. Rounds repeat until the map is full. Each territory is worth 200 points.
3. **Battle.** Players take turns attacking a neighbouring territory in a two-player quiz duel:
   - attacker right, defender wrong: the territory changes hands;
   - defender right: the defender keeps it and earns +100;
   - both right: a closest-number tiebreak decides the duel.

   Attacking a castle knocks down one tower per won duel. When the last tower falls, the owner is eliminated and the attacker takes their whole realm.
4. **Result.** After the final round, the highest score wins.

There are three modes:

- **Blitz:** 2 battle rounds with shorter timers.
- **Classic:** 4 battle rounds.
- **Long campaign:** modelled on the original game's long campaign. It has 3 expansion rounds, then a **division of free land** phase where every remaining territory goes to the closest guess one at a time, then 6 battle rounds with the attack order rotating each round.

Players who are not in a duel can still answer from the sideline for bonus coins.

## Multiplayer

**Play** starts a match against two bots. **Multiplayer** opens a lobby:

- **Create room** gives a 5-character room code. On CrazyGames the lobby also offers an invite link and shows the platform's invite button.
- **Join** takes a friend's code, or opens automatically from a CrazyGames invite link (`roomId` invite parameter) or an instant-multiplayer start.
- Up to 3 people play. Empty seats are filled with bots when the host starts. The host picks the mode, and the match uses the host's map and question language. Each player keeps their own interface language.
- The host's browser runs the match and the other players' browsers mirror it. If a guest leaves, a bot takes over their seat. If the host leaves, the guests are told and return to the menu.

Connections are browser-to-browser WebRTC data channels through [PeerJS](https://peerjs.com/) (vendored in `js/vendor/`, MIT licence). The public PeerJS signalling server and its STUN/TURN servers are used, so no game server is needed. Online play does not work inside a claude.ai artifact, whose sandbox blocks WebRTC.

## Country and language detection

At boot the game picks the player's country in this order:

1. the CrazyGames SDK (`user.systemInfo.countryCode`);
2. the browser time zone;
3. the browser locale.

It then loads that country's map and picks a matching question language. An **English** notice ("We detected you are playing from …") appears for a few seconds. Tapping the notice, or the country chip on the menu, opens a picker for any of **236 countries** and **12 languages**: English, Magyar, Deutsch, Español, Français, Italiano, Português, Polski, Türkçe, Русский, Nederlands and Bahasa Indonesia.

Every map has exactly **15 playable territories**, built from real administrative regions (counties, states, provinces). Large regions are merged; when a country has too few regions, as with Monaco, it is split into organic-looking parts. Islands are linked by sea routes so every territory can be reached.

## Questions

Questions are generated, not drawn from a fixed list, which is why players rarely see repeats:

- **Geography:** capitals, borders, populations, areas, city sizes and distances, using real data for about 200 countries and 650 cities.
- **Local:** which of the player's own regions a city belongs to, local city populations, facts about the home country.
- **History:** 113 dated events, plus "which happened first?".
- **Culture and entertainment:** about 150 famous people and about 150 works (paintings, books, music, films).
- **Science, sport and numbers:** 100 numeric facts, 115 multiple-choice facts, chemical elements, mental arithmetic, Roman numerals.

A soak test of 3,000 consecutive questions produced 3,000 different ones in every language tested. The game also remembers the last 2,500 question IDs per player, so they are not asked again.

## Progression

The game includes:

- XP levels;
- eight trophy leagues, from Recruit to Emperor;
- coins;
- daily quests;
- a 7-day login reward;
- 16 achievements;
- a shop with 50:50 and Hint boosters, emblems and three map styles;
- a statistics page;
- a per-country win tracker.

Bot difficulty scales with the player's league.

## CrazyGames SDK integration (`js/sdk.js`)

| Feature | Where it is used |
| --- | --- |
| `init`, `environment` | Boot. Every call is a safe no-op when the SDK is missing or blocked. |
| `loadingStart` / `loadingStop` | Around the boot sequence. |
| `gameplayStart` / `gameplayStop` | Around each match. |
| `happytime` | When the player wins. |
| Midgame ad | Before every match except the first. |
| Rewarded ads | "Double coins" after a match, free boosters in the shop. |
| `user.systemInfo` | Country detection. |
| `user.getUser` | Default player name. |
| `data.getItem` / `setItem` | Saves progress. On CrazyGames the Data module is the only store, with no localStorage; off-platform the game falls back to localStorage. |
| `user.addAuthListener` | Reloads progress when the player signs in or out. |
| Settings listener (`muteAudio`) | Audio follows the platform mute setting. Audio is also muted while an ad plays. |

## CrazyGames submission pack

The `crazygames/` folder holds everything the submission form asks for: the upload zip, a 19.6-second 1080p preview video, the three cover images (1920×1080, 800×1200, 800×800) and `LISTING.md` with the description, controls, tags and answers for the form. Rebuild the zip after code changes with `python3 tools/package_crazygames.py`.

## Uploading to CrazyGames

Zip the **contents** of the repository root and upload the zip as an HTML5 game, with `index.html` at the root of the zip. Leave out `tools/` because it is only needed to regenerate data. The zip is about 8 MB. A country's map file (20–130 KB) loads only when that country is picked.

## Running locally

Serve the folder with any static file server, for example:

```sh
npx serve .
```

Then open the printed URL. Opening `index.html` directly from disk will not work because the game uses ES modules and `fetch`.

## Project layout

```
index.html          page shell; loads the CrazyGames SDK and js/main.js
css/style.css       all styling (three map themes, responsive down to phone size)
js/                 game code (vanilla ES modules, no dependencies)
  main.js           boot + app controller (solo, host and guest matches)
  engine.js         authoritative match engine and bot AI (emits plain-JSON events)
  presenter.js      turns engine events into one player's screen, sends their input back
  net.js            rooms, lobby and relay over PeerJS (WebRTC)
  gameview.js       HUD, question panels, number pad
  mapview.js        SVG map renderer and effects
  questions.js      question generator
  ui.js             menus, shop, profile, results
  meta.js           rewards, quests, achievements
  sdk.js / store.js / detect.js / audio.js / i18n.js / dom.js
data/maps/          one JSON map per country + index.json
data/geo/           country/city/mountain facts and translated names
data/q/             trivia content per language
data/i18n/          UI strings per language (English is built in)
fonts/              Rubik (latin, latin-ext, cyrillic)
tools/              build-time generators (Node 18+)
```

## Rebuilding data

```sh
cd tools
npm install
# Natural Earth GeoJSON files go in tools/.cache/ (see build-maps.mjs for the file names)
node build-maps.mjs        # all countries, or e.g. "node build-maps.mjs HU DE"
node build-geo.mjs         # country/city facts + translated names
node build-content.mjs     # validates and emits trivia content (tools/content/*.mjs)
node build-ui.mjs          # validates and emits UI strings (tools/ui/*.mjs)
```

The two validators check that every language has every key and placeholder. To add a language, copy `tools/content/en.mjs` and `tools/ui/de.mjs`, translate them, add the language to `LANGS` in `js/detect.js`, then rerun both validators.

Map data comes from [Natural Earth](https://www.naturalearthdata.com/), which is public domain. Extra city names come from GeoNames via `all-the-cities` (CC BY 4.0).
