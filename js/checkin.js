// Mind Check-in: a private, on-device mental acuity check-in that tracks personal trends over time.
// Five short activities (word learning, symbol swap, connect the path, object locations, delayed words),
// compared only against the user's own baseline. Nothing here ever leaves the device.
(function () {
  'use strict';
  const { h } = WH;

  // ================= Constants: schedule & change rules =================
  const RUN_IN_N = 2;              // first two sessions are practice (stored, excluded from stats)
  const BASELINE_N = 6;            // valid sessions that form the personal baseline
  const BASELINE_GAP_DAYS = 5;     // recommended spacing between baseline sessions
  const MAINT_DAYS = 14;           // maintenance cadence once the baseline is complete
  const RETRY_DAYS = 3;            // suggested retry after a dip (3–7 days)
  const MINI_BASELINE_N = 3;       // sessions needed on a new device class before evaluating it
  const REBASE_MIN_VALID = 10;     // re-baseline once there are this many valid post-run-in sessions…
  const REBASE_DAYS = 84;          // …and this many days since the first baseline session
  const REBASE_FROM = 3, REBASE_TO = 9; // slice() bounds → valid sessions #4–#9 (1-indexed)
  const SHRINK_M = 4;              // prior weight for the shrunk SD
  const RECENT_K = 3;              // recent window size
  const Z_LOW = -1.645;            // one-sided 95%
  const Z_NOTABLE = -2.0;
  const SUSTAINED_MIN_EVALS = 2, SUSTAINED_MIN_SESSIONS = 4, SUSTAINED_DAYS = 28;
  const NOTABLE_MIN_EVALS = 3, NOTABLE_DAYS = 42;
  const MOOD_LOW = 2, MOOD_RUN = 3;
  const TOTAL_SETUP = RUN_IN_N + BASELINE_N; // "session x of 8"

  // Metrics oriented so that higher = better.
  const METRICS = ['recallT2', 'delayedRecall', 'dprime', 'symbolRate', 'trailsA', 'ratio', 'objectErrors'];
  const DOMAINS = { memory: ['recallT2', 'delayedRecall', 'dprime'], speed: ['symbolRate', 'trailsA'], focus: ['ratio', 'objectErrors'] };
  const PRIOR_SD = { recallT2: 1.0, delayedRecall: 1.0, dprime: 0.4, symbolRate: null, trailsA: 0.10, ratio: 0.10, objectErrors: 1.0 };
  const SYMBOL_PRIOR_FRAC = 0.10;  // symbolRate prior SD = 10% of baseline mean

  // ================= Constants: activity timing =================
  const WORD_ON_MS = 1500, WORD_GAP_MS = 500;
  const RECALL_MS = 30000;
  const SYMBOL_MS = 60000, SYMBOL_PRACTICE = 3;
  const LOC_ON_MS = 1500, LOC_GAP_MS = 400, LOC_STAGES = [3, 5], LOC_ATTEMPTS = 2;
  
  // ================= Copy =================
  const DISCLAIMER = 'This is not a medical test and can’t tell you whether you have any condition. Scores naturally vary with sleep, mood, stress and device.';
  const DOCTOR_LINE = 'If you or people close to you have noticed changes in memory or thinking in daily life, talk to a doctor regardless of these results.';
  const MSG = {
    baseline: (x) => `Session ${x} of ${TOTAL_SETUP}. Your personal baseline is taking shape.`,
    normal: 'Within your usual range. Day-to-day ups and downs are completely normal.',
    dip: 'A bit lower than your usual. Sleep, stress and feeling unwell often explain this. Let’s see how next time goes: try again in 3–7 days under your usual conditions.',
    sustained: 'Your recent check-ins have been lower than your baseline for a few weeks.',
    notable: 'Your results have stayed noticeably below your own baseline for over 6 weeks. This app can’t tell you what’s behind that, and many treatable things (sleep, mood, medications, thyroid, vitamin B12, hearing) affect thinking. It may be worth mentioning to your doctor.',
  };
  const MOOD_NOTE = 'You’ve mentioned low mood in your last few check-ins. Low mood often affects focus and memory, and it’s worth talking to someone you trust or a doctor about how you’ve been feeling.';
  const REFLECT = [
    'Have you been sleeping less, or less well, than usual?',
    'Has your mood been low, or have you been under more stress lately?',
    'Have you started, stopped or changed any medications?',
    'Have you been unwell, or in pain, recently?',
  ];
  const STEP_NAMES = ['Word Garden', 'Symbol Swap', 'Connect the Path', 'Where Was It?', 'Word Garden Revisited'];
  const DOMAIN_INFO = {
    memory: { name: 'Memory', area: 'memory' },
    speed: { name: 'Speed', area: 'focus' },
    focus: { name: 'Focus', area: 'logic' },
  };

  // ================= Word lists =================
  // 24 hand-written lists. Each: 10 concrete, common, 1–2 syllable, 4–7 letter nouns from ten different
  // categories (animal, food, clothing, vehicle, landscape, furniture, tool, household, music/toy, place);
  // 5 related lures (lure i is similar to word i, i < 5); 5 unrelated foils. No word appears twice anywhere.
  const LISTS = [
    ['horse apple jacket train river table hammer pillow drum church', 'pony pear coat tram stream', 'finger thumb elbow ankle knee'],
    ['tiger bread shirt plane forest chair shovel mirror violin school', 'lion toast blouse glider woods', 'tooth tongue wrist chin cheek'],
    ['rabbit cheese boots wagon beach sofa wrench lamp guitar bank', 'hare butter shoes cart shore', 'nose crayon lips eyebrow skull'],
    ['sheep carrot gloves ship lake bench handsaw clock piano castle', 'goat onion mittens boat pond', 'pencil folder stamp eraser heel'],
    ['eagle lemon sweater taxi desert shelf drill bucket flute hotel', 'hawk lime jumper cab dune', 'ruler marker chalk binder ticket'],
    ['whale grape socks canoe valley stool ladder towel trumpet office', 'shark raisin stocking kayak slope', 'wire cork string thread penny'],
    ['monkey peach skirt sled cave desk pliers broom harp temple', 'ape plum dress sleigh cavern', 'ring crown medal wallet locket'],
    ['bear orange belt yacht canyon dresser chisel blanket cello bridge', 'wolf mango buckle sailboat gorge', 'badge ribbon necklace bracelet earring'],
    ['camel cookie scarf truck meadow cradle rake kettle banjo market', 'llama cracker shawl van pasture', 'magnet chain rope coin feather'],
    ['duck pizza apron rocket island closet trowel teapot tuba cabin', 'swan pasta smock shuttle isle', 'letter parcel postcard envelope notepad'],
    ['frog bacon vest tractor cliff drawer spade vase bugle igloo', 'toad ham jersey plow ledge', 'token padlock hinge pendant goblet'],
    ['snake honey shorts scooter glacier futon sickle sponge organ tower', 'cobra syrup trunks bike iceberg', 'needle comb brush razor tissue'],
    ['zebra cherry robe jeep swamp rocker mallet bottle cymbal farm', 'giraffe berry kimono car marsh', 'candle lantern anchor saddle globe'],
    ['turtle pepper jeans subway jungle hammock clamp curtain kite palace', 'tortoise salt trousers metro thicket', 'trophy mask flag barrel statue'],
    ['goose rice hoodie ferry field throne anvil carpet yoyo prison', 'hen wheat fleece liner lawn', 'wheel crate bulb atlas poster'],
    ['deer salad sandals barge prairie lounger crowbar napkin doll station', 'moose lettuce clogs tugboat plains', 'photo lens compass cage plug'],
    ['parrot noodle helmet camper lagoon locker shears faucet racket airport', 'canary soup visor caravan bay', 'arrow banner coupon dollar receipt'],
    ['donkey pickle cape buggy crater chest sander hanger skates harbor', 'mule cucumber cloak stroller volcano', 'cube acorn diamond ruby pearl'],
    ['lizard muffin pants blimp summit bunkbed hatchet toaster teddy garage', 'gecko cupcake slacks zeppelin peak', 'jewel copper silver shell pyramid'],
    ['spider walnut poncho coach cloud crib pickaxe ladle rattle chapel', 'beetle peanut raincoat minibus fog', 'socket cable pipe hose tube'],
    ['beaver melon blazer moped ocean easel wedge stove frisbee cottage', 'otter kiwi suit motorbike sea', 'bell hook basket soap lotion'],
    ['penguin candy gown rowboat geyser cushion funnel fridge robot kennel', 'seal fudge veil dinghy spring', 'perfume hairpin pillar mailbox domino'],
    ['pigeon garlic tights chopper boulder playpen plunger plate puzzle barn', 'dove ginger leggings drone pebble', 'dice sticker battery spool tripod'],
    ['dolphin steak collar digger rainbow beanbag stapler bowl marble lodge', 'porpoise burger necktie crane prism', 'pouch suitcase antenna lever doorbell'],
  ].map(([w, l, f], id) => ({ id, words: w.split(' '), lures: l.split(' '), foils: f.split(' ') }));

  // Picture icons for "Where Was It?"
  const LOC_ICONS = ['🍎', '🔑', '⚓', '🌙', '🎈', '🐟', '⭐', '🌻', '🎁', '☂️', '🔔', '🍄'];

  // Nine original abstract glyphs for Symbol Swap (24×24, stroked).
  const GLYPHS = [
    '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/>',
    '<path d="M5 8l7 9 7-9"/><circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/>',
    '<path d="M12 4l8 8-8 8-8-8z"/><path d="M4 12h16"/>',
    '<path d="M5 15a7 7 0 0 1 14 0"/><circle cx="8" cy="19" r="1.5" fill="currentColor" stroke="none"/><circle cx="16" cy="19" r="1.5" fill="currentColor" stroke="none"/>',
    '<path d="M3.5 9l4.25 6 4.25-6 4.25 6 4.25-6"/>',
    '<path d="M12 5v14M5 12h14"/><circle cx="18" cy="6" r="1.6" fill="currentColor" stroke="none"/>',
    '<path d="M12 4.5L20 19H4z"/><circle cx="12" cy="14" r="1.6" fill="currentColor" stroke="none"/>',
    '<path d="M4 9.5c2.7-3.5 5.3-3.5 8 0s5.3 3.5 8 0"/><path d="M4 15.5c2.7-3.5 5.3-3.5 8 0s5.3 3.5 8 0"/>',
    '<path d="M9 5H5v14h4M15 5h4v14h-4"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  ];
  const glyphSvg = (i) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[i]}</svg>`;

  const ICON = {
    touch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/></svg>',
    mouse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  };

  // ================= Pure helpers =================
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
  const sd = (a) => {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
  };
  const median = (a) => {
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x - y), k = s.length >> 1;
    return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
  };
  const finite = (x) => typeof x === 'number' && isFinite(x);
  const round = (x, d = 2) => (finite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

  // Inverse standard normal CDF (Acklam's rational approximation).
  function probit(p) {
    const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
    const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    const lo = 0.02425, hi = 1 - lo;
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    let q, r;
    if (p < lo) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > hi) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  // d′ with the log-linear correction (Hautus 1995).
  function dprime(hits, nSignal, fas, nNoise) {
    const H = (hits + 0.5) / (nSignal + 1), F = (fas + 0.5) / (nNoise + 1);
    return probit(H) - probit(F);
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  const normWord = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  const pluralOf = (a, b) => a === b + 's' || a === b + 'es' || (b.endsWith('y') && a === b.slice(0, -1) + 'ies');
  // Fuzzy match a typed word to a target: exact, then plural/singular, then 1 edit for targets of ≥5 letters.
  function matchWord(input, targets) {
    const w = normWord(input);
    if (!w) return null;
    const ts = targets.map(normWord);
    let i = ts.indexOf(w);
    if (i >= 0) return targets[i];
    i = ts.findIndex((t) => pluralOf(w, t) || pluralOf(t, w));
    if (i >= 0) return targets[i];
    i = ts.findIndex((t) => t.length >= 5 && w.length >= 4 && levenshtein(w, t) <= 1);
    return i >= 0 ? targets[i] : null;
  }
  function scoreRecall(typed, targets) {
    const got = [], intrusions = [];
    for (const w of typed) {
      const m = matchWord(w, targets);
      if (m == null) intrusions.push(w);
      else if (!got.includes(m)) got.push(m);
    }
    return { typed: typed.slice(), recalled: got, count: got.length, intrusions };
  }

  // Context → flag reasons (empty array = valid session).
  function flagReasons(ctx, focusLost) {
    const r = [];
    if (ctx.sleepAmt === 'much-less') r.push('slept much less than usual');
    if (ctx.sleepQ <= 2) r.push('poor sleep');
    if (ctx.mood <= 1) r.push('very low mood');
    if (ctx.stress >= 5) r.push('very stressed');
    if (ctx.energy <= 1) r.push('very low energy');
    if (ctx.unwell) r.push('feeling unwell');
    if (ctx.substance) r.push('alcohol or cannabis recently');
    if (ctx.meds) r.push('a medication change');
    if (ctx.quiet === false) r.push('not somewhere quiet');
    if (focusLost) r.push('switched away mid-session');
    return r;
  }

  // Raw activity results → session scores.
  function scoreSession(raw) {
    const s = {};
    const t1 = raw.learn.trials[0], t2 = raw.learn.trials[1];
    s.recallT1 = t1.count; s.recallT2 = t2.count; s.slope = t2.count - t1.count;
    s.intrusions = t1.intrusions.length + t2.intrusions.length;
    const sy = raw.symbol, ok = sy.trials.filter((t) => t.ok);
    s.symbolCorrect = ok.length;
    s.symbolRate = round(ok.length / (sy.durationMs / 60000), 2);
    s.symbolAcc = round(sy.trials.length ? ok.length / sy.trials.length : 0, 3);
    s.symbolRT = ok.length ? Math.round(median(ok.map((t) => t.rt))) : null;
    s.trailsA = round(raw.trails.a.ms / 1000, 2);
    s.trailsB = round(raw.trails.b.ms / 1000, 2);
    s.ratio = round(raw.trails.b.ms / raw.trails.a.ms, 3);
    s.trailsErrors = raw.trails.a.errors + raw.trails.b.errors;
    s.objectErrors = raw.where.errors;
    const del = raw.delayed;
    s.delayedRecall = del.recall.count;
    s.retention = s.recallT2 ? round(s.delayedRecall / s.recallT2, 3) : null;
    const items = del.recog;
    const hits = items.filter((i) => i.type === 'target' && i.yes).length;
    const lureFA = items.filter((i) => i.type === 'lure' && i.yes).length;
    const foilFA = items.filter((i) => i.type === 'foil' && i.yes).length;
    const nT = items.filter((i) => i.type === 'target').length;
    const nL = items.filter((i) => i.type === 'lure').length, nF = items.filter((i) => i.type === 'foil').length;
    s.recogHits = hits; s.recogFA = lureFA + foilFA;
    s.dprime = round(dprime(hits, nT, lureFA + foilFA, nL + nF), 3);
    s.lureFA = round(nL ? lureFA / nL : 0, 3);
    s.foilFA = round(nF ? foilFA / nF : 0, 3);
    return s;
  }

  // Oriented metric values (higher = better).
  function oriented(sc) {
    return {
      recallT2: sc.recallT2,
      delayedRecall: sc.delayedRecall,
      dprime: sc.dprime,
      symbolRate: sc.symbolRate,
      trailsA: finite(sc.trailsA) && sc.trailsA > 0 ? -Math.log(sc.trailsA) : NaN,
      ratio: finite(sc.ratio) && sc.ratio > 0 ? -Math.log(sc.ratio) : NaN,
      objectErrors: finite(sc.objectErrors) ? -sc.objectErrors : NaN,
    };
  }

  // Baseline: mean and shrunk SD per metric. s* = sqrt((n·s_b² + m·s_prior²)/(n+m)), floored at s_prior.
  function makeBaseline(list) {
    const m = {};
    for (const k of METRICS) {
      const vals = list.map((s) => oriented(s.scores)[k]).filter(finite);
      const n = vals.length, mu = mean(vals), sb = sd(vals);
      let prior = PRIOR_SD[k];
      if (k === 'symbolRate') prior = Math.max(SYMBOL_PRIOR_FRAC * Math.abs(mu || 0), 0.5);
      let s = Math.sqrt((n * sb * sb + SHRINK_M * prior * prior) / (n + SHRINK_M));
      s = Math.max(s, prior);
      m[k] = { mu: round(mu, 4), sd: round(s, 4), n };
    }
    return { m, ids: list.map((s) => s.id), from: list[0] ? list[0].day : null, to: list.length ? list[list.length - 1].day : null };
  }

  // Composite z for a recent window against a baseline.
  function evaluate(base, recent) {
    const z = {};
    for (const k of METRICS) {
      const b = base.m[k];
      const vals = recent.map((s) => oriented(s.scores)[k]).filter(finite);
      if (!vals.length || !b || !b.n || !finite(b.mu)) continue;
      z[k] = (mean(vals) - b.mu) / (b.sd * Math.sqrt(1 / vals.length + 1 / b.n));
    }
    const dom = {};
    for (const [d, ks] of Object.entries(DOMAINS)) {
      const zs = ks.map((k) => z[k]).filter(finite);
      dom[d] = zs.length ? mean(zs) : NaN;
    }
    const all = Object.values(z).filter(finite);
    return { z, dom, zc: all.length ? mean(all) : NaN, k: recent.length };
  }
  // Single-session standing vs baseline (for the per-domain results summary).
  function standing(base, session) {
    const ev = evaluate(base, [session]);
    return ev.dom;
  }

  function tailRun(evs, pred) {
    const out = [];
    for (let i = evs.length - 1; i >= 0 && pred(evs[i]); i--) out.unshift(evs[i]);
    return out;
  }
  // Does a run of consecutive low evaluations meet the persistence rules?
  function qualifies(st, run, minEvals, minDays, minSessions) {
    if (run.length < minEvals) return false;
    const ids = new Set(run.flatMap((e) => e.window));
    const win = st.valid.filter((s) => ids.has(s.id));
    if (win.length < minSessions) return false;
    const first = Math.min(...win.map((s) => s.day)), last = run[run.length - 1].day;
    if (last - first < minDays) return false;
    const involved = st.all.filter((s) => s.day >= first && s.day <= last);
    const flagged = involved.filter((s) => s.flagged).length;
    return flagged * 2 < involved.length;
  }
  function classify(st) {
    if (!st.baseline) return 'baseline';
    const ev = st.evals, last = ev[ev.length - 1];
    const lastAll = st.all.slice(-RECENT_K);
    const flaggedMost = lastAll.length >= 2 && lastAll.filter((s) => s.flagged).length * 2 > lastAll.length;
    const runZ2 = tailRun(ev, (e) => e.zc <= Z_NOTABLE);
    const runDR = tailRun(ev, (e) => e.z.delayedRecall <= Z_NOTABLE && (e.dom.speed <= Z_LOW || e.dom.focus <= Z_LOW));
    if (qualifies(st, runZ2, NOTABLE_MIN_EVALS, NOTABLE_DAYS, 0) || qualifies(st, runDR, NOTABLE_MIN_EVALS, NOTABLE_DAYS, 0)) return 'notable';
    const runLow = tailRun(ev, (e) => e.zc <= Z_LOW);
    if (qualifies(st, runLow, SUSTAINED_MIN_EVALS, SUSTAINED_DAYS, SUSTAINED_MIN_SESSIONS)) return 'sustained';
    if ((last && last.zc <= Z_LOW) || flaggedMost) return 'dip';
    return 'normal';
  }

  // Replays the whole history deterministically. `frozen` holds re-baselines already computed (per device).
  function analyze(sessions, frozen = {}, today = null) {
    const list = (sessions || []).slice().sort((a, b) => a.ts - b.ts);
    const runIn = list.filter((s) => s.phase === 'runin');
    const post = list.filter((s) => s.phase !== 'runin');
    const firstValid = post.find((s) => !s.flagged);
    const primary = firstValid ? firstValid.device : null;
    const classes = {}, newFrozen = {};
    for (const s of post) {
      const st = classes[s.device] || (classes[s.device] = {
        device: s.device, all: [], valid: [], need: s.device === primary ? BASELINE_N : MINI_BASELINE_N,
        baseline: null, baseEnd: -1, rebased: false, rebaseDay: null, completedId: null, evals: [],
      });
      st.all.push(s);
      if (s.flagged) continue;
      st.valid.push(s);
      const nv = st.valid.length;
      if (!st.baseline) {
        if (nv >= st.need) { st.baseline = makeBaseline(st.valid.slice(0, st.need)); st.baseEnd = st.need - 1; st.completedId = s.id; }
        continue;
      }
      // Only re-baseline while results are in the usual range, so an ongoing drop is never
      // absorbed into the new baseline.
      const lastEv = st.evals[st.evals.length - 1];
      const settled = !lastEv || !(lastEv.zc <= Z_LOW);
      if (!st.rebased && settled && nv >= REBASE_MIN_VALID && s.day - st.valid[0].day >= REBASE_DAYS) {
        const fz = frozen[s.device];
        if (fz && fz.baseline) st.baseline = fz.baseline;
        else {
          st.baseline = makeBaseline(st.valid.slice(REBASE_FROM, REBASE_TO));
          newFrozen[s.device] = { day: s.day, baseline: st.baseline };
        }
        st.rebased = true; st.rebaseDay = s.day; st.baseEnd = REBASE_TO - 1;
      }
      const recent = st.valid.slice(st.baseEnd + 1).slice(-RECENT_K);
      if (!recent.length) continue;
      const ev = evaluate(st.baseline, recent);
      ev.day = s.day; ev.id = s.id; ev.window = recent.map((r) => r.id);
      st.evals.push(ev);
    }
    for (const st of Object.values(classes)) st.status = classify(st);

    const latest = list[list.length - 1] || null;
    const primaryValid = primary && classes[primary] ? classes[primary].valid.length : 0;
    const progress = Math.min(runIn.length, RUN_IN_N) + Math.min(primaryValid, BASELINE_N);
    let status, phase, cls = null;
    if (!latest) { status = 'new'; phase = 'new'; }
    else if (runIn.length < RUN_IN_N) { status = 'baseline'; phase = 'runin'; }
    else if (!primary || !classes[primary].baseline) { status = 'baseline'; phase = 'baseline'; cls = primary ? classes[primary] : null; }
    else {
      cls = classes[latest.device] || classes[primary];
      if (!cls.baseline) { status = 'baseline'; phase = 'device'; }
      else { status = cls.status; phase = 'tracking'; }
    }
    // Mood note: mood ≤ 2 on the last 3 sessions in a row.
    const lastN = list.slice(-MOOD_RUN);
    const moodNote = lastN.length === MOOD_RUN && lastN.every((s) => s.ctx && s.ctx.mood <= MOOD_LOW);

    let nextDue = null;
    if (!latest) nextDue = today;
    else if (phase === 'runin') nextDue = latest.day;
    else if (phase === 'baseline' || phase === 'device') nextDue = latest.day + (latest.flagged ? 1 : BASELINE_GAP_DAYS);
    else if (status === 'dip' || status === 'sustained') nextDue = latest.day + RETRY_DAYS;
    else nextDue = latest.day + MAINT_DAYS;

    const justCompleted = !!(cls && cls.completedId && latest && cls.completedId === latest.id);
    const deviceProgress = cls && phase === 'device' ? cls.valid.length : 0;
    return { list, runIn: runIn.length, primary, classes, latest, status, phase, progress, moodNote, nextDue, justCompleted, deviceProgress, newFrozen };
  }

  // Domain value per session (relative to that device class's current baseline, or a provisional one).
  function domainSeries(an) {
    const out = [];
    const post = an.list.filter((s) => s.phase !== 'runin');
    for (const s of post) {
      const st = an.classes[s.device];
      let base = st && st.baseline;
      if (!base) {
        const ref = st ? st.valid : [];
        if (!ref.length) { out.push({ s, memory: null, speed: null, focus: null }); continue; }
        base = makeBaseline(ref);
      }
      const v = {};
      for (const [d, ks] of Object.entries(DOMAINS)) {
        const o = oriented(s.scores);
        const zs = ks.map((k) => (finite(o[k]) && base.m[k] && finite(base.m[k].mu) ? (o[k] - base.m[k].mu) / base.m[k].sd : NaN)).filter(finite);
        v[d] = zs.length ? mean(zs) : null;
      }
      out.push(Object.assign({ s }, v));
    }
    return out;
  }

  // Trails layout: n non-overlapping nodes in the unit square, choosing the layout with the fewest path crossings.
  function segCross(p1, p2, p3, p4) {
    const o = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    return o(p1, p2, p3) * o(p1, p2, p4) < 0 && o(p3, p4, p1) * o(p3, p4, p2) < 0;
  }
  function crossings(pts) {
    let c = 0;
    for (let i = 0; i < pts.length - 1; i++) for (let j = i + 2; j < pts.length - 1; j++) if (segCross(pts[i], pts[i + 1], pts[j], pts[j + 1])) c++;
    return c;
  }
  function layoutNodes(n, rng = Math.random, minDist = 0.17, margin = 0.08, candidates = 30, maxCross = 3) {
    let best = null, bestScore = Infinity;
    for (let c = 0; c < candidates; c++) {
      let pts = null, md = minDist;
      for (let restart = 0; restart < 60 && !pts; restart++) {
        const p = [];
        for (let tries = 0; tries < 3000 && p.length < n; tries++) {
          const q = { x: margin + rng() * (1 - 2 * margin), y: margin + rng() * (1 - 2 * margin) };
          if (p.every((r) => Math.hypot(r.x - q.x, r.y - q.y) >= md)) p.push(q);
        }
        if (p.length === n) pts = p; else if (restart % 10 === 9) md *= 0.95;
      }
      if (!pts) continue;
      const score = crossings(pts);
      if (score < bestScore) { best = pts; bestScore = score; }
      if (bestScore === 0) break;
    }
    // Light 2-opt: reverse a stretch of the path to undo crossings until at most maxCross remain.
    // Each move strictly shortens the path, so this terminates; it keeps some crossings so the
    // next circle isn't always simply the nearest one.
    for (let guard = 0; best && guard < 200 && crossings(best) > maxCross; guard++) {
      let fixed = false;
      for (let i = 0; i < best.length - 1 && !fixed; i++) {
        for (let j = i + 2; j < best.length - 1 && !fixed; j++) {
          if (segCross(best[i], best[i + 1], best[j], best[j + 1])) {
            best = best.slice(0, i + 1).concat(best.slice(i + 1, j + 1).reverse(), best.slice(j + 1));
            fixed = true;
          }
        }
      }
      if (!fixed) break;
    }
    return best;
  }
  const TRAILS_A = Array.from({ length: 15 }, (_, i) => String(i + 1));
  const TRAILS_B = (() => { const o = []; for (let i = 1; i <= 8; i++) { o.push(String(i)); if (i < 8) o.push('ABCDEFG'[i - 1]); } return o; })();

  // List rotation: never repeat until all lists have been used.
  function pickList(used, rng = Math.random) {
    let pool = LISTS.filter((l) => !used.includes(l.id));
    let reset = false;
    if (!pool.length) { pool = LISTS.slice(); reset = true; }
    return { list: pool[Math.floor(rng() * pool.length)], reset };
  }

  // ================= Storage =================
  function db() {
    const D = WH.store.data;
    if (!D.checkin || typeof D.checkin !== 'object') D.checkin = { v: 1, sessions: [], usedLists: [], frozen: {} };
    const c = D.checkin;
    if (!Array.isArray(c.sessions)) c.sessions = [];
    if (!Array.isArray(c.usedLists)) c.usedLists = [];
    if (!c.frozen || typeof c.frozen !== 'object') c.frozen = {};
    return c;
  }
  function analyzeStored() {
    const c = db();
    const an = analyze(c.sessions, c.frozen, WH.today());
    if (Object.keys(an.newFrozen).length) { Object.assign(c.frozen, an.newFrozen); WH.store.save(); }
    return an;
  }

  // ================= Labels =================
  const fmtDay = (d, opts = { month: 'short', day: 'numeric' }) => WH.dateFromDay(d).toLocaleDateString(undefined, opts);
  function dueText(nextDue, today = WH.today()) {
    if (nextDue == null) return '';
    const diff = nextDue - today;
    if (diff <= 0) return 'due today';
    if (diff === 1) return 'next check-in tomorrow';
    return `next check-in in ${diff} days`;
  }
  function statusLabel(an) {
    switch (an.status) {
      case 'new': return 'About 5 minutes · start with a practice session';
      case 'baseline':
        if (an.phase === 'runin') return `Practice ${an.runIn} of ${RUN_IN_N} done`;
        if (an.phase === 'device') return `New device type: ${an.deviceProgress} of ${MINI_BASELINE_N} sessions`;
        return `Baseline: session ${an.progress} of ${TOTAL_SETUP}`;
      case 'normal': return an.justCompleted ? 'Baseline complete' : 'Within your usual range';
      case 'dip': return 'A bit lower than usual this time';
      case 'sustained': return 'Lower than your baseline lately';
      case 'notable': return 'Below your baseline for 6+ weeks';
      default: return '';
    }
  }
  function statusMessage(an) {
    if (an.status === 'new') return '';
    if (an.phase === 'runin') return `Practice session ${an.runIn} of ${RUN_IN_N} done. The first two sessions help you get used to the activities and aren’t counted.`;
    if (an.phase === 'device') return `You’re using a different kind of device (${an.latest.device === 'touch' ? 'touch' : 'mouse or trackpad'}). Scores vary by device, so we’ll learn your usual range on this one too: session ${an.deviceProgress} of ${MINI_BASELINE_N}.`;
    if (an.status === 'baseline') return MSG.baseline(Math.max(an.progress, RUN_IN_N));
    if (an.status === 'normal' && an.justCompleted) return 'Your personal baseline is complete. From now on, each check-in is compared with your own usual range. ' + MSG.normal.split('. ')[1];
    return MSG[an.status] || '';
  }

  const summaryOf = (an) => ({
    sessions: an.list.length,
    status: an.status,
    nextDue: an.nextDue,
    label: [statusLabel(an), dueText(an.nextDue)].filter(Boolean).join(' · '),
  });

  // ================= Shared UI bits =================
  function disclaimerEl() {
    return h('div', { class: 'ck-note ck-disclaimer' },
      h('p', null, DISCLAIMER),
      h('p', null, DOCTOR_LINE));
  }
  function sparkline(points, color, label) {
    const W = 320, H = 76, px = 10, py = 8, lo = -3, hi = 2.5;
    const n = points.length;
    const x = (i) => px + (n <= 1 ? (W - 2 * px) / 2 : (i * (W - 2 * px)) / (n - 1));
    const y = (v) => py + ((hi - Math.max(lo, Math.min(hi, v))) / (hi - lo)) * (H - 2 * py);
    const valid = points.map((p, i) => ({ p, i })).filter((o) => o.p.v != null && !o.p.flagged);
    const path = valid.map((o, j) => `${j ? 'L' : 'M'}${x(o.i).toFixed(1)} ${y(o.p.v).toFixed(1)}`).join(' ');
    const dots = points.map((p, i) => (p.v == null ? '' : p.flagged
      ? `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4" fill="var(--surface)" stroke="${color}" stroke-width="2"><title>${p.title} (set aside)</title></circle>`
      : `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4" fill="${color}"><title>${p.title}</title></circle>`)).join('');
    return `<svg class="ck-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">
      <rect x="0" y="${y(1).toFixed(1)}" width="${W}" height="${(y(-1) - y(1)).toFixed(1)}" rx="8" fill="${color}" opacity=".10"/>
      <line x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="${color}" stroke-opacity=".35" stroke-dasharray="3 4"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}</svg>`;
  }
  function trendsEl(an) {
    const series = domainSeries(an);
    if (series.length < 2) return null;
    const cards = Object.entries(DOMAIN_INFO).map(([d, info]) => {
      const pts = series.map((r) => ({ v: r[d], flagged: r.s.flagged, title: `${fmtDay(r.s.day)}` }));
      return h('div', { class: `ck-trend area-${info.area}` },
        h('div', { class: 'ck-trend-head' }, h('b', null, info.name), h('small', null, `${fmtDay(series[0].s.day)} – ${fmtDay(series[series.length - 1].s.day)}`)),
        h('div', { html: sparkline(pts, `var(--a-${info.area})`, `${info.name} trend across ${pts.length} check-ins`) }));
    });
    return h('section', { class: 'ck-card ck-trends' },
      h('h2', { class: 'ck-h2' }, 'Your trends'),
      h('p', { class: 'ck-sub' }, 'Each dot is a check-in. The shaded band is your usual range. Hollow dots were set aside because of sleep, mood, distractions or similar.'),
      h('div', { class: 'ck-trend-grid' }, cards));
  }

  // ================= Export =================
  function exportText(an) {
    const L = [];
    const d = (s) => WH.dateKey(new Date(s.ts));
    L.push('MIND CHECK-IN: PERSONAL SUMMARY');
    L.push(`Created ${WH.dateKey()} with Well Played. Kept on this device only.`);
    L.push('');
    L.push(DISCLAIMER);
    L.push(DOCTOR_LINE);
    L.push('');
    L.push(`Current status: ${statusLabel(an)}`);
    const msg = statusMessage(an); if (msg) L.push(msg);
    L.push('');
    const n = an.list.length;
    if (n) L.push(`${n} check-in${n === 1 ? '' : 's'} from ${d(an.list[0])} to ${d(an.list[n - 1])} (first ${Math.min(n, RUN_IN_N)} were practice).`);
    L.push('Scores are compared only with this person’s own earlier results.');
    L.push('');
    L.push('Columns: words learned (round 1/round 2, of 10) · words recalled after ~4 min · recognised (of 10) · similar-word mix-ups (of 5) · symbols matched per minute · path A seconds · path B seconds · location slips');
    L.push('');
    for (const s of an.list) {
      const c = s.scores;
      const tag = s.phase === 'runin' ? 'practice' : s.flagged ? 'set aside' : 'counted';
      L.push(`${d(s)} ${s.tod || ''} · ${s.device === 'touch' ? 'touch' : 'mouse'} · ${tag}`);
      L.push(`  words ${c.recallT1}/${c.recallT2} · later ${c.delayedRecall} · recognised ${c.recogHits} · mix-ups ${Math.round(c.lureFA * 5)} · symbols ${c.symbolRate} · path A ${c.trailsA}s · path B ${c.trailsB}s · slips ${c.objectErrors}`);
      if (s.flags && s.flags.length) L.push(`  context: ${s.flags.join(', ')}`);
    }
    return L.join('\n');
  }
  function downloadText(an) {
    try {
      const blob = new Blob([exportText(an)], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: `mind-checkin-${WH.dateKey()}.txt` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { WH.toast('Could not create the file'); }
  }
  function printSummary(an) {
    const host = h('div', { class: 'ck-print' }, h('pre', null, exportText(an)));
    document.body.append(host);
    document.body.classList.add('ck-printing');
    const done = () => { host.remove(); document.body.classList.remove('ck-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch (e) { /* ignore */ }
    setTimeout(() => { if (document.body.contains(host) && !matchMedia('print').matches) done(); }, 1500);
  }

  // ================= Mount =================
  function mount(container, opts = {}) {
    const onExit = typeof opts.onExit === 'function' ? opts.onExit : () => {};
    const root = h('div', { class: 'ck' });
    container.append(root);
    let alive = true;
    const timers = new Set();
    let keyHandler = null;
    let run = null; // active session state

    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); return t; };
    const sleep = (ms) => new Promise((r) => later(r, ms));
    const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
    const reduced = () => (WH.reducedMotion ? WH.reducedMotion() : false);

    function onKey(e) {
      if (!alive || (WH.modalOpen && WH.modalOpen())) return;
      if (e.key === 'Escape' && run) { e.preventDefault(); confirmQuit(); return; }
      if (keyHandler) keyHandler(e);
    }
    function onVis() { if (run && document.visibilityState === 'hidden') run.focusLost = true; }
    function onBlur() { if (run) run.focusLost = true; }
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);

    function show(node) {
      root.replaceChildren(node);
      try { window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); } catch (e) { /* ignore */ }
    }
    const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    // Button that responds on pointerdown (for timing) and on keyboard activation.
    function fastBtn(attrs, fn, ...kids) {
      return h('button', Object.assign({ type: 'button' }, attrs, {
        onpointerdown: (e) => { if (e.button > 0) return; e.preventDefault(); fn(e); },
        onclick: (e) => { if (e.detail === 0) fn(e); },
      }), ...kids);
    }
    function shake(el) {
      el.classList.remove('ck-shake'); void el.offsetWidth; el.classList.add('ck-shake');
      if (WH.vibrate) WH.vibrate(60);
    }
    function sfx(name) { try { WH.sound && WH.sound[name] && WH.sound[name](); } catch (e) { /* ignore */ } }

    // ---------- Intro ----------
    function renderIntro() {
      run = null; keyHandler = null; clearTimers();
      const an = analyzeStored();
      const today = WH.today();
      const n = an.list.length;
      const startLabel = an.phase === 'new' || an.phase === 'runin' ? `Start practice session ${an.runIn + 1}` : 'Start check-in';
      const early = an.phase !== 'new' && an.phase !== 'runin' && an.nextDue != null && today < an.nextDue;
      const earlyNote = early ? h('p', { class: 'ck-hint' },
        an.phase === 'baseline' || an.phase === 'device'
          ? `For your baseline we suggest at least ${BASELINE_GAP_DAYS} days between check-ins (next on ${fmtDay(an.nextDue, { weekday: 'long', month: 'short', day: 'numeric' })}). Spacing them out gives a truer picture of your usual range, but you can still go ahead now.`
          : `Your next check-in is suggested for ${fmtDay(an.nextDue, { weekday: 'long', month: 'short', day: 'numeric' })}. You can check in earlier if you like.`) : null;

      const hero = h('section', { class: 'ck-card ck-hero' },
        h('p', { class: 'ck-eyebrow' }, 'Mind Check-in'),
        h('h1', { class: 'ck-h1' }, 'A five-minute check-in for your mind'),
        h('p', { class: 'ck-lede' }, 'Five short activities for memory, speed and focus. Over time you’ll see your own trends: how today compares with your usual, never with anyone else.'),
        h('div', { class: 'ck-facts' },
          h('span', null, h('b', null, '~5'), ' minutes'),
          h('span', null, h('b', null, '5'), ' short activities'),
          h('span', null, h('b', null, '100%'), ' on this device')),
        n ? h('div', { class: 'ck-status-pill ck-tier-' + an.status }, statusLabel(an), an.nextDue != null ? h('small', null, dueText(an.nextDue, today)) : null) : null,
        h('div', { class: 'ck-actions' },
          h('button', { class: 'btn primary ck-cta', type: 'button', onclick: startSession, html: `${WH.icons.play}<span>${startLabel}</span>` }),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => onExit() }, 'Back')),
        earlyNote,
        an.phase === 'runin' || an.phase === 'new' ? h('p', { class: 'ck-hint' }, 'Tip: do both practice sessions back-to-back today. Find a quiet spot and use the device you’ll usually use.') : null);

      const schedule = h('section', { class: 'ck-card' },
        h('h2', { class: 'ck-h2' }, 'How it works'),
        h('ol', { class: 'ck-steps-list' },
          stepLi(1, 'Two practice sessions', 'Get familiar with the activities. Best done back-to-back on day one. They aren’t counted.', an.runIn >= RUN_IN_N, an.phase === 'runin' || an.phase === 'new'),
          stepLi(2, 'Six baseline check-ins', `About a week apart (at least ${BASELINE_GAP_DAYS} days). Together they map out your usual range.`, an.progress >= TOTAL_SETUP, an.phase === 'baseline'),
          stepLi(3, 'A check-in every two weeks', 'Each one is compared with your own baseline. Around three months in, your baseline is refreshed once to allow for getting used to the activities.', false, an.phase === 'tracking')),
        h('p', { class: 'ck-sub' }, 'Before each session you’ll answer a few quick questions about sleep, mood and your surroundings. Sessions on an off day are kept but set aside, so they never skew your trend.'));

      const parts = [hero];
      if (an.moodNote) parts.push(h('div', { class: 'ck-card ck-mood' }, h('p', null, MOOD_NOTE)));
      if (n && an.status !== 'new') {
        const msg = statusMessage(an);
        if (msg && an.phase === 'tracking') parts.push(tierCard(an));
      }
      const tr = trendsEl(an);
      if (tr) parts.push(tr);
      if (n) parts.push(historyEl(an));
      parts.push(schedule, disclaimerEl());
      show(h('div', { class: 'ck-wrap ck-intro' }, parts));
    }
    function stepLi(num, title, text, done, now) {
      return h('li', { class: (done ? 'done ' : '') + (now ? 'now' : '') },
        h('span', { class: 'ck-step-num', html: done ? WH.icons.check : String(num) }),
        h('div', null, h('b', null, title), h('p', null, text)));
    }
    function historyEl(an) {
      const rows = an.list.slice().reverse().slice(0, 12).map((s) => {
        const tag = s.phase === 'runin' ? ['Practice', 'practice'] : s.flagged ? ['Set aside', 'aside'] : ['Counted', 'counted'];
        return h('li', { class: 'ck-hist-row' },
          h('span', { class: 'ck-hist-ico', title: s.device === 'touch' ? 'Touch device' : 'Mouse or trackpad', html: s.device === 'touch' ? ICON.touch : ICON.mouse }),
          h('span', { class: 'ck-hist-date' }, fmtDay(s.day, { weekday: 'short', month: 'short', day: 'numeric' }), s.flags && s.flags.length && s.phase !== 'runin' ? h('small', null, s.flags.join(', ')) : null),
          h('span', { class: 'ck-tag ck-tag-' + tag[1] }, tag[0]));
      });
      return h('section', { class: 'ck-card' },
        h('div', { class: 'ck-row-head' }, h('h2', { class: 'ck-h2' }, 'History'), h('small', { class: 'ck-sub' }, `${an.list.length} check-in${an.list.length === 1 ? '' : 's'}`)),
        h('ul', { class: 'ck-hist' }, rows),
        h('div', { class: 'ck-actions wrap' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => downloadText(an) }, 'Download summary (.txt)'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => printSummary(an) }, 'Print summary'),
          h('button', { class: 'link-btn ck-erase', type: 'button', onclick: confirmErase }, 'Erase check-in data')));
    }
    function confirmErase() {
      const m = WH.modal({
        title: 'Erase check-in data?',
        body: h('div', { class: 'ck-modal' },
          h('p', null, 'This removes every Mind Check-in session and your baseline from this device. It can’t be undone.'),
          h('div', { class: 'ck-actions' },
            h('button', { class: 'btn ghost', type: 'button', onclick: () => WH.closeModal() }, 'Keep my data'),
            h('button', { class: 'btn primary', type: 'button', onclick: () => { delete WH.store.data.checkin; WH.store.save(); WH.closeModal(); renderIntro(); WH.toast('Check-in data erased'); } }, 'Erase'))),
      });
      return m;
    }
    function tierCard(an) {
      const st = an.status;
      const kids = [h('p', { class: 'ck-tier-msg' }, statusMessage(an))];
      if (st === 'sustained') {
        kids.push(h('p', { class: 'ck-sub' }, 'A few things worth reflecting on:'),
          h('ul', { class: 'ck-reflect' }, REFLECT.map((q) => h('li', null, q))),
          h('p', { class: 'ck-sub' }, 'A confirmation check-in in a few days, somewhere quiet at your usual time, will help show whether this is a passing dip.'));
      }
      if (st === 'notable') {
        kids.push(
          h('div', { class: 'ck-actions wrap' },
            h('button', { class: 'btn primary', type: 'button', onclick: () => downloadText(an) }, 'Download a summary for your doctor'),
            h('button', { class: 'btn ghost', type: 'button', onclick: () => printSummary(an) }, 'Print it')),
          h('ul', { class: 'ck-links' },
            h('li', null, h('a', { href: 'https://www.nia.nih.gov/health/memory-loss-and-forgetfulness/memory-problems-forgetfulness-and-aging', target: '_blank', rel: 'noopener noreferrer' }, 'National Institute on Aging: memory, forgetfulness and aging')),
            h('li', null, 'Free 24/7 helpline: ', h('a', { href: 'tel:18002723900' }, '800-272-3900'))));
      }
      return h('section', { class: 'ck-card ck-tier ck-tier-' + st }, kids);
    }

    // ---------- Session start ----------
    function startSession() {
      const c = db();
      const phase = c.sessions.length < RUN_IN_N ? 'runin' : 'main';
      renderContext((ctx) => runSession(phase, ctx));
    }

    // ---------- Context questions ----------
    function renderContext(onDone) {
      clearTimers();
      const ctx = {};
      const qs = [
        { k: 'sleepAmt', q: 'Sleep last night, compared with usual', opts: [['much-less', 'Much less'], ['less', 'Less'], ['usual', 'Usual'], ['more', 'More']] },
        { k: 'sleepQ', q: 'Sleep quality', scale: ['Very poor', 'Very good'] },
        { k: 'mood', q: 'Mood right now', scale: ['Very low', 'Great'] },
        { k: 'stress', q: 'Stress right now', scale: ['Calm', 'Very stressed'] },
        { k: 'energy', q: 'Energy right now', scale: ['Exhausted', 'Full of energy'] },
        { k: 'unwell', q: 'Feeling unwell today?', yn: true },
        { k: 'substance', q: 'Alcohol or cannabis in the last 12 hours, or a hangover?', yn: true },
        { k: 'meds', q: 'Any new or changed medication recently?', yn: true },
        { k: 'quiet', q: 'Somewhere quiet and undistracted right now?', yn: true },
      ];
      const note = h('div', { class: 'ck-note ck-flagnote', 'aria-live': 'polite' });
      const go = h('button', { class: 'btn primary ck-cta', type: 'button', disabled: true, onclick: () => onDone(Object.assign({}, ctx)) }, 'Continue');
      const update = () => {
        const done = qs.every((q) => ctx[q.k] !== undefined);
        go.disabled = !done;
        const r = flagReasons(Object.assign({ sleepQ: 5, mood: 5, stress: 1, energy: 5 }, ctx), false);
        note.replaceChildren();
        note.classList.toggle('hidden', !r.length);
        if (r.length) note.append(h('p', null, `Thanks for being honest. Because of ${joinAnd(r)}, today’s results will be kept but set aside from your trend. You can carry on, or come back another day.`));
      };
      const rows = qs.map((q) => {
        let opts;
        if (q.opts) opts = q.opts;
        else if (q.scale) opts = [1, 2, 3, 4, 5].map((v) => [v, String(v)]);
        else opts = [[true, 'Yes'], [false, 'No']];
        const btns = opts.map(([v, label]) => h('button', {
          type: 'button', role: 'radio', 'aria-checked': 'false', class: 'ck-opt',
          'aria-label': q.scale ? `${label}${v === 1 ? ` (${q.scale[0]})` : v === 5 ? ` (${q.scale[1]})` : ''}` : label,
          onclick: (e) => {
            ctx[q.k] = v;
            for (const b of btns) b.setAttribute('aria-checked', String(b === e.currentTarget));
            update();
          },
        }, label));
        return h('div', { class: 'ck-q' },
          h('div', { class: 'ck-q-label', id: `ckq-${q.k}` }, q.q),
          h('div', { class: 'ck-seg' + (q.scale ? ' scale' : '') + (q.yn ? ' yn' : ''), role: 'radiogroup', 'aria-labelledby': `ckq-${q.k}` }, btns),
          q.scale ? h('div', { class: 'ck-scale-ends' }, h('span', null, q.scale[0]), h('span', null, q.scale[1])) : null);
      });
      note.classList.add('hidden');
      show(h('div', { class: 'ck-wrap' },
        h('section', { class: 'ck-card ck-context' },
          h('p', { class: 'ck-eyebrow' }, 'Before we start'),
          h('h1', { class: 'ck-h1 sm' }, 'How are you today?'),
          h('p', { class: 'ck-sub' }, 'A few quick taps. They help make sense of your results. Try to use the same kind of device each time, and silence notifications if you can.'),
          h('div', { class: 'ck-qs' }, rows),
          note,
          h('div', { class: 'ck-actions' }, go, h('button', { class: 'btn ghost', type: 'button', onclick: renderIntro }, 'Cancel')))));
    }
    const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

    // ---------- Session shell ----------
    let stageEl = null, stepEls = [], stepLabel = null;
    function renderShell() {
      stepEls = STEP_NAMES.map(() => h('i'));
      stepLabel = h('span', { class: 'ck-step-label' });
      stageEl = h('div', { class: 'ck-stage' });
      show(h('div', { class: 'ck-wrap ck-session' },
        h('div', { class: 'ck-bar' },
          h('div', { class: 'ck-progress' },
            h('div', { class: 'ck-segs', 'aria-hidden': 'true' }, stepEls),
            stepLabel),
          h('button', { class: 'icon-btn ck-quit', type: 'button', 'aria-label': 'Quit session', title: 'Quit session', onclick: confirmQuit, html: WH.icons.x })),
        stageEl));
    }
    function setStep(i) {
      stepEls.forEach((el, j) => { el.className = j < i ? 'done' : j === i ? 'now' : ''; });
      stepLabel.textContent = `Activity ${i + 1} of ${STEP_NAMES.length} · ${STEP_NAMES[i]}`;
    }
    function stage(node) {
      keyHandler = null;
      stageEl.replaceChildren(node);
    }
    function confirmQuit() {
      if (!run) return;
      WH.modal({
        title: 'Quit this session?',
        body: h('div', { class: 'ck-modal' },
          h('p', null, 'Your answers so far will be discarded. You can start a fresh check-in any time.'),
          h('div', { class: 'ck-actions' },
            h('button', { class: 'btn ghost', type: 'button', onclick: () => WH.closeModal() }, 'Keep going'),
            h('button', { class: 'btn primary', type: 'button', onclick: () => { WH.closeModal(); abandon(); } }, 'Quit and discard'))),
      });
    }
    function abandon() {
      clearTimers();
      run = null; keyHandler = null;
      renderIntro();
    }

    // Instruction card; resolves on the button or Enter.
    function instructions({ step, title, body, demo, cta = 'Begin', practice }) {
      return new Promise((res) => {
        let done = false;
        const fire = () => { if (done) return; done = true; res(); };
        const btn = h('button', { class: 'btn primary ck-cta', type: 'button', onclick: fire }, cta);
        stage(h('div', { class: 'ck-card ck-instr ck-enter' },
          practice ? h('span', { class: 'ck-tag ck-tag-practice' }, 'Practice') : null,
          h('p', { class: 'ck-eyebrow' }, step != null ? `Activity ${step + 1}` : ''),
          h('h2', { class: 'ck-h2 lg' }, title),
          body.map((p) => h('p', { class: 'ck-instr-p' }, p)),
          demo || null,
          h('div', { class: 'ck-actions' }, btn)));
        keyHandler = (e) => { if (e.key === 'Enter' && !typing(e)) { e.preventDefault(); fire(); } };
        later(() => btn.focus({ preventScroll: true }), 30);
      });
    }
    function getReady(text) {
      stage(h('div', { class: 'ck-ready' }, h('p', null, text)));
      return sleep(1200);
    }
    function timerBar() {
      const fill = h('i');
      const el = h('div', { class: 'ck-timer', role: 'progressbar', 'aria-label': 'Time remaining', 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill);
      return { el, set(frac) { fill.style.transform = `scaleX(${Math.max(0, 1 - frac)})`; el.setAttribute('aria-valuenow', String(Math.round((1 - frac) * 100))); } };
    }
    function countdown(ms, onTick, onDone) {
      const t0 = performance.now();
      let stopped = false;
      (function tick() {
        if (stopped) return;
        const el = performance.now() - t0;
        onTick(Math.min(1, el / ms), ms - el);
        if (el >= ms) { stopped = true; onDone(); return; }
        later(tick, 100);
      })();
      return { stop() { stopped = true; }, elapsed: () => performance.now() - t0 };
    }

    // ---------- Run a whole session ----------
    async function runSession(phase, ctx) {
      const c = db();
      const { list, reset } = pickList(c.usedLists);
      const now = new Date();
      const hr = now.getHours();
      run = {
        focusLost: false,
        startedAt: Date.now(),
        listId: list.id,
      };
      const device = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
      const tod = hr < 5 ? 'night' : hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : hr < 22 ? 'evening' : 'night';
      const width = window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 0;
      renderShell();

      // Mark the list as seen as soon as it is shown, so it isn't repeated even if this run is abandoned.
      if (reset) c.usedLists = [];
      if (!c.usedLists.includes(list.id)) c.usedLists.push(list.id);
      WH.store.save();

      const raw = {};
      setStep(0); raw.learn = await taskLearn(list);
      const learnedAt = performance.now();
      setStep(1); raw.symbol = await taskSymbol();
      setStep(2); raw.trails = await taskTrails();
      setStep(3); raw.where = await taskWhere();
      setStep(4); raw.delayed = await taskDelayed(list, learnedAt);
      if (!run) return;

      const scores = scoreSession(raw);
      const flags = flagReasons(ctx, run.focusLost);
      const session = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        ts: run.startedAt, day: WH.today(), date: WH.dateKey(), endedAt: Date.now(),
        phase, device, tod, hour: hr, width, focusLost: run.focusLost,
        listId: list.id, ctx, flagged: flags.length > 0, flags, scores,
        detail: {
          recall: raw.learn.trials.map((t) => ({ typed: t.typed, recalled: t.count })),
          delayedTyped: raw.delayed.recall.typed,
          delayMs: Math.round(raw.delayed.delayMs),
          symbolItems: raw.symbol.trials.length,
          trailsErrors: [raw.trails.a.errors, raw.trails.b.errors],
          where: raw.where.stages,
        },
      };
      c.sessions.push(session);
      const an = analyzeStored();
      session.status = an.status;
      WH.store.save();
      run = null;
      keyHandler = null;
      renderResults(session, an);
    }

    // ---------- a. Word Garden ----------
    async function taskLearn(list) {
      await instructions({
        step: 0, title: 'Word Garden',
        body: ['You’ll see 10 words, one at a time. Try to remember as many as you can.',
          'Then type every word you remember, in any order, pressing Enter after each. You’ll have 30 seconds. We’ll do this twice.'],
      });
      const trials = [];
      let prev = null;
      for (let t = 0; t < 2; t++) {
        let order;
        do { order = WH.shuffle(list.words); } while (prev && (order.join() === prev.join() || order[0] === prev[0]));
        prev = order;
        await getReady(t === 0 ? 'Get ready…' : 'Round 2. Same words, new order.');
        await present(order);
        trials.push(await recall({ title: t === 0 ? 'Which words do you remember?' : 'Round 2: which words do you remember?', targets: list.words }));
      }
      return { trials };
    }
    async function present(words) {
      const word = h('div', { class: 'ck-word', 'aria-live': 'assertive' });
      const dots = words.map(() => h('i'));
      stage(h('div', { class: 'ck-present' }, h('div', { class: 'ck-word-card' }, word), h('div', { class: 'ck-dots' }, dots)));
      for (let i = 0; i < words.length; i++) {
        word.textContent = words[i];
        word.classList.add('on');
        dots[i].classList.add('on');
        await sleep(WORD_ON_MS);
        word.classList.remove('on');
        word.textContent = '';
        await sleep(WORD_GAP_MS);
      }
    }
    function recall({ title, targets, sub }) {
      return new Promise((resolve) => {
        const typed = [];
        let finished = false;
        const chips = h('div', { class: 'ck-chips' });
        const helper = h('p', { class: 'ck-helper', 'aria-live': 'polite' }, '');
        const input = h('input', {
          class: 'ck-input', type: 'text', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false',
          enterkeyhint: 'enter', placeholder: 'Type a word, then Enter', 'aria-label': 'Type a word you remember and press Enter',
        });
        const count = h('span', { class: 'ck-count' }, '0 words');
        const tb = timerBar();
        const add = (rawWord) => {
          const w = normWord(rawWord);
          if (!w) return;
          if (typed.includes(w)) { helper.textContent = `“${w}” is already there`; return; }
          helper.textContent = '';
          typed.push(w);
          const chip = h('button', { class: 'ck-chip', type: 'button', 'aria-label': `${w}, tap to remove`, onclick: () => {
            if (finished) return;
            const i = typed.indexOf(w); if (i >= 0) typed.splice(i, 1);
            chip.remove(); count.textContent = `${typed.length} word${typed.length === 1 ? '' : 's'}`; input.focus();
          } }, w, h('span', { 'aria-hidden': 'true', html: WH.icons.x }));
          chips.append(chip);
          count.textContent = `${typed.length} word${typed.length === 1 ? '' : 's'}`;
        };
        const commit = () => { const v = input.value; input.value = ''; v.split(/[\s,;.]+/).forEach(add); };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
        });
        input.addEventListener('input', () => {
          if (/[\s,;]/.test(input.value)) {
            const parts = input.value.split(/[\s,;]+/);
            const last = parts.pop();
            parts.forEach(add);
            input.value = last;
          }
        });
        const doneBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => finish() }, 'I’m done');
        const addBtn = h('button', { class: 'btn primary ck-add', type: 'button', onclick: () => { commit(); input.focus(); } }, 'Add');
        stage(h('div', { class: 'ck-card ck-recall ck-enter' },
          h('h2', { class: 'ck-h2' }, title),
          sub ? h('p', { class: 'ck-sub' }, sub) : null,
          tb.el,
          h('div', { class: 'ck-input-row' }, input, addBtn),
          helper,
          chips,
          h('div', { class: 'ck-recall-foot' }, count, doneBtn)));
        later(() => input.focus(), 30);
        const timer = countdown(RECALL_MS, (f) => tb.set(f), () => finish());
        function finish() {
          if (finished) return;
          finished = true; timer.stop(); commit();
          input.disabled = true; addBtn.disabled = true; doneBtn.disabled = true;
          resolve(scoreRecall(typed, targets));
        }
      });
    }

    // ---------- b. Symbol Swap ----------
    function keyStrip(map, highlight) {
      return h('div', { class: 'ck-key', 'aria-label': 'Symbol key' },
        map.map((g, d) => h('div', { class: 'ck-key-cell' + (highlight === d + 1 ? ' hl' : '') },
          h('span', { class: 'ck-glyph', html: glyphSvg(g) }), h('b', null, String(d + 1)))));
    }
    async function taskSymbol() {
      const map = WH.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]); // map[d-1] = glyph shown for digit d
      await instructions({
        step: 1, title: 'Symbol Swap',
        body: ['Each symbol has a number, shown in the key. When a symbol appears, tap its number (or type it).',
          'First, three practice ones. Then one minute: go as quickly as you comfortably can.'],
        demo: keyStrip(map), cta: 'Try the practice',
      });
      // Practice
      await symbolRound(map, { practice: true, items: SYMBOL_PRACTICE });
      await instructions({ step: 1, title: 'Nicely done', body: ['Now the real one: 60 seconds. Accuracy and pace both matter, so don’t rush into mistakes.'], cta: 'Start' });
      return symbolRound(map, { practice: false, ms: SYMBOL_MS });
    }
    function symbolRound(map, { practice, items, ms }) {
      return new Promise((resolve) => {
        const trials = [];
        let current = 0, shownAt = 0, last = 0, done = false, practiceLeft = items || 0, wrongOnce = false;
        let keyEl = keyStrip(map);
        const keyHost = h('div', { class: 'ck-key-host' }, keyEl);
        const target = h('div', { class: 'ck-target', 'aria-live': 'polite' });
        const msg = h('p', { class: 'ck-helper' }, practice ? 'Practice' : '');
        const tb = timerBar();
        const pad = h('div', { class: 'ck-pad' }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) =>
          fastBtn({ class: 'ck-pad-btn', 'aria-label': `Number ${d}` }, () => respond(d), String(d))));
        stage(h('div', { class: 'ck-symbol ck-enter' }, practice ? null : tb.el, keyHost, target, msg, pad));
        function next() {
          let d;
          do { d = 1 + Math.floor(Math.random() * 9); } while (d === last);
          last = current = d;
          target.innerHTML = glyphSvg(map[d - 1]);
          target.setAttribute('aria-label', `Symbol for number ${d}`);
          target.classList.remove('pop'); void target.offsetWidth; target.classList.add('pop');
          shownAt = performance.now();
          wrongOnce = false;
        }
        function respond(d) {
          if (done || !current) return;
          const rt = performance.now() - shownAt;
          if (practice) {
            if (d === current) {
              sfx('tap');
              msg.textContent = 'That’s it';
              keyHost.replaceChildren(keyEl = keyStrip(map));
              practiceLeft--;
              if (practiceLeft <= 0) { done = true; current = 0; later(() => resolve({ practice: true }), 450); return; }
              next();
            } else {
              if (!wrongOnce) sfx('soft');
              wrongOnce = true;
              msg.textContent = `Not quite. Find this symbol in the key: it’s highlighted.`;
              keyHost.replaceChildren(keyEl = keyStrip(map, current));
              shake(target);
            }
            return;
          }
          trials.push({ g: current, r: d, ok: d === current, rt: Math.round(rt) });
          const btn = pad.children[d - 1];
          btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit');
          next();
        }
        keyHandler = (e) => {
          const k = e.key;
          if (/^[1-9]$/.test(k)) { e.preventDefault(); respond(+k); }
        };
        next();
        if (!practice) {
          const timer = countdown(ms, (f) => tb.set(f), () => {
            done = true; current = 0; keyHandler = null;
            resolve({ trials, durationMs: timer.elapsed() >= ms ? ms : timer.elapsed() });
          });
        }
      });
    }

    // ---------- c. Connect the Path ----------
    async function taskTrails() {
      const demoA = h('div', { class: 'ck-demo-seq' }, ['1', '2', '3', '4', '…', '15'].map((x) => h('span', null, x)));
      await instructions({
        step: 2, title: 'Connect the Path',
        body: ['Tap the circles in order, 1 → 2 → 3 and so on, as quickly as you can.',
          'If you tap the wrong one it will wiggle. Just find the right one and keep going. Let’s practise with five.'],
        demo: demoA, cta: 'Try the practice',
      });
      await trailsBoard(['1', '2', '3', '4', '5'], { practice: true });
      await instructions({ step: 2, title: 'Part 1', body: ['Now numbers 1 to 15. The clock starts when the circles appear.'], cta: 'Start' });
      const a = await trailsBoard(TRAILS_A, {});
      const demoB = h('div', { class: 'ck-demo-seq' }, ['1', 'A', '2', 'B', '3', 'C', '…', '8'].map((x) => h('span', { class: /\d/.test(x) ? '' : 'alt' }, x)));
      await instructions({
        step: 2, title: 'Part 2',
        body: ['This time, switch between numbers and letters: 1 → A → 2 → B → 3 → C and so on, ending at 8.'],
        demo: demoB, cta: 'Start',
      });
      const b = await trailsBoard(TRAILS_B, {});
      return { a, b };
    }
    function trailsBoard(labels, { practice }) {
      return new Promise((resolve) => {
        let pts = null;
        for (let md = labels.length <= 6 ? 0.25 : 0.17; !pts; md *= 0.9) pts = layoutNodes(labels.length, Math.random, md);
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('class', 'ck-lines');
        svg.setAttribute('aria-hidden', 'true');
        let next = 0, errors = 0, t0 = 0, finished = false;
        const hint = h('p', { class: 'ck-helper' }, practice ? 'Practice: tap 1 to start' : `Next: ${labels[0]}`);
        const nodes = labels.map((lab, i) => fastBtn({
          class: 'ck-node' + (/\d/.test(lab) ? '' : ' alt'), 'aria-label': `Circle ${lab}`,
          style: { left: `${(pts[i].x * 100).toFixed(2)}%`, top: `${(pts[i].y * 100).toFixed(2)}%` },
        }, () => tap(i), lab));
        const board = h('div', { class: 'ck-board' + (practice ? ' practice' : '') }, svg, nodes);
        stage(h('div', { class: 'ck-trails ck-enter' }, practice ? h('span', { class: 'ck-tag ck-tag-practice' }, 'Practice') : null, board, hint));
        t0 = performance.now();
        function line(i) {
          const l = document.createElementNS(svgNS, 'line');
          l.setAttribute('x1', pts[i - 1].x * 100); l.setAttribute('y1', pts[i - 1].y * 100);
          l.setAttribute('x2', pts[i].x * 100); l.setAttribute('y2', pts[i].y * 100);
          svg.append(l);
        }
        function tap(i) {
          if (finished) return;
          if (i < next) return; // already done: ignore
          if (i !== next) {
            errors++;
            shake(nodes[i]);
            sfx('soft');
            if (practice) hint.textContent = `Look for ${labels[next]}`;
            return;
          }
          nodes[i].classList.add('done');
          nodes[i].setAttribute('aria-pressed', 'true');
          if (i > 0) line(i);
          next++;
          if (next >= labels.length) {
            finished = true;
            const ms = performance.now() - t0;
            sfx('good');
            hint.textContent = practice ? 'Nice!' : 'Done!';
            later(() => resolve({ ms, errors }), 550);
            return;
          }
          hint.textContent = `Next: ${labels[next]}`;
        }
      });
    }

    // ---------- d. Where Was It? ----------
    async function taskWhere() {
      await instructions({
        step: 3, title: 'Where Was It?',
        body: ['Some of the six boxes will open one at a time to show a picture. Remember which box each picture was in.',
          'Then each picture appears on its own: tap the box where it was. First three pictures, then five. If you miss any, you’ll get one more look.'],
        cta: 'Begin',
      });
      const icons = WH.shuffle(LOC_ICONS);
      let used = 0, errors = 0;
      const stages = [];
      for (let si = 0; si < LOC_STAGES.length; si++) {
        const nIcons = LOC_STAGES[si];
        const set = icons.slice(used, used + nIcons); used += nIcons;
        const boxes = WH.shuffle([0, 1, 2, 3, 4, 5]).slice(0, nIcons);
        const rec = { n: nIcons, attempts: [] };
        let passed = false;
        for (let a = 0; a < LOC_ATTEMPTS && !passed; a++) {
          const errs = await whereAttempt(set, boxes, { stage: si, attempt: a });
          rec.attempts.push(errs);
          errors += errs;
          passed = errs === 0;
        }
        rec.passed = passed;
        stages.push(rec);
        if (!passed) {
          for (let sj = si + 1; sj < LOC_STAGES.length; sj++) { errors += LOC_STAGES[sj] * LOC_ATTEMPTS; stages.push({ n: LOC_STAGES[sj], attempts: [], passed: false, notReached: true }); }
          break;
        }
      }
      return { errors, stages };
    }
    async function whereAttempt(set, boxes, { stage: si, attempt }) {
      const cells = [0, 1, 2, 3, 4, 5].map((i) => fastBtn({ class: 'ck-box', 'aria-label': `Box ${i + 1}`, disabled: true }, () => pick(i),
        h('span', { class: 'ck-box-num' }, String(i + 1)), h('span', { class: 'ck-box-icon' })));
      const center = h('div', { class: 'ck-loc-center', 'aria-live': 'polite' });
      const msg = h('p', { class: 'ck-helper' }, attempt ? 'Another look. Watch closely.' : 'Watch where each picture appears.');
      let pick = () => {};
      stage(h('div', { class: 'ck-where ck-enter' },
        h('p', { class: 'ck-eyebrow' }, `Round ${si + 1} of ${LOC_STAGES.length} · ${set.length} pictures`),
        center, h('div', { class: 'ck-boxes' }, cells), msg));
      await sleep(900);
      // Reveal in a random order.
      for (const k of WH.shuffle(set.map((_, i) => i))) {
        const c = cells[boxes[k]];
        c.querySelector('.ck-box-icon').textContent = set[k];
        c.classList.add('open');
        await sleep(LOC_ON_MS);
        c.classList.remove('open');
        c.querySelector('.ck-box-icon').textContent = '';
        await sleep(LOC_GAP_MS);
      }
      // Test in a random order.
      let errs = 0;
      cells.forEach((c) => { c.disabled = false; });
      msg.textContent = 'Tap the box where this was';
      for (const k of WH.shuffle(set.map((_, i) => i))) {
        center.textContent = set[k];
        center.classList.remove('pop'); void center.offsetWidth; center.classList.add('pop');
        const chosen = await new Promise((r) => {
          pick = (i) => { pick = () => {}; r(i); };
          keyHandler = (e) => { if (/^[1-6]$/.test(e.key)) { e.preventDefault(); pick(+e.key - 1); } };
        });
        keyHandler = null;
        const c = cells[chosen];
        c.classList.add('tapped');
        later(() => c.classList.remove('tapped'), 220);
        sfx('tap');
        if (chosen !== boxes[k]) errs++;
        await sleep(250);
      }
      cells.forEach((c) => { c.disabled = true; });
      center.textContent = '';
      msg.textContent = errs === 0 ? 'All found!' : attempt + 1 < LOC_ATTEMPTS ? 'Let’s take another look.' : 'Thanks, on we go.';
      if (errs === 0) sfx('good');
      await sleep(1000);
      return errs;
    }

    // ---------- e. Word Garden Revisited ----------
    async function taskDelayed(list, learnedAt) {
      await instructions({
        step: 4, title: 'Word Garden Revisited',
        body: ['Remember the Word Garden words from the start? Type as many as you can recall, in any order.', 'You have 30 seconds.'],
        cta: 'Start',
      });
      const delayMs = performance.now() - learnedAt;
      const r = await recall({ title: 'Which Word Garden words do you remember?', targets: list.words });
      await instructions({
        step: 4, title: 'Seen it before?',
        body: ['Now you’ll see 20 words, one at a time. For each one, was it in the Word Garden?',
          'Some are new and some are similar to the originals, so take a moment with each. Tap Yes or No (or press Y / N).'],
        cta: 'Start',
      });
      const items = WH.shuffle([
        ...list.words.map((w) => ({ w, type: 'target' })),
        ...list.lures.map((w) => ({ w, type: 'lure' })),
        ...list.foils.map((w) => ({ w, type: 'foil' })),
      ]);
      const recog = [];
      for (let i = 0; i < items.length; i++) recog.push(await recogItem(items[i], i, items.length));
      return { recall: r, recog, delayMs };
    }
    function recogItem(item, i, n) {
      return new Promise((resolve) => {
        let done = false;
        const t0 = performance.now();
        const answer = (yes) => {
          if (done) return; done = true;
          sfx('tap');
          resolve({ w: item.w, type: item.type, yes, rt: Math.round(performance.now() - t0) });
        };
        const yesBtn = h('button', { class: 'btn primary ck-yn', type: 'button', onclick: () => answer(true) }, 'Yes, it was');
        const noBtn = h('button', { class: 'btn ghost ck-yn', type: 'button', onclick: () => answer(false) }, 'No, it wasn’t');
        stage(h('div', { class: 'ck-recog' },
          h('p', { class: 'ck-eyebrow' }, `${i + 1} of ${n}`),
          h('div', { class: 'ck-word-card' }, h('div', { class: 'ck-word on' }, item.w)),
          h('p', { class: 'ck-sub center' }, 'Was this word in the Word Garden?'),
          h('div', { class: 'ck-yn-row' }, yesBtn, noBtn)));
        keyHandler = (e) => {
          const k = e.key.toLowerCase();
          if (k === 'y') { e.preventDefault(); answer(true); } else if (k === 'n') { e.preventDefault(); answer(false); }
        };
      });
    }

    // ---------- Results ----------
    function renderResults(session, an) {
      clearTimers();
      const sc = session.scores;
      const st = an.classes[session.device];
      const isRunIn = session.phase === 'runin';
      const base = st && st.baseline;
      const inBaseline = !!(base && base.ids.includes(session.id));
      const compare = base && !inBaseline && !isRunIn;
      const dom = compare ? standing(base, session) : null;
      const rel = (z) => (!finite(z) ? null : z >= 1 ? ['Above your usual', 'up'] : z > -1 ? ['Within your usual range', 'mid'] : ['Below your usual', 'down']);
      const building = isRunIn ? 'Practice session: not counted'
        : an.phase === 'device' ? `Learning your range on this device (${an.deviceProgress} of ${MINI_BASELINE_N})`
          : `Building your baseline (session ${Math.max(an.progress, RUN_IN_N)} of ${TOTAL_SETUP})`;
      const facts = {
        memory: `${sc.recallT2} of 10 words learned · ${sc.delayedRecall} remembered later · ${sc.recogHits} of 10 recognised`,
        speed: `${sc.symbolCorrect} symbols matched in a minute · Path 1 in ${fmtSec(sc.trailsA)}`,
        focus: `Path 2 in ${fmtSec(sc.trailsB)} · ${sc.objectErrors === 0 ? 'every picture placed first time' : `${sc.objectErrors} location slip${sc.objectErrors === 1 ? '' : 's'}`}`,
      };
      const domainCards = Object.entries(DOMAIN_INFO).map(([d, info]) => {
        const r = dom ? rel(dom[d]) : null;
        return h('div', { class: `ck-domain area-${info.area}` },
          h('div', { class: 'ck-domain-head' }, h('b', null, info.name),
            h('span', { class: 'ck-rel ' + (r ? r[1] : 'build') }, session.flagged && !isRunIn ? 'Set aside today' : r ? r[0] : building)),
          h('p', null, facts[d]));
      });

      const title = isRunIn ? `Practice ${an.runIn} of ${RUN_IN_N} done` : 'Check-in complete';
      const showTier = an.phase === 'tracking' && !an.justCompleted && an.status !== 'normal';
      const parts = [
        h('section', { class: 'ck-card ck-hero ck-enter' },
          h('p', { class: 'ck-eyebrow' }, fmtDay(session.day, { weekday: 'long', month: 'long', day: 'numeric' })),
          h('h1', { class: 'ck-h1' }, title),
          showTier ? null : h('p', { class: 'ck-lede' }, statusMessage(an)),
          session.flagged && !isRunIn ? h('p', { class: 'ck-note' }, `This session is saved but set aside from your trend because of ${joinAnd(session.flags)}. That keeps an off day from skewing your picture.`) : null,
          h('div', { class: 'ck-domains' }, domainCards)),
      ];
      if (showTier) parts.push(tierCard(an));
      if (an.moodNote) parts.push(h('div', { class: 'ck-card ck-mood' }, h('p', null, MOOD_NOTE)));
      const tr = trendsEl(an);
      if (tr) parts.push(tr);
      const actions = h('div', { class: 'ck-actions wrap' });
      if (isRunIn && an.runIn < RUN_IN_N) actions.append(h('button', { class: 'btn primary ck-cta', type: 'button', onclick: startSession }, `Start practice session ${an.runIn + 1} now`));
      actions.append(
        h('button', { class: 'btn ' + (isRunIn && an.runIn < RUN_IN_N ? 'ghost' : 'primary'), type: 'button', onclick: renderIntro }, 'Done'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => downloadText(analyzeStored()) }, 'Download summary'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => printSummary(analyzeStored()) }, 'Print'));
      parts.push(h('section', { class: 'ck-card' },
        h('p', { class: 'ck-sub' }, an.nextDue != null ? `Next check-in: ${an.nextDue <= WH.today() ? 'whenever you’re ready' : fmtDay(an.nextDue, { weekday: 'long', month: 'short', day: 'numeric' })}.` : ''),
        actions));
      parts.push(disclaimerEl());
      show(h('div', { class: 'ck-wrap ck-results' }, parts));
      sfx('win');
    }
    const fmtSec = (s) => (finite(s) ? `${Math.round(s)}s` : '—');

    renderIntro();

    return {
      destroy() {
        alive = false;
        clearTimers();
        run = null; keyHandler = null;
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('blur', onBlur);
        root.remove();
      },
    };
  }

  function summary() {
    try { return summaryOf(analyzeStored()); }
    catch (e) { return { sessions: 0, status: 'new', nextDue: null, label: 'About 5 minutes' }; }
  }

  WH.checkin = { mount, summary };

  // Test hook: only populated when a harness sets window.__CK_TEST__ before loading this file.
  if (window.__CK_TEST__) {
    window.__CK_TEST__ = {
      LISTS, LOC_ICONS, GLYPHS, TRAILS_A, TRAILS_B, METRICS, DOMAINS,
      probit, dprime, levenshtein, matchWord, scoreRecall, flagReasons, scoreSession, oriented,
      makeBaseline, evaluate, classify, analyze, domainSeries, layoutNodes, crossings, pickList,
      statusLabel, statusMessage, summaryOf, exportText,
      C: { RUN_IN_N, BASELINE_N, BASELINE_GAP_DAYS, MAINT_DAYS, RETRY_DAYS, MINI_BASELINE_N, REBASE_MIN_VALID, REBASE_DAYS, SHRINK_M, RECENT_K, Z_LOW, Z_NOTABLE },
    };
  }
})();
