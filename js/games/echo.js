// Echo: watch the pads light up, then repeat the growing sequence.
(function () {
  const { h } = WH;
  const PADS = 9, LIVES = 3;
  // C-major pentatonic across two octaves: always sounds pleasant.
  const NOTES = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0];
  const KEYMAP = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };

  function mount(root, ctx) {
    const seq = Array.from({ length: 60 }, () => Math.floor(ctx.rng() * PADS));
    const st = ctx.load() || { best: 0, lives: LIVES, finished: false };
    let level = st.best + 1, input = 0, phase = 'idle', alive = true;

    const pads = Array.from({ length: PADS }, (_, i) =>
      h('button', { class: 'echo-pad', type: 'button', 'data-i': i, 'aria-label': `Pad ${i + 1}`, onpointerdown: (e) => { e.preventDefault(); press(i); } }));
    const grid = h('div', { class: 'echo-grid' }, pads);
    const status = h('div', { class: 'echo-status' });
    const levelEl = h('b', null, '');
    const hearts = h('div', { class: 'echo-hearts' });
    const startBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => { startBtn.remove(); round(); } }, st.best ? `Continue from ${st.best + 1}` : 'Start');
    root.append(h('div', { class: 'play-area echo' },
      h('div', { class: 'echo-top' }, h('div', { class: 'echo-level' }, 'Sequence ', levelEl), hearts),
      grid, status, h('div', { class: 'echo-start' }, startBtn)));

    function renderTop() {
      levelEl.textContent = level;
      hearts.innerHTML = '';
      for (let i = 0; i < LIVES; i++) hearts.append(h('span', { class: 'heart' + (i < st.lives ? '' : ' lost'), html: WH.icons.heart }));
    }
    const setStatus = (t, cls = '') => { status.textContent = t; status.className = 'echo-status ' + cls; };

    async function flash(i, ms) {
      pads[i].classList.add('lit');
      WH.sound.tone(NOTES[i], ms / 1000 + 0.1, 'sine', 0.07);
      await new Promise((r) => setTimeout(r, ms));
      pads[i].classList.remove('lit');
    }

    async function round() {
      if (!alive) return;
      phase = 'watch'; input = 0; renderTop();
      grid.classList.add('watching');
      setStatus('Watch…');
      await new Promise((r) => setTimeout(r, 650));
      const on = Math.max(260, 520 - level * 18), gap = Math.max(120, 220 - level * 8);
      for (let k = 0; k < level && alive; k++) {
        await flash(seq[k], on);
        await new Promise((r) => setTimeout(r, gap));
      }
      if (!alive) return;
      grid.classList.remove('watching');
      phase = 'input'; setStatus('Your turn', 'go');
    }

    async function press(i) {
      if (phase !== 'input') return;
      flash(i, 180);
      if (seq[input] !== i) {
        phase = 'wait';
        st.lives--; ctx.save(st); renderTop();
        pads[i].classList.add('wrong'); setTimeout(() => pads[i].classList.remove('wrong'), 450);
        grid.classList.remove('shake'); void grid.offsetWidth; grid.classList.add('shake');
        WH.sound.error(); WH.vibrate(120);
        if (st.lives <= 0) { setStatus('Out of hearts', 'bad'); await WH.wait(800); return end(true); }
        setStatus(`Not quite. Watch again`, 'bad');
        await new Promise((r) => setTimeout(r, 1100));
        return round();
      }
      input++;
      if (input === level) {
        phase = 'wait';
        st.best = level; ctx.save(st);
        setStatus(level % 5 === 0 ? `Wonderful, ${level} in a row!` : 'Nice!', 'good');
        grid.classList.add('cleared'); setTimeout(() => grid.classList.remove('cleared'), 400);
        WH.sound.good();
        level++;
        await new Promise((r) => setTimeout(r, 900));
        round();
      }
    }

    function end(animate) {
      phase = 'over'; st.finished = true; ctx.save(st);
      grid.classList.add('over');
      const b = st.best;
      ctx.complete({
        won: b >= 7, score: b, label: `${b} in a row`,
        title: b >= 12 ? 'Elephant memory!' : b >= 9 ? 'Superb recall!' : b >= 7 ? 'Great focus!' : b >= 4 ? 'Nicely done' : 'Warm-up done',
        sub: `Longest sequence: ${b}`,
        share: `Echo ${ctx.label} 🔊 ${b} in a row\n${'🟪'.repeat(Math.min(b, 15))}${b > 15 ? '+' : ''}`,
      }, { animate });
    }

    renderTop();
    if (st.finished) { startBtn.remove(); setStatus(`Best today: ${st.best}`); end(false); }
    else setStatus(st.best ? 'Pick up where you left off' : 'Watch the pads, then repeat them', '');

    return {
      onKey(k) {
        if (k in KEYMAP) press(KEYMAP[k]);
        else if (k === 'Enter' && startBtn.isConnected) startBtn.click();
      },
      destroy() { alive = false; },
    };
  }

  WH.register({
    id: 'echo', name: 'Echo', area: 'Memory', statType: 'best',
    tagline: 'Watch the pattern of lights, then play it back.',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true">' + Array.from({ length: 9 }, (_, i) => `<rect x="${2 + (i % 3) * 7.2}" y="${2 + Math.floor(i / 3) * 7.2}" width="5.6" height="5.6" rx="1.6" fill="currentColor" opacity="${[1, .35, .35, .35, 1, .35, .35, .35, 1][i]}"/>`).join('') + '</svg>',
    howTo: `<p>The pads light up in a sequence. When it's <b>your turn</b>, tap them back in the same order.</p>
      <p>Each round adds <b>one more</b> step. A wrong tap costs a heart and replays the round. You have <b>3 hearts</b>.</p>
      <p>Keyboard: number pad <b>7 8 9 / 4 5 6 / 1 2 3</b> matches the grid. Turn sound on: each pad plays its own note.</p>
      <p>Reach <b>7 in a row</b> for a great score.</p>`,
    mount,
  });
})();
