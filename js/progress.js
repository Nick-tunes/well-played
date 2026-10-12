// Progress: streaks, XP, daily goals and ranked records.
// Design follows the streak research (see SPEC.md §Streaks): effort counts (a loss still keeps the
// streak), 2 automatic rest days a week, earned freezes, a free repair window after a break,
// lifetime "days played" that never resets, and XP only from daily/ranked play so grinding doesn't pay.
(function () {
  const store = WH.store;
  const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];
  const isStreakMilestone = (n) => STREAK_MILESTONES.includes(n) || (n > 365 && n % 100 === 0);
  const PLAYED_MILESTONES = [10, 25, 50, 100, 150, 200, 300, 500, 750, 1000];
  const FREEZE_AT = [7, 30, 100];          // bonus freezes on these streak milestones
  const FREEZE_EVERY = 7, MAX_FREEZES = 3;   // plus one per 7 days played
  const REST_PER_WEEK = 2;
  const REPAIR_WINDOW = 3, REPAIR_NEEDED = 2, REPAIR_COOLDOWN = 30;
  const GOALS = {
    gentle: { label: 'Gentle', xp: 10, desc: 'About 1 puzzle a day' },
    steady: { label: 'Steady', xp: 25, desc: 'About 2 puzzles a day' },
    focused: { label: 'Focused', xp: 45, desc: 'About 3 puzzles a day' },
  };

  function state() {
    const d = store.data;
    if (!d.streak) {
      // First run with the streak engine: credit any days already played.
      const days = Object.keys(d.results || {}).map(Number).filter((n) => Object.keys(d.results[n]).length);
      d.streak = { days, rest: [], frozen: [], freezes: 1, longest: 0, repair: null, lastRepair: -999, notices: [] };
    }
    const s = d.streak;
    s.rest = s.rest || []; s.frozen = s.frozen || []; s.notices = s.notices || [];
    if (!d.xp) d.xp = { total: 0, byDay: {} };
    if (!GOALS[d.goal]) d.goal = 'gentle';
    if (!d.ranked) d.ranked = {};
    if (!d.bests) d.bests = {};
    return d;
  }
  const has = (arr, n) => arr.indexOf(n) !== -1;
  const weekStart = (day) => day - ((WH.dateFromDay(day).getDay() + 6) % 7); // Monday
  const covered = (s, d) => has(s.days, d) || has(s.rest, d) || has(s.frozen, d);

  // Fill missed days since the last covered day: rest days first (2 per week), then freezes.
  // If neither covers a day, the streak breaks and a repair window opens.
  function reconcile(today = WH.today()) {
    const s = state().streak;
    if (!s.days.length) return;
    let last = Math.max(...s.days, ...s.rest, ...s.frozen);
    if (s.repair && today > s.repair.until) { s.repair = null; }
    for (let d = last + 1; d < today; d++) {
      const restUsed = s.rest.filter((r) => weekStart(r) === weekStart(d)).length;
      if (restUsed < REST_PER_WEEK) { s.rest.push(d); s.notices.push({ type: 'rest', day: d }); continue; }
      if (s.freezes > 0) { s.freezes--; s.frozen.push(d); s.notices.push({ type: 'freeze', day: d }); continue; }
      // Broken. Offer a repair if one hasn't been used recently.
      const prev = streakEndingAt(d - 1);
      if (prev >= 2 && today - s.lastRepair >= REPAIR_COOLDOWN && !s.repair && s.repairOfferedFor !== d) {
        s.repair = { from: d, prev, until: today + REPAIR_WINDOW - 1, progress: 0 };
        s.repairOfferedFor = d;
        s.notices.push({ type: 'broken', prev });
      }
      break;
    }
    store.save();
  }

  function streakEndingAt(day) {
    const s = state().streak;
    let n = 0;
    for (let d = day; covered(s, d); d--) if (has(s.days, d)) n++;
    return n;
  }
  // Current streak counts days actually played in the unbroken chain (rest/freeze days bridge it).
  function current(today = WH.today()) {
    const s = state().streak;
    return streakEndingAt(covered(s, today) ? today : today - 1);
  }

  function goalProgress(today = WH.today()) {
    const g = GOALS[state().goal];
    const earned = state().xp.byDay[today] || 0;
    return { target: g.xp, earned, done: earned >= g.xp, label: g.label };
  }

  // XP per finished game: complete 10, solved +5, efficiency up to +5, first of the day +5.
  // Practice earns nothing, so the streak and leagues reward consistency, not grinding.
  function xpFor(mode, result) {
    if (mode === 'practice') return 0;
    const acc = typeof result.accuracy === 'number' ? result.accuracy : 0;
    let xp = 10 + (result.won ? 5 : 0) + Math.round(Math.max(0, Math.min(1, acc)) * 5);
    if (!has(state().streak.days, WH.today())) xp += 5;
    return xp;
  }

  // Called on every completed game. Returns what changed so the UI can celebrate.
  function recordActivity(mode, result) {
    const today = WH.today();
    reconcile(today);
    const d = state(), s = d.streak;
    const xp = xpFor(mode, result);
    const goalBefore = goalProgress(today).done;
    if (xp) {
      d.xp.total += xp;
      d.xp.byDay[today] = (d.xp.byDay[today] || 0) + xp;
      for (const k of Object.keys(d.xp.byDay)) if (+k < today - 120) delete d.xp.byDay[k];
    }
    const out = { xp, extended: false, streak: current(today), milestone: null, playedMilestone: null, freezeEarned: false, repaired: false, goalJustMet: false };
    if (mode === 'practice') { store.save(); return out; }

    // Repair progress: two puzzles inside the window restores the streak.
    if (s.repair && today <= s.repair.until) {
      s.repair.progress++;
      if (s.repair.progress >= REPAIR_NEEDED) {
        for (let g = s.repair.from; g < today; g++) if (!covered(s, g)) s.frozen.push(g);
        s.lastRepair = today; s.repair = null; out.repaired = true;
      }
    }
    if (!has(s.days, today)) {
      s.days.push(today);
      if (s.days.length > 1500) s.days.splice(0, s.days.length - 1500);
      out.extended = true;
      const n = current(today);
      out.streak = n;
      s.longest = Math.max(s.longest || 0, n);
      if (isStreakMilestone(n)) out.milestone = n;
      if (PLAYED_MILESTONES.includes(s.days.length)) out.playedMilestone = s.days.length;
      const earned = (s.days.length % FREEZE_EVERY === 0 ? 1 : 0) + (FREEZE_AT.includes(n) ? 1 : 0);
      if (earned && s.freezes < MAX_FREEZES) { s.freezes = Math.min(MAX_FREEZES, s.freezes + earned); out.freezeEarned = true; }
    }
    out.goalJustMet = !goalBefore && goalProgress(today).done;
    store.save();
    return out;
  }

  function weekXp(today = WH.today()) {
    let sum = 0;
    for (let d = weekStart(today); d <= today; d++) sum += state().xp.byDay[d] || 0;
    return sum;
  }

  // Mon–Sun strip for the streak calendar.
  function weekStrip(today = WH.today()) {
    const s = state().streak, ws = weekStart(today);
    return Array.from({ length: 7 }, (_, i) => {
      const d = ws + i;
      const st = has(s.days, d) ? 'done' : has(s.rest, d) ? 'rest' : has(s.frozen, d) ? 'frozen' : d === today ? 'today' : d > today ? 'future' : 'missed';
      return { day: d, label: 'MTWTFSS'[i], state: st };
    });
  }

  const atRisk = (today = WH.today()) => current(today) > 0 && !has(state().streak.days, today) && new Date().getHours() >= 17;
  function takeNotices() {
    const s = state().streak, n = s.notices;
    if (n.length) { s.notices = []; store.save(); }
    return n;
  }

  // ----- Ranked records -----
  const rankedFor = (day, id) => (state().ranked[day] || {})[id];
  function saveRanked(day, id, rec) {
    const d = state();
    (d.ranked[day] = d.ranked[day] || {})[id] = rec;
    if (rec.won && rec.time != null) {
      const b = d.bests[id];
      if (!b || rec.time < b.time) { d.bests[id] = { time: rec.time, acc: rec.acc, day }; rec.pb = true; }
    }
    for (const k of Object.keys(d.ranked)) if (+k < day - 60) delete d.ranked[k];
    store.save();
    return rec;
  }

  WH.progress = {
    GOALS, MAX_FREEZES, REPAIR_NEEDED, state, reconcile, current, recordActivity, goalProgress, weekXp,
    weekStrip, atRisk, takeNotices, rankedFor, saveRanked,
    longest: () => Math.max(state().streak.longest || 0, current()),
    daysPlayed: () => state().streak.days.length,
    freezes: () => state().streak.freezes,
    repair: () => state().streak.repair,
    activeToday: () => has(state().streak.days, WH.today()),
  };

  // Online layer. Replaced by js/net.js once a backend is configured; until then everything is local.
  WH.net = WH.net || {
    enabled: false,
    async submitRanked() { return null; }, async leaderboard() { return null; }, async syncProfile() {},
  };
})();
