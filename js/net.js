// Online layer: username accounts, ranked leaderboards, weekly XP board and friends.
// Talks to the Cloudflare Worker in /worker. Everything degrades gracefully offline:
// the app keeps working locally and syncs the next time a request succeeds.
(function () {
  const API = 'https://api.well-played.win';
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
    const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
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
      return a;
    },
    signOut() { delete store.data.account; store.save(); },

    async syncProfile() {
      if (!acct()) return;
      const P = WH.progress, day = WH.today();
      await call('/sync', { method: 'POST', body: {
        day, xpToday: (store.data.xp && store.data.xp.byDay[day]) || 0,
        streak: P.current(), longest: P.longest(), daysPlayed: P.daysPlayed(),
      } });
      await flush();
    },

    async submitRanked({ game, day, won, time, acc, score }) {
      queue().push({ day, game, won: !!won, timeMs: time != null ? Math.round(time * 1000) : null, acc, score });
      store.save();
      if (!acct()) return null;
      await flush();
      return net.syncProfile().catch(() => {});
    },

    leaderboard: (game, day = WH.today()) => (acct() ? call(`/leaderboard/ranked?game=${encodeURIComponent(game)}&day=${day}`) : Promise.resolve(null)),
    weekly: (day = WH.today()) => call(`/leaderboard/xp?day=${day}&from=${weekStart(day)}`),
    friends: (day = WH.today()) => call(`/friends?day=${day}&from=${weekStart(day)}`),
    addFriend: (code) => call('/friends/add', { method: 'POST', body: { code } }),
    removeFriend: (id) => call('/friends/remove', { method: 'POST', body: { id } }),
  };

  WH.net = net;
  // Sync quietly on load and whenever the tab comes back into view.
  const sync = () => { if (acct()) net.syncProfile().catch(() => {}); };
  sync();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
})();
