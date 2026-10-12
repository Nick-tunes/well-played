// Player profile: achievements (from local play + server-verified ones), unlockable avatar
// parts, and the avatar editor. Mind Check-in data is deliberately never used here: nothing
// about it may become public.
(function () {
  const { h, store, icons } = WH;
  const C = window.WH_COSMETICS;
  const data = () => store.data;
  const SERVER_ONLY = new Set(['podium', 'friends_3']); // only the server can know these

  function prof() {
    const d = data();
    if (!d.profile) d.profile = Object.assign(WH.avatar.defaults(), { earned: {}, serverAch: [] });
    const p = d.profile;
    p.earned = p.earned || {};
    p.serverAch = p.serverAch || [];
    return p;
  }

  // Current progress toward each achievement, from what's already stored on this device.
  function values() {
    const d = data(), s = d.stats || {}, P = WH.progress;
    const results = Object.values(d.results || {});
    const statDist = (id) => (s[id] && s[id].dist) || {};
    const wins = Object.values(s).reduce((a, x) => a + (x.wins || 0), 0);
    const genius = ['word', 'sums'].some((id) => (statDist(id)[1] || 0) + (statDist(id)[2] || 0) > 0);
    const rankedWon = Object.values(d.ranked || {}).some((day) => Object.values(day).some((r) => r && r.won));
    const server = new Set(prof().serverAch);
    return {
      first_win: Math.min(1, wins),
      streak_3: P.longest(), streak_7: P.longest(), streak_30: P.longest(), streak_100: P.longest(),
      days_10: P.daysPlayed(), days_50: P.daysPlayed(), days_100: P.daysPlayed(),
      xp_1000: (d.xp && d.xp.total) || 0,
      genius: genius ? 1 : 0,
      flawless: (statDist('groups')[0] || 0) > 0 ? 1 : 0,
      echo_10: (s.echo && s.echo.best) || 0,
      full_workout: Math.max(0, ...results.map((r) => Object.keys(r).length)),
      ranked_first: rankedWon ? 1 : 0,
      podium: server.has('podium') ? 1 : 0,
      friends_3: server.has('friends_3') ? 3 : 0,
    };
  }

  function list() {
    const v = values(), p = prof();
    return C.achievements.map((a) => {
      const value = Math.min(v[a.id] || 0, a.goal);
      const earned = !!p.earned[a.id] || value >= a.goal || p.serverAch.includes(a.id);
      const rewards = ['species', 'colors', 'frames', 'titles'].flatMap((k) => C[k].filter((x) => x.unlock === a.id).map((x) => ({ kind: k, ...x })));
      return { ...a, value, earned, day: p.earned[a.id] || null, rewards, serverOnly: SERVER_ONLY.has(a.id) };
    });
  }
  const earnedSet = () => new Set(list().filter((a) => a.earned).map((a) => a.id));
  const isUnlocked = (item, set = earnedSet()) => !item.unlock || set.has(item.unlock);
  const kindName = { species: 'avatar', colors: 'colour', frames: 'frame', titles: 'title' };

  // Records newly earned achievements and returns them (with their rewards) for celebration.
  function check() {
    const p = prof(), fresh = [];
    for (const a of list()) {
      if (a.earned && !p.earned[a.id]) { p.earned[a.id] = WH.today(); fresh.push(a); }
    }
    if (fresh.length) {
      store.save();
      if (WH.net.enabled) WH.net.syncProfile().catch(() => {});
    }
    return fresh;
  }
  function announce(fresh) {
    fresh.forEach((a, i) => setTimeout(() => {
      const reward = a.rewards.length ? ` · New ${a.rewards.map((r) => `${kindName[r.kind]}: ${r.name}`).join(', ')}` : '';
      WH.toast(`🏆 ${a.name}${reward}`, 3600);
      WH.sound.good();
    }, i * 1400));
  }

  function spec() { const p = prof(); return { species: p.species, color: p.color, frame: p.frame, title: p.title }; }
  const titleName = (id) => (C.titles.find((t) => t.id === id) || C.titles[0]).name;

  // Avatar editor: live preview, tabs per part, locked items show what unlocks them.
  function openEditor(onSave) {
    const set = earnedSet();
    const draft = spec();
    const ach = Object.fromEntries(C.achievements.map((a) => [a.id, a]));
    const preview = h('div', { class: 'ed-preview' });
    const titleEl = h('div', { class: 'ed-title' });
    const grid = h('div', { class: 'ed-grid' });
    const tabsEl = h('div', { class: 'seg ed-tabs' });
    const TABS = [['species', 'Characters'], ['colors', 'Colours'], ['frames', 'Frames'], ['titles', 'Titles']];
    const field = { species: 'species', colors: 'color', frames: 'frame', titles: 'title' };
    let tab = 'species';
    function paint() {
      preview.replaceChildren(WH.avatar.el(draft, 120));
      titleEl.textContent = titleName(draft.title);
      tabsEl.replaceChildren(...TABS.map(([k, label]) => h('button', { type: 'button', class: tab === k ? 'on' : '', onclick: () => { tab = k; paint(); } }, label)));
      grid.className = 'ed-grid ed-' + tab;
      grid.replaceChildren(...C[tab].map((item) => {
        const open = isUnlocked(item, set);
        const chosen = draft[field[tab]] === item.id;
        const look = tab === 'titles' ? h('span', { class: 'ed-title-opt' }, item.name)
          : WH.avatar.el(tab === 'species' ? { ...draft, species: item.id } : tab === 'colors' ? { ...draft, color: item.id } : { ...draft, frame: item.id }, 64);
        return h('button', {
          type: 'button', class: 'ed-opt' + (chosen ? ' chosen' : '') + (open ? '' : ' locked'),
          'aria-label': `${item.name}${open ? '' : ' (locked)'}`, title: open ? item.name : `Locked: ${ach[item.unlock].desc}`,
          onclick: () => {
            if (!open) { WH.toast(`Unlock ${item.name}: ${ach[item.unlock].desc}`, 2600); return; }
            draft[field[tab]] = item.id; WH.sound.tap(); paint();
          },
        }, look, tab === 'titles' ? null : h('small', null, item.name), open ? null : h('span', { class: 'ed-lock', html: lockIcon }));
      }));
    }
    paint();
    WH.modal({
      title: 'Edit your look', wide: true,
      body: h('div', { class: 'editor' },
        h('div', { class: 'ed-head' }, preview, titleEl),
        tabsEl, grid,
        h('button', { class: 'btn primary wide', type: 'button', onclick: () => {
          Object.assign(prof(), draft, { updated: Date.now() }); store.save();
          if (WH.net.queueStatePush) WH.net.queueStatePush();
          if (WH.net.enabled) WH.net.syncProfile().catch(() => {});
          WH.closeModal(); WH.toast('Looking good!'); onSave && onSave();
        } }, 'Save')),
    });
  }
  const lockIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  WH.profile = { prof, spec, list, check, announce, openEditor, titleName, isUnlocked, earnedSet, kindName };
})();
