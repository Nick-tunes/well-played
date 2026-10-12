// Groups: sort sixteen words into four hidden groups of four (Connections-style).
(function () {
  const { h } = WH;
  const MISTAKES = 4;
  const EMOJI = ['🟨', '🟩', '🟦', '🟪'];

  function generate(rng) {
    const pool = window.WH_GROUPS;
    for (let t = 0; t < 500; t++) {
      const cats = [0, 1, 2, 3].map((lv) => WH.pick(pool.filter((c) => c.level === lv), rng));
      const groups = cats.map((c) => ({ name: c.name, level: c.level, words: WH.shuffle(c.words, rng).slice(0, 4) }));
      // A chosen word must not fit any other chosen category, or the puzzle becomes ambiguous.
      const ok = groups.every((g, i) => g.words.every((w) => cats.every((c, j) => j === i || !c.words.includes(w))));
      if (ok) return groups;
    }
    return null;
  }
  function validGroups(gs) {
    if (!Array.isArray(gs) || gs.length !== 4) return false;
    const all = gs.flatMap((g) => g.words || []);
    return all.length === 16 && new Set(all).size === 16;
  }

  function mount(root, ctx) {
    const groups = (ctx.content && validGroups(ctx.content.groups) ? ctx.content.groups : generate(ctx.rng))
      .map((g, i) => ({ ...g, level: g.level ?? i, words: g.words.map((w) => w.toUpperCase()) }));
    const st = ctx.load() || {
      order: WH.shuffle(groups.flatMap((g) => g.words), ctx.rng), solved: [], guesses: [], mistakes: 0,
    };
    let sel = [], busy = false, done = false;

    const solvedEl = h('div', { class: 'groups-solved' });
    const gridEl = h('div', { class: 'groups-grid' });
    const dots = h('div', { class: 'groups-dots' });
    const submitBtn = h('button', { class: 'btn primary', type: 'button', onclick: submit }, 'Submit');
    const controls = h('div', { class: 'groups-controls' },
      h('button', { class: 'btn ghost', type: 'button', onclick: shuffle, html: `${WH.icons.shuffle}<span>Shuffle</span>` }),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { sel = []; render(); } }, 'Deselect'),
      submitBtn);
    root.append(h('div', { class: 'play-area groups' },
      h('p', { class: 'groups-hint' }, 'Make four groups of four'),
      solvedEl, gridEl, h('div', { class: 'groups-mistakes' }, 'Mistakes left', dots), controls));

    const groupOf = (w) => groups.findIndex((g) => g.words.includes(w));
    const remaining = () => st.order.filter((w) => !st.solved.includes(groupOf(w)));

    function solvedBar(gi, animate) {
      const g = groups[gi];
      return h('div', { class: 'groups-bar lv' + g.level + (animate ? ' enter' : '') },
        h('b', null, g.name), h('span', null, g.words.join(', ')));
    }

    function render(animateIdx) {
      solvedEl.innerHTML = '';
      st.solved.forEach((gi) => solvedEl.append(solvedBar(gi, gi === animateIdx)));
      gridEl.innerHTML = '';
      for (const w of remaining()) {
        const len = w.length;
        gridEl.append(h('button', {
          class: 'groups-tile' + (sel.includes(w) ? ' sel' : '') + (len > 8 ? ' xs' : len > 6 ? ' sm' : ''),
          type: 'button', 'data-w': w, onclick: () => toggle(w),
        }, w));
      }
      dots.innerHTML = '';
      for (let i = 0; i < MISTAKES; i++) dots.append(h('i', { class: i < MISTAKES - st.mistakes ? '' : 'used' }));
      submitBtn.disabled = sel.length !== 4 || busy;
      controls.classList.toggle('hidden', done);
    }

    function toggle(w) {
      if (busy || done) return;
      if (sel.includes(w)) sel = sel.filter((x) => x !== w);
      else if (sel.length < 4) { sel.push(w); WH.sound.tap(); }
      render();
    }
    function shuffle() {
      const rem = WH.shuffle(remaining());
      st.order = [...st.order.filter((w) => !rem.includes(w)), ...rem];
      ctx.save(st); render();
    }

    async function submit() {
      if (sel.length !== 4 || busy || done) return;
      const key = [...sel].sort().join('|');
      if (st.guesses.some((g) => [...g].sort().join('|') === key)) { WH.toast('Already guessed'); return; }
      busy = true;
      const tiles = sel.map((w) => gridEl.querySelector(`[data-w="${CSS.escape(w)}"]`));
      for (const [i, t] of tiles.entries()) { setTimeout(() => t && t.classList.add('hop'), i * 90); }
      await WH.wait(520);
      st.guesses.push([...sel]);
      const counts = groups.map((g) => sel.filter((w) => g.words.includes(w)).length);
      const hit = counts.indexOf(4);
      if (hit >= 0) {
        st.solved.push(hit); sel = []; ctx.save(st);
        WH.sound.good(); busy = false; render(hit);
        if (st.solved.length === 4) { WH.sound.win(); await WH.wait(700); return finish(true); }
      } else {
        st.mistakes++; ctx.save(st);
        if (counts.includes(3)) WH.toast('One away…');
        gridEl.classList.remove('shake'); void gridEl.offsetWidth; gridEl.classList.add('shake');
        tiles.forEach((t) => t && t.classList.remove('hop'));
        WH.sound.error(); WH.vibrate(80);
        busy = false; render();
        if (st.mistakes >= MISTAKES) {
          done = true;
          await WH.wait(600);
          for (const gi of [0, 1, 2, 3].filter((i) => !st.solved.includes(i)).sort((a, b) => groups[a].level - groups[b].level)) {
            st.solved.push(gi); render(gi); await WH.wait(450);
          }
          ctx.save(st);
          await WH.wait(400);
          finish(true);
        }
      }
    }

    function finish(animate) {
      done = true; sel = []; render();
      const won = st.mistakes < MISTAKES;
      const grid = st.guesses.map((g) => g.map((w) => EMOJI[groups[groupOf(w)].level]).join('')).join('\n');
      ctx.complete({
        won, score: won ? st.mistakes : 'X', label: won ? (st.mistakes ? `${st.mistakes} mistake${st.mistakes > 1 ? 's' : ''}` : 'Flawless') : 'X',
        title: won ? ['Perfect!', 'Great!', 'Solid!', 'Phew!'][st.mistakes] : 'Good effort',
        sub: won ? 'All four groups found' : 'The groups are revealed above',
        note: ctx.content && ctx.content.note,
        share: `Groups ${ctx.label}\n${grid}`,
      }, { animate });
    }

    function onKey(k) {
      if (k === 'Enter') submit();
    }

    if (st.solved.length === 4) { done = true; finish(false); } else render();
    return { onKey };
  }

  WH.groupsGen = generate;
  WH.register({
    id: 'groups', name: 'Groups', area: 'Association', statType: 'mistakes',
    tagline: 'Spot the hidden links between sixteen words.',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="5" rx="1.8" fill="currentColor"/><rect x="2" y="9.5" width="9" height="5" rx="1.8" fill="currentColor" opacity=".5"/><rect x="13" y="9.5" width="9" height="5" rx="1.8" fill="currentColor" opacity=".5"/><rect x="2" y="17" width="9" height="5" rx="1.8" fill="currentColor" opacity=".5"/><rect x="13" y="17" width="9" height="5" rx="1.8" fill="currentColor" opacity=".5"/></svg>',
    howTo: `<p>Find <b>four groups of four</b> words that share something in common.</p>
      <p>Select four words and press <b>Submit</b>. You can make <b>4 mistakes</b>. If three of your four are right, you'll see “One away…”.</p>
      <div class="demo-bars"><div class="groups-bar lv0"><b>Easiest</b></div><div class="groups-bar lv1"><b>Medium</b></div><div class="groups-bar lv2"><b>Tricky</b></div><div class="groups-bar lv3"><b>Devious</b></div></div>
      <p>Watch for red herrings: some words seem to fit more than one group.</p>`,
    mount,
  });
})();
