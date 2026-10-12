// Well Played app shell: routing, hub, game screen (daily / practice / ranked), results,
// streak celebrations, ranked page, stats and settings.
(function () {
  const { h, store, icons } = WH;
  const P = WH.progress;
  const data = () => store.data;
  const AREAS = {
    Language: 'language', Focus: 'focus', Logic: 'logic', Spatial: 'spatial',
    Perception: 'perception', Listening: 'listening', Memory: 'memory', Association: 'association',
  };
  const ORDER = ['word', 'duet', 'quad', 'sums', 'code', 'ladder', 'swap', 'hue', 'tune', 'echo', 'groups'];
  const games = () => ORDER.map((id) => WH.gameMap[id]).filter(Boolean);
  const TIPS = [
    'Variety matters. Try a game from an area you haven’t touched this week.',
    'A short daily habit beats an occasional marathon. Little and often.',
    'Stuck? Step away for a moment. Fresh eyes often see the answer straight away.',
    'Say your guesses out loud. Hearing words can unlock new ideas.',
    'Sleep, movement and good company feed a healthy mind as much as puzzles do.',
    'Playing with someone? Compare results, not speed. Talking it over is half the fun.',
    'Notice how you solved it. Thinking about your strategy strengthens it.',
    'Missed a day? No problem. Every day is a fresh start.',
  ];

  const app = document.getElementById('app');
  let current = null; // { game, instance, ranked?: { start, lastInput, locked } }
  let ticker = null;

  // ---------- Settings / theme ----------
  function applySettings() {
    const s = data().settings, root = document.documentElement;
    if (s.theme === 'system') root.removeAttribute('data-theme'); else root.dataset.theme = s.theme;
    root.toggleAttribute('data-cb', !!s.colorblind);
    root.toggleAttribute('data-rm', !!s.reducedMotion);
    const dark = s.theme === 'dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name=theme-color]').setAttribute('content', dark ? '#16151b' : '#f5f0e8');
  }

  // ---------- Stats helpers ----------
  const resultFor = (day, id) => (data().results[day] || {})[id];
  const dailyCount = (day) => Object.keys(data().results[day] || {}).length;
  function areaCounts(days) {
    const from = WH.today() - days + 1, counts = {};
    for (const a of Object.keys(AREAS)) counts[a] = 0;
    for (const e of data().log) if (e.d >= from && WH.gameMap[e.g]) counts[WH.gameMap[e.g].area]++;
    return counts;
  }
  const fmtTime = (s) => (s == null ? '—' : s < 60 ? `${s.toFixed(2)}s` : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`);

  // Records a finished game and returns the streak/XP outcome for celebrations.
  function record(game, mode, day, result) {
    const D = data();
    const acc = typeof result.accuracy === 'number' ? Math.max(0, Math.min(1, result.accuracy)) : null;
    D.log.push({ d: day, g: game.id, p: mode === 'practice' ? 1 : 0, r: mode === 'ranked' ? 1 : 0, w: result.won ? 1 : 0, a: acc == null ? undefined : Math.round(acc * 100) });
    if (D.log.length > 3000) D.log.splice(0, D.log.length - 3000);
    const s = (D.stats[game.id] = Object.assign({ played: 0, wins: 0, streak: 0, maxStreak: 0, lastDay: null, dist: {}, best: 0, total: 0, accSum: 0, accN: 0 }, D.stats[game.id]));
    if (acc != null) { s.accSum += acc; s.accN++; }
    if (mode === 'daily') {
      D.results[day] = D.results[day] || {};
      D.results[day][game.id] = { won: result.won, score: result.score, label: result.label, acc };
      s.played++;
      if (result.won) s.wins++;
      const counts = game.statType === 'best' ? true : result.won;
      s.streak = counts ? (s.lastDay === day - 1 ? s.streak + 1 : 1) : 0;
      s.lastDay = day;
      s.maxStreak = Math.max(s.maxStreak, s.streak);
      s.dist[result.score] = (s.dist[result.score] || 0) + 1;
      if (typeof result.score === 'number') { s.best = Math.max(s.best, result.score); s.total += result.score; }
    }
    const outcome = P.recordActivity(mode, result);
    store.save();
    if (WH.net.enabled) WH.net.syncProfile().catch(() => {});
    return outcome;
  }

  // ---------- Router ----------
  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    teardown();
    if (parts[0] === 'play' && WH.gameMap[parts[1]]) {
      const mode = parts[2] === 'practice' ? 'practice' : parts[2] === 'ranked' ? 'ranked' : 'daily';
      return renderGame(WH.gameMap[parts[1]], mode);
    }
    if (parts[0] === 'stats') return renderStats();
    if (parts[0] === 'ranked') return renderRanked();
    if (parts[0] === 'friends') return renderFriends();
    if (parts[0] === 'checkin') return renderCheckin();
    if (parts[0] === 'add' && parts[1]) return renderFriends(decodeURIComponent(parts[1]));
    renderHub();
  }
  function teardown() {
    WH.closeModal();
    if (current && current.instance && current.instance.destroy) current.instance.destroy();
    if (current && current.cleanup) current.cleanup();
    current = null;
    clearInterval(ticker);
    document.body.classList.remove('in-game');
  }
  const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

  // ---------- Header ----------
  function header() {
    const streak = P.current();
    return h('header', { class: 'top' },
      h('a', { class: 'brand', href: '#/' },
        h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')),
        h('span', { class: 'brand-name' }, 'Well ', h('em', null, 'Played'))),
      h('nav', { class: 'top-actions' },
        h('button', { class: 'streak-chip' + (P.activeToday() ? ' lit' : streak ? ' warm' : ''), type: 'button', title: 'Your streak', onclick: () => showStreakSheet(),
          html: `${icons.flame}<b>${streak}</b>` }),
        h('a', { class: 'icon-btn', href: '#/friends', 'aria-label': 'Friends', title: 'Friends & leaderboard', html: icons.users }),
        h('a', { class: 'icon-btn', href: '#/ranked', 'aria-label': 'Ranked', title: 'Ranked', html: icons.trophy }),
        h('a', { class: 'icon-btn', href: '#/stats', 'aria-label': 'Statistics', title: 'Statistics', html: icons.chart }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Settings', title: 'Settings', onclick: openSettings, html: icons.gear })));
  }

  // ---------- Streak UI ----------
  function weekStripEl(today = WH.today()) {
    return h('div', { class: 'week-strip' }, P.weekStrip(today).map((d) =>
      h('div', { class: 'wk ' + d.state, title: { done: 'Played', rest: 'Rest day', frozen: 'Freeze used', missed: 'Missed', today: 'Today', future: '' }[d.state] },
        h('span', null, d.label),
        h('i', { html: d.state === 'done' ? icons.flame : d.state === 'rest' ? '☾' : d.state === 'frozen' ? '❄' : '' }))));
  }
  function goalRing(goal) {
    const r = 46, c = 2 * Math.PI * r, frac = Math.min(1, goal.earned / goal.target);
    return h('div', { class: 'ring' + (goal.done ? ' done' : ''), html: `<svg viewBox="0 0 108 108" aria-hidden="true">
      <circle cx="54" cy="54" r="${r}" class="ring-bg"/>
      <circle cx="54" cy="54" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}"/></svg>
      <div class="ring-label"><b>${goal.earned}</b><span>of ${goal.target} XP</span></div>` });
  }

  function showStreakSheet() {
    const n = P.current(), rep = P.repair();
    WH.modal({
      body: h('div', { class: 'streak-sheet' },
        h('div', { class: 'big-flame' + (P.activeToday() ? ' lit' : ''), html: icons.flame }),
        h('h2', null, `${n} day streak`),
        h('p', { class: 'muted' }, P.activeToday() ? 'You’ve played today. Lovely.' : n ? 'Play any daily or ranked puzzle today to keep it going.' : 'Play any daily puzzle to start a streak.'),
        weekStripEl(),
        h('div', { class: 'streak-facts' },
          fact('❄', P.freezes(), `Freeze${P.freezes() === 1 ? '' : 's'} ready`),
          fact('☾', 2, 'Rest days a week'),
          fact('★', P.longest(), 'Longest streak'),
          fact('✓', P.daysPlayed(), 'Days played')),
        rep ? h('p', { class: 'repair-note' }, `Pick up where you left off: play ${P.REPAIR_NEEDED - rep.progress} more puzzle${P.REPAIR_NEEDED - rep.progress === 1 ? '' : 's'} by ${dayName(rep.until)} to restore your ${rep.prev}-day streak.`) : null,
        h('p', { class: 'small muted' }, 'Any finished puzzle counts, win or lose. Two rest days a week are applied automatically, and you earn a freeze for every 7 days played (up to 3).')),
    });
  }
  const fact = (sym, v, l) => h('div', { class: 'sfact' }, h('span', null, sym), h('b', null, v), h('small', null, l));
  const dayName = (d) => WH.dateFromDay(d).toLocaleDateString(undefined, { weekday: 'long' });

  function showCelebration(out, next) {
    const lines = [];
    if (out.repaired) lines.push('Streak restored. Welcome back!');
    if (out.milestone) lines.push(`${out.milestone} days. That’s a real habit.`);
    if (out.playedMilestone) lines.push(`${out.playedMilestone} days played in total.`);
    if (out.freezeEarned) lines.push('You earned a streak freeze ❄');
    if (out.goalJustMet) lines.push('Daily goal reached!');
    if (out.milestone || out.repaired) WH.confetti();
    WH.sound.win();
    WH.modal({
      body: h('div', { class: 'celebrate' },
        h('div', { class: 'big-flame lit pop', html: icons.flame }),
        h('div', { class: 'celebrate-num' }, out.streak),
        h('h2', null, out.streak === 1 ? 'Streak started!' : 'day streak!'),
        weekStripEl(),
        lines.map((l) => h('p', { class: 'celebrate-line' }, l)),
        out.xp ? h('span', { class: 'xp-pill' }, `+${out.xp} XP`) : null,
        h('button', { class: 'btn primary wide', type: 'button', onclick: () => { WH.closeModal(); setTimeout(next, 240); } }, 'Continue')),
    });
  }

  // ---------- Hub ----------
  function greeting() {
    const hr = new Date().getHours();
    return hr < 5 ? 'Still up?' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : hr < 22 ? 'Good evening' : 'Winding down?';
  }

  function renderHub() {
    P.reconcile();
    const day = WH.today();
    const list = games();
    const done = list.filter((g) => resultFor(day, g.id)).length;
    const streak = P.current();
    const goal = P.goalProgress();
    const daily = WH.daily(day) || {};
    const next = list.find((g) => !resultFor(day, g.id));
    const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const countdown = h('b', null, WH.fmtCountdown(WH.msToMidnight()));
    const rep = P.repair();
    const rankedDone = list.filter((g) => P.rankedFor(day, g.id)).length;

    const banner = rep ? h('div', { class: 'banner repair', html: `${icons.flame}<span><b>Pick up where you left off.</b> Play ${P.REPAIR_NEEDED - rep.progress} puzzle${P.REPAIR_NEEDED - rep.progress === 1 ? '' : 's'} by ${dayName(rep.until)} to restore your ${rep.prev}-day streak.</span>` })
      : P.atRisk() ? h('div', { class: 'banner risk', html: `${icons.flame}<span>Your ${streak}-day streak is still going. Play a puzzle today, or let a rest day cover it.</span>` })
        : null;

    const hero = h('section', { class: 'hero' },
      h('div', { class: 'hero-text' },
        h('p', { class: 'eyebrow' }, `${dateStr} · Daily #${day}`),
        h('h1', null, greeting(), greeting().endsWith('?') ? null : h('span', { class: 'dot' }, '.')),
        h('p', { class: 'lede' }, done === list.length
          ? 'Workout complete. Your mind thanks you. See you tomorrow.'
          : done ? `Nice progress: ${done} of ${list.length} daily puzzles done.` : 'A few minutes of play to keep your mind bright.'),
        daily.theme ? h('p', { class: 'theme-chip', html: `${icons.sparkle}<span>Today’s theme: <b>${esc(daily.theme)}</b></span>` }) : null,
        h('div', { class: 'hero-cta' },
          next ? h('a', { class: 'btn primary', href: `#/play/${next.id}`, html: `${icons.play}<span>${done ? 'Continue' : 'Start'} with ${next.name}</span>` }) : null,
          h('span', { class: 'hero-meta' }, 'New puzzles in ', countdown))),
      h('div', { class: 'hero-side' },
        goalRing(goal),
        h('button', { class: 'streak' + (streak ? ' on' : '') + (P.activeToday() ? ' lit' : ''), type: 'button', onclick: showStreakSheet },
          h('span', { html: icons.flame }), h('b', null, streak), h('span', null, 'day streak'),
          P.freezes() ? h('span', { class: 'freeze-count', title: 'Streak freezes ready' }, `❄${P.freezes()}`) : null),
        weekStripEl()));

    const cards = h('section', { class: 'cards' }, list.map((g, i) => {
      const res = resultFor(day, g.id);
      const prog = data().progress[`${g.id}:${day}`];
      const status = res ? h('span', { class: 'status done' + (res.won ? '' : ' soft'), html: `${icons.check}<span>${esc(res.label)}</span>` })
        : prog ? h('span', { class: 'status prog' }, 'In progress') : h('span', { class: 'status' }, 'Play');
      return h('a', { class: 'card area-' + AREAS[g.area] + (res ? ' is-done' : ''), href: `#/play/${g.id}`, style: { '--i': i } },
        h('div', { class: 'card-icon', html: g.icon }),
        h('div', { class: 'card-body' },
          h('div', { class: 'card-head' }, h('h3', null, g.name), h('span', { class: 'chip' }, g.area)),
          h('p', null, g.tagline)),
        h('div', { class: 'card-foot' }, status,
          h('span', { class: 'card-links' },
            h('button', { class: 'link-btn', type: 'button', onclick: (e) => { e.preventDefault(); go(`#/play/${g.id}/ranked`); } }, 'Ranked'),
            h('button', { class: 'link-btn', type: 'button', onclick: (e) => { e.preventDefault(); go(`#/play/${g.id}/practice`); } }, 'Practice'))));
    }));

    const ranked = h('a', { class: 'panel ranked-promo', href: '#/ranked' },
      h('div', { class: 'tip-icon', html: icons.trophy }),
      h('div', null, h('h2', null, 'Ranked: race the clock'),
        h('p', null, `Same puzzle for everyone, one attempt, timed to the hundredth. ${rankedDone ? `You’ve raced ${rankedDone} of ${list.length} today.` : 'How fast are you today?'}`)),
      h('span', { class: 'arrow' }, '→'));

    const counts = areaCounts(7);
    const maxC = Math.max(3, ...Object.values(counts));
    const balance = h('section', { class: 'panel balance' },
      h('div', { class: 'panel-head' }, h('h2', null, 'This week’s balance'), h('a', { href: '#/stats', class: 'link' }, 'All stats →')),
      h('div', { class: 'bars' }, Object.entries(counts).map(([a, n]) =>
        h('div', { class: 'bar-col area-' + AREAS[a], title: `${a}: ${n}` },
          h('div', { class: 'bar-track' }, h('i', { style: { height: `${(n / maxC) * 100}%` } })),
          h('b', null, n), h('span', null, a)))),
      h('p', { class: 'muted small' }, balanceAdvice(counts)));

    const note = daily.note || TIPS[day % TIPS.length];
    const tip = h('section', { class: 'panel tip' },
      h('div', { class: 'tip-icon', html: icons.bulb }),
      h('div', null, h('h2', null, daily.note ? 'Today’s note' : 'Mind tip'), h('p', null, note)));

    const ck = WH.checkin ? WH.checkin.summary() : null;
    const checkin = ck ? h('a', { class: 'panel ranked-promo checkin-promo', href: '#/checkin' },
      h('div', { class: 'tip-icon', html: icons.heart }),
      h('div', null, h('h2', null, 'Mind Check-in'),
        h('p', null, ck.sessions ? ck.label : 'A 5-minute set of memory, speed and focus activities that tracks your own trends over time.')),
      h('span', { class: 'arrow' }, '→')) : null;
    app.replaceChildren(header(), h('main', { class: 'hub' }, banner, hero, h('div', { class: 'promo-row' }, ranked, checkin), cards, h('div', { class: 'hub-lower' }, balance, tip)));
    for (const n of P.takeNotices()) {
      if (n.type === 'rest') WH.toast(`A rest day covered ${dayName(n.day)}. Your streak is safe.`, 3200);
      if (n.type === 'freeze') WH.toast(`A streak freeze covered ${dayName(n.day)} ❄`, 3200);
      if (n.type === 'broken') WH.toast(`Welcome back! Your ${P.daysPlayed()} days played still count.`, 3600);
    }
    ticker = setInterval(() => {
      if (WH.today() !== day) return route();
      countdown.textContent = WH.fmtCountdown(WH.msToMidnight());
    }, 1000);
  }
  function balanceAdvice(counts) {
    const entries = Object.entries(counts);
    const total = entries.reduce((s, [, n]) => s + n, 0);
    if (!total) return 'Play a few games and your weekly mix will appear here.';
    const low = entries.filter(([, n]) => n === 0).map(([a]) => a);
    if (low.length) return `Nothing in ${low.slice(0, 2).join(' or ')} yet this week. Worth a try!`;
    return 'Lovely variety this week. Every area got some exercise.';
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Game screen ----------
  function renderGame(game, mode) {
    const day = WH.today();
    const practice = mode === 'practice', ranked = mode === 'ranked';
    const seed = practice ? `${game.id}-p-${Date.now()}-${Math.random()}` : ranked ? `${game.id}-r-${day}` : `${game.id}-d-${day}`;
    const pkey = `${game.id}:${day}`;
    document.body.classList.add('in-game');
    let lastResult = null, lastOutcome = null;

    const resultsBtn = h('button', { class: 'icon-btn hidden', type: 'button', 'aria-label': 'Results', title: 'Results', html: icons.chart,
      onclick: () => lastResult && (ranked ? showRankedResult(game, lastResult) : showResult(game, mode, lastResult, lastOutcome)) });
    const timerEl = h('span', { class: 'race-timer' }, '0.00s');
    const sub = practice ? 'Practice · unlimited' : ranked ? `Ranked #${day} · ${game.area}` : `Daily #${day} · ${game.area}`;
    const bar = h('header', { class: 'game-top area-' + AREAS[game.area] + (ranked ? ' is-ranked' : '') },
      h('a', { class: 'icon-btn', href: ranked ? '#/ranked' : '#/', 'aria-label': 'Back', html: icons.arrowLeft }),
      h('div', { class: 'game-title' },
        h('h1', null, h('span', { class: 'mini-icon', html: game.icon }), game.name),
        ranked ? timerEl : h('span', { class: 'game-sub' }, sub)),
      h('div', { class: 'game-actions' },
        resultsBtn,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'How to play', title: 'How to play', html: icons.help, onclick: () => howTo(game) }),
        ranked ? null : h('button', { class: 'mode-btn', type: 'button', onclick: () => go(practice ? `#/play/${game.id}` : `#/play/${game.id}/practice`) }, practice ? 'Daily' : 'Practice')));
    const stage = h('div', { class: 'game-stage game-' + game.id });
    const screen = h('div', { class: 'game-screen area-' + AREAS[game.area] }, bar, stage);
    app.replaceChildren(screen);

    // Ranked: one attempt a day. If it's been used, show the record instead of the board.
    if (ranked) {
      const rec = P.rankedFor(day, game.id);
      if (rec) return renderRankedDone(game, rec, stage, timerEl);
    }

    const race = ranked ? { start: 0, lastInput: 0, locked: true, raf: 0 } : null;
    const ctx = {
      mode, day, seed, rng: WH.rng(seed),
      content: practice || ranked ? null : WH.daily(day, game.id),
      label: practice ? '(practice)' : ranked ? `Ranked #${day}` : `#${day}`,
      load: () => (practice || ranked ? null : data().progress[pkey] || null),
      save: (s) => { if (!practice && !ranked) { data().progress[pkey] = s; store.save(); } },
      complete(result, opts = {}) {
        lastResult = result;
        resultsBtn.classList.remove('hidden');
        if (ranked) return finishRace(result);
        const already = !practice && resultFor(day, game.id);
        if (opts.animate && !already) lastOutcome = record(game, mode, day, result);
        if (opts.animate) {
          if (result.won) WH.confetti();
          const showIt = () => current && current.game === game && showResult(game, mode, result, lastOutcome);
          setTimeout(() => {
            if (!current || current.game !== game) return;
            if (lastOutcome && (lastOutcome.extended || lastOutcome.repaired)) showCelebration(lastOutcome, showIt); else showIt();
          }, result.won ? 600 : 250);
        } else if (!practice) {
          resultsBtn.classList.add('pulse');
          WH.toast('You’ve played today’s puzzle. Practice is unlimited!', 2400);
        }
      },
    };

    function finishRace(result) {
      if (!race || race.done) return;
      race.done = true;
      cancelAnimationFrame(race.raf);
      const end = race.lastInput > race.start ? race.lastInput : performance.now();
      const time = Math.round((end - race.start) / 10) / 100;
      timerEl.textContent = fmtTime(time);
      timerEl.classList.add('stopped');
      const rec = P.saveRanked(day, game.id, {
        won: !!result.won, time: result.won ? time : null, rawTime: time, acc: result.accuracy ?? null,
        score: result.score, label: result.label, at: Date.now(),
      });
      const outcome = record(game, 'ranked', day, result);
      const payload = { game: game.id, day, won: rec.won, time: rec.time, acc: rec.acc, score: rec.score };
      Promise.resolve(WH.net.submitRanked(payload)).catch(() => {});
      result = Object.assign({}, result, { rec, outcome });
      lastResult = result;
      if (result.won) WH.confetti();
      setTimeout(() => {
        if (!current || current.game !== game) return;
        const showIt = () => showRankedResult(game, result);
        if (outcome.extended || outcome.repaired) showCelebration(outcome, showIt); else showIt();
      }, result.won ? 600 : 250);
    }

    const instance = game.mount(stage, ctx);
    current = { game, instance, race };
    if (ranked) startGate(game, stage, timerEl, race);
    if (!data().seen[game.id]) { data().seen[game.id] = true; store.save(); howTo(game); }
  }

  // Hide the puzzle until a 3-2-1 countdown so nobody gets a head start.
  function startGate(game, stage, timerEl, race) {
    stage.classList.add('race-hidden');
    const best = data().bests[game.id];
    const count = h('div', { class: 'race-count' });
    const gate = h('div', { class: 'race-gate' },
      h('div', { class: 'race-card' },
        h('span', { class: 'race-badge', html: `${icons.trophy}<span>Ranked</span>` }),
        h('h2', null, `${game.name} · Daily race`),
        h('p', null, 'Everyone gets the same puzzle today. The clock starts after the countdown and stops on your final move. You get one attempt.'),
        h('div', { class: 'race-facts' },
          h('div', null, h('small', null, 'Your best'), h('b', null, best ? fmtTime(best.time) : '—')),
          h('div', null, h('small', null, 'Ranked on'), h('b', null, game.id === 'echo' ? 'Length, then time' : 'Time, then accuracy'))),
        h('button', { class: 'btn primary wide', type: 'button', onclick: go3 }, 'Start the clock')),
      count);
    stage.parentElement.append(gate);

    async function go3() {
      // Claim the attempt now: leaving mid-race counts as a did-not-finish.
      P.saveRanked(WH.today(), game.id, { won: false, time: null, dnf: true, at: Date.now() });
      gate.querySelector('.race-card').remove();
      for (const n of ['3', '2', '1']) {
        count.textContent = n; count.classList.remove('tick'); void count.offsetWidth; count.classList.add('tick');
        WH.sound.tone(n === '1' ? 660 : 440, 0.12, 'sine', 0.06);
        await new Promise((r) => setTimeout(r, 650));
      }
      gate.remove();
      stage.classList.remove('race-hidden');
      race.locked = false;
      race.start = performance.now();
      WH.sound.tone(880, 0.18, 'sine', 0.07);
      const tick = () => {
        if (race.done) return;
        timerEl.textContent = fmtTime((performance.now() - race.start) / 1000);
        race.raf = requestAnimationFrame(tick);
      };
      tick();
    }
    const markInput = () => { if (!race.locked && !race.done) race.lastInput = performance.now(); };
    stage.addEventListener('pointerdown', markInput, true);
    race.markInput = markInput;
  }

  function renderRankedDone(game, rec, stage, timerEl) {
    timerEl.textContent = rec.won ? fmtTime(rec.time) : rec.dnf ? 'DNF' : 'Not solved';
    timerEl.classList.add('stopped');
    const best = data().bests[game.id];
    stage.append(h('div', { class: 'play-area' }, h('div', { class: 'race-card done' },
      h('span', { class: 'race-badge', html: `${icons.trophy}<span>Ranked #${WH.today()}</span>` }),
      h('h2', null, rec.won ? 'Race complete' : rec.dnf ? 'Attempt used' : 'Not solved this time'),
      h('div', { class: 'race-big' }, rec.won ? fmtTime(rec.time) : '—'),
      h('div', { class: 'race-facts' },
        h('div', null, h('small', null, 'Accuracy'), h('b', null, rec.acc != null ? WH.pct(rec.acc) : '—')),
        h('div', null, h('small', null, 'Personal best'), h('b', null, best ? fmtTime(best.time) : '—'))),
      h('p', { class: 'muted small' }, rec.dnf ? 'The race was left before finishing. A new ranked puzzle arrives at midnight.' : 'A new ranked puzzle arrives at midnight.'),
      h('div', { class: 'result-actions' },
        h('a', { class: 'btn primary', href: '#/ranked' }, 'Rankings'),
        h('a', { class: 'btn ghost', href: `#/play/${game.id}/practice` }, 'Practice')))));
    current = { game, instance: null };
  }

  function howTo(game) {
    WH.modal({ title: `How to play ${game.name}`, body: h('div', { class: 'howto', html: game.howTo }) });
  }

  // ---------- Results ----------
  function showResult(game, mode, result, outcome) {
    const day = WH.today();
    const practice = mode === 'practice';
    const s = data().stats[game.id];
    const nextGame = games().find((g) => g.id !== game.id && !resultFor(day, g.id));
    const countdown = h('b', null, WH.fmtCountdown(WH.msToMidnight()));
    const iv = setInterval(() => { countdown.textContent = WH.fmtCountdown(WH.msToMidnight()); }, 1000);

    const body = h('div', { class: 'result area-' + AREAS[game.area] },
      h('div', { class: 'result-badge', html: game.icon }),
      h('h2', { class: 'result-title' }, result.title),
      h('p', { class: 'result-sub' }, result.sub),
      h('div', { class: 'result-pills' },
        h('span', { class: 'result-pill' + (result.won ? ' won' : '') }, result.label),
        typeof result.accuracy === 'number' ? h('span', { class: 'result-pill' }, `${WH.pct(result.accuracy)} accuracy`) : null,
        outcome && outcome.xp ? h('span', { class: 'result-pill xp' }, `+${outcome.xp} XP`) : null),
      result.note ? h('p', { class: 'result-note' }, result.note) : null,
      !practice && s ? statBlock(game, s, result.score) : null,
      h('div', { class: 'result-actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => share(result.share), html: `${icons.share}<span>Share</span>` }),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => go(`#/play/${game.id}/practice`) }, practice ? 'New puzzle' : 'Practice')),
      nextGame ? h('a', { class: 'next-up area-' + AREAS[nextGame.area], href: `#/play/${nextGame.id}` },
        h('span', { class: 'card-icon', html: nextGame.icon }),
        h('span', null, h('small', null, 'Up next'), h('b', null, nextGame.name)), h('span', { class: 'arrow' }, '→'))
        : h('a', { class: 'next-up done', href: '#/' }, h('span', null, h('small', null, 'Workout complete'), h('b', null, 'Back to the hub')), h('span', { class: 'arrow' }, '→')),
      practice ? h('p', { class: 'muted small center' }, 'Practice doesn’t earn XP. Daily and ranked puzzles do.') : h('p', { class: 'muted small center' }, 'Next daily in ', countdown));
    WH.modal({ body, onClose: () => clearInterval(iv) });
  }
  const share = (text) => WH.share(`Well Played · ${text}` + (location.protocol.startsWith('http') ? `\n${location.origin + location.pathname}` : ''));

  function showRankedResult(game, result) {
    const rec = result.rec || P.rankedFor(WH.today(), game.id) || {};
    const best = data().bests[game.id];
    const timeTxt = rec.won ? fmtTime(rec.time) : '—';
    const worldEl = h('p', { class: 'muted small center world-line' }, WH.net.enabled ? 'Fetching your world rank…' : 'World rankings switch on with online accounts. Your time is saved and will count.');
    if (WH.net.enabled) {
      Promise.resolve(WH.net.leaderboard(game.id, WH.today())).then((b) => {
        if (b && b.you) worldEl.textContent = `World rank today: #${b.you.rank} of ${b.total}`;
      }).catch(() => {});
    }
    WH.modal({
      body: h('div', { class: 'result area-' + AREAS[game.area] },
        h('span', { class: 'race-badge', html: `${icons.trophy}<span>Ranked ${game.name}</span>` }),
        h('div', { class: 'race-big' }, timeTxt),
        h('h2', { class: 'result-title' }, rec.won ? (rec.pb ? 'New personal best!' : result.title) : 'Not solved this time'),
        h('p', { class: 'result-sub' }, result.sub),
        h('div', { class: 'result-pills' },
          h('span', { class: 'result-pill' + (rec.won ? ' won' : '') }, result.label),
          rec.acc != null ? h('span', { class: 'result-pill' }, `${WH.pct(rec.acc)} accuracy`) : null,
          result.outcome && result.outcome.xp ? h('span', { class: 'result-pill xp' }, `+${result.outcome.xp} XP`) : null),
        h('div', { class: 'race-facts' },
          h('div', null, h('small', null, 'Personal best'), h('b', null, best ? fmtTime(best.time) : '—')),
          h('div', null, h('small', null, 'Best accuracy here'), h('b', null, bestAcc(game.id)))),
        worldEl,
        h('div', { class: 'result-actions' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => share(`Ranked ${game.name} #${WH.today()} · ${rec.won ? `⏱ ${timeTxt}` : '✕'}${rec.acc != null ? ` · 🎯 ${WH.pct(rec.acc)}` : ''}`), html: `${icons.share}<span>Share</span>` }),
          h('a', { class: 'btn ghost', href: '#/ranked' }, 'Rankings'))),
    });
  }
  function bestAcc(id) {
    let best = null;
    for (const day of Object.values(data().ranked)) { const r = day[id]; if (r && r.acc != null) best = Math.max(best ?? 0, r.acc); }
    return best == null ? '—' : WH.pct(best);
  }

  function statBlock(game, s, highlight) {
    const nums = h('div', { class: 'stat-nums' },
      stat(s.played, 'Played'),
      game.statType === 'best' ? stat(s.best, 'Best') : stat(s.played ? Math.round((s.wins / s.played) * 100) : 0, 'Win %'),
      stat(s.streak, 'Streak'),
      stat(s.accN ? WH.pct(s.accSum / s.accN) : '—', 'Accuracy'));
    return h('div', { class: 'stat-block' }, nums, distribution(game, s, highlight));
  }
  const stat = (v, l) => h('div', { class: 'stat' }, h('b', null, v), h('span', null, l));

  function distKeys(game) {
    if (game.statType === 'guesses') return [...Array.from({ length: game.maxGuesses }, (_, i) => i + 1), 'X'];
    if (game.statType === 'par') return [[0, 'Par'], [1, '+1'], [2, '+2'], [3, '+3'], ['X', '✕']];
    if (game.statType === 'mistakes') return [[0, '0'], [1, '1'], [2, '2'], [3, '3'], ['X', '✕']];
    if (game.statType === 'stars') return [[5, '5★'], [4, '4★'], [3, '3★'], [2, '2★'], [1, '1★'], [0, '0★'], ['X', '✕']];
    return null;
  }
  function distribution(game, s, highlight) {
    let keys = distKeys(game);
    if (!keys) return null;
    keys = keys.map((k) => (Array.isArray(k) ? k : [k, String(k)]));
    const max = Math.max(1, ...keys.map(([k]) => s.dist[k] || 0));
    return h('div', { class: 'dist' },
      h('h4', null, { guesses: 'Guess distribution', par: 'Steps over par', mistakes: 'Mistakes', stars: 'Stars kept' }[game.statType]),
      keys.map(([k, label]) => {
        const n = s.dist[k] || 0;
        return h('div', { class: 'dist-row' + (String(k) === String(highlight) ? ' hi' : '') },
          h('span', null, label), h('div', { class: 'dist-bar' }, h('i', { style: { width: `${Math.max(7, (n / max) * 100)}%` } }, n)));
      }));
  }

  // ---------- Ranked page ----------
  function renderRanked() {
    const day = WH.today();
    const rows = games().map((g) => {
      const rec = P.rankedFor(day, g.id);
      const best = data().bests[g.id];
      const status = !rec ? h('a', { class: 'status', href: `#/play/${g.id}/ranked` }, 'Race')
        : rec.won ? h('span', { class: 'status done', html: `${icons.check}<span>${fmtTime(rec.time)}</span>` })
          : h('span', { class: 'status done soft' }, rec.dnf ? 'DNF' : 'Not solved');
      return h('a', { class: 'rank-row area-' + AREAS[g.area], href: `#/play/${g.id}/ranked` },
        h('span', { class: 'card-icon', html: g.icon }),
        h('span', { class: 'rank-name' }, h('b', null, g.name), h('small', null, g.area)),
        h('span', { class: 'rank-stat' }, h('small', null, 'Accuracy'), h('b', null, rec && rec.acc != null ? WH.pct(rec.acc) : '—')),
        h('span', { class: 'rank-stat' }, h('small', null, 'Best'), h('b', null, best ? fmtTime(best.time) : '—')),
        status);
    });
    const world = h('section', { class: 'panel world' }, h('h2', null, 'World leaderboard · today'));
    if (!WH.net.enabled) {
      world.append(h('div', { class: 'world-off' },
        h('p', null, 'Pick a username to see where your times rank in the world, and to add friends.'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => signUp(() => route()) }, 'Play online')));
    } else {
      let pick = (games().find((g) => P.rankedFor(day, g.id)) || games()[0]).id;
      const tabs = h('div', { class: 'lb-tabs' });
      const table = h('div', { class: 'lboard' });
      const load = () => {
        tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.g === pick));
        table.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
        WH.net.leaderboard(pick, day).then((b) => {
          if (!b || !b.rows.length) return table.replaceChildren(h('p', { class: 'muted' }, 'No finishers yet today. Be the first!'));
          const rows = b.rows.map((r) => boardRow(r.rank, r.username, pick === 'echo' ? `${r.score} · ${fmtTime(r.timeMs / 1000)}` : fmtTime(r.timeMs / 1000), r.acc != null ? WH.pct(r.acc) : '', r.you));
          if (b.you && b.you.won && !b.rows.some((r) => r.you)) rows.push(h('div', { class: 'lb-gap' }, '⋯'), boardRow(b.you.rank, WH.net.account().username, fmtTime(b.you.timeMs / 1000), b.you.acc != null ? WH.pct(b.you.acc) : '', true));
          table.replaceChildren(h('p', { class: 'muted small' }, `${b.total} finisher${b.total === 1 ? '' : 's'} today`), ...rows);
        }).catch((e) => table.replaceChildren(h('p', { class: 'muted' }, `Couldn’t load the leaderboard (${e.message}).`)));
      };
      games().forEach((g) => tabs.append(h('button', { type: 'button', 'data-g': g.id, onclick: () => { pick = g.id; load(); } }, g.name)));
      world.append(tabs, table);
      load();
    }
    app.replaceChildren(header(), h('main', { class: 'stats-page' },
      h('div', { class: 'ranked-head' },
        h('h1', { class: 'page-title' }, 'Ranked'),
        h('p', { class: 'lede' }, 'A daily race for every game. Everyone gets the same puzzle, you get one attempt, and the clock runs from the countdown to your final move. The fastest solve wins, and accuracy breaks ties. New races every midnight.')),
      h('div', { class: 'rank-list' }, rows),
      world));
  }

  const boardRow = (rank, name, main, sub, you) => h('div', { class: 'lb-row' + (you ? ' you' : '') + (rank <= 3 ? ' top' + rank : '') },
    h('span', { class: 'lb-rank' }, rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank), h('span', { class: 'lb-name' }, name), h('b', null, main), h('small', null, sub));

  // ---------- Accounts ----------
  function signUp(after) {
    if (!WH.net.configured) { WH.toast('Online play is being set up. Check back soon!'); return; }
    const input = h('input', { class: 'text-input', type: 'text', maxlength: 16, placeholder: 'e.g. puzzle_fan', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Username' });
    const err = h('p', { class: 'form-err' });
    const btn = h('button', { class: 'btn primary wide', type: 'submit' }, 'Create my player');
    const form = h('form', { class: 'signup', onsubmit: async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) { err.textContent = 'Use 3–16 letters, numbers or underscores.'; return; }
      btn.disabled = true; btn.textContent = 'Creating…'; err.textContent = '';
      try { await WH.net.register(name); WH.closeModal(); WH.toast(`Welcome, ${name}!`); WH.confetti(); after && after(); }
      catch (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = 'Create my player'; }
    } },
      h('p', { class: 'muted' }, 'Pick a username to join the world leaderboards and play with friends. No email or password needed.'),
      input, err, btn,
      h('p', { class: 'small muted' }, 'Your account lives on this device. Only your username, streak, XP and ranked times are shared. Mind Check-in results never leave your device.'));
    WH.modal({ title: 'Play online', body: form });
    setTimeout(() => input.focus(), 250);
  }

  // ---------- Friends & weekly leaderboard ----------
  function renderFriends(addCode) {
    const main = h('main', { class: 'stats-page' }, h('h1', { class: 'page-title' }, 'Friends'));
    app.replaceChildren(header(), main);
    if (!WH.net.enabled) {
      main.append(h('section', { class: 'panel world-off' },
        h('h2', null, 'Play with friends'),
        h('p', null, 'Keep shared streaks going with friends: a friend streak grows each day you both play. See who earns the most XP this week, too.'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => signUp(() => renderFriends(addCode)) }, 'Pick a username')));
      if (addCode) main.append(h('p', { class: 'muted center' }, `After you pick a username, we’ll add friend code ${addCode.toUpperCase()}.`));
      return;
    }
    const me = WH.net.account();
    const link = `${location.origin}${location.pathname}#/add/${me.friendCode}`;
    const codeCard = h('section', { class: 'panel me-card' },
      h('div', null, h('small', { class: 'muted' }, 'Signed in as'), h('h2', null, me.username)),
      h('div', { class: 'code-box' }, h('small', { class: 'muted' }, 'Your friend code'), h('b', null, me.friendCode)),
      h('button', { class: 'btn ghost', type: 'button', html: `${icons.share}<span>Invite a friend</span>`,
        onclick: () => WH.share(`Play Well Played with me! My friend code is ${me.friendCode}
${location.protocol.startsWith('http') ? link : ''}`) }));
    const codeInput = h('input', { class: 'text-input', type: 'text', maxlength: 6, placeholder: 'Friend code', value: addCode ? addCode.toUpperCase() : '', 'aria-label': 'Friend code' });
    const addForm = h('form', { class: 'add-friend', onsubmit: async (e) => {
      e.preventDefault();
      const code = codeInput.value.trim();
      if (!code) return;
      try { const r = await WH.net.addFriend(code); WH.toast(`You and ${r.friend.username} are now friends!`); codeInput.value = ''; loadFriends(); }
      catch (x) { WH.toast(x.message); }
    } }, codeInput, h('button', { class: 'btn primary', type: 'submit' }, 'Add'));
    const list = h('div', { class: 'friend-list' }, h('p', { class: 'muted' }, 'Loading…'));
    const weekly = h('div', { class: 'lboard' }, h('p', { class: 'muted' }, 'Loading…'));
    main.append(codeCard,
      h('div', { class: 'stats-row' },
        h('section', { class: 'panel' }, h('h2', null, 'Friend streaks'), addForm, list,
          h('p', { class: 'small muted' }, 'A friend streak grows each day you both finish a daily or ranked puzzle.')),
        h('section', { class: 'panel' }, h('h2', null, 'This week’s XP'), weekly,
          h('p', { class: 'small muted' }, 'Weekly XP resets every Monday. XP comes from daily and ranked puzzles only, so steady play beats marathons.'))));

    function loadFriends() {
      WH.net.friends().then(({ friends }) => {
        if (!friends.length) return list.replaceChildren(h('p', { class: 'muted' }, 'No friends yet. Share your code to start a friend streak!'));
        list.replaceChildren(...friends.map((f) => h('div', { class: 'friend' },
          h('span', { class: 'avatar' }, f.username[0].toUpperCase()),
          h('span', { class: 'friend-name' }, h('b', null, f.username),
            h('small', null, f.playedToday ? 'Played today ✓' : 'Hasn’t played yet today', ` · ${f.weekXp} XP this week`)),
          h('span', { class: 'friend-streak' + (f.bothToday ? ' lit' : ''), title: 'Friend streak', html: `${icons.flame}<b>${f.friendStreak}</b>` }),
          h('button', { class: 'icon-btn small', type: 'button', title: 'Remove friend', 'aria-label': `Remove ${f.username}`, html: icons.x,
            onclick: async () => { if (confirm(`Remove ${f.username} from your friends?`)) { await WH.net.removeFriend(f.id).catch(() => {}); loadFriends(); } } }))));
      }).catch((e) => list.replaceChildren(h('p', { class: 'muted' }, `Couldn’t load friends (${e.message}).`)));
    }
    WH.net.syncProfile().catch(() => {}).finally(() => {
      loadFriends();
      WH.net.weekly().then((b) => {
        if (!b.rows.length) return weekly.replaceChildren(h('p', { class: 'muted' }, 'No XP yet this week.'));
        const rows = b.rows.map((r) => boardRow(r.rank, r.username, `${r.xp} XP`, `🔥 ${r.streak}`, r.you));
        if (!b.rows.some((r) => r.you)) rows.push(h('div', { class: 'lb-gap' }, '⋯'), boardRow(b.you.rank, me.username, `${b.you.xp} XP`, '', true));
        weekly.replaceChildren(...rows);
      }).catch((e) => weekly.replaceChildren(h('p', { class: 'muted' }, `Couldn’t load (${e.message}).`)));
    });
    if (addCode && addCode.toUpperCase() !== me.friendCode) addForm.requestSubmit();
  }

  // ---------- Mind Check-in ----------
  function renderCheckin() {
    const main = h('main', { class: 'checkin-page' });
    app.replaceChildren(header(), main);
    const inst = WH.checkin.mount(main, { onExit: () => go('#/') });
    current = { game: null, instance: null, cleanup: () => inst && inst.destroy && inst.destroy() };
  }

  // ---------- Stats page ----------
  function renderStats() {
    P.reconcile();
    const D = data();
    const today = WH.today();
    const total = games().length;
    const cal = h('div', { class: 'cal' });
    const start = today - 34;
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d) => cal.append(h('span', { class: 'cal-h' }, d)));
    const offset = (WH.dateFromDay(start).getDay() + 6) % 7;
    for (let i = 0; i < offset; i++) cal.append(h('span'));
    const st = P.state().streak;
    for (let d = start; d <= today; d++) {
      const n = dailyCount(d), date = WH.dateFromDay(d);
      const mark = st.rest.includes(d) ? '☾' : st.frozen.includes(d) ? '❄' : '';
      cal.append(h('span', {
        class: 'cal-d' + (n ? ' on' : '') + (d === today ? ' today' : '') + (mark ? ' covered' : ''), style: { '--lv': n ? 0.25 + 0.75 * (n / total) : 0 },
        title: `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${n} of ${total}${mark === '☾' ? ' · rest day' : mark ? ' · freeze' : ''}`,
      }, mark || date.getDate()));
    }
    const counts = areaCounts(30);
    const maxC = Math.max(1, ...Object.values(counts));
    const accAll = D.log.filter((e) => e.a != null && e.d > today - 30);
    const gameCards = games().map((g) => {
      const s = D.stats[g.id] || { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: {}, best: 0, accSum: 0, accN: 0 };
      const best = D.bests[g.id];
      return h('div', { class: 'panel stat-card area-' + AREAS[g.area] },
        h('div', { class: 'stat-card-head' }, h('span', { class: 'card-icon', html: g.icon }), h('h3', null, g.name),
          best ? h('span', { class: 'chip', title: 'Ranked personal best' }, `⏱ ${fmtTime(best.time)}`) : h('span', { class: 'chip' }, g.area)),
        statBlock(g, s, null));
    });
    app.replaceChildren(header(), h('main', { class: 'stats-page' },
      h('h1', { class: 'page-title' }, 'Your progress'),
      h('div', { class: 'stat-tiles' },
        tile(icons.flame, P.current(), 'Day streak'), tile(icons.sparkle, P.longest(), 'Longest streak'),
        tile(icons.check, P.daysPlayed(), 'Days played'), tile(icons.bulb, D.xp ? D.xp.total : 0, 'Total XP'),
        tile(icons.trophy, P.weekXp(), 'XP this week'),
        tile(icons.play, accAll.length ? `${Math.round(accAll.reduce((a, e) => a + e.a, 0) / accAll.length)}%` : '—', 'Accuracy · 30 days')),
      h('div', { class: 'stats-row' },
        h('section', { class: 'panel' }, h('h2', null, 'Last 5 weeks'), cal, h('p', { class: 'muted small' }, 'The greener the day, the more daily puzzles you finished. ☾ marks a rest day and ❄ a freeze.')),
        h('section', { class: 'panel' }, h('h2', null, 'Mind areas · 30 days'),
          h('div', { class: 'hbars' }, Object.entries(counts).map(([a, n]) =>
            h('div', { class: 'hbar area-' + AREAS[a] }, h('span', null, a), h('div', { class: 'hbar-track' }, h('i', { style: { width: `${(n / maxC) * 100}%` } })), h('b', null, n)))))),
      h('h2', { class: 'section-title' }, 'By game'),
      h('div', { class: 'stat-cards' }, gameCards)));
  }
  const tile = (icon, v, l) => h('div', { class: 'stat-tile' }, h('span', { html: icon }), h('b', null, v), h('small', null, l));

  // ---------- Settings ----------
  function openSettings() {
    const s = data().settings;
    const save = () => { store.save(); applySettings(); };
    const toggle = (key, label, desc) => h('label', { class: 'setting' },
      h('span', null, h('b', null, label), h('small', null, desc)),
      h('input', { type: 'checkbox', class: 'switch', checked: s[key], onchange: (e) => { s[key] = e.target.checked; save(); } }));
    const seg = (options, cur, onPick) => {
      const el = h('div', { class: 'seg' }, options.map(([v, label]) => h('button', { type: 'button', class: cur === v ? 'on' : '',
        onclick: (e) => { onPick(v); el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } }, label)));
      return el;
    };
    const theme = seg([['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], s.theme, (v) => { s.theme = v; save(); });
    const goal = seg(Object.entries(P.GOALS).map(([k, g]) => [k, g.label]), P.state().goal, (v) => { data().goal = v; store.save(); goalDesc.textContent = `${P.GOALS[v].xp} XP · ${P.GOALS[v].desc}. Your streak only ever needs one puzzle.`; });
    const goalDesc = h('small', null, `${P.GOALS[P.state().goal].xp} XP · ${P.GOALS[P.state().goal].desc}. Your streak only ever needs one puzzle.`);
    let armed = false;
    const reset = h('button', { class: 'btn danger', type: 'button', onclick: () => {
      if (!armed) { armed = true; reset.textContent = 'Tap again to erase everything'; return; }
      store.reset(); applySettings(); WH.closeModal(); WH.toast('Progress reset'); route();
    } }, 'Reset all progress');
    const curated = Object.keys(window.WH_DAILY || {}).sort();
    const through = curated.length ? curated[curated.length - 1] : null;
    WH.modal({
      title: 'Settings',
      body: h('div', { class: 'settings' },
        h('div', { class: 'setting stack' }, h('span', null, h('b', null, 'Daily goal'), goalDesc), goal),
        h('div', { class: 'setting' }, h('span', null, h('b', null, 'Theme'), h('small', null, 'Match your device or pick one')), theme),
        toggle('colorblind', 'Colour-blind mode', 'High-contrast orange and blue tiles'),
        toggle('sound', 'Sound', 'Soft clicks, chimes and Echo notes'),
        toggle('reducedMotion', 'Reduce motion', 'Calmer animations, no confetti'),
        h('div', { class: 'setting' }, h('span', null, h('b', null, 'Daily puzzles'),
          h('small', null, through ? `Hand-curated puzzles ready through ${new Date(through + 'T12:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.` : 'Generated fresh each day.'))),
        h('div', { class: 'setting' }, h('span', null, h('b', null, 'Your data'), h('small', null, 'Progress is stored only on this device.')), reset)),
    });
  }

  // ---------- Keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && WH.modalOpen()) return WH.closeModal();
    if (WH.modalOpen() || !current || !current.instance || !current.instance.onKey) return;
    if (current.race && current.race.locked) return; // puzzle hidden until the countdown ends
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if ((e.key === 'Enter' || e.key === ' ') && tag === 'BUTTON') return; // let the button click itself
    if (current.race && current.race.markInput) current.race.markInput();
    if (tag === 'INPUT' && e.key !== 'Enter') return;
    let k = e.key;
    if (k.length === 1) k = k.toLowerCase();
    if (k === 'Enter' || k === 'Backspace' || k.length === 1) {
      if (k === 'Backspace' || k === ' ' || k === '/') e.preventDefault();
      current.instance.onKey(k);
    }
  });

  // ---------- Boot ----------
  applySettings();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applySettings);
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
