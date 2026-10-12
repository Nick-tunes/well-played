// Ladder: change one letter at a time to turn the start word into the target.
(function () {
  const { h } = WH;

  function buckets(words) {
    const m = new Map();
    for (const w of words) for (let i = 0; i < 4; i++) {
      const k = w.slice(0, i) + '_' + w.slice(i + 1);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(w);
    }
    return m;
  }
  function* neighbors(m, w) {
    for (let i = 0; i < 4; i++) for (const n of m.get(w.slice(0, i) + '_' + w.slice(i + 1)) || []) if (n !== w) yield n;
  }
  function bfs(m, from) {
    const dist = new Map([[from, 0]]), q = [from];
    for (let qi = 0; qi < q.length; qi++) {
      const w = q[qi];
      for (const n of neighbors(m, w)) if (!dist.has(n)) { dist.set(n, dist.get(w) + 1); q.push(n); }
    }
    return dist;
  }
  let G = null;
  function graphs() {
    if (!G) {
      const common = window.WH_WORDS.common4;
      G = { common, commonSet: new Set(common), cm: buckets(common), vm: buckets(WH.valid4List()) };
    }
    return G;
  }

  function choosePuzzle(ctx) {
    const g = graphs();
    const c = ctx.content;
    if (c && c.start && c.target) {
      const d = bfs(g.cm, c.target);
      if (d.has(c.start)) return { start: c.start, target: c.target };
    }
    for (let t = 0; t < 400; t++) {
      const start = WH.pick(g.common, ctx.rng);
      const dc = bfs(g.cm, start);
      const want = ctx.rng() < 0.6 ? 4 : 5;
      const cands = [...dc].filter(([, d]) => d === want).map(([w]) => w);
      if (!cands.length) continue;
      return { start, target: WH.pick(cands, ctx.rng) };
    }
    return { start: 'cold', target: 'warm' };
  }

  const diffOne = (a, b) => [...a].filter((ch, i) => ch !== b[i]).length === 1;

  function mount(root, ctx) {
    const g = graphs();
    const { start, target } = choosePuzzle(ctx);
    // Par and hints use common words so the shortest path never relies on obscure entries;
    // any valid word is still accepted, so a player can beat par with a clever rare word.
    const fromC = bfs(g.cm, target), fromV = bfs(g.vm, target);
    const distTo = (w) => (fromC.has(w) ? fromC.get(w) : fromV.get(w));
    const par = distTo(start);
    const st = ctx.load() || { rungs: [], hints: 0, gaveUp: false };
    let cur = '', done = false;

    const chainEl = h('div', { class: 'ladder-chain' });
    const scroller = h('div', { class: 'ladder-scroll' }, chainEl);
    const stepsEl = h('b', null, '0');
    const info = h('div', { class: 'ladder-info' },
      h('span', null, 'Steps ', stepsEl), h('span', { class: 'dot-sep' }), h('span', null, 'Par ', h('b', null, String(par))));
    const btn = (icon, label, fn) => h('button', { class: 'pill-btn', type: 'button', onclick: fn, html: `${WH.icons[icon]}<span>${label}</span>` });
    const actions = h('div', { class: 'ladder-actions' },
      btn('undo', 'Undo', undo), btn('bulb', 'Hint', hint), btn('x', 'Reveal', giveUp));
    const kb = WH.Keyboard({ rows: WH.QWERTY, onKey });
    root.append(h('div', { class: 'play-area ladder' }, info, scroller), actions, kb.el);

    const last = () => (st.rungs.length ? st.rungs[st.rungs.length - 1] : start);

    function rowEl(word, kind, prev) {
      return h('div', { class: 'ladder-row ' + kind },
        word.split('').map((ch, i) => h('div', {
          class: 'tile filled' + (prev && prev[i] !== ch ? ' changed' : ''),
          'data-state': kind === 'goal' ? 'goal' : ch === target[i] ? 'correct' : 'plain',
        }, ch.toUpperCase())));
    }

    function render() {
      chainEl.innerHTML = '';
      chainEl.append(h('div', { class: 'ladder-label' }, 'Start'), rowEl(start, 'start'));
      let prev = start;
      st.rungs.forEach((w) => { chainEl.append(h('div', { class: 'ladder-link' }), rowEl(w, w === target ? 'rung reached' : 'rung', prev)); prev = w; });
      if (!done) {
        const ghost = last();
        chainEl.append(h('div', { class: 'ladder-link' }), h('div', { class: 'ladder-row input' },
          [0, 1, 2, 3].map((i) => h('div', { class: 'tile' + (cur[i] ? ' filled' : ' ghost') }, (cur[i] || ghost[i]).toUpperCase()))));
        const left = distTo(last());
        chainEl.append(h('div', { class: 'ladder-link dashed' }),
          h('div', { class: 'ladder-label' }, left != null ? `Target · ${left} step${left === 1 ? '' : 's'} away at best` : 'Target'),
          rowEl(target, 'goal'));
      }
      stepsEl.textContent = st.rungs.length;
      actions.classList.toggle('hidden', done);
      requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
    }

    function shakeInput(msg) {
      const r = chainEl.querySelector('.ladder-row.input');
      if (r) { r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake'); }
      WH.toast(msg); WH.sound.error(); WH.vibrate(80);
    }

    function addRung(w) {
      st.rungs.push(w); cur = ''; ctx.save(st);
      if (w === target) return win();
      WH.sound.flip(w.split('').filter((ch, i) => ch === target[i]).length);
      render();
    }

    function submit() {
      if (cur.length < 4) return shakeInput('Type a four-letter word');
      if (!diffOne(cur, last())) return shakeInput('Change exactly one letter');
      if (!WH.isWord4(cur) && !g.commonSet.has(cur)) return shakeInput('Not in word list');
      if (cur === start || st.rungs.includes(cur)) return shakeInput('Already used');
      addRung(cur);
    }

    function nextOnPath(from) {
      if (fromC.has(from)) {
        const d = fromC.get(from);
        if (d === 0) return null;
        for (const n of neighbors(g.cm, from)) if (fromC.get(n) === d - 1) return n;
      }
      // Off the common graph: step toward any word that rejoins it.
      const d = fromV.get(from);
      if (d == null || d === 0) return null;
      let best = null;
      for (const n of neighbors(g.vm, from)) {
        if (fromV.get(n) === d - 1) { if (fromC.has(n)) return n; best = best || n; }
      }
      return best;
    }

    function hint() {
      if (done) return;
      const n = nextOnPath(last());
      if (!n) { WH.toast('No path from here. Try Undo.'); return; }
      st.hints++; WH.toast(`Hint: ${n.toUpperCase()}`); addRung(n);
    }
    function undo() {
      if (done || !st.rungs.length) return;
      st.rungs.pop(); cur = ''; ctx.save(st); render();
    }
    function giveUp() {
      if (done) return;
      st.gaveUp = true;
      let n; let guard = 0;
      while ((n = nextOnPath(last())) && guard++ < 20) st.rungs.push(n);
      if (last() !== target) { st.rungs = []; let w = start; while ((n = nextOnPath(w)) && guard++ < 40) { st.rungs.push(n); w = n; } }
      ctx.save(st); finish(true);
    }

    async function win() {
      done = true; render(); WH.sound.win();
      await WH.wait(600); finish(true);
    }

    function finish(animate) {
      done = true; render();
      const steps = st.rungs.length, over = steps - par;
      const won = !st.gaveUp && last() === target;
      const label = won ? (over <= 0 ? (over < 0 ? `${steps} · under par!` : `${steps} · par`) : `${steps} · +${over}`) : 'Revealed';
      const grid = [start, ...st.rungs].map((w) => w.split('').map((ch, i) => (ch === target[i] ? '🟩' : '⬜')).join('')).join('\n');
      ctx.complete({
        won, score: won ? Math.min(3, Math.max(0, over)) : 'X', label,
        accuracy: won ? Math.max(0, Math.min(1, par / steps) - 0.15 * st.hints) : 0,
        title: !won ? 'Here’s the way' : over <= 0 ? (st.hints ? 'Made it!' : 'Perfect climb!') : over === 1 ? 'Lovely climb!' : 'You made it!',
        sub: `${start.toUpperCase()} → ${target.toUpperCase()} in ${steps} steps (par ${par})${st.hints ? ` · ${st.hints} hint${st.hints > 1 ? 's' : ''}` : ''}`,
        share: `Ladder ${ctx.label} ${start.toUpperCase()}→${target.toUpperCase()} ${won ? `${steps} (par ${par})` : 'revealed'}\n${grid}`,
      }, { animate });
    }

    function onKey(k) {
      if (done) return;
      if (k === 'Enter') return submit();
      if (k === 'Backspace') { if (cur) cur = cur.slice(0, -1); render(); return; }
      if (/^[a-z]$/.test(k) && cur.length < 4) { cur += k; WH.sound.tap(); render(); }
    }

    if (st.gaveUp || last() === target) finish(false); else render();
    return { onKey };
  }

  WH.register({
    id: 'ladder', name: 'Ladder', area: 'Language', statType: 'par',
    tagline: 'Climb from one word to another, a single letter at a time.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M7 2v20M17 2v20M7 6h10M7 12h10M7 18h10"/></svg>',
    howTo: `<p>Turn the <b>start word</b> into the <b>target</b> by changing <b>one letter</b> at a time. Every step must be a real word.</p>
      <div class="demo-ladder">${['cold', 'cord', 'card', 'ward', 'warm'].map((w) => `<span>${w.toUpperCase()}</span>`).join('<i>→</i>')}</div>
      <p>Letters that already match the target turn <span class="chip-c correct">green</span>. Try to finish in <b>par</b>, the fewest steps possible.</p>
      <p>Stuck? <b>Undo</b> a step, take a <b>Hint</b>, or <b>Reveal</b> the path.</p>`,
    mount,
  });
})();
