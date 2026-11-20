// Memeory games, ported from the standalone Memeory project:
//   Deep Cuts: name a meme that fits each prompt; more niche answers score more.
//   Timeline:  put five memes in the order they went viral.
// Data comes from js/data/memes.js (built by scripts/build-memes.mjs from content/memes/).
(function () {
  const { h } = WH;

  // ---------- Data ----------
  let MEMES = null, BY_ID = null;
  function memes() {
    if (!MEMES) {
      MEMES = (window.WH_MEMES || []).map(([id, name, aliases, year, platform, source, star, type, tags, niche, fact]) =>
        ({ id, name, aliases, year, platform, source, star, type, tags, niche, fact }));
      BY_ID = new Map(MEMES.map((m) => [m.id, m]));
    }
    return MEMES;
  }
  const byId = (id) => { memes(); return BY_ID.get(id); };

  // ---------- Rules ----------
  const NICHE = {
    1: { name: 'Mainstream', score: 10 },
    2: { name: 'Well known', score: 30 },
    3: { name: 'Known online', score: 60 },
    4: { name: 'Niche', score: 85 },
    5: { name: 'Deep cut', score: 100 },
  };
  const PROMPTS = 5;

  function fits(m, where) {
    for (const [k, v] of Object.entries(where)) {
      if (k === 'tag') { if (!(m.tags || []).includes(v)) return false; }
      else if (k === 'year') { if (m.year !== v) return false; }
      else if (k === 'yearFrom') { if (m.year < v) return false; }
      else if (k === 'yearTo') { if (m.year > v) return false; }
      else if (m[k] !== v) return false;
    }
    return true;
  }

  const PHRASE = {
    platform: (v) => (v === 'Forums' ? 'that took off on a forum or website' : `that took off on ${v}`),
    source: (v) => ({
      Photo: 'that started as a photo', 'Stock photo': 'that started as a stock photo', TV: 'from a TV show', Film: 'from a movie',
      Music: 'from a song or music video', News: 'from a news clip', 'Video game': 'from a video game', Sports: 'from sports',
      'Home video': 'from a home video', 'Social post': 'that started as a post', Comic: 'from a comic or cartoon', Other: 'from somewhere odd',
    }[v]),
    star: (v) => ({
      Animal: 'starring an animal', Person: 'starring a real person', Kid: 'starring a kid', Group: 'starring a group of people',
      Character: 'starring a character', Object: 'starring an object', Text: 'that is just words',
    }[v]),
    type: (v) => ({
      'Image macro': 'that is an image macro', 'Reaction image': 'people post as a reaction', Template: 'that is an edit template',
      Video: 'that is a video', Phrase: 'that is a phrase or saying', Song: 'that is a song or sound', Dance: 'that is a dance or challenge', Prank: 'that is a prank',
    }[v]),
    tag: (v) => ({
      cat: 'about a cat', dog: 'about a dog', animal: 'about an animal', food: 'about food', dance: 'about dancing', music: 'about music',
      sports: 'about sports', gaming: 'about video games', 'tv-film': 'about TV or movies', cartoon: 'about a cartoon', anime: 'about anime',
      celebrity: 'about a celebrity', kid: 'about a kid', school: 'about school', work: 'about work', money: 'about money',
      catchphrase: 'built on a catchphrase', sound: 'built on a sound', challenge: 'that is a challenge', fail: 'about a fail',
      wholesome: 'that is wholesome', creepy: 'that is creepy', ai: 'about AI', space: 'about space', vehicle: 'about a vehicle',
      holiday: 'about a holiday', history: 'about history', fashion: 'about fashion', science: 'about science', copypasta: 'that is a copypasta',
    }[v]),
  };
  function promptText(p) {
    if (p.text) return p.text;
    const w = p.where;
    const parts = ['platform', 'source', 'star', 'type', 'tag'].filter((k) => w[k] != null).map((k) => PHRASE[k](w[k]));
    if (w.year != null) parts.push(`from ${w.year}`);
    else if (w.yearFrom != null && w.yearTo != null) parts.push(`from ${w.yearFrom} to ${w.yearTo}`);
    else if (w.yearFrom != null) parts.push(`from ${w.yearFrom} or later`);
    else if (w.yearTo != null) parts.push(`from ${w.yearTo} or earlier`);
    return `Name a meme ${parts.join(' ')}`;
  }

  // Plain words for why a meme failed a prompt, e.g. "Doge isn't about music."
  const SAY = {
    platform: (m) => `took off on ${m.platform === 'Forums' ? 'a forum or website' : m.platform === 'Other' ? 'TV, email or offline' : m.platform}`,
    source: (m) => ({ Photo: 'started as a photo', 'Stock photo': 'started as a stock photo', TV: 'is from TV', Film: 'is from a movie', Music: 'is from a song', News: 'is from the news', 'Video game': 'is from a video game', Sports: 'is from sports', 'Home video': 'is from a home video', 'Social post': 'started as a post', Comic: 'is from a comic or cartoon', Other: 'came from somewhere else' }[m.source]),
    star: (m) => ({ Animal: 'stars an animal', Person: 'stars a real person', Kid: 'stars a kid', Group: 'stars a group', Character: 'stars a character', Object: 'stars an object', Text: 'is just words' }[m.star]),
    type: (m) => ({ 'Image macro': 'is an image macro', 'Reaction image': 'is a reaction image', Template: 'is a template', Video: 'is a video', Phrase: 'is a phrase', Song: 'is a song or sound', Dance: 'is a dance', Prank: 'is a prank' }[m.type]),
  };
  function whyNot(m, where) {
    const parts = [];
    for (const k of ['platform', 'source', 'star', 'type']) if (where[k] != null && m[k] !== where[k]) parts.push(SAY[k](m));
    if (where.tag != null && !(m.tags || []).includes(where.tag)) parts.push(`isn't ${PHRASE.tag(where.tag).replace(/^that is /, '')}`);
    const yr = (where.year != null && m.year !== where.year) || (where.yearFrom != null && m.year < where.yearFrom) || (where.yearTo != null && m.year > where.yearTo);
    if (yr) parts.unshift(`is from ${m.year}`);
    return `${m.name} ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]}.`;
  }

  // Score one answer. id null = skipped.
  function scoreAnswer(prompt, id, seed) {
    const pool = memes().filter((m) => fits(m, prompt.where));
    const deeper = WH.shuffle(pool.filter((m) => m.id !== id && m.niche >= 4), WH.rng(seed)).slice(0, 3).map((m) => m.name);
    const row = { prompt: promptText(prompt), options: pool.length, deeper };
    if (id == null) return { ...row, skipped: true, tier: 0, score: 0 };
    const m = byId(id);
    if (!m) return { ...row, skipped: true, tier: 0, score: 0 };
    const ok = fits(m, prompt.where);
    return {
      ...row, id, name: m.name, fits: ok, tier: ok ? m.niche : 0,
      tierName: ok ? NICHE[m.niche].name : null, score: ok ? NICHE[m.niche].score : 0,
      why: ok ? null : whyNot(m, prompt.where), fact: m.fact,
    };
  }

  // ---------- Puzzles: curated day, or generated from the prompt pool ----------
  function genDeep(rng) {
    const pool = window.WH_MEME_PROMPTS || {};
    const out = [];
    for (const kind of WH.shuffle(['platform', 'era', 'tag', 'kind', 'combo'], rng)) {
      const opts = WH.shuffle(pool[kind] || [], rng);
      const pick = opts.find((w) => !out.some((p) => promptText(p) === promptText({ where: w })));
      if (pick) out.push({ where: pick });
    }
    return out.slice(0, PROMPTS);
  }
  // One meme from each era, five different years, mostly recognisable, nothing under a year old.
  function genTimeline(rng) {
    const newest = new Date().getFullYear() - 1;
    const buckets = [[2000, 2007], [2008, 2012], [2013, 2017], [2018, 2021], [2022, newest]];
    const caps = WH.shuffle([2, 2, 3, 3, 4], rng);
    const years = new Set(), out = [];
    buckets.forEach(([a, b], i) => {
      const cand = memes().filter((m) => m.year >= a && m.year <= b && m.niche <= caps[i] && !years.has(m.year));
      const m = WH.pick(cand, rng);
      if (m) { out.push(m.id); years.add(m.year); }
    });
    return out;
  }
  function dayFor(ctx) {
    const curated = ctx.mode === 'daily' ? (window.WH_MEME_DAYS || {})[WH.dateKey(WH.dateFromDay(ctx.day))] : null;
    return curated || null;
  }

  // ---------- Shared search box (start-of-name matching only) ----------
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  // Suggestions only match the START of a name or alias, from 3 letters on, so players can't
  // browse the list for deep cuts by typing a common word like "cat".
  function search(q, exclude) {
    const k = norm(q);
    if (k.length < 3) return [];
    const out = [];
    for (const m of memes()) {
      if (exclude.has(m.id)) continue;
      let best = 99, via = null;
      [m.name, ...m.aliases].forEach((n, i) => {
        const nn = norm(n);
        const s = nn === k ? 0 : nn.startsWith(k) || nn.replace(/^(the|a) /, '').startsWith(k) ? 1 : 99;
        if (s < best) { best = s; via = i ? n : null; }
      });
      if (best < 99) out.push({ m, best, via });
    }
    return out.sort((a, b) => a.best - b.best || a.m.name.length - b.m.name.length).slice(0, 5);
  }

  // ---------- Deep Cuts ----------
  const TIER_EMOJI = ['🟥', '⬜', '🟦', '🟩', '🟨', '🟧'];
  function rankTitle(score) {
    const t = ['Normie', 'Scroller', 'Lurker', 'Archivist', 'Meme historian'];
    return t[Math.min(t.length - 1, Math.floor((score / (PROMPTS * 100)) * t.length))];
  }

  function mountDeep(root, ctx) {
    const day = dayFor(ctx);
    const prompts = (day && day.deep && day.deep.length === PROMPTS ? day.deep : null) || genDeep(ctx.rng);
    const st = ctx.load() || { answers: [] };
    let done = false, matches = [], active = 0;
    const rows = () => st.answers.map((id, i) => scoreAnswer(prompts[i], id, `${ctx.label}:${i}`));
    const total = () => rows().reduce((a, r) => a + r.score, 0);

    const scoreEl = h('div', { class: 'dc-score' });
    const askEl = h('div', { class: 'dc-ask' });
    const listEl = h('ol', { class: 'dc-list' });
    const input = h('input', { class: 'dc-input', type: 'text', placeholder: 'Type a meme…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go', 'aria-label': 'Your answer',
      oninput: suggest,
      onkeydown: (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); }
        if (e.key === 'Escape') { matches = []; drawList(); }
      },
      onblur: () => setTimeout(() => { matches = []; drawList(); }, 150) });
    const sugg = h('div', { class: 'dc-suggest', role: 'listbox' });
    const note = h('p', { class: 'dc-note', role: 'status' });
    const goBtn = h('button', { class: 'btn primary', type: 'button', onclick: submitTyped }, 'Go');
    const skipBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => answer(null) }, 'Skip');
    const controls = h('div', { class: 'dc-controls' },
      h('div', { class: 'dc-search' }, sugg, input), h('div', { class: 'dc-buttons' }, skipBtn, goBtn), note);
    root.append(h('div', { class: 'play-area deep' },
      h('p', { class: 'dc-lead' }, 'Name a meme that fits. The more niche, the more it scores. One shot each.'),
      scoreEl, askEl, controls, listEl));

    function suggest() {
      note.textContent = '';
      matches = search(input.value, new Set(st.answers.filter(Boolean)));
      active = 0; drawList();
    }
    function drawList() {
      sugg.innerHTML = '';
      matches.forEach((r, i) => sugg.append(h('button', { type: 'button', class: 'dc-opt' + (i === active ? ' active' : ''), role: 'option',
        onmousedown: (e) => { e.preventDefault(); answer(r.m.id); } }, h('b', null, r.m.name), r.via ? h('span', null, r.via) : null)));
    }
    function move(d) { if (!matches.length) return; active = (active + d + matches.length) % matches.length; drawList(); }
    function submitTyped() {
      if (matches.length) return answer(matches[active].m.id);
      const q = input.value.trim();
      if (!q) { WH.toast('Type a meme, or skip'); return; }
      note.textContent = norm(q).length < 3 ? 'Type at least 3 letters.' : "That one isn't in the meme vault. Try another.";
    }

    function answer(id) {
      if (done) return;
      st.answers.push(id); ctx.save(st);
      input.value = ''; matches = []; drawList(); note.textContent = '';
      const r = rows().at(-1);
      if (r.skipped) WH.sound.soft();
      else if (!r.fits) { WH.sound.error(); WH.vibrate(80); }
      else if (r.tier >= 4) WH.sound.win(); else WH.sound.good();
      render(true);
      if (st.answers.length >= prompts.length) { input.blur(); WH.wait(700).then(() => finish(true)); }
      else if (matchMedia('(pointer: fine)').matches) input.focus();
    }

    function card(r, i, fresh) {
      const cls = r.skipped ? 'skip' : r.fits ? `t${r.tier}` : 'bad';
      return h('li', { class: `dc-card ${cls}${fresh ? ' enter' : ''}` },
        h('p', { class: 'dc-q' }, h('span', { class: 'n' }, i + 1), r.prompt),
        h('div', { class: 'dc-a' },
          h('b', null, r.skipped ? 'Skipped' : r.name),
          h('span', { class: 'pts' }, r.skipped ? '+0' : r.fits ? `${r.tierName} +${r.score}` : "Doesn't fit +0")),
        r.why ? h('p', { class: 'dc-why' }, r.why) : null,
        r.fits && r.fact ? h('p', { class: 'dc-fact' }, r.fact) : null,
        h('p', { class: 'dc-more' }, `${r.options} memes fit.`, r.deeper.length ? ` Deeper cuts: ${r.deeper.join(', ')}.` : ''));
    }

    function render(fresh) {
      const rs = rows();
      scoreEl.innerHTML = '';
      scoreEl.append(h('span', null, 'Score'), h('b', null, total()), h('span', null, `/ ${prompts.length * 100}`),
        h('span', { class: 'dc-pips' }, prompts.map((_, i) => h('i', { class: rs[i] ? `t${rs[i].tier}` : i === rs.length ? 'now' : '' }))));
      const i = st.answers.length;
      askEl.innerHTML = '';
      if (!done && i < prompts.length) askEl.append(h('p', { class: 'dc-prompt' }, h('span', { class: 'n' }, `${i + 1}/${prompts.length}`), promptText(prompts[i])));
      listEl.innerHTML = '';
      rs.map((r, j) => card(r, j, fresh && j === rs.length - 1)).reverse().forEach((c) => listEl.append(c));
      controls.classList.toggle('hidden', done || i >= prompts.length);
    }

    function finish(animate) {
      done = true; render();
      const rs = rows(), score = total();
      const fitCount = rs.filter((r) => r.fits).length;
      const best = rs.filter((r) => r.fits).sort((a, b) => b.tier - a.tier)[0];
      ctx.complete({
        won: fitCount > 0, score, label: `${score}/${prompts.length * 100}`,
        accuracy: rs.length ? fitCount / rs.length : 0,
        title: rankTitle(score),
        sub: best ? `Deepest: ${best.name} (${best.tierName.toLowerCase()})` : 'No answers fit this time',
        note: best && best.fact,
        share: `Deep Cuts ${ctx.label} ${score}/${prompts.length * 100}\n${rs.map((r) => (r.skipped ? '⬛' : TIER_EMOJI[r.tier])).join('')}`,
      }, { animate });
    }

    render();
    if (st.answers.length >= prompts.length) finish(false);
    return { onKey(k) { if (k === 'Enter' && document.activeElement === input) submitTyped(); } };
  }

  // ---------- Timeline ----------
  const TRIES = 3;
  function mountTimeline(root, ctx) {
    const day = dayFor(ctx);
    const ids = (day && day.timeline && day.timeline.memes && day.timeline.memes.every(byId) ? day.timeline.memes : null) || genTimeline(ctx.rng);
    const items = ids.map(byId);
    const answer = [...items].sort((a, b) => a.year - b.year).map((m) => m.id);
    let st = ctx.load();
    if (!st) {
      // Start scrambled, with at most one item already in place.
      let start = null;
      for (let n = 0; n < 50 && !start; n++) {
        const s = WH.shuffle(ids, ctx.rng);
        if (s.filter((id, i) => id === answer[i]).length <= 1) start = s;
      }
      st = { order: start || [...answer].reverse(), attempts: [] };
    }
    let sel = null, shake = new Set(), done = false;
    const marks = () => st.attempts.map((a) => a.map((id, i) => id === answer[i]));
    const solved = () => marks().some((mk) => mk.every(Boolean));

    const listEl = h('ol', { class: 'tl-list' });
    const histEl = h('div', { class: 'tl-hist' });
    const checkBtn = h('button', { class: 'btn primary wide', type: 'button', onclick: check }, 'Check order');
    root.append(h('div', { class: 'play-area timeline' },
      h('p', { class: 'dc-lead' }, 'Oldest at the top. Tap two memes to swap them.'),
      h('p', { class: 'tl-end' }, 'Oldest'), listEl, h('p', { class: 'tl-end' }, 'Newest'), histEl, checkBtn));

    function render() {
      const last = marks().at(-1) || [], lastAtt = st.attempts.at(-1) || [];
      const order = done ? answer : st.order;
      listEl.innerHTML = '';
      order.forEach((id, i) => {
        const m = byId(id);
        const lock = !done && last[i] && lastAtt[i] === st.order[i];
        const right = done && lastAtt[i] === id;
        listEl.append(h('li', null, h('button', {
          type: 'button',
          class: 'tl-item' + (lock || right ? ' lock' : '') + (sel === i ? ' sel' : '') + (shake.has(id) ? ' wrong' : ''),
          disabled: lock || done ? true : null, 'aria-pressed': sel === i ? 'true' : 'false',
          onclick: () => {
            if (sel === null) sel = i;
            else if (sel === i) sel = null;
            else { [st.order[sel], st.order[i]] = [st.order[i], st.order[sel]]; sel = null; ctx.save(st); WH.sound.tap(); }
            shake = new Set(); render();
          },
        }, h('span', { class: 'n' }, i + 1), h('span', { class: 'nm' }, m.name), done ? h('span', { class: 'yr' }, m.year) : null)));
      });
      histEl.innerHTML = '';
      marks().forEach((mk) => histEl.append(h('span', null, mk.map((ok) => h('i', { class: ok ? 'ok' : '' })))));
      for (let i = st.attempts.length; i < TRIES; i++) histEl.append(h('span', { class: 'empty' }, [0, 1, 2, 3, 4].map(() => h('i'))));
      checkBtn.classList.toggle('hidden', done);
    }

    async function check() {
      if (done) return;
      st.attempts.push([...st.order]); sel = null; ctx.save(st);
      const mk = marks().at(-1);
      if (mk.every(Boolean)) { WH.sound.win(); done = true; render(); await WH.wait(500); return finish(true); }
      shake = new Set(st.order.filter((_, i) => !mk[i]));
      WH.sound.error(); WH.vibrate(80);
      if (st.attempts.length >= TRIES) { done = true; render(); await WH.wait(700); return finish(true); }
      render();
      WH.toast(`${mk.filter(Boolean).length} of 5 in place`);
    }

    function finish(animate) {
      done = true; render();
      const won = solved(), n = st.attempts.length;
      ctx.complete({
        won, score: won ? n : 'X', label: won ? `${n}/${TRIES}` : 'X',
        accuracy: marks().flat().filter(Boolean).length / Math.max(1, marks().flat().length),
        title: won ? ['Time lord!', 'Nicely sorted', 'Just made it'][n - 1] : 'Good effort',
        sub: answer.map((id) => `${byId(id).year} ${byId(id).name}`).join(' · '),
        note: byId(answer[0]).fact,
        share: `Timeline ${ctx.label} ${won ? n : 'X'}/${TRIES}\n${marks().map((mk) => mk.map((ok) => (ok ? '🟩' : '⬜')).join('')).join('\n')}`,
      }, { animate });
    }

    if (solved() || st.attempts.length >= TRIES) finish(false); else render();
    return { onKey(k) { if (k === 'Enter' && !done) check(); } };
  }

  // Pixel icons (8-bit style, drawn on a 12x12 grid).
  const px = (cells, color = 'currentColor') => `<svg viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">${cells.map(([x, y, w = 1, hh = 1, o]) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${color}"${o ? ` opacity="${o}"` : ''}/>`).join('')}</svg>`;
  // A cut gem: wide crown on top, tapering to a point.
  const DEEP_ICON = px([[3, 2, 6, 1], [2, 3, 8, 1], [1, 4, 10, 1], [1, 5, 10, 1, .6], [2, 6, 8, 1, .6], [3, 7, 6, 1, .6], [4, 8, 4, 1, .6], [5, 9, 2, 1, .6], [4, 3, 1, 1, .35], [7, 3, 1, 1, .35]]);
  const TL_ICON = px([[1, 9, 2, 2], [4, 7, 2, 4], [7, 5, 2, 6], [10, 2, 1, 9, .6], [1, 11, 10, 1, .4]]);

  WH.memes = { fits, promptText, whyNot, scoreAnswer, genDeep, genTimeline, memes, byId, NICHE };
  WH.register({
    id: 'deep', name: 'Deep Cuts', area: 'Culture', statType: 'best',
    tagline: 'Name the most niche meme that fits.',
    icon: DEEP_ICON,
    howTo: `<p>Five prompts, like <b>“a meme that took off on Vine”</b>. Name any meme that fits.</p>
      <p>The more niche your answer, the more it scores: mainstream <b>10</b>, well known <b>30</b>, known online <b>60</b>, niche <b>85</b>, deep cut <b>100</b>.</p>
      <p>A meme that doesn't fit scores 0, and you'll see why. You get <b>one shot</b> per prompt, or skip it.</p>`,
    mount: mountDeep,
  });
  WH.register({
    id: 'timeline', name: 'Timeline', area: 'Culture', statType: 'guesses', maxGuesses: TRIES,
    tagline: 'Sort five memes by the year they went viral.',
    icon: TL_ICON,
    howTo: `<p>Put the five memes in the order they <b>went viral</b>, oldest at the top.</p>
      <p>Tap two to swap them, then <b>Check order</b>. Memes in the right spot turn green and lock. You get <b>3 tries</b>.</p>`,
    mount: mountTimeline,
  });
})();
