# Well Played — Product Spec

> Daily word & puzzle games for a healthy mind.

## 1. Vision

Well Played collects short, satisfying daily puzzles in the spirit of Wordle and Bandle in one calm,
good-looking app. Each game works a different mental skill, so a few minutes a day gives your brain a
varied workout. The tone is gentle: no timers ticking down at you, no harsh "GAME OVER". Losing a
puzzle just shows the answer kindly, and every day starts fresh.

### Goals
- **Daily ritual.** One shared puzzle per game per day (same for everyone), plus unlimited practice.
- **Variety by design.** Each game is tagged with a *mind area* — Language, Logic, Memory,
  Spatial, Perception, Listening, Memory, Focus, Association — and the hub shows how balanced your week has been.
- **Calm & delightful.** Warm palette, soft motion, satisfying tile flips, subtle sound, confetti on wins.
- **Accessible.** Colour-blind palette, reduced motion, dark mode, full keyboard and touch support.
- **Zero friction.** No account, no install step, works offline, progress stays on the device.

### Non-goals (v1)
- Accounts, cloud sync, leaderboards, ads, notifications.
- Medical claims. We say "exercise" and "variety", never "prevents decline".

## 2. Games

| # | Game | Mind area | Based on | Core loop |
|---|------|-----------|----------|-----------|
| 1 | **Word** | Language | Wordle | Guess the 5-letter word in 6 tries. Green = right spot, gold = in the word, grey = not in it. |
| 2 | **Duet** | Focus | Dordle | Two hidden words, 7 shared guesses. Keys split in half to show each board's colour. |
| 3 | **Quad** | Focus | Quordle | Four hidden words, 9 shared guesses. Keys split into quarters, one per board. |
| 4 | **Sums** | Logic | Nerdle | Guess an 8-character equation (e.g. `12+35=47`) in 6 tries. Standard order of operations. |
| 5 | **Code** | Logic | Mastermind × Wordle | Crack a 5-colour code (8 colours, repeats allowed) in 6 tries with per-slot Wordle feedback. Every colour also has a symbol for colour-blind play. |
| 6 | **Ladder** | Language | Word ladder + Wordle colouring | Turn the start word into the target one letter at a time; every step a real word. Aim for par. Undo / hint / reveal. |
| 7 | **Swap** | Spatial | Waffle | A 5×5 waffle of six crossing words, scrambled. Swap tiles to fix it within 15 swaps (solvable in 10). Green locks, gold = belongs elsewhere in that row/column. Stars = swaps saved. |
| 8 | **Hue** | Perception | Hexle / colour matching | Recreate the colour of the day with H/S/L sliders in 6 tries. Match % plus per-slider arrows. Win at ≥95%. |
| 9 | **Tune** | Listening | Bandle / Heardle | Name a public-domain melody (synthesised in-browser) from 3, 5, 7, 10, 14 notes, then the full phrase. Skip or guess from a searchable list. |
| 10 | **Echo** | Memory | Simon | Repeat a growing sequence of lit, musical pads. 3 hearts. Score = longest sequence. |
| 11 | **Groups** | Association | Connections | Sort 16 words into 4 hidden groups of 4. 4 mistakes. "One away" hint. Easy (gold) to devious (purple). |

