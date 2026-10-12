// Hue: recreate a target colour with H/S/L sliders.
(function () {
  const { h } = WH;
  const MAX = 6, WIN = 95;
  const TOL = { h: [5, 16], s: [5, 14], l: [4, 11] }; // [spot on, close]

  const hsl = (c) => `hsl(${c.h} ${c.s}% ${c.l}%)`;
  function toRgb({ h: H, s, l }) {
    s /= 100; l /= 100;
    const k = (n) => (n + H / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)];
  }
  function toLab(c) {
    const lin = toRgb(c).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    const [r, g, b] = lin;
    const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  }
  function match(a, b) {
    const [l1, a1, b1] = toLab(a), [l2, a2, b2] = toLab(b);
    const dE = Math.hypot(l1 - l2, a1 - a2, b1 - b2);
    return Math.max(0, Math.round(100 - dE * 1.1));
  }
  function feedback(guess, target) {
    return ['h', 's', 'l'].map((k) => {
      let d = target[k] - guess[k];
      if (k === 'h' && Math.abs(d) > 180) d = d > 0 ? d - 360 : d + 360; // shortest way round
      const ad = Math.abs(d);
      const state = ad <= TOL[k][0] ? 'correct' : ad <= TOL[k][1] ? 'present' : 'absent';
      // Arrow follows the slider, not the colour wheel, so it matches what the player moves.
      const sliderDir = Math.sign(target[k] - guess[k]);
      return { k, state, dir: state === 'correct' ? 0 : sliderDir };
    });
  }

  function chooseTarget(ctx) {
    const c = ctx.content;
    if (c && c.h != null) return { h: c.h, s: c.s, l: c.l, name: c.name || 'Today’s colour', note: c.note || '' };
    return { h: WH.randInt(0, 359, ctx.rng), s: WH.randInt(35, 85, ctx.rng), l: WH.randInt(32, 72, ctx.rng), name: ctx.mode === 'daily' ? 'Today’s colour' : 'Mystery colour', note: '' };
  }

  function mount(root, ctx) {
    const target = chooseTarget(ctx);
    const st = ctx.load() || { guesses: [] };
    const val = st.guesses.length ? { ...st.guesses[st.guesses.length - 1] } : { h: 180, s: 50, l: 50 };
    let done = false;

    const targetSw = h('div', { class: 'hue-swatch target', style: { background: hsl(target) } }, h('span', null, 'Target'));
    const guessSw = h('div', { class: 'hue-swatch guess' }, h('span', null, 'Your mix'));
    const nameEl = h('div', { class: 'hue-name' }, target.name);
    const history = h('div', { class: 'hue-history' });
    const sliders = {};
    const sliderBox = h('div', { class: 'hue-sliders' }, [
      ['h', 'Hue', 359], ['s', 'Saturation', 100], ['l', 'Lightness', 100],
    ].map(([k, label, max]) => {
      const input = h('input', { type: 'range', min: 0, max, step: 1, value: val[k], 'aria-label': label,
        oninput: (e) => { val[k] = +e.target.value; paint(); } });
      sliders[k] = input;
      return h('label', { class: 'hue-slider hs-' + k }, h('span', null, label), input);
    }));
    const submitBtn = h('button', { class: 'btn primary hue-submit', type: 'button', onclick: submit }, 'Mix it');
    const counter = h('div', { class: 'hue-count' });
    root.append(h('div', { class: 'play-area hue' },
      h('div', { class: 'hue-swatches' }, targetSw, guessSw), nameEl, history),
      h('div', { class: 'hue-controls' }, sliderBox, h('div', { class: 'hue-submit-row' }, counter, submitBtn)));

    function paint() {
      guessSw.style.background = hsl(val);
      sliders.s.style.setProperty('--track', `linear-gradient(90deg, hsl(${val.h} 0% ${val.l}%), hsl(${val.h} 100% ${val.l}%))`);
      sliders.l.style.setProperty('--track', `linear-gradient(90deg, #000, hsl(${val.h} ${val.s}% 50%), #fff)`);
      sliders.h.style.setProperty('--track', `linear-gradient(90deg, ${[0, 60, 120, 180, 240, 300, 360].map((x) => `hsl(${x} ${val.s}% ${val.l}%)`).join(',')})`);
      counter.textContent = done ? '' : `Guess ${st.guesses.length + 1} of ${MAX}`;
    }

    const ARROW = { '-1': '←', 1: '→', 0: '✓' };
    function historyRow(gs, animate) {
      const pct = match(gs, target);
      const fb = feedback(gs, target);
      const row = h('div', { class: 'hue-row' + (animate ? ' enter' : '') },
        h('div', { class: 'hue-chip', style: { background: hsl(gs) } }),
        h('div', { class: 'hue-fb' }, fb.map((f) => h('span', { class: 'fb', 'data-state': f.state, title: f.k.toUpperCase() },
          h('small', null, f.k.toUpperCase()), ARROW[f.dir]))),
        h('div', { class: 'hue-pct' }, h('b', null, pct + '%'), h('div', { class: 'bar' }, h('i', { style: { width: pct + '%' } }))));
      history.append(row);
      return { pct, fb };
    }
    const isWin = (gs) => match(gs, target) >= WIN || feedback(gs, target).every((f) => f.state === 'correct');

    async function submit() {
      if (done) return;
      const gs = { ...val };
      st.guesses.push(gs); ctx.save(st);
      const { pct } = historyRow(gs, true);
      WH.sound.flip(Math.round(pct / 20));
      if (isWin(gs) || st.guesses.length >= MAX) {
        done = true; paint();
        if (isWin(gs)) WH.sound.win(); else WH.sound.soft();
        await WH.wait(600); finish(true);
      } else paint();
    }

    function finish(animate) {
      done = true;
      submitBtn.disabled = true;
      sliderBox.classList.add('locked');
      Object.values(sliders).forEach((s) => (s.disabled = true));
      targetSw.classList.add('revealed');
      const best = Math.max(...st.guesses.map((g) => match(g, target)));
      const won = st.guesses.some(isWin);
      const n = won ? st.guesses.findIndex(isWin) + 1 : 'X';
      paint();
      const em = { correct: '🟩', present: '🟨', absent: '⬜' };
      ctx.complete({
        won, score: n, label: won ? `${n}/${MAX}` : `${best}%`,
        title: won ? (n <= 2 ? 'What an eye!' : n <= 4 ? 'Beautifully matched' : 'Got there!') : 'So close',
        sub: `${target.name} · best match ${best}%`,
        note: target.note,
        share: `Hue ${ctx.label} ${won ? `${n}/${MAX}` : `X/${MAX}`} · best ${best}%\n` +
          st.guesses.map((g) => feedback(g, target).map((f) => em[f.state]).join('') + ` ${match(g, target)}%`).join('\n'),
      }, { animate });
    }

    st.guesses.forEach((g) => historyRow(g, false));
    paint();
    if (st.guesses.some(isWin) || st.guesses.length >= MAX) finish(false);

    return {
      onKey(k) { if (k === 'Enter' && !done && document.activeElement?.tagName !== 'BUTTON') submit(); },
    };
  }

  WH.hue = { match };
  WH.register({
    id: 'hue', name: 'Hue', area: 'Perception', statType: 'guesses', maxGuesses: MAX,
    tagline: 'Mix the colour of the day by eye with three sliders.',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9" r="6.5" fill="currentColor" opacity=".9"/><circle cx="15" cy="9" r="6.5" fill="currentColor" opacity=".55"/><circle cx="12" cy="15" r="6.5" fill="currentColor" opacity=".35"/></svg>',
    howTo: `<p>Recreate the <b>target colour</b> in <b>6 tries</b> using the Hue, Saturation and Lightness sliders, then press <b>Mix it</b>.</p>
      <p>Each guess shows a <b>match %</b> and a hint for every slider:</p>
      <div class="demo-fb"><span class="fb" data-state="correct"><small>H</small>✓</span><span class="fb" data-state="present"><small>S</small>→</span><span class="fb" data-state="absent"><small>L</small>←</span></div>
      <p><span class="chip-c correct">Green</span> is spot on, <span class="chip-c present">gold</span> is close, grey is far. Arrows point the way to move that slider.</p>
      <p>Hit <b>${WIN}%</b> or better to win.</p>`,
    mount,
  });
})();
