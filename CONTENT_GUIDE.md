# Well Played — Daily Content Guide

This is the playbook for the daily content run. Each run keeps **at least 7 days of hand-curated
puzzles ahead of today**, so a missed run never leaves players without a fresh day. Days with no
curated file still work: the games fall back to seeded generators. But curated days are the
product, so the buffer matters.

## The daily run, step by step

1. `cd "/Users/nicholasfarraj/Wordle Hub"`
2. `node scripts/validate-daily.mjs` and read the coverage line. Note the last curated date.
3. Write new files in `content/days/` until coverage reaches **today + 7** (usually one file per run;
   more if runs were missed). One file per date: `content/days/YYYY-MM-DD.json`.
4. Re-run `node scripts/validate-daily.mjs --build`. It must print `✓ daily content valid` and
   rewrite `js/data/daily.js`. Fix every ERROR. Treat warnings as things to fix unless there's a reason.
5. Re-read each new Groups puzzle once more, as a player would (see the Groups checklist).
6. Append a line to `content/editor-log.md`: date of run, days added, themes, anything notable.
7. If the site is deployed (see README "Deploying"), publish the change the way that section says.

Never edit `js/data/daily.js` by hand; it's generated. Never reuse a past word, equation or group.
The validator enforces this across every file in `content/days/`.

## File format

```json
{
  "date": "2026-10-19",
  "theme": "Short, warm theme (2–4 words)",
  "note": "One or two sentences of gentle, practical mind-health encouragement (≤ 220 chars).",
  "word":   { "answer": "lemon", "fact": "One true, interesting sentence or two about the word." },
  "duet":   { "answers": ["grape", "toast"] },
  "quad":   { "answers": ["lemon", "pasta", "grill", "sauce"] },
  "sums":   { "equation": "7*8+4=60" },
  "ladder": { "start": "milk", "target": "cake" },
  "swap":   { "words": ["paper", "onion", "fetch", "proof", "print", "ranch"] },
  "hue":    { "h": 42, "s": 88, "l": 55, "name": "Saffron", "note": "One true sentence about the colour." },
  "tune":   { "id": "hot-cross-buns" },
  "groups": { "groups": [
    { "level": 0, "name": "Kitchen tools", "words": ["WHISK", "LADLE", "TONGS", "GRATER"] },
    { "level": 1, "name": "Herbs",         "words": ["THYME", "SAGE", "DILL", "MINT"] },
    { "level": 2, "name": "Pasta shapes",  "words": ["PENNE", "ORZO", "FUSILLI", "LINGUINE"] },
    { "level": 3, "name": "___ PIN",       "words": ["ROLLING", "SAFETY", "BOWLING", "HAIR"] }
  ] }
}
```

## Game-by-game rules

**Word / Duet**: lowercase 5-letter, common, well-known words (prefer `scripts/lists/answers5.txt`).
No plurals ending in -s, no obscure or offensive words, nothing grim (death, disease, violence). Duet's
two words must differ from each other and from the day's Word. Tie at least one to the theme when it's
natural. The `fact` must be accurate: etymology or a well-established fact. If unsure, leave it out
rather than guess.

**Quad**: four lowercase 5-letter common words, all different from each other and from the day's
Word and Duet. Same word rules as Word. A loose theme link across the four is a nice touch.

