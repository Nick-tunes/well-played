// Validates the curated daily content in content/days/*.json against the game rules,
// and (with --build) bundles the current window into js/data/daily.js for the app.
// Usage:
//   node scripts/validate-daily.mjs              validate everything, report coverage
//   node scripts/validate-daily.mjs --build      validate, then write js/data/daily.js (only if valid)
//   node scripts/validate-daily.mjs --ladder cold warm   show par + a shortest path
//   node scripts/validate-daily.mjs --ladders 5   suggest common-word ladder pairs at distance 5
//   node scripts/validate-daily.mjs --swaps 8     suggest Swap (waffle) grids
// Exits non-zero if any error is found.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { console, Math, Date, JSON };
sandbox.window = sandbox;
sandbox.addEventListener = sandbox.removeEventListener = () => {}; // core.js wires browser events at load
sandbox.document = { addEventListener() {}, removeEventListener() {}, hidden: true };
vm.createContext(sandbox);
for (const f of ['js/core.js', 'js/data/words.js', 'js/data/groups.js', 'js/data/tunes.js', 'js/games/sums.js', 'js/games/swap.js', 'js/games/tune.js']) {
  vm.runInContext(readFileSync(join(root, f), 'utf8'), sandbox, { filename: f });
}
const WH = sandbox.WH, W = sandbox.WH_WORDS;
const daysDir = join(root, 'content/days');
const DAILY = {};
const parseErrors = [];
for (const f of existsSync(daysDir) ? readdirSync(daysDir).filter((f) => f.endsWith('.json')).sort() : []) {
  try {
    const e = JSON.parse(readFileSync(join(daysDir, f), 'utf8'));
    const d = f.replace('.json', '');
    if (e.date && e.date !== d) parseErrors.push(`${f}: "date" field ${e.date} does not match filename`);
    delete e.date;
    DAILY[d] = e;
  } catch (x) { parseErrors.push(`${f}: invalid JSON (${x.message})`); }
}
// Reserve: date-less, fully curated days the app plays whenever a date has no curated file.
const reserveDir = join(root, 'content/reserve');
const RESERVE = {};
for (const f of existsSync(reserveDir) ? readdirSync(reserveDir).filter((f) => /^R\d{2}\.json$/.test(f)).sort() : []) {
  try { RESERVE[f.replace('.json', '')] = JSON.parse(readFileSync(join(reserveDir, f), 'utf8')); }
  catch (x) { parseErrors.push(`reserve/${f}: invalid JSON (${x.message})`); }
}
const answers5 = new Set(W.answers5), common4 = new Set(W.common4);

// ---- ladder graph ----
const valid4 = WH.valid4List();
function buckets(words) {
  const m = new Map();
  for (const w of words) for (let i = 0; i < 4; i++) {
    const k = w.slice(0, i) + '_' + w.slice(i + 1);
    (m.get(k) || m.set(k, []).get(k)).push(w);
  }
  return m;
}
const vm4 = buckets(valid4), cm4 = buckets(W.common4);
function path(m, a, b) {
  const prev = new Map([[a, null]]), q = [a];
  for (let i = 0; i < q.length; i++) {
    const w = q[i];
    if (w === b) break;
    for (let j = 0; j < 4; j++) for (const n of m.get(w.slice(0, j) + '_' + w.slice(j + 1)) || []) {
      if (!prev.has(n)) { prev.set(n, w); q.push(n); }
    }
  }
  if (!prev.has(b)) return null;
  const out = [];
  for (let w = b; w; w = prev.get(w)) out.unshift(w);
  return out;
}

const args = process.argv.slice(2);
if (args[0] === '--ladder') {
  const [a, b] = args.slice(1);
  const pv = path(vm4, a, b), pc = path(cm4, a, b);
  console.log(`par (common words): ${pc ? pc.length - 1 : 'none'}  ${pc ? pc.join(' → ') : ''}`);
  console.log(`shortest using any valid word: ${pv ? pv.length - 1 : 'unreachable'}  ${pv ? pv.join(' → ') : ''}`);
  process.exit(0);
}
if (args[0] === '--swaps') {
  // Suggest Swap grids: [r0, r2, r4, c0, c2, c4], shown as a 5x5 waffle.
  for (let i = 0; i < (+args[1] || 5); i++) {
    const ws = WH.swap.generateWords(Math.random);
    const g = WH.swap.solutionFrom(ws);
    console.log(JSON.stringify(ws));
    for (let r = 0; r < 5; r++) console.log('   ' + [0, 1, 2, 3, 4].map((c) => (g[r * 5 + c] || ' ').toUpperCase()).join(' '));
  }
  process.exit(0);
}
if (args[0] === '--ladders') {
  const want = +args[1] || 4, out = [];
  for (const a of WH.shuffle(W.common4)) {
    for (const b of WH.shuffle(W.common4)) {
      if (a >= b) continue;
      const pc = path(cm4, a, b);
      if (pc && pc.length - 1 === want) out.push(`${a} → ${b}: ${pc.join(' ')}`);
      if (out.length >= 25) break;
    }
    if (out.length >= 25) break;
  }
  console.log(out.join('\n'));
  process.exit(0);
}

