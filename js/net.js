// Online layer: username accounts, ranked leaderboards, weekly XP board and friends.
// Talks to the Cloudflare Worker in /worker. Everything degrades gracefully offline:
// the app keeps working locally and syncs the next time a request succeeds.
(function () {
  // On well-played.win the API is same-origin (/api), which avoids DNS and CORS failures.
  // Elsewhere (GitHub mirror, local dev) use the dedicated API hostname.
  const API = /(^|\.)well-played\.win$/.test(location.hostname) ? '/api' : 'https://api.well-played.win';
  const store = WH.store;
  const acct = () => store.data.account || null;
  const weekStart = (day) => day - ((WH.dateFromDay(day).getDay() + 6) % 7);

  async function call(path, { method = 'GET', body, authed = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const a = acct();
    if (authed) {
      if (!a) throw Object.assign(new Error('Not signed in'), { status: 401 });
      headers.Authorization = `Bearer ${a.id}.${a.token}`;
    }
    let res;
    try {
      res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      // Safari says "Load failed", Chrome "Failed to fetch": both mean the request never arrived.
      throw Object.assign(new Error('Couldn’t reach the Well Played server. Check your connection and try again.'), { status: 0, network: true });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
    return data;
  }

  // Ranked results made while offline (or before signing up) are queued and sent later.
  function queue() { return (store.data.netQueue = store.data.netQueue || []); }
  async function flush() {
    if (!acct()) return;
    const q = queue();
    while (q.length) {
      const item = q[0];
      if (item.day < WH.today() - 1) { q.shift(); continue; } // server only accepts ±1 day
      try { await call('/ranked', { method: 'POST', body: item }); q.shift(); store.save(); }
      catch (e) { if (e.status && e.status < 500) { q.shift(); store.save(); continue; } break; }
    }
  }

  // ---------- Cross-device progress (game data only; Mind Check-in never leaves the device) ----------
  const SYNC_KEYS = ['results', 'stats', 'log', 'streak', 'xp', 'ranked', 'bests', 'profile', 'seen'];
  function snapshot() {
    const d = store.data, out = {};
    for (const k of SYNC_KEYS) if (d[k] !== undefined) out[k] = d[k];
    if (Array.isArray(out.log)) out.log = out.log.slice(-600);
    return JSON.parse(JSON.stringify(out));
  }
  const uniq = (a = [], b = []) => [...new Set([...a, ...b])].sort((x, y) => x - y);
  // Merge another device's progress into this one without losing anything from either.
  function merge(L, R) {
    if (!R) return;
    L.results = L.results || {};
    for (const [day, games] of Object.entries(R.results || {})) L.results[day] = Object.assign({}, games, L.results[day] || {});
    L.stats = L.stats || {};
    for (const [id, rs] of Object.entries(R.stats || {})) {
      const ls = L.stats[id];
      if (!ls || (rs.played || 0) > (ls.played || 0)) {
        const dist = Object.assign({}, rs.dist);
        if (ls) for (const [k, v] of Object.entries(ls.dist || {})) dist[k] = Math.max(dist[k] || 0, v);
        L.stats[id] = Object.assign({}, rs, { dist, best: Math.max(rs.best || 0, (ls && ls.best) || 0), maxStreak: Math.max(rs.maxStreak || 0, (ls && ls.maxStreak) || 0) });
      } else {
        ls.best = Math.max(ls.best || 0, rs.best || 0);
        ls.maxStreak = Math.max(ls.maxStreak || 0, rs.maxStreak || 0);
      }
    }
    const key = (e) => `${e.d}|${e.g}|${e.p}|${e.r}|${e.w}|${e.a}`;
    const seenLog = new Set((L.log || []).map(key));
    L.log = [...(L.log || []), ...(R.log || []).filter((e) => !seenLog.has(key(e)))].sort((a, b) => a.d - b.d).slice(-3000);
    if (R.streak) {
      const ls = L.streak = L.streak || { days: [], rest: [], frozen: [], freezes: 1, longest: 0, notices: [] };
      ls.days = uniq(ls.days, R.streak.days);
      ls.rest = uniq(ls.rest, R.streak.rest);
      ls.frozen = uniq(ls.frozen, R.streak.frozen);
      // A day that was played is never also a rest/freeze day.
      ls.rest = ls.rest.filter((d) => !ls.days.includes(d));
      ls.frozen = ls.frozen.filter((d) => !ls.days.includes(d));
      ls.freezes = Math.max(ls.freezes || 0, R.streak.freezes || 0);
      ls.longest = Math.max(ls.longest || 0, R.streak.longest || 0);
      ls.lastRepair = Math.max(ls.lastRepair ?? -999, R.streak.lastRepair ?? -999);
    }
    if (R.xp) {
      const lx = L.xp = L.xp || { total: 0, byDay: {} };
      for (const [day, v] of Object.entries(R.xp.byDay || {})) lx.byDay[day] = Math.max(lx.byDay[day] || 0, v);
      lx.total = Math.max(lx.total || 0, R.xp.total || 0, Object.values(lx.byDay).reduce((t, v) => t + v, 0));
    }
    L.ranked = L.ranked || {};
    for (const [day, games] of Object.entries(R.ranked || {})) {
      L.ranked[day] = L.ranked[day] || {};
      for (const [g, r] of Object.entries(games)) { const l = L.ranked[day][g]; if (!l || (!l.won && r.won)) L.ranked[day][g] = r; }
    }
    L.bests = L.bests || {};
    for (const [g, b] of Object.entries(R.bests || {})) if (!L.bests[g] || b.time < L.bests[g].time) L.bests[g] = b;
    if (R.profile) {
      const lp = L.profile = L.profile || {};
      if ((R.profile.updated || 0) > (lp.updated || 0)) for (const k of ['species', 'color', 'frame', 'title', 'updated']) if (R.profile[k] !== undefined) lp[k] = R.profile[k];
      lp.earned = Object.assign({}, R.profile.earned || {}, lp.earned || {});
      lp.serverAch = [...new Set([...(lp.serverAch || []), ...(R.profile.serverAch || [])])];
    }
    L.seen = Object.assign({}, R.seen || {}, L.seen || {});
  }
  let pushTimer = null;
  async function pushState() {
    if (!acct()) return;
    const rev = Date.now();
    await call('/state', { method: 'PUT', body: { blob: snapshot(), rev } });
    store.data.syncRev = rev; store.save();
  }
  async function pullState() {
    if (!acct()) return false;
    const r = await call('/state');
    if (r.blob && r.rev > (store.data.syncRev || 0)) {
      merge(store.data, r.blob);
      store.data.syncRev = r.rev; store.save();
      return true;
    }
    return false;
  }

  const net = {
    get enabled() { return !!acct(); },
    configured: true,
    account: acct,

    async register(username) {
      const a = await call('/register', { method: 'POST', body: { username }, authed: false });
      store.data.account = a; store.save();
      // Bring local ranked results from today/yesterday along.
      const d = WH.today();
      for (const day of [d - 1, d]) for (const [game, r] of Object.entries((store.data.ranked || {})[day] || {})) {
        if (r.dnf && !r.won && r.time == null && !r.label) continue;
        queue().push({ day, game, won: !!r.won, timeMs: r.time != null ? Math.round(r.time * 1000) : null, acc: r.acc, score: r.score });
      }
      store.save();
      await net.syncProfile();
      await pushState().catch(() => {});
      return a;
    },
    signOut() { delete store.data.account; delete store.data.syncRev; store.save(); },

    // Recovery code = the account's id + secret. It moves an account to another device or
    // into the installed app (which on iPhone has its own storage, separate from Safari).
    recoveryCode: () => (acct() ? `${acct().id}.${acct().token}` : null),
    async recover(code) {
      const m = /^\s*([a-z0-9]{6,32})\.([A-Za-z0-9]{16,64})\s*$/.exec(code || '');
      if (!m) throw new Error('That doesn’t look like a recovery code.');
      const prev = store.data.account;
      store.data.account = { id: m[1], token: m[2] };
      try {
        const me = await call('/me');
        store.data.account = { id: m[1], token: m[2], username: me.username, friendCode: me.friendCode };
        delete store.data.syncRev;
        store.save();
        await pullState();
        await net.syncProfile();
        await pushState().catch(() => {}); // upload the combined progress right away
        return me;
      } catch (e) {
        store.data.account = prev; store.save();
        throw e.status === 401 ? new Error('That recovery code didn’t match an account.') : e;
      }
    },
    pullState, pushState,
    // Called after each game: back up progress a moment later (batched).
    queueStatePush() {
      if (!acct()) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => pushState().catch(() => {}), 2500);
    },

    async syncProfile() {
      if (!acct()) return;
      const P = WH.progress, day = WH.today();
      await call('/sync', { method: 'POST', body: {
        day, xpToday: (store.data.xp && store.data.xp.byDay[day]) || 0,
        streak: P.current(), longest: P.longest(), daysPlayed: P.daysPlayed(),
      } });
      await flush();
      await net.saveProfile();
    },

    async submitRanked({ game, day, won, time, acc, score }) {
      queue().push({ day, game, won: !!won, timeMs: time != null ? Math.round(time * 1000) : null, acc, score });
      store.save();
      if (!acct()) return null;
      await flush();
      return net.syncProfile().catch(() => {});
    },

    // Sends the chosen look plus earned achievements; the server returns what it could verify
    // (and may swap out any avatar part that isn't actually unlocked).
    async saveProfile() {
      if (!acct() || !WH.profile) return null;
      const pr = WH.profile;
      const r = await call('/profile', { method: 'POST', body: { avatar: pr.spec(), achievements: pr.list().filter((a) => a.earned).map((a) => a.id) } });
      const p = pr.prof();
      const before = new Set(p.serverAch);
      p.serverAch = r.achievements || [];
      store.save();
      // Server-only achievements (podium, friends) can arrive here: celebrate them.
      if (p.serverAch.some((id) => !before.has(id))) pr.announce(pr.check());
      return r;
    },
    getProfile: (name) => call(`/u/${encodeURIComponent(name)}`),
    leaderboard: (game, day = WH.today()) => (acct() ? call(`/leaderboard/ranked?game=${encodeURIComponent(game)}&day=${day}`) : Promise.resolve(null)),
    weekly: (day = WH.today()) => call(`/leaderboard/xp?day=${day}&from=${weekStart(day)}`),
    friends: (day = WH.today()) => call(`/friends?day=${day}&from=${weekStart(day)}`),
    addFriend: (code) => call('/friends/add', { method: 'POST', body: { code } }),
    removeFriend: (id) => call('/friends/remove', { method: 'POST', body: { id } }),
  };

  WH.net = net;
  // Sync quietly on load and whenever the tab comes back into view.
  const sync = async () => {
    if (!acct()) return;
    try {
      const changed = await pullState();
      if (changed && WH.onRemoteProgress) WH.onRemoteProgress();
      await net.syncProfile();
      await pushState();
    } catch (e) { /* offline: try again next time */ }
  };
  sync();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
})();
