// Word (classic) and Duet (two boards at once) share one engine.
(function () {
  const { h } = WH;
  const TITLES = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];

  // Daily answers come from the curated content when present; otherwise from a seeded
  // permutation of the answer list so they don't repeat until the list cycles.
  function chooseAnswers(ctx, id, count) {
    const list = window.WH_WORDS.answers5;
    const cur = ctx.content && (ctx.content.answers || (ctx.content.answer && [ctx.content.answer]));
    if (cur && cur.length === count && cur.every((w) => /^[a-z]{5}$/.test(w))) return cur.slice();
    if (ctx.mode === 'daily') {
      const perm = WH.shuffle(list, WH.rng('perm-' + id));
      return Array.from({ length: count }, (_, k) => perm[(ctx.day * count + k) % perm.length]);
    }
    const out = [];
    while (out.length < count) { const w = WH.pick(list, ctx.rng); if (!out.includes(w)) out.push(w); }
    return out;
  }

  function mountWordle(root, ctx, { id, name, count, maxGuesses }) {
    const answers = chooseAnswers(ctx, id, count);
    const st = ctx.load() || { guesses: [] };
    const boards = answers.map(() => WH.Board({ rows: maxGuesses, cols: 5, className: count > 1 ? 'compact' : '' }));
    const boardWrap = h('div', { class: 'boards boards-' + count }, boards.map((b) => b.el));
    const kb = WH.Keyboard({ rows: WH.QWERTY, onKey });
    root.append(h('div', { class: 'play-area' }, boardWrap), kb.el);

    const solvedAt = answers.map(() => -1);
    const letterState = answers.map(() => ({}));
    const rank = { absent: 1, present: 2, correct: 3 };
    let cur = '', busy = false, done = false;

    function updateKeys(guess, statesPerBoard) {
      statesPerBoard.forEach((states, b) => {
        if (!states) return;
        states.forEach((s, i) => {
          const ch = guess[i];
          if ((rank[s] || 0) > (rank[letterState[b][ch]] || 0)) letterState[b][ch] = s;
        });
      });
      for (const ch of new Set(guess)) {
        if (count === 1) kb.mark(ch, letterState[0][ch]);
        else kb.multi(ch, letterState.map((ls) => ls[ch]));
      }
    }

    async function applyGuess(guess, r, animate) {
      const states = answers.map((ans, b) => (solvedAt[b] === -1 ? WH.scoreGuess(guess, ans) : null));
      boards.forEach((bd, b) => { if (states[b]) bd.setRow(r, guess); });
      if (animate) await Promise.all(boards.map((bd, b) => (states[b] ? bd.reveal(r, states[b]) : null)));
      else boards.forEach((bd, b) => states[b] && bd.paint(r, states[b]));
      answers.forEach((ans, b) => {
        if (states[b] && guess === ans) {
          solvedAt[b] = r;
          boards[b].el.classList.add('solved');
          if (animate) boards[b].bounce(r);
        }
      });
      updateKeys(guess, states);
    }

    function renderCurrent() {
      const r = st.guesses.length;
      boards.forEach((bd, b) => { if (solvedAt[b] === -1 && r < maxGuesses) { bd.setRow(r, cur); bd.setActive(r); } else bd.setActive(-1); });
    }

    function finish(animate) {
      done = true;
      const won = solvedAt.every((x) => x !== -1);
      const n = st.guesses.length;
      const label = won ? `${n}/${maxGuesses}` : `X/${maxGuesses}`;
      const NUM = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
      const grid = count === 4
        // Quad shares the solve row of each board, Quordle-style.
        ? [0, 2].map((i) => [i, i + 1].map((b) => (solvedAt[b] === -1 ? '🟥' : NUM[solvedAt[b] + 1])).join('')).join('\n')
        : st.guesses.map((g, r) =>
          answers.map((ans, b) => (solvedAt[b] !== -1 && r > solvedAt[b] ? '⬛⬛⬛⬛⬛' : WH.emojiRow(WH.scoreGuess(g, ans)))).join('  ')
        ).join('\n');
      const solvedCount = solvedAt.filter((x) => x !== -1).length;
      const words = answers.map((w) => w.toUpperCase()).join(' & ');
      ctx.complete({
        won, score: won ? n : 'X', label,
        title: won ? TITLES[Math.min(n - (maxGuesses - 6) - 1, TITLES.length - 1)] || 'Solved!' : 'Good effort',
        sub: won ? (count > 2 ? `All four found: ${words}` : count > 1 ? `Both words found: ${words}` : `You found ${words}`)
          : `${count > 2 ? `${solvedCount} of 4 found. ` : ''}The ${count > 1 ? 'words were' : 'word was'} ${words}`,
        note: ctx.content && ctx.content.fact,
        share: `${name} ${ctx.label} ${label}\n${grid}`,
      }, { animate });
    }

    async function submit() {
      if (cur.length < 5) { boards.forEach((b, i) => solvedAt[i] === -1 && b.shake(st.guesses.length)); WH.toast('Not enough letters'); WH.sound.error(); return; }
      if (!WH.isWord5(cur) && !answers.includes(cur)) { boards.forEach((b, i) => solvedAt[i] === -1 && b.shake(st.guesses.length)); WH.toast('Not in word list'); WH.sound.error(); return; }
      busy = true;
      const g = cur, r = st.guesses.length;
      st.guesses.push(g); cur = '';
      ctx.save(st);
      boards.forEach((bd) => bd.setActive(-1));
      await applyGuess(g, r, true);
      busy = false;
      if (solvedAt.every((x) => x !== -1) || st.guesses.length >= maxGuesses) {
        if (solvedAt.every((x) => x !== -1)) WH.sound.win(); else WH.sound.soft();
        await WH.wait(700);
        finish(true);
      } else {
        if (count > 1 && solvedAt.includes(r)) {
          const left = solvedAt.filter((x) => x === -1).length;
          WH.sound.good(); WH.toast(left === 1 ? 'One to go!' : count === 2 ? 'One down!' : `${left} to go`);
        }
        renderCurrent();
      }
    }

    function onKey(k) {
      if (busy || done) return;
      if (k === 'Enter') return submit();
      if (k === 'Backspace') { cur = cur.slice(0, -1); renderCurrent(); return; }
      if (/^[a-z]$/.test(k) && cur.length < 5) { cur += k; WH.sound.tap(); renderCurrent(); }
    }

    // Restore saved progress.
    st.guesses.forEach((g, r) => applyGuess(g, r, false));
    if (solvedAt.every((x) => x !== -1) || st.guesses.length >= maxGuesses) finish(false);
    else renderCurrent();

    return { onKey };
  }

  const tiles = (cells) => `<svg viewBox="0 0 24 24" aria-hidden="true">${cells}</svg>`;

  WH.register({
    id: 'word', name: 'Word', area: 'Language', statType: 'guesses', maxGuesses: 6,
    tagline: 'Find the hidden five-letter word in six tries.',
    icon: tiles('<rect x="2" y="2" width="9" height="9" rx="2.2" fill="currentColor"/><rect x="13" y="2" width="9" height="9" rx="2.2" fill="currentColor" opacity=".45"/><rect x="2" y="13" width="9" height="9" rx="2.2" fill="currentColor" opacity=".45"/><rect x="13" y="13" width="9" height="9" rx="2.2" fill="currentColor"/>'),
    howTo: `<p>Guess the hidden word in <b>6 tries</b>. Each guess must be a real five-letter word.</p>
      <div class="demo-row">${demo('crane', ['correct', 'absent', 'absent', 'absent', 'absent'])}</div>
      <p><b>C</b> is in the word and in the right spot.</p>
      <div class="demo-row">${demo('pilot', ['absent', 'present', 'absent', 'absent', 'absent'])}</div>
      <p><b>I</b> is in the word but in the wrong spot.</p>
      <div class="demo-row">${demo('vague', ['absent', 'absent', 'absent', 'absent', 'absent'])}</div>
      <p>Grey letters aren't in the word at all.</p>`,
    mount: (root, ctx) => mountWordle(root, ctx, { id: 'word', name: 'Word', count: 1, maxGuesses: 6 }),
  });

  WH.register({
    id: 'duet', name: 'Duet', area: 'Focus', statType: 'guesses', maxGuesses: 7,
    tagline: 'Two hidden words, one set of guesses. Keep both in mind.',
    icon: tiles('<rect x="1.5" y="3" width="9.5" height="18" rx="2.4" fill="currentColor"/><rect x="13" y="3" width="9.5" height="18" rx="2.4" fill="currentColor" opacity=".45"/>'),
    howTo: `<p>Solve <b>two words at once</b> in <b>7 tries</b>. Every guess is played on both boards.</p>
      <p>Colours work like Word: <span class="chip-c correct">green</span> right spot, <span class="chip-c present">gold</span> wrong spot, grey not in the word.</p>
      <p>Keyboard keys are split in half: the <b>left half</b> shows the left board, the <b>right half</b> the right board.</p>
      <p>Once a board is solved it locks, so every remaining guess goes toward the other word.</p>`,
    mount: (root, ctx) => mountWordle(root, ctx, { id: 'duet', name: 'Duet', count: 2, maxGuesses: 7 }),
  });

  WH.register({
    id: 'quad', name: 'Quad', area: 'Focus', statType: 'guesses', maxGuesses: 9,
    tagline: 'Four hidden words, nine guesses. The ultimate juggling act.',
    icon: tiles('<rect x="2" y="2" width="9" height="9" rx="2.2" fill="currentColor"/><rect x="13" y="2" width="9" height="9" rx="2.2" fill="currentColor" opacity=".6"/><rect x="2" y="13" width="9" height="9" rx="2.2" fill="currentColor" opacity=".6"/><rect x="13" y="13" width="9" height="9" rx="2.2" fill="currentColor" opacity=".3"/>'),
    howTo: `<p>Solve <b>four words at once</b> in <b>9 tries</b>. Every guess is played on all four boards.</p>
      <p>Colours work like Word: <span class="chip-c correct">green</span> right spot, <span class="chip-c present">gold</span> wrong spot, grey not in the word.</p>
      <p>Each keyboard key is split into <b>quarters</b>, one for each board: top-left, top-right, bottom-left, bottom-right.</p>
      <p>Solved boards lock. Plan your guesses to gather clues for several boards at once.</p>`,
    mount: (root, ctx) => mountWordle(root, ctx, { id: 'quad', name: 'Quad', count: 4, maxGuesses: 9 }),
  });

  function demo(word, states) {
    return word.split('').map((c, i) => `<div class="tile filled" data-state="${states[i]}">${c.toUpperCase()}</div>`).join('');
  }
  WH.demoTiles = demo;
})();