const errors = [...parseErrors], warnings = [];
// Every melody in the library must parse.
const tuneIds = new Set();
for (const t of sandbox.WH_TUNES) {
  tuneIds.add(t.id);
  try { if (sandbox.WH.tune.parse(t.notes).filter((n) => !n.rest).length < 8) warnings.push(`tune ${t.id}: fewer than 8 notes`); }
  catch (x) { errors.push(`tune ${t.id}: notes don't parse`); }
}
const lastTune = new Map();
const err = (d, m) => errors.push(`${d}: ${m}`);
const warn = (d, m) => warnings.push(`${d}: ${m}`);
const seenWord = new Map(), seenEq = new Map(), seenGroupName = new Map();
const dates = Object.keys(DAILY).sort();
const reserveKeys = Object.keys(RESERVE).sort();
// Reserve first: if a new daily reuses a reserve word, the daily is the one flagged.
for (const d of [...reserveKeys, ...dates]) {
  const e = RESERVE[d] || DAILY[d];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) && !/^R\d{2}$/.test(d)) { err(d, 'bad date key'); continue; }
  // Every word, equation and group may only be used once, ever. The first use wins.
  const track = (map, key, label) => {
    if (!key) return;
    if (map.has(key)) err(d, `${label} "${key}" already used on ${map.get(key)}`);
    else map.set(key, d);
  };
  for (const k of ['theme', 'note']) if (typeof e[k] !== 'string' || !e[k].trim()) err(d, `missing ${k}`);
  if (e.note && e.note.length > 220) warn(d, `note is long (${e.note.length} chars)`);

  // Word
  const w = e.word?.answer;
  if (!/^[a-z]{5}$/.test(w || '')) err(d, 'word.answer must be 5 lowercase letters');
  else if (!answers5.has(w) && !WH.isWord5(w)) err(d, `word "${w}" not in word lists`);
  if (!e.word?.fact) warn(d, 'word.fact missing');
  track(seenWord, w, 'word');

  // Duet
  const da = e.duet?.answers;
  if (!Array.isArray(da) || da.length !== 2 || da[0] === da[1]) err(d, 'duet.answers must be two different words');
  else da.forEach((x) => {
    if (!/^[a-z]{5}$/.test(x)) err(d, `duet word "${x}" must be 5 lowercase letters`);
    else if (!answers5.has(x) && !WH.isWord5(x)) err(d, `duet word "${x}" not in word lists`);
    if (x === w) err(d, `duet word "${x}" duplicates today's Word`);
    track(seenWord, x, 'word');
  });

  // Quad
  const qa = e.quad?.answers;
  if (!Array.isArray(qa) || qa.length !== 4 || new Set(qa).size !== 4) err(d, 'quad.answers must be four different words');
  else qa.forEach((x) => {
    if (!/^[a-z]{5}$/.test(x)) err(d, `quad word "${x}" must be 5 lowercase letters`);
    else if (!answers5.has(x) && !WH.isWord5(x)) err(d, `quad word "${x}" not in word lists`);
    if (x === w || (da || []).includes(x)) err(d, `quad word "${x}" duplicates today's Word/Duet`);
    track(seenWord, x, 'word');
  });

  // Swap
  const sw = e.swap?.words;
  if (!Array.isArray(sw) || sw.length !== 6 || new Set(sw).size !== 6) err(d, 'swap.words must be six different words [r0, r2, r4, c0, c2, c4]');
  else {
    sw.forEach((x) => { if (!/^[a-z]{5}$/.test(x) || (!answers5.has(x) && !WH.isWord5(x))) err(d, `swap word "${x}" not a valid 5-letter word`); });
    if (!WH.swap.solutionFrom(sw)) err(d, 'swap words do not cross correctly (row r[k] must equal column c[k] at intersections)');
    track(seenGroupName, 'SWAP|' + sw.join(','), 'swap grid');
  }

  // Tune
  const tid = e.tune?.id;
  if (!tuneIds.has(tid)) err(d, `tune.id "${tid}" not in js/data/tunes.js`);
  else {
    const prev = lastTune.get(tid);
    if (prev && (new Date(d) - new Date(prev)) / 864e5 < 21) warn(d, `tune "${tid}" repeats within 21 days (last ${prev})`);
    lastTune.set(tid, d);
  }

  // Sums
  const eq = e.sums?.equation;
  const why = eq ? WH.sums.validate(eq) : 'missing';
  if (why) err(d, `sums.equation "${eq}": ${why}`);
  track(seenEq, eq, 'equation');

  // Ladder
  const { start, target } = e.ladder || {};
  if (!/^[a-z]{4}$/.test(start || '') || !/^[a-z]{4}$/.test(target || '')) err(d, 'ladder start/target must be 4 lowercase letters');
  else {
    // Par is measured over common words (what the game uses for par and hints).
    const pc = path(cm4, start, target);
    if (!common4.has(start) || !common4.has(target)) err(d, 'ladder start/target must be in scripts/lists/common4.txt');
    else if (!pc) err(d, `ladder ${start}→${target} has no common-word path`);
    else {
      const par = pc.length - 1;
      if (par < 3 || par > 6) warn(d, `ladder par ${par} outside 3–6`);
    }
  }

  // Hue
  const hu = e.hue || {};
  if (!(hu.h >= 0 && hu.h <= 359) || !(hu.s >= 20 && hu.s <= 95) || !(hu.l >= 20 && hu.l <= 85)) err(d, 'hue h∈[0,359], s∈[20,95], l∈[20,85]');
  if (!hu.name) warn(d, 'hue.name missing');

  // Groups
  const gs = e.groups?.groups;
  if (!Array.isArray(gs) || gs.length !== 4) err(d, 'groups.groups must have 4 groups');
  else {
    const levels = gs.map((g) => g.level).sort().join('');
    if (levels !== '0123') err(d, 'groups need one of each level 0,1,2,3');
    const all = gs.flatMap((g) => g.words || []);
    if (all.length !== 16) err(d, 'groups need 4 words each');
    if (new Set(all).size !== all.length) err(d, 'groups contain a duplicate word');
    all.forEach((x) => {
      if (x !== x.toUpperCase()) err(d, `group word "${x}" must be uppercase`);
      if (x.length > 11) warn(d, `group word "${x}" is long; tile may be cramped`);
    });
    gs.forEach((g) => { if (!g.name) err(d, 'group missing name'); track(seenGroupName, g.name.toUpperCase() + '|' + [...g.words].sort().join(','), 'group'); });
  }
}

