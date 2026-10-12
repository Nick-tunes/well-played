// Well Played API: username accounts, ranked leaderboards, XP boards and friend streaks.
// Runs on Cloudflare Workers with a D1 (SQLite) database bound as env.DB.
//
// Auth: POST /register returns { id, token }. The client sends `Authorization: Bearer <id>.<token>`.
// Only a SHA-256 hash of the token is stored.
//
// Days are the client's local "day number" (day 1 = 2026-01-01). The server only accepts days
// within ±1 of its own UTC day so nobody can post results for the past or future.

import COSMETICS from '../../shared/cosmetics.json';

const GAMES = new Set(['word', 'duet', 'quad', 'sums', 'code', 'ladder', 'swap', 'hue', 'tune', 'echo', 'groups']);
const MIN_TIME_MS = 1500;               // faster than this isn't humanly possible for any game
const MAX_TIME_MS = 60 * 60 * 1000;
const MAX_XP_PER_DAY = 400;
const EPOCH = Date.UTC(2026, 0, 1);
const BLOCKED = /(fuck|shit|cunt|nigg|fag|bitch|rape|nazi|hitler|porn|sex|dick|cock|pussy|whore|slut)/i;

const serverDay = () => Math.floor((Date.now() - EPOCH) / 864e5) + 1;

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(req, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (e) {
      const status = e.status || 500;
      return json({ error: status === 500 ? 'Server error' : e.message }, status, cors);
    }
  },
};

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
function fail(status, message) { const e = new Error(message); e.status = status; throw e; }
async function body(req) { try { return await req.json(); } catch { fail(400, 'Invalid JSON'); } }

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomString(len, alphabet) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

async function auth(req, env) {
  const m = /^Bearer ([\w-]+)\.([\w-]+)$/.exec(req.headers.get('Authorization') || '');
  if (!m) fail(401, 'Not signed in');
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(m[1]).first();
  if (!user || user.token_hash !== (await sha256(m[2]))) fail(401, 'Not signed in');
  return user;
}

function checkDay(day) {
  const d = Number(day), s = serverDay();
  if (!Number.isInteger(d) || d < s - 1 || d > s + 1) fail(400, 'Day out of range');
  return d;
}

const parseAvatar = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const publicUser = (u) => ({ id: u.id, username: u.username, friendCode: u.friend_code, streak: u.streak, longest: u.longest, daysPlayed: u.days_played, xpTotal: u.xp_total, avatar: parseAvatar(u.avatar), achievements: (u.achievements || '').split(',').filter(Boolean) });

// ---- Profiles: achievements are re-checked here wherever the server has the data ----
const ACH_IDS = new Set(COSMETICS.achievements.map((a) => a.id));
const CLIENT_ONLY = new Set(['first_win', 'genius', 'flawless', 'echo_10', 'full_workout']); // cosmetic; trusted
const PODIUM_MIN_FINISHERS = 5; // a "top 3" needs a real field
async function verifyAchievements(db, u, claimed) {
  const out = new Set();
  for (const id of claimed) if (CLIENT_ONLY.has(id)) out.add(id);
  for (const n of [3, 7, 30, 100]) if (u.longest >= n) out.add(`streak_${n}`);
  for (const n of [10, 50, 100]) if (u.days_played >= n) out.add(`days_${n}`);
  if (u.xp_total >= 1000) out.add('xp_1000');
  if (await db.prepare('SELECT 1 FROM ranked WHERE user_id = ? AND won = 1 LIMIT 1').bind(u.id).first()) out.add('ranked_first');
  const podium = await db.prepare(`SELECT 1 FROM ranked r WHERE r.user_id = ? AND r.won = 1 AND r.game != 'echo'
      AND (SELECT COUNT(*) FROM ranked t WHERE t.game = r.game AND t.day = r.day AND t.won = 1) >= ?
      AND (SELECT COUNT(*) FROM ranked b WHERE b.game = r.game AND b.day = r.day AND b.won = 1
           AND (b.time_ms < r.time_ms OR (b.time_ms = r.time_ms AND COALESCE(b.acc, 0) > COALESCE(r.acc, 0)))) < 3 LIMIT 1`)
    .bind(u.id, PODIUM_MIN_FINISHERS).first();
  if (podium) out.add('podium');
  const fc = await db.prepare('SELECT COUNT(*) AS n FROM friends WHERE a = ?').bind(u.id).first();
  if (fc.n >= 3) out.add('friends_3');
  return [...out].filter((id) => ACH_IDS.has(id));
}
// Keep only avatar parts that exist and are unlocked; anything else falls back to the free default.
function cleanAvatar(av, earned) {
  const pick = (list, id) => {
    const item = list.find((x) => x.id === id);
    return item && (!item.unlock || earned.includes(item.unlock)) ? item.id : list[0].id;
  };
  av = av || {};
  return { species: pick(COSMETICS.species, av.species), color: pick(COSMETICS.colors, av.color), frame: pick(COSMETICS.frames, av.frame), title: pick(COSMETICS.titles, av.title) };
}

