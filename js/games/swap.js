// Swap: unscramble a waffle-shaped grid of six crossing words by swapping tiles (Waffle-style).
(function () {
  const { h } = WH;
  const MAX_SWAPS = 15, PAR = 10;
  const isHole = (r, c) => r % 2 === 1 && c % 2 === 1;
  const CELLS = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!isHole(r, c)) CELLS.push(r * 5 + c);
  // The six words as lists of cell indices: rows 0,2,4 then columns 0,2,4.
  const LINES = [0, 2, 4].map((r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c))
    .concat([0, 2, 4].map((c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c)));

  // Fill a 25-cell solution from words [r0, r2, r4, c0, c2, c4]. Returns null if they don't cross.
  function solutionFrom(words) {
    const g = Array(25).fill(null);
    for (let i = 0; i < 6; i++) {
      for (let k = 0; k < 5; k++) {
        const cell = LINES[i][k];
        if (g[cell] && g[cell] !== words[i][k]) return null;
        g[cell] = words[i][k];
      }
    }
    return g;
  }

  function generateWords(rng) {
    const A = window.WH_WORDS.answers5;
    const byFirst = {}, by024 = {};
    for (const w of A) {
      (byFirst[w[0]] = byFirst[w[0]] || []).push(w);
      (by024[w[0] + w[2] + w[4]] = by024[w[0] + w[2] + w[4]] || []).push(w);
    }
    for (let t = 0; t < 50000; t++) {
      const r0 = WH.pick(A, rng);
      const c0 = WH.pick(byFirst[r0[0]] || [''], rng), c2 = WH.pick(byFirst[r0[2]] || [''], rng), c4 = WH.pick(byFirst[r0[4]] || [''], rng);
      if (!c0 || !c2 || !c4) continue;
      const r2s = by024[c0[2] + c2[2] + c4[2]], r4s = by024[c0[4] + c2[4] + c4[4]];
      if (!r2s || !r4s) continue;
      const words = [r0, WH.pick(r2s, rng), WH.pick(r4s, rng), c0, c2, c4];
      if (new Set(words).size === 6) return words;
    }
    return null;
  }

  // Scramble by applying random cycles that cost exactly PAR swaps to undo (for distinct letters).
  function scramble(sol, rng) {
    for (let t = 0; t < 500; t++) {
      const lens = [];
      let cost = 0;
      while (cost < PAR) {
        const len = Math.min(WH.randInt(2, 6, rng), PAR - cost + 1);
        lens.push(len); cost += len - 1;
      }
      const moving = WH.shuffle(CELLS, rng).slice(0, lens.reduce((a, b) => a + b, 0));
      if (moving.length < lens.reduce((a, b) => a + b, 0)) continue;
      const g = sol.slice();
      let i = 0;
      for (const len of lens) {
        const cyc = moving.slice(i, i + len); i += len;
        cyc.forEach((cell, k) => { g[cell] = sol[cyc[(k + 1) % len]]; });
      }
      // Every moved tile must actually be wrong, otherwise the puzzle is easier than it looks.
      if (moving.every((cell) => g[cell] !== sol[cell])) return g;
    }
    return sol.slice();
  }

  // Colour each tile: correct, present (belongs elsewhere in one of its words), or absent.
  function colours(g, sol) {
    const out = Array(25).fill(null);
    for (const cell of CELLS) out[cell] = g[cell] === sol[cell] ? 'correct' : 'absent';
    for (const line of LINES) {
      const need = {};
      for (const cell of line) if (out[cell] !== 'correct') need[sol[cell]] = (need[sol[cell]] || 0) + 1;
      for (const cell of line) {
        if (out[cell] === 'correct') continue;
        if (need[g[cell]] > 0) { need[g[cell]]--; out[cell] = 'present'; }
      }
    }
    return out;
  }

  function mount(root, ctx) {
    const cw = ctx.content && ctx.content.words;
    const words = (cw && cw.length === 6 && solutionFrom(cw) && cw) || generateWords(ctx.rng) || generateWords(Math.random);
    const sol = solutionFrom(words);
    const st = ctx.load() || { grid: scramble(sol, ctx.rng), used: 0 };
    let sel = null, busy = false, done = false;

    const gridEl = h('div', { class: 'swap-grid' });
    const tiles = [];
    for (let i = 0; i < 25; i++) {
      const r = Math.floor(i / 5), c = i % 5;
      const t = isHole(r, c) ? h('div', { class: 'swap-hole' })
        : h('button', { class: 'tile swap-tile filled', type: 'button', 'data-i': i, onclick: () => tap(i) });
      tiles.push(t); gridEl.append(t);
    }
    const leftEl = h('b');
    root.append(h('div', { class: 'play-area swap' },
      h('div', { class: 'swap-count' }, leftEl, h('span', null, 'swaps left')),
      gridEl,
      h('p', { class: 'swap-hint' }, `Tap two tiles to swap them. It can be solved in ${PAR} swaps.`)));

    function render() {
      const col = colours(st.grid, sol);
      for (const cell of CELLS) {
        const t = tiles[cell];
        t.textContent = st.grid[cell].toUpperCase();
        t.dataset.state = col[cell];
        t.classList.toggle('sel', sel === cell);
        t.disabled = done || col[cell] === 'correct';
      }
      leftEl.textContent = MAX_SWAPS - st.used;
      leftEl.parentElement.classList.toggle('low', MAX_SWAPS - st.used <= 3);
    }

    async function tap(i) {
      if (busy || done) return;
      if (st.grid[i] === sol[i]) return;
      if (sel === null) { sel = i; WH.sound.tap(); return render(); }
      if (sel === i) { sel = null; return render(); }
      const a = sel, b = i;
      sel = null; busy = true;
      [tiles[a], tiles[b]].forEach((t) => { t.classList.remove('swapping'); void t.offsetWidth; t.classList.add('swapping'); });
      await WH.wait(140);
      [st.grid[a], st.grid[b]] = [st.grid[b], st.grid[a]];
      st.used++; ctx.save(st);
      render();
      const nowRight = [a, b].filter((x) => st.grid[x] === sol[x]).length;
      if (nowRight) WH.sound.good(); else WH.sound.flip(2);
      busy = false;
      if (CELLS.every((c) => st.grid[c] === sol[c])) {
        done = true; render(); WH.sound.win();
        CELLS.forEach((c, k) => setTimeout(() => tiles[c].classList.add('bounce'), k * 35));
        await WH.wait(1100); finish(true);
      } else if (st.used >= MAX_SWAPS) {
        done = true; WH.sound.soft();
        await WH.wait(500);
        st.grid = sol.slice(); st.failed = true; ctx.save(st); render();
        CELLS.forEach((c) => tiles[c].classList.add('revealed'));
        await WH.wait(600); finish(true);
      }
    }

    function finish(animate) {
      done = true; render();
      const won = !st.failed;
      const left = MAX_SWAPS - st.used;
      const stars = won ? '★'.repeat(left) + '☆'.repeat(5 - left) : '☆☆☆☆☆';
      ctx.complete({
        won, score: won ? left : 'X', accuracy: won ? Math.min(1, PAR / Math.max(1, st.used)) : 0, label: won ? `${stars} · ${st.used} swaps` : 'Out of swaps',
        title: !won ? 'So close' : left === 5 ? 'Perfect!' : left >= 3 ? 'Brilliant!' : left >= 1 ? 'Nicely done!' : 'Just made it!',
        sub: `The words: ${words.map((w) => w.toUpperCase()).join(', ')}`,
        share: `Swap ${ctx.label} ${won ? `${stars}` : '✕'} (${st.used} swaps)\n` +
          [0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => (isHole(r, c) ? '⬜' : won ? '🟩' : '🟨')).join('')).join('\n'),
      }, { animate });
    }

    render();
    if (st.failed || CELLS.every((c) => st.grid[c] === sol[c])) finish(false);
    return { onKey() {} };
  }

  WH.swap = { solutionFrom, generateWords };
  WH.register({
    id: 'swap', name: 'Swap', area: 'Spatial', statType: 'stars',
    tagline: 'Six crossing words, all jumbled. Swap tiles to set them straight.',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true">' + [0, 1, 2, 3, 4].flatMap((r) => [0, 1, 2, 3, 4].map((c) => (r % 2 && c % 2) ? '' : `<rect x="${1 + c * 4.6}" y="${1 + r * 4.6}" width="3.8" height="3.8" rx="1" fill="currentColor" opacity="${(r + c) % 4 === 0 ? 1 : .45}"/>`)).join('') + '</svg>',
    howTo: `<p>The grid holds <b>six words</b>: three across and three down, crossing like a waffle. All the letters are there, just in the wrong places.</p>
      <p>Tap two tiles to <b>swap</b> them. You have <b>15 swaps</b>, and the puzzle can be solved in 10.</p>
      <p><span class="chip-c correct">Green</span> tiles are in the right spot (and lock). <span class="chip-c present">Gold</span> tiles belong somewhere else in the same word (row or column). Grey tiles belong elsewhere in the grid.</p>
      <p>Every swap you save earns a star.</p>`,
    mount,
  });
})();