**Swap**: six words `[row0, row2, row4, col0, col2, col4]` crossing like a waffle (row r's letter k
equals column k's letter r at the 9 intersections). Get candidates with
`node scripts/validate-daily.mjs --swaps 12` and pick a grid of friendly words. Avoid reusing a word
that appears in the same day's Word/Duet/Quad. The game scrambles it from the date.

**Tune**: an `id` from `js/data/tunes.js`. Match the theme where possible (holiday songs in
December, lullabies on rest days). Don't repeat a tune within 21 days (the validator warns). To add a
melody, append it to `tunes.js` (public-domain only, opening phrase, ≥ 8 notes) and play it in the app to
check it sounds right before using it.

**Code**: nothing to curate. It's generated from the date.

**Sums**: exactly 8 characters, one `=`, a single number on the right, `+ - * /`, normal precedence,
no leading zeros, divisions exact. Vary the shape day to day (`a+b=cc`, `a*b-c=dd`, `aaa/b=cc`,
`aa-bb=cc`…). Weekday difficulty: one operator early in the week, two operators later.

**Ladder**: both words must be in `scripts/lists/common4.txt` and par (common-word path) 3–6.
Find candidates with `node scripts/validate-daily.mjs --ladder start target` or
`--ladders 5`. Prefer pairs with a theme link (cold→warm, milk→cake, calm→mind). Words may be added
to `common4.txt` if they are genuinely common. Re-run `node scripts/build-words.mjs` afterwards.

**Hue**: `h` 0–359, `s` 20–95, `l` 20–85. Give it an evocative real-world name tied to the theme.
Avoid near-repeats of recent colours (vary hue by ≥40° day to day). Mid-saturation, mid-lightness
colours are the most satisfying to match; push extremes only occasionally.

**Groups**: this is the puzzle players remember. Every puzzle must have **exactly one solution**.
- Levels: 0 = straightforward category, 1 = needs some knowledge, 2 = lateral (`___FISH`, "Have
  rings"), 3 = wordplay (hidden words, homophones, `___ CONE`).
- Include **1–3 deliberate red herrings**: a word that seems to fit a second group, but where only one
  assignment lets all four groups complete. Example: PINE looks like a Tree, but Trees already has
  OAK/ELM/CEDAR/ASH and `___ CONE` needs it.
- Checklist before saving:
  1. Does any group have a 5th plausible member among the other 12 words? If yes, make sure the
     overall solution is still unique, or swap a word.
  2. Is every category name clear once revealed? ("Have shells", not "Shell things").
  3. All 16 words uppercase, unique, ≤ 11 characters, family-friendly.
  4. No group repeated from a previous day (the validator checks exact repeats; avoid near-repeats too).

**theme / note**: theme ties the day together loosely (seasons, holidays, everyday life). The note is
kind, specific and actionable: noticing, movement, sleep, connection, curiosity, rest. **No medical
claims** ("prevents dementia", "cures anxiety"). Prefer "is linked with", "can help", "is a lovely way
to". Don't lecture.

## Difficulty by weekday

Monday easiest → Saturday hardest, Sunday gentle (a "rest day" feel). Apply it across Word/Duet/Quad
word choice, Sums operator count, Ladder par (Mon 3–4, Sat 5–6), Tune (famous nursery tunes early in the
week, classical themes later) and Groups herring density.

## Seasonal calendar (plan themes around these)

- Oct 31 Halloween · Nov: autumn harvest, Thanksgiving (US, 4th Thu) · Dec: winter, festive lights,
  solstice (~Dec 21), New Year's Eve · Jan 1 fresh start · Feb 14 kindness/love · Mar 20 spring equinox
  · Apr 22 Earth Day · May: gardens · Jun 21 summer solstice · Jul–Aug: summer, travel, sea · Sep:
  back to school, learning.
- World Mental Health Day is Oct 10: a good anchor for a reflective theme in future years.

## Periodic upkeep (weekly, on Sundays)

- Add 2–3 new public-domain melodies to `js/data/tunes.js` (the library is small, so it needs to grow).
- Add 5–10 new categories to `js/data/groups.js` (the generator fallback pool) and a few fresh words to
  `scripts/lists/answers5.txt` / `common4.txt`; re-run `node scripts/build-words.mjs`.
- Skim `content/editor-log.md` for the last week: vary themes, colours and Sums shapes.

## Reserve days

`content/reserve/R01.json … R28.json` are complete, **evergreen** days (no dates, holidays or seasons)
that the app plays in rotation on any date that has no `content/days` file, so a missed run never
falls back to random puzzles. They use the same format, minus the `date` field.

- The validator checks reserve days first: their Word/Duet/Quad answers, equations and groups count as
  used, so a new daily that reuses one is flagged. Pick a different word rather than editing the reserve.
- `--build` also writes `js/data/reserve.js`.
- Don't edit reserve days during a normal daily run. If you ever add more, keep them evergreen.
