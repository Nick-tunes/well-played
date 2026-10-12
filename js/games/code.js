// Code: crack a hidden sequence of colours with Wordle-style feedback.
(function () {
  const { h } = WH;
  const SLOTS = 5, MAX = 6;
  // Each colour also has a symbol so the game works without colour vision.
  const PEGS = [
    { c: '#e5675a', s: '●', n: 'Red' }, { c: '#eea23f', s: '▲', n: 'Orange' },
    { c: '#e3cd4b', s: '■', n: 'Yellow' }, { c: '#67b26f', s: '◆', n: 'Green' },
    { c: '#4fb7c5', s: '★', n: 'Teal' }, { c: '#5b86e5', s: '✚', n: 'Blue' },
    { c: '#9d6ad8', s: '⬟', n: 'Purple' }, { c: '#e27ab3', s: '♥', n: 'Pink' },
  ];
  const peg = (i, extra = '') => h('span', { class: 'peg ' + extra, style: { '--peg': PEGS[i].c } }, PEGS[i].s);

  function mount(root, ctx) {
    const cc = ctx.content && ctx.content.code;
    const answer = Array.isArray(cc) && cc.length === SLOTS && cc.every((x) => x >= 0 && x < PEGS.length)
      ? cc : Array.from({ length: SLOTS }, () => Math.floor(ctx.rng() * PEGS.length));
    const st = ctx.load() || { guesses: [] };
    let cur = [], busy = false, done = false;

    const rows = [];
    const board = h('div', { class: 'code-board' });
    for (let r = 0; r < MAX; r++) {
      const cells = Array.from({ length: SLOTS }, () => h('div', { class: 'code-cell' }));
      const row = h('div', { class: 'code-row' }, h('span', { class: 'code-num' }, r + 1), cells);
      rows.push({ row, cells }); board.append(row);
    }
    const palette = h('div', { class: 'code-palette' }, PEGS.map((p, i) =>
      h('button', { class: 'code-key', type: 'button', 'aria-label': p.n, title: `${p.n} (${i + 1})`, onclick: () => onKey(String(i + 1)) }, peg(i))));
    const actions = h('div', { class: 'code-actions' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => onKey('Backspace'), html: `${WH.icons.back}<span>Undo</span>` }),
      h('button', { class: 'btn primary', type: 'button', onclick: () => onKey('Enter') }, 'Check'));
    root.append(h('div', { class: 'play-area code' }, board), h('div', { class: 'code-controls' }, palette, actions));

    function paintRow(r, guess, states, animate) {
      const { cells, row } = rows[r];
      cells.forEach((cell, i) => {
        cell.replaceChildren(guess[i] != null ? peg(guess[i]) : '');
        cell.classList.toggle('filled', guess[i] != null);
        if (!states) { delete cell.dataset.state; return; }
        const apply = () => { cell.dataset.state = states[i]; };
        if (animate && !WH.reducedMotion()) { setTimeout(() => { cell.classList.add('flip'); setTimeout(() => { apply(); WH.sound.flip(i); }, 230); }, i * 220); } else apply();
      });
      row.classList.toggle('active', !states && !done);
    }
    const render = () => { if (st.guesses.length < MAX) paintRow(st.guesses.length, cur, null); };

    async function submit() {
      if (cur.length < SLOTS) {
        const row = rows[st.guesses.length].row;
        row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake');
        WH.toast(`Pick ${SLOTS} colours`); WH.sound.error(); return;
      }
      busy = true;
      const g = cur.slice(), r = st.guesses.length;
      st.guesses.push(g); cur = []; ctx.save(st);
      const states = WH.scoreGuess(g, answer);
      paintRow(r, g, states, true);
      await WH.wait((SLOTS - 1) * 220 + 520);
      busy = false;
      const won = states.every((s) => s === 'correct');
      if (won || st.guesses.length >= MAX) {
        if (won) WH.sound.win(); else WH.sound.soft();
        await WH.wait(500); finish(true);
      } else render();
    }

    function finish(animate) {
      done = true;
      rows.forEach((x) => x.row.classList.remove('active'));
      const won = st.guesses.some((g) => g.every((x, i) => x === answer[i]));
      const n = st.guesses.length;
      const reveal = h('div', { class: 'code-answer' }, h('span', null, 'The code'), answer.map((x) => peg(x)));
      if (!root.querySelector('.code-answer')) root.querySelector('.play-area').append(reveal);
      root.querySelector('.code-controls').classList.add('hidden');
      ctx.complete({
        won, score: won ? n : 'X', label: won ? `${n}/${MAX}` : `X/${MAX}`, accuracy: WH.hitRate(st.guesses.map((g) => [g, answer])),
        title: won ? ['Psychic!', 'Codebreaker!', 'Sharp!', 'Cracked it!', 'Nice!', 'Phew!'][n - 1] : 'Locked out',
        sub: `The code was ${answer.map((x) => PEGS[x].n).join(', ')}`,
        share: `Code ${ctx.label} ${won ? n : 'X'}/${MAX}\n` + st.guesses.map((g) => WH.emojiRow(WH.scoreGuess(g, answer))).join('\n'),
      }, { animate });
    }

    function onKey(k) {
      if (busy || done) return;
      if (k === 'Enter') return submit();
      if (k === 'Backspace') { cur.pop(); return render(); }
      const n = +k;
      if (n >= 1 && n <= PEGS.length && cur.length < SLOTS) { cur.push(n - 1); WH.sound.tone(300 + n * 45, 0.08, 'triangle', 0.03); render(); }
    }

    st.guesses.forEach((g, r) => paintRow(r, g, WH.scoreGuess(g, answer), false));
    if (st.guesses.some((g) => g.every((x, i) => x === answer[i])) || st.guesses.length >= MAX) finish(false);
    else render();
    return { onKey };
  }

  WH.register({
    id: 'code', name: 'Code', area: 'Logic', statType: 'guesses', maxGuesses: MAX,
    tagline: 'Crack the secret five-colour code in six tries.',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="7" r="3" fill="currentColor"/><circle cx="12" cy="7" r="3" fill="currentColor" opacity=".55"/><circle cx="19" cy="7" r="3" fill="currentColor"/><circle cx="5" cy="17" r="3" fill="currentColor" opacity=".55"/><circle cx="12" cy="17" r="3" fill="currentColor"/><circle cx="19" cy="17" r="3" fill="currentColor" opacity=".3"/></svg>',
    howTo: `<p>A secret code of <b>${SLOTS} colours</b> is hidden. Colours can repeat. Crack it in <b>${MAX} tries</b>.</p>
      <div class="demo-code">${[[0, 'correct'], [3, 'present'], [5, 'absent'], [0, 'absent'], [7, 'present']].map(([i, s]) => `<div class="code-cell filled" data-state="${s}"><span class="peg" style="--peg:${PEGS[i].c}">${PEGS[i].s}</span></div>`).join('')}</div>
      <p><span class="chip-c correct">Green</span>: right colour, right slot. <span class="chip-c present">Gold</span>: that colour is in the code, but in another slot. Grey: no more of that colour.</p>
      <p>Tap the palette or press <b>1–${PEGS.length}</b> on your keyboard. Every colour has its own symbol, too.</p>`,
    mount,
  });
})();
