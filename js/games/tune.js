// Tune: name the melody from as few notes as possible (Bandle / Heardle-style).
(function () {
  const { h } = WH;
  const STAGES = [3, 5, 7, 10, 14, Infinity]; // notes revealed per attempt
  const MAX = STAGES.length;
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function parse(str) {
    return str.trim().split(/\s+/).map((tok) => {
      const [p, d] = tok.split(':');
      const beats = d ? parseFloat(d) : 1;
      if (p === 'R') return { rest: true, beats };
      const m = /^([A-G])(#|b)?(\d)$/.exec(p);
      const midi = 12 * (+m[3] + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
      return { midi, beats, freq: 440 * 2 ** ((midi - 69) / 12) };
    });
  }

  // A soft, piano-like voice. Tune always plays when asked: listening is the game.
  let ac = null;
  function audio() {
    if (!ac) { WH.applyAudioSession(); ac = new (window.AudioContext || window.webkitAudioContext)(); }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function voice(a, freq, t0, dur) {
    const out = a.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(0.16, t0 + 0.012);
    out.gain.exponentialRampToValueAtTime(0.05, t0 + Math.min(0.25, dur));
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.25);
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    out.connect(lp).connect(a.destination);
    [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12]].forEach(([mult, type, g]) => {
      const o = a.createOscillator(), og = a.createGain();
      o.type = type; o.frequency.value = freq * mult; og.gain.value = g;
      o.connect(og).connect(out); o.start(t0); o.stop(t0 + dur + 0.3);
    });
  }

  function chooseTune(ctx) {
    const list = window.WH_TUNES;
    const want = ctx.content && ctx.content.id;
    const found = want && list.find((t) => t.id === want);
    if (found) return found;
    if (ctx.mode === 'daily') return WH.shuffle(list, WH.rng('perm-tune'))[ctx.day % list.length];
    return WH.pick(list, ctx.rng);
  }

  function mount(root, ctx) {
    const tune = chooseTune(ctx);
    const notes = parse(tune.notes);
    const sounding = notes.filter((n) => !n.rest);
    const lo = Math.min(...sounding.map((n) => n.midi)), hi = Math.max(...sounding.map((n) => n.midi));
    const st = ctx.load() || { guesses: [] }; // each guess: tune id, or null for a skip
    let playing = null, done = false;

    const stage = () => Math.min(st.guesses.length, MAX - 1);
    // Index into `notes` covering the first N sounding notes.
    function cutoff(n) {
      if (n === Infinity) return notes.length;
      let seen = 0;
      for (let i = 0; i < notes.length; i++) if (!notes[i].rest && ++seen === n) return i + 1;
      return notes.length;
    }

    const bars = notes.map((n) => h('i', { class: n.rest ? 'rest' : '', style: n.rest ? null : { '--y': (n.midi - lo) / Math.max(1, hi - lo), '--w': n.beats } }));
    const strip = h('div', { class: 'tune-strip' }, bars);
    const playBtn = h('button', { class: 'tune-play', type: 'button', 'aria-label': 'Play', onclick: () => play(), html: WH.icons.play });
    const playLabel = h('div', { class: 'tune-play-label' });
    const dots = h('div', { class: 'tune-dots' });
    const history = h('div', { class: 'tune-history' });
    const input = h('input', { class: 'tune-input', type: 'text', placeholder: 'Type to search melodies…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Guess the melody',
      oninput: () => suggest(), onfocus: () => suggest(),
      onkeydown: (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveActive(e.key === 'ArrowDown' ? 1 : -1); }
        if (e.key === 'Escape') { list.innerHTML = ''; input.blur(); }
      } });
    const list = h('div', { class: 'tune-suggest', role: 'listbox' });
    const skipBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => guess(null) });
    const guessBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => submitTyped() }, 'Guess');
    const controls = h('div', { class: 'tune-controls' }, h('div', { class: 'tune-search' }, list, input), h('div', { class: 'tune-buttons' }, skipBtn, guessBtn));
    root.append(h('div', { class: 'play-area tune' },
      dots, h('div', { class: 'tune-stage' }, playBtn, h('div', null, playLabel, strip)), history), controls);

    function render() {
      const n = done ? Infinity : STAGES[stage()];
      const cut = cutoff(n);
      bars.forEach((b, i) => b.classList.toggle('on', i < cut));
      const count = n === Infinity ? sounding.length : Math.min(n, sounding.length);
      playLabel.innerHTML = done ? `<b>${esc(tune.title)}</b><span>${esc(tune.by)}</span>` : `<b>Play ${count} notes</b><span>Attempt ${stage() + 1} of ${MAX}</span>`;
      dots.innerHTML = '';
      for (let i = 0; i < MAX; i++) {
        const g = st.guesses[i];
        const cls = i < st.guesses.length ? (g === tune.id ? 'right' : g === null ? 'skip' : 'wrong') : i === st.guesses.length && !done ? 'now' : '';
        dots.append(h('i', { class: cls }));
      }
      history.innerHTML = '';
      st.guesses.forEach((g) => {
        const t = window.WH_TUNES.find((x) => x.id === g);
        history.append(h('div', { class: 'tune-guess ' + (g === tune.id ? 'right' : g === null ? 'skip' : 'wrong') },
          h('span', null, g === tune.id ? '✓' : g === null ? '↷' : '✕'), g === null ? 'Skipped' : t ? t.title : g));
      });
      const next = STAGES[Math.min(st.guesses.length + 1, MAX - 1)];
      skipBtn.textContent = st.guesses.length >= MAX - 1 ? 'Give up' : `Skip (+${(next === Infinity ? sounding.length : next) - (STAGES[stage()] === Infinity ? sounding.length : STAGES[stage()])} notes)`;
      controls.classList.toggle('hidden', done);
    }
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    function play() {
      if (playing) { stop(); return; }
      const a = audio();
      const cut = cutoff(done ? Infinity : STAGES[stage()]);
      const spb = 60 / tune.bpm;
      let t = a.currentTime + 0.08;
      const timers = [];
      for (let i = 0; i < cut; i++) {
        const n = notes[i], dur = n.beats * spb;
        if (!n.rest) {
          voice(a, n.freq, t, dur * 0.92);
          timers.push(setTimeout(() => { bars[i].classList.add('hit'); setTimeout(() => bars[i].classList.remove('hit'), Math.max(120, dur * 900)); }, (t - a.currentTime) * 1000));
        }
        t += dur;
      }
      timers.push(setTimeout(stop, (t - a.currentTime) * 1000 + 200));
      playing = { timers };
      playBtn.classList.add('playing');
      playBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>';
    }
    function stop() {
      if (!playing) return;
      playing.timers.forEach(clearTimeout); playing = null;
      if (ac) { ac.close(); ac = null; } // cut any notes still ringing
      playBtn.classList.remove('playing'); playBtn.innerHTML = WH.icons.play;
      bars.forEach((b) => b.classList.remove('hit'));
    }

    let matches = [], active = 0;
    function suggest() {
      const q = input.value.trim().toLowerCase();
      const guessed = new Set(st.guesses);
      matches = q ? window.WH_TUNES.filter((t) => !guessed.has(t.id) && (t.title.toLowerCase().includes(q) || t.by.toLowerCase().includes(q))).slice(0, 6) : [];
      active = 0;
      drawList();
    }
    function drawList() {
      list.innerHTML = '';
      matches.forEach((t, i) => list.append(h('button', { type: 'button', class: 'tune-opt' + (i === active ? ' active' : ''), role: 'option',
        onmousedown: (e) => { e.preventDefault(); guess(t.id); } }, h('b', null, t.title), h('span', null, t.by))));
    }
    function moveActive(d) { if (!matches.length) return; active = (active + d + matches.length) % matches.length; drawList(); }
    function submitTyped() {
      if (matches.length) return guess(matches[active].id);
      if (input.value.trim()) WH.toast('Pick a melody from the list'); else WH.toast('Start typing a title, or skip');
    }

    async function guess(id) {
      if (done) return;
      stop();
      st.guesses.push(id); ctx.save(st);
      input.value = ''; matches = []; drawList();
      const right = id === tune.id;
      if (right) { WH.sound.win(); }
      else if (id !== null) { WH.sound.error(); WH.vibrate(80); }
      if (right || st.guesses.length >= MAX) {
        done = true; render();
        input.blur();
        await WH.wait(500); finish(true);
      } else {
        render();
        if (id !== null) WH.toast('Not that one. More notes unlocked');
      }
    }

    function finish(animate) {
      done = true; render();
      const won = st.guesses.includes(tune.id);
      const n = st.guesses.length;
      const row = st.guesses.map((g) => (g === tune.id ? '🟩' : g === null ? '⬛' : '🟥')).join('') + '⬜'.repeat(MAX - n);
      ctx.complete({
        won, score: won ? n : 'X', label: won ? `${n}/${MAX}` : `X/${MAX}`,
        accuracy: won ? 1 / st.guesses.filter((g) => g !== null).length : 0,
        title: won ? ['Perfect pitch!', 'Great ear!', 'Bravo!', 'Got it!', 'Nice!', 'Phew!'][n - 1] : 'Good listening',
        sub: `${tune.title} · ${tune.by}`,
        note: won && n <= 2 ? `You named it from just ${Math.min(STAGES[n - 1], sounding.length)} notes.` : 'Press play to hear the full phrase.',
        share: `Tune ${ctx.label} 🎵 ${won ? n : 'X'}/${MAX}\n${row}`,
      }, { animate });
    }

    render();
    if (st.guesses.includes(tune.id) || st.guesses.length >= MAX) finish(false);
    return {
      onKey(k) { if (k === 'Enter' && document.activeElement === input) submitTyped(); },
      destroy() { stop(); },
    };
  }

  WH.tune = { parse };
  WH.register({
    id: 'tune', name: 'Tune', area: 'Listening', statType: 'guesses', maxGuesses: MAX,
    tagline: 'Name that melody from just a few notes.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3" fill="currentColor"/><circle cx="18" cy="16" r="3" fill="currentColor"/></svg>',
    howTo: `<p>Press <b>play</b> to hear the opening notes of a famous melody, then search for its name.</p>
      <p>You have <b>${MAX} attempts</b>. Each wrong guess or skip unlocks more notes: ${STAGES.slice(0, -1).join(', ')}, then the whole phrase.</p>
      <p>Every melody is a classic: nursery rhymes, folk songs, holiday favourites and famous classical themes. Turn your volume up!</p>`,
    mount,
  });
})();