async function route(req, env) {
  const url = new URL(req.url);
  // Served both at api.well-played.win/<path> and well-played.win/api/<path>.
  const p = url.pathname.replace(/^\/api(?=\/|$)/, '').replace(/\/+$/, '') || '/';
  const db = env.DB;

  if (p === '/' && req.method === 'GET') return json({ ok: true, service: 'well-played', day: serverDay() });

  // ---- Accounts ----
  if (p === '/register' && req.method === 'POST') {
    const { username } = await body(req);
    const name = String(username || '').trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) fail(400, 'Usernames are 3–16 letters, numbers or underscores');
    if (BLOCKED.test(name)) fail(400, 'Please choose a different username');
    const taken = await db.prepare('SELECT 1 FROM users WHERE username = ?').bind(name).first();
    if (taken) fail(409, 'That username is taken');
    const id = randomString(12, 'abcdefghijklmnopqrstuvwxyz0123456789');
    const token = randomString(32, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
    let code;
    for (let i = 0; i < 5; i++) {
      code = randomString(6, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
      if (!(await db.prepare('SELECT 1 FROM users WHERE friend_code = ?').bind(code).first())) break;
    }
    await db.prepare('INSERT INTO users (id, username, token_hash, friend_code, created) VALUES (?, ?, ?, ?, ?)')
      .bind(id, name, await sha256(token), code, Date.now()).run();
    return json({ id, token, username: name, friendCode: code }, 201);
  }

  const me = await auth(req, env);

  if (p === '/me' && req.method === 'GET') return json(publicUser(me));

  // ---- Progress sync (streak + today's XP) ----
  if (p === '/sync' && req.method === 'POST') {
    const b = await body(req);
    const day = checkDay(b.day);
    const clamp = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
    const xpToday = clamp(b.xpToday, MAX_XP_PER_DAY);
    const daysPlayed = clamp(b.daysPlayed, day);
    const streak = clamp(b.streak, daysPlayed);
    const longest = Math.max(streak, clamp(b.longest, daysPlayed));
    await db.batch([
      db.prepare(`INSERT INTO xp_days (user_id, day, xp) VALUES (?, ?, ?)
        ON CONFLICT (user_id, day) DO UPDATE SET xp = MAX(xp, excluded.xp)`).bind(me.id, day, xpToday),
      db.prepare(`UPDATE users SET streak = ?, longest = MAX(longest, ?), days_played = MAX(days_played, ?), last_day = MAX(last_day, ?),
        xp_total = (SELECT COALESCE(SUM(xp), 0) FROM xp_days WHERE user_id = ?) WHERE id = ?`)
        .bind(streak, longest, daysPlayed, day, me.id, me.id),
    ]);
    return json({ ok: true });
  }

  // ---- Profiles ----
  if (p === '/profile' && req.method === 'POST') {
    const b = await body(req);
    const claimed = Array.isArray(b.achievements) ? b.achievements.map(String).slice(0, 64) : [];
    const earned = await verifyAchievements(db, me, claimed);
    const avatar = cleanAvatar(b.avatar, earned);
    await db.prepare('UPDATE users SET avatar = ?, achievements = ? WHERE id = ?').bind(JSON.stringify(avatar), earned.join(','), me.id).run();
    return json({ avatar, achievements: earned });
  }

  const um = /^\/u\/([A-Za-z0-9_]{3,16})$/.exec(p);
  if (um && req.method === 'GET') {
    const u = await db.prepare('SELECT * FROM users WHERE username = ?').bind(um[1]).first();
    if (!u) fail(404, 'No player with that name');
    const day = serverDay();
    const bests = (await db.prepare(`SELECT game, MIN(time_ms) AS time_ms FROM ranked WHERE user_id = ? AND won = 1 AND game != 'echo' GROUP BY game`).bind(u.id).all()).results;
    const isFriend = !!(await db.prepare('SELECT 1 FROM friends WHERE a = ? AND b = ?').bind(me.id, u.id).first());
    return json({
      username: u.username, joined: u.created, avatar: parseAvatar(u.avatar),
      achievements: (u.achievements || '').split(',').filter(Boolean),
      streak: u.last_day >= day - 1 ? u.streak : 0, longest: u.longest, daysPlayed: u.days_played, xpTotal: u.xp_total,
      rankedBests: bests.map((r) => ({ game: r.game, timeMs: r.time_ms })), isFriend, you: u.id === me.id,
    });
  }

  // ---- Ranked ----
  if (p === '/ranked' && req.method === 'POST') {
    const b = await body(req);
    const day = checkDay(b.day);
    if (!GAMES.has(b.game)) fail(400, 'Unknown game');
    const won = b.won ? 1 : 0;
    let time = won ? Math.round(Number(b.timeMs)) : null;
    if (won && !(time >= MIN_TIME_MS && time <= MAX_TIME_MS)) fail(400, 'Time out of range');
    const acc = b.acc == null ? null : Math.max(0, Math.min(1, Number(b.acc)));
    const score = b.score == null ? null : String(b.score).slice(0, 12);
    // First submission wins: one attempt per game per day.
    const r = await db.prepare(`INSERT OR IGNORE INTO ranked (user_id, day, game, won, time_ms, acc, score, created)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(me.id, day, b.game, won, time, acc, score, Date.now()).run();
    return json({ ok: true, recorded: r.meta.changes > 0, ...(await rankedBoard(db, b.game, day, me.id, 10)) });
  }

  if (p === '/leaderboard/ranked' && req.method === 'GET') {
    const game = url.searchParams.get('game');
    if (!GAMES.has(game)) fail(400, 'Unknown game');
    const day = checkDay(url.searchParams.get('day'));
    return json(await rankedBoard(db, game, day, me.id, 50));
  }

  if (p === '/leaderboard/xp' && req.method === 'GET') {
    const day = checkDay(url.searchParams.get('day'));
    const from = Number(url.searchParams.get('from')) || day - 6; // client sends its local week start
    if (from > day || from < day - 6) fail(400, 'Bad week');
    const rows = (await db.prepare(`SELECT u.id, u.username, u.streak, u.avatar, SUM(x.xp) AS xp FROM xp_days x JOIN users u ON u.id = x.user_id
      WHERE x.day BETWEEN ? AND ? GROUP BY u.id ORDER BY xp DESC, u.streak DESC LIMIT 50`).bind(from, day).all()).results;
    const mine = await db.prepare('SELECT COALESCE(SUM(xp), 0) AS xp FROM xp_days WHERE user_id = ? AND day BETWEEN ? AND ?').bind(me.id, from, day).first();
    const above = await db.prepare(`SELECT COUNT(*) AS n FROM (SELECT user_id, SUM(xp) AS xp FROM xp_days WHERE day BETWEEN ? AND ? GROUP BY user_id) WHERE xp > ?`)
      .bind(from, day, mine.xp).first();
    const total = await db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM xp_days WHERE day BETWEEN ? AND ?').bind(from, day).first();
    return json({
      rows: rows.map((r, i) => ({ rank: i + 1, username: r.username, xp: r.xp, streak: r.streak, avatar: parseAvatar(r.avatar), you: r.id === me.id })),
      you: { rank: above.n + 1, xp: mine.xp }, total: total.n,
    });
  }

  // ---- Friends ----
  if (p === '/friends/add' && req.method === 'POST') {
    const { code } = await body(req);
    const friend = await db.prepare('SELECT * FROM users WHERE friend_code = ?').bind(String(code || '').toUpperCase().trim()).first();
    if (!friend) fail(404, 'No player with that friend code');
    if (friend.id === me.id) fail(400, 'That’s your own code');
    const count = await db.prepare('SELECT COUNT(*) AS n FROM friends WHERE a = ?').bind(me.id).first();
    if (count.n >= 50) fail(400, 'Friend list is full');
    const now = Date.now();
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO friends (a, b, created) VALUES (?, ?, ?)').bind(me.id, friend.id, now),
      db.prepare('INSERT OR IGNORE INTO friends (a, b, created) VALUES (?, ?, ?)').bind(friend.id, me.id, now),
    ]);
    return json({ ok: true, friend: { username: friend.username } });
  }

  if (p === '/friends/remove' && req.method === 'POST') {
    const { id } = await body(req);
    await db.batch([
      db.prepare('DELETE FROM friends WHERE a = ? AND b = ?').bind(me.id, String(id)),
      db.prepare('DELETE FROM friends WHERE a = ? AND b = ?').bind(String(id), me.id),
    ]);
    return json({ ok: true });
  }

  if (p === '/friends' && req.method === 'GET') {
    const day = checkDay(url.searchParams.get('day'));
    const from = Number(url.searchParams.get('from')) || day - 6;
    const friends = (await db.prepare(`SELECT u.id, u.username, u.streak, u.last_day, u.avatar FROM friends f JOIN users u ON u.id = f.b WHERE f.a = ?`).bind(me.id).all()).results;
    if (!friends.length) return json({ friends: [] });
    const ids = [me.id, ...friends.map((f) => f.id)];
    const q = ids.map(() => '?').join(',');
    // Last 400 days of activity for everyone involved, to compute shared (friend) streaks.
    const rows = (await db.prepare(`SELECT user_id, day, xp FROM xp_days WHERE user_id IN (${q}) AND day > ?`).bind(...ids, day - 400).all()).results;
    const active = new Map(ids.map((id) => [id, new Map()]));
    for (const r of rows) active.get(r.user_id).set(r.day, r.xp);
    const mine = active.get(me.id);
    const out = friends.map((f) => {
      const theirs = active.get(f.id);
      // A friend streak counts days when BOTH played, ending today or yesterday.
      let d = mine.has(day) && theirs.has(day) ? day : day - 1, n = 0;
      while (mine.has(d) && theirs.has(d)) { n++; d--; }
      let weekXp = 0;
      for (let x = from; x <= day; x++) weekXp += theirs.get(x) || 0;
      return { id: f.id, username: f.username, avatar: parseAvatar(f.avatar), streak: f.last_day >= day - 1 ? f.streak : 0, playedToday: theirs.has(day), weekXp, friendStreak: n, bothToday: mine.has(day) && theirs.has(day) };
    });
    out.sort((a, b) => b.friendStreak - a.friendStreak || b.weekXp - a.weekXp);
    return json({ friends: out });
  }

  fail(404, 'Not found');
}

async function rankedBoard(db, game, day, meId, limit) {
  const rows = (await db.prepare(`SELECT r.user_id, u.username, u.avatar, r.time_ms, r.acc, r.score FROM ranked r JOIN users u ON u.id = r.user_id
    WHERE r.game = ? AND r.day = ? AND r.won = 1 ORDER BY ${game === 'echo' ? 'CAST(r.score AS INTEGER) DESC,' : ''} r.time_ms ASC, r.acc DESC LIMIT ?`)
    .bind(game, day, limit).all()).results;
  const totalRow = await db.prepare('SELECT COUNT(*) AS n FROM ranked WHERE game = ? AND day = ? AND won = 1').bind(game, day).first();
  const mine = await db.prepare('SELECT won, time_ms, acc, score FROM ranked WHERE user_id = ? AND game = ? AND day = ?').bind(meId, game, day).first();
  let you = null;
  if (mine) {
    if (mine.won) {
      const better = game === 'echo'
        ? await db.prepare(`SELECT COUNT(*) AS n FROM ranked WHERE game = ? AND day = ? AND won = 1 AND (CAST(score AS INTEGER) > ? OR (CAST(score AS INTEGER) = ? AND time_ms < ?))`)
          .bind(game, day, Number(mine.score) || 0, Number(mine.score) || 0, mine.time_ms).first()
        : await db.prepare(`SELECT COUNT(*) AS n FROM ranked WHERE game = ? AND day = ? AND won = 1 AND (time_ms < ? OR (time_ms = ? AND acc > ?))`)
          .bind(game, day, mine.time_ms, mine.time_ms, mine.acc ?? 0).first();
      you = { rank: better.n + 1, timeMs: mine.time_ms, acc: mine.acc, won: true };
    } else you = { won: false };
  }
  return {
    rows: rows.map((r, i) => ({ rank: i + 1, username: r.username, avatar: parseAvatar(r.avatar), timeMs: r.time_ms, acc: r.acc, score: r.score, you: r.user_id === meId })),
    you, total: totalRow.n,
  };
}
