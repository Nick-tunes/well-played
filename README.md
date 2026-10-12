# Well Played

Daily word and puzzle games for a healthy mind. Eleven short games, each exercising a different mind
area, with fresh hand-curated puzzles every day.

| Game | Area | In one line |
|------|------|-------------|
| Word | Language | Guess the 5-letter word in 6 tries |
| Duet | Focus | Two words, one set of 7 guesses |
| Quad | Focus | Four words, one set of 9 guesses |
| Sums | Logic | Guess the 8-character equation |
| Code | Logic | Crack the 5-colour code |
| Ladder | Language | Change one letter at a time to reach the target |
| Swap | Spatial | Unscramble a waffle of six crossing words |
| Hue | Perception | Mix the colour of the day with sliders |
| Tune | Listening | Name the melody from a few notes |
| Echo | Memory | Repeat the growing light sequence |
| Groups | Association | Sort 16 words into 4 hidden groups |

## Run it

No build step and no dependencies. Either double-click `index.html`, or serve the folder (needed for
offline/install support):

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. On a phone, use "Add to Home Screen" to install it like an app.

## How daily content works

- `content/days/YYYY-MM-DD.json` holds one hand-curated day: Word + fact, Duet pair, Quad set, Sums
  equation, Ladder pair, Swap grid, colour of the day, melody of the day, a Groups puzzle, a theme and
  a mind note. (Code is generated from the date.)
- `node scripts/validate-daily.mjs --build` checks every day against the game rules (valid words,
  solvable ladders, true equations, unique Groups, no repeats ever) and bundles the current window
  into `js/data/daily.js`, which the app loads.
- A scheduled daily run keeps at least 7 days curated ahead, following `CONTENT_GUIDE.md`, and logs what
  it did in `content/editor-log.md`.
- Any day without curated content falls back to seeded generators, so the app never runs dry.

## Project layout

```
index.html            app shell
css/styles.css        design system + all game styles
js/core.js            shared helpers (RNG, storage, keyboard, board, modal, sound, confetti)
js/app.js             router, hub, results, stats, settings
js/games/*.js         one file per game
js/data/words.js      generated word lists (scripts/build-words.mjs)
js/data/groups.js     fallback Groups category pool
js/data/daily.js      generated curated window (scripts/validate-daily.mjs --build)
content/days/         curated daily content (source of truth)
scripts/              word-list build, content validator
SPEC.md               product spec · CONTENT_GUIDE.md  editorial playbook
```

## Deploying

Live at **https://nick-tunes.github.io/well-played/**. It's served by GitHub Pages from the `main`
branch root of https://github.com/Nick-tunes/well-played.

To publish a content update (the daily run does this after a passing `--build`):

```bash
git add content js/data scripts CONTENT_GUIDE.md
git commit -m "Daily content: <dates added>"
git push origin main
```

Pages redeploys within a minute or two. The service worker is network-first, so players get the new
`js/data/daily.js` on their next visit. Only commit when `node scripts/validate-daily.mjs --build` passes.
