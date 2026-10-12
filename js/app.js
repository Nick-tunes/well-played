// Well Played app shell: routing, hub, game screen, results, stats and settings.
(function () {
  const { h, store, icons } = WH;
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
  let current = null; // { game, instance }
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
  function mindStreak() {
    let d = WH.today();
    if (!dailyCount(d)) d--;
    let n = 0;
    while (dailyCount(d)) { n++; d--; }
    return n;
  }
  function bestMindStreak() {
    const days = Object.keys(data().results).map(Number).filter((d) => dailyCount(d)).sort((a, b) => a - b);
    let best = 0, run = 0, prev = null;
    for (const d of days) { run = prev === d - 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
    return best;
  }
  function areaCounts(days) {
    const from = WH.today() - days + 1, counts = {};
    for (const a of Object.keys(AREAS)) counts[a] = 0;
    for (const e of data().log) if (e.d >= from && WH.gameMap[e.g]) counts[WH.gameMap[e.g].area]++;
    return counts;
  }

  function record(game, mode, day, result, extra) {
    const D = data();
    D.log.push({ d: day, g: game.id, p: mode === 'practice' ? 1 : 0, w: result.won ? 1 : 0 });
    if (D.log.length > 3000) D.log.splice(0, D.log.length - 3000);
    if (mode === 'daily') {
      D.results[day] = D.results[day] || {};
      D.results[day][game.id] = { won: result.won, score: result.score, label: result.label };
      const s = (D.stats[game.id] = Object.assign({ played: 0, wins: 0, streak: 0, maxStreak: 0, lastDay: null, dist: {}, best: 0, total: 0, minutes: 0 }, D.stats[game.id]));
      s.played++;
      if (result.won) s.wins++;
      const counts = ['best', 'sessions'].includes(game.statType) ? true : result.won;
      s.streak = counts ? (s.lastDay === day - 1 ? s.streak + 1 : 1) : 0;
      s.lastDay = day;
      s.maxStreak = Math.max(s.maxStreak, s.streak);
      s.dist[result.score] = (s.dist[result.score] || 0) + 1;
      if (typeof result.score === 'number') { s.best = Math.max(s.best, result.score); s.total += result.score; }
      if (extra && extra.minutes) s.minutes += extra.minutes;
    }
    store.save();
  }

  // ---------- Router ----------
  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    teardown();
    if (parts[0] === 'play' && WH.gameMap[parts[1]]) return renderGame(WH.gameMap[parts[1]], parts[2] === 'practice' ? 'practice' : 'daily');
    if (parts[0] === 'stats') return renderStats();
    renderHub();
  }
  function teardown() {
    WH.closeModal();
    if (current && current.instance && current.instance.destroy) current.instance.destroy();
    current = null;
    clearInterval(ticker);
    document.body.classList.remove('in-game');
  }
  const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

  // ---------- Header ----------
  function header() {
    return h('header', { class: 'top' },
      h('a', { class: 'brand', href: '#/' },
        h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')),
        h('span', { class: 'brand-name' }, 'Well ', h('em', null, 'Played'))),
      h('nav', { class: 'top-actions' },
        h('a', { class: 'icon-btn', href: '#/stats', 'aria-label': 'Statistics', title: 'Statistics', html: icons.chart }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Settings', title: 'Settings', onclick: openSettings, html: icons.gear })));
  }

  // ---------- Hub ----------
  function greeting() {
    const hr = new Date().getHours();
    return hr < 5 ? 'Still up?' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : hr < 22 ? 'Good evening' : 'Winding down?';
  }
  function ring(done, total) {
    const r = 46, c = 2 * Math.PI * r, frac = total ? done / total : 0;
    return h('div', { class: 'ring', html: `<svg viewBox="0 0 108 108" aria-hidden="true">
      <circle cx="54" cy="54" r="${r}" class="ring-bg"/>
      <circle cx="54" cy="54" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}"/></svg>
      <div class="ring-label"><b>${done}</b><span>of ${total}</span></div>` });
  }

  function renderHub() {
    const day = WH.today();
    const list = games();
    const done = list.filter((g) => resultFor(day, g.id)).length;
    const streak = mindStreak();
    const daily = WH.daily(day) || {};
    const next = list.find((g) => !resultFor(day, g.id));
    const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const countdown = h('b', null, WH.fmtCountdown(WH.msToMidnight()));

    const hero = h('section', { class: 'hero' },
      h('div', { class: 'hero-text' },
        h('p', { class: 'eyebrow' }, `${dateStr} · Daily #${day}`),
        h('h1', null, greeting(), h('span', { class: 'dot' }, '.')),
        h('p', { class: 'lede' }, done === list.length
          ? 'Workout complete. Your mind thanks you. See you tomorrow.'
          : done ? `Nice progress. ${list.length - done} to go in today’s workout.` : 'A few minutes of play to keep your mind bright.'),
        daily.theme ? h('p', { class: 'theme-chip', html: `${icons.sparkle}<span>Today’s theme: <b>${esc(daily.theme)}</b></span>` }) : null,
        h('div', { class: 'hero-cta' },
          next ? h('a', { class: 'btn primary', href: `#/play/${next.id}`, html: `${icons.play}<span>${done ? 'Continue' : 'Start'} with ${next.name}</span>` }) : null,
          h('span', { class: 'hero-meta' }, 'New puzzles in ', countdown))),
      h('div', { class: 'hero-side' },
        ring(done, list.length),
        h('div', { class: 'streak' + (streak ? ' on' : '') },
          h('span', { html: icons.flame }), h('b', null, streak), h('span', null, streak === 1 ? 'day streak' : 'day streak'))));

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
          h('button', { class: 'link-btn', type: 'button', onclick: (e) => { e.preventDefault(); go(`#/play/${g.id}/practice`); } }, 'Practice')));
    }));

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

    app.replaceChildren(header(), h('main', { class: 'hub' }, hero, cards, h('div', { class: 'hub-lower' }, balance, tip)));
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
    const practice = mode === 'practice';
    const seed = practice ? `${game.id}-p-${Date.now()}-${Math.random()}` : `${game.id}-d-${day}`;
    const pkey = `${game.id}:${day}`;
    document.body.classList.add('in-game');
    let lastResult = null;

    const resultsBtn = h('button', { class: 'icon-btn hidden', type: 'button', 'aria-label': 'Results', title: 'Results', html: icons.chart, onclick: () => lastResult && showResult(game, mode, lastResult) });
    const bar = h('header', { class: 'game-top area-' + AREAS[game.area] },
      h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Back to hub', html: icons.arrowLeft }),
      h('div', { class: 'game-title' },
        h('h1', null, h('span', { class: 'mini-icon', html: game.icon }), game.name),
        h('span', { class: 'game-sub' }, practice ? 'Practice · unlimited' : `Daily #${day} · ${game.area}`)),
      h('div', { class: 'game-actions' },
        resultsBtn,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'How to play', title: 'How to play', html: icons.help, onclick: () => howTo(game) }),
        h('button', { class: 'mode-btn', type: 'button', onclick: () => go(practice ? `#/play/${game.id}` : `#/play/${game.id}/practice`) }, practice ? 'Daily' : 'Practice')));
    const stage = h('div', { class: 'game-stage game-' + game.id });
    app.replaceChildren(h('div', { class: 'game-screen area-' + AREAS[game.area] }, bar, stage));

    const ctx = {
      mode, day, seed, rng: WH.rng(seed),
      content: practice ? null : WH.daily(day, game.id),
      label: practice ? '(practice)' : `#${day}`,
      load: () => (practice ? null : data().progress[pkey] || null),
      save: (s) => { if (!practice) { data().progress[pkey] = s; store.save(); } },
      complete(result, opts = {}) {
        lastResult = result;
        resultsBtn.classList.remove('hidden');
        const already = !practice && resultFor(day, game.id);
        if (opts.animate && !already) record(game, mode, day, result, opts);
        if (opts.animate) {
          if (result.won) WH.confetti();
          setTimeout(() => current && current.game === game && showResult(game, mode, result), result.won ? 500 : 200);
        } else if (!practice) {
          resultsBtn.classList.add('pulse');
          WH.toast('You’ve played today’s puzzle. Practice is unlimited!', 2400);
        }
      },
    };
    const instance = game.mount(stage, ctx);
    current = { game, instance };
    if (!data().seen[game.id]) { data().seen[game.id] = true; store.save(); howTo(game); }
  }

  function howTo(game) {
    WH.modal({ title: `How to play ${game.name}`, body: h('div', { class: 'howto', html: game.howTo }) });
  }

  // ---------- Results ----------
  function showResult(game, mode, result) {
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
      h('span', { class: 'result-pill' + (result.won ? ' won' : '') }, result.label),
      result.note ? h('p', { class: 'result-note' }, result.note) : null,
      !practice && s ? statBlock(game, s, result.score) : null,
      h('div', { class: 'result-actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => WH.share(`Well Played · ${result.share}` + (location.protocol.startsWith('http') ? `\n${location.origin + location.pathname}` : '')), html: `${icons.share}<span>Share</span>` }),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => go(`#/play/${game.id}/practice`) }, practice ? 'New puzzle' : 'Practice')),
      nextGame ? h('a', { class: 'next-up area-' + AREAS[nextGame.area], href: `#/play/${nextGame.id}` },
        h('span', { class: 'card-icon', html: nextGame.icon }),
        h('span', null, h('small', null, 'Up next'), h('b', null, nextGame.name)), h('span', { class: 'arrow' }, '→'))
        : h('a', { class: 'next-up done', href: '#/' }, h('span', null, h('small', null, 'Workout complete'), h('b', null, 'Back to the hub')), h('span', { class: 'arrow' }, '→')),
      practice ? null : h('p', { class: 'muted small center' }, 'Next daily in ', countdown));
    WH.modal({ body, onClose: () => clearInterval(iv) });
  }

  function statBlock(game, s, highlight) {
    const nums = h('div', { class: 'stat-nums' },
      stat(s.played, 'Played'),
      game.statType === 'best' ? stat(s.best, 'Best') : game.statType === 'sessions' ? stat(Math.round(s.minutes * 10) / 10, 'Minutes') : stat(s.played ? Math.round((s.wins / s.played) * 100) : 0, 'Win %'),
      stat(s.streak, 'Streak'), stat(s.maxStreak, 'Max streak'));
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

  // ---------- Stats page ----------
  function renderStats() {
    const D = data();
    const daysActive = Object.keys(D.results).filter((d) => dailyCount(+d)).length;
    const today = WH.today();
    const total = games().length;
    // 5-week calendar aligned so the last column ends on today.
    const cal = h('div', { class: 'cal' });
    const start = today - 34;
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d) => cal.append(h('span', { class: 'cal-h' }, d)));
    const offset = (WH.dateFromDay(start).getDay() + 6) % 7;
    for (let i = 0; i < offset; i++) cal.append(h('span'));
    for (let d = start; d <= today; d++) {
      const n = dailyCount(d), date = WH.dateFromDay(d);
      cal.append(h('span', {
        class: 'cal-d' + (n ? ' on' : '') + (d === today ? ' today' : ''), style: { '--lv': n ? 0.25 + 0.75 * (n / total) : 0 },
        title: `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${n} of ${total}`,
      }, date.getDate()));
    }
    const counts = areaCounts(30);
    const maxC = Math.max(1, ...Object.values(counts));
    const gameCards = games().map((g) => {
      const s = D.stats[g.id] || { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: {}, best: 0, minutes: 0 };
      return h('div', { class: 'panel stat-card area-' + AREAS[g.area] },
        h('div', { class: 'stat-card-head' }, h('span', { class: 'card-icon', html: g.icon }), h('h3', null, g.name), h('span', { class: 'chip' }, g.area)),
        statBlock(g, s, null));
    });
    app.replaceChildren(header(), h('main', { class: 'stats-page' },
      h('h1', { class: 'page-title' }, 'Your progress'),
      h('div', { class: 'stat-tiles' },
        tile(icons.flame, mindStreak(), 'Day streak'), tile(icons.sparkle, bestMindStreak(), 'Best streak'),
        tile(icons.check, daysActive, 'Days active'), tile(icons.play, D.log.length, 'Games played')),
      h('div', { class: 'stats-row' },
        h('section', { class: 'panel' }, h('h2', null, 'Last 5 weeks'), cal, h('p', { class: 'muted small' }, 'The greener the day, the more of the daily workout you completed.')),
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
    const theme = h('div', { class: 'seg' }, ['system', 'light', 'dark'].map((t) =>
      h('button', { type: 'button', class: s.theme === t ? 'on' : '', onclick: (e) => {
        s.theme = t; save(); theme.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
      } }, t[0].toUpperCase() + t.slice(1))));
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
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if ((e.key === 'Enter' || e.key === ' ') && tag === 'BUTTON') return; // let the button click itself
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