### Shared rules
- **Daily puzzle**: deterministic from the local date (day #1 = 2026-01-01) and the game id via a seeded
  PRNG, so everyone gets the same puzzle and answers don't repeat until the list cycles.
- **Practice**: random seed, unlimited, counts toward the weekly balance but not daily stats/streaks.
- **Resume**: an in-progress daily is saved after every move; reopening restores it.
- **Share**: every result produces an emoji summary (`Well Played · Word #284 4/6` + grid).

## 3. Screens

1. **Hub (home)**
   - Greeting by time of day + date.
   - *Today's workout* ring: dailies completed / total, mind streak 🔥, countdown to tomorrow.
   - Game cards: icon, name, one-line pitch, mind-area chip, status (Play / In progress / ✓ result).
   - *This week's balance*: one bar per mind area (last 7 days).
   - Rotating gentle tip.
2. **Game**: top bar (back, title, daily #/practice badge, help, mode switch), board, on-screen keyboard
   or controls. How-to-play modal auto-opens the first time.
3. **Result modal**: headline ("Splendid!"/"So close"), answer, game stats, share, practice, next
   suggested game, countdown.
4. **Stats**: mind streak, best streak, days active, total sessions, 5-week activity calendar,
   balance by area (30 days), per-game cards (played, win %, streak, distribution).
5. **Settings**: theme (system/light/dark), colour-blind mode, sound, reduced motion, reset data.

## 4. Data & architecture

- **Stack**: plain HTML/CSS/JS, no build step, no dependencies. Classic `<script>` tags so it also
  runs from `file://`. PWA manifest + service worker for install/offline when served over HTTP.
- **Layout**
  ```
  index.html              shell, script tags
  css/styles.css          design tokens, components, games
  js/core.js              WH namespace: RNG, dates, storage, DOM helper, toast, modal,
                          keyboard component, sound, confetti, share
  js/data/words.js        generated word lists (answers, valid guesses, 4-letter words)
  js/data/daily.js        generated window of curated daily content
  content/days/*.json     curated daily content (source of truth)
  js/data/groups.js       Groups category pool
  js/games/*.js           one file per game, each calls WH.register({...})
  js/app.js               router (#/ , #/play/:id[?practice], #/stats), hub, stats, settings, results
  scripts/build-words.mjs builds js/data/words.js from scripts/lists/* + /usr/share/dict/words
  sw.js, manifest.webmanifest, icon.svg
  ```
- **Game contract**
  ```js
  WH.register({
    id, name, area, tagline, color, icon,      // metadata for hub
    statType: 'guesses' | 'best' | 'par' | 'mistakes' | 'stars',
    maxGuesses,                                // for 'guesses'
    howTo,                                     // HTML string
    mount(root, ctx) → { onKey(key), destroy() }
  })
  ctx = { mode, day, seed, rng, content, label, load(), save(state), complete(result, opts) }
  result = { won, score, label, title, sub, note, share }
  ```
- **Storage** (`localStorage['wellplayed:v1']`)
  ```js
  { settings: { theme, colorblind, sound, reducedMotion },
    seen: { [gameId]: true },                       // how-to shown
    progress: { [`${gameId}:${day}`]: state },      // resumable daily state
    results: { [day]: { [gameId]: result } },       // completed dailies
    stats: { [gameId]: { played, wins, streak, maxStreak, lastDay, dist, best, total } },
    log: [{ d: day, g: gameId, p: isPractice, w: won }] }   // capped, drives balance chart
  ```
- **Word lists**: hand-curated common answers (5-letter, 4-letter); valid guesses = curated ∪ system
  dictionary ∪ simple inflections (plural `s`, `ed`, `es`) so reasonable guesses aren't rejected.

## 5. Daily content pipeline

Puzzles are not just a fixed word list: each day is **hand-curated** and refreshed by a scheduled
daily run.

- **Source of truth**: `content/days/YYYY-MM-DD.json`, one file per day containing the theme, a mind
  note, the Word answer + fact, the Duet pair, the Sums equation, the Ladder pair, the colour of the
  day (name + fact) and a full Groups puzzle with deliberate red herrings.
- **Validation**: `scripts/validate-daily.mjs` loads the real game code and checks every day: words
  exist, equations compute, ladders are solvable with par 3–6 over common words, Groups has 16 unique
  words across levels 0–3, and nothing (word, equation, group) is *ever* reused.
- **Bundling**: `--build` writes a rolling window (last 7 days + all future days) into
  `js/data/daily.js`, loaded by the app with a classic script tag, so it works offline and from `file://`.
- **Cadence**: a scheduled task runs every morning, tops the buffer up to today + 7, validates, builds,
  and logs to `content/editor-log.md`. Weekly it also grows the fallback pools. Rules live in
  `CONTENT_GUIDE.md` (difficulty by weekday, seasonal calendar, Groups uniqueness checklist, tone).
- **Resilience**: any day without a curated file falls back to seeded generators (same puzzle for
  everyone), and a missed run is covered by the 7-day buffer.

## 6. Visual design

- Warm paper background with soft colour blooms, cream surfaces, ink-plum text.
- Type: *Fraunces* (display, soft serif) + *DM Sans* (UI/tiles); system fallbacks offline.
- Tile palette: sage green (correct), honey gold (present), warm grey (absent).
  Colour-blind: orange / sky blue.
- Each mind area has its own accent used on cards, chips and charts.
- Motion: tile pop on type, 3-D flip on reveal, shake on invalid, bounce on win, confetti.
  All gated by reduced-motion.

## 7. Milestones

1. Core shell, storage, router, hub, settings ✅
2. Word + Duet (shared engine) ✅
3. Sums, Ladder, Hue, Echo, Groups ✅
3b. Quad, Swap, Code, Tune (Breathe removed) ✅
4. Stats, share, result modal, PWA/offline ✅
5. Curated daily content + validator + scheduled daily run ✅
6. Later: hard mode, more Groups packs, weekly recap, cloud sync, native wrapper (Capacitor).