// ---- coverage ----
const today = WH.dateKey(new Date());
const future = Object.keys(DAILY).filter((d) => d >= today).sort();
let ahead = 0;
for (let i = 0; ; i++) {
  const dt = new Date(); dt.setDate(dt.getDate() + i);
  if (DAILY[WH.dateKey(dt)]) ahead++; else break;
}
console.log(`Curated days in content/days: ${dates.length} · reserve days: ${reserveKeys.length}`);
console.log(`Consecutive days covered from today (${today}): ${ahead}${future.length ? `, last: ${future[future.length - 1]}` : ''}`);
if (ahead < 7) warnings.push(`buffer: only ${ahead} consecutive day(s) ahead; aim for 7+`);
warnings.forEach((w) => console.log('  warn  ' + w));
errors.forEach((e) => console.log('  ERROR ' + e));
console.log(errors.length ? `\n✗ ${errors.length} error(s)` : '\n✓ daily content valid');
if (errors.length) process.exit(1);

if (args.includes('--build')) {
  // Ship a rolling window: the last week (for anyone a day behind) plus everything ahead.
  const from = new Date(); from.setDate(from.getDate() - 7);
  const fromKey = WH.dateKey(from);
  const bundle = Object.fromEntries(dates.filter((d) => d >= fromKey).map((d) => [d, DAILY[d]]));
  const out = `// Generated by scripts/validate-daily.mjs --build from content/days/*.json. Do not edit by hand.
// Days without an entry fall back to seeded generators, so the app never runs dry.
window.WH_DAILY = ${JSON.stringify(bundle, null, 2)};
`;
  writeFileSync(join(root, 'js/data/daily.js'), out);
  console.log(`Wrote js/data/daily.js with ${Object.keys(bundle).length} day(s) (${fromKey} onward).`);
  writeFileSync(join(root, 'js/data/reserve.js'), `// Generated by scripts/validate-daily.mjs --build from content/reserve/*.json. Do not edit by hand.
// Played (in rotation) on any date that has no curated content/days file.
window.WH_RESERVE = ${JSON.stringify(reserveKeys.map((k) => RESERVE[k]), null, 2)};
`);
  console.log(`Wrote js/data/reserve.js with ${reserveKeys.length} reserve day(s).`);
}
