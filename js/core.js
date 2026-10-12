// Well Played core: shared helpers exposed on window.WH.
window.WH = (function () {
  const WH = { games: [], gameMap: {} };
  WH.register = (game) => { WH.games.push(game); WH.gameMap[game.id] = game; };

  // ---------- Seeded randomness ----------
  function hashStr(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  WH.rng = function (seed) {
    let a = typeof seed === 'number' ? seed >>> 0 : hashStr(String(seed));
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  WH.shuffle = (arr, rng = Math.random) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  WH.pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];
  WH.randInt = (lo, hi, rng = Math.random) => lo + Math.floor(rng() * (hi - lo + 1));

  // ---------- Dates ----------
  const EPOCH = new Date(2026, 0, 1);
  const pad = (n) => String(n).padStart(2, '0');
  WH.dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  WH.dayNumber = (d = new Date()) => {
    const mid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((mid - EPOCH) / 864e5) + 1;
  };
  WH.dateFromDay = (n) => new Date(EPOCH.getFullYear(), EPOCH.getMonth(), EPOCH.getDate() + n - 1);
  WH.today = () => WH.dayNumber();
  WH.msToMidnight = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  };
  WH.fmtCountdown = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  };

  // Curated daily content (written by the daily content task), keyed by YYYY-MM-DD.
  WH.daily = (day, gameId) => {
    const entry = (window.WH_DAILY || {})[WH.dateKey(WH.dateFromDay(day))];
    return entry ? (gameId ? entry[gameId] : entry) : null;
  };

  // ---------- Storage ----------
  const KEY = 'wellplayed:v1';
  const defaults = () => ({
    settings: { theme: 'system', colorblind: false, sound: true, reducedMotion: false },
    seen: {}, progress: {}, results: {}, stats: {}, log: [],
  });
  let data;
  try { data = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch (e) { data = defaults(); }
  data.settings = Object.assign(defaults().settings, data.settings);
  WH.store = {
    get data() { return data; },
    save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode */ } },
    reset() { data = defaults(); this.save(); },
  };
  // Drop resumable state older than a week.
  const cutoff = WH.today() - 7;
  for (const k of Object.keys(data.progress)) if (+k.split(':')[1] < cutoff) delete data.progress[k];

  // ---------- DOM ----------
  WH.h = function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [p, pv] of Object.entries(v)) {
          if (p.startsWith('--')) el.style.setProperty(p, pv); else el.style[p] = pv;
        }
      }
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  };
  WH.reducedMotion = () =>
    data.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  WH.wait = (ms) => new Promise((r) => setTimeout(r, WH.reducedMotion() ? Math.min(ms, 60) : ms));

  // ---------- Toast ----------
  WH.toast = function (msg, ms = 1600) {
    const host = document.getElementById('toasts');
    const t = WH.h('div', { class: 'toast', role: 'status' }, msg);
    host.prepend(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  };

  // ---------- Modal ----------
  let modalEl = null;
  // Each open modal owns one history entry, so the phone's back button/gesture closes it
  // instead of leaving the page. Replacing one modal with another reuses the same entry.
  let ignorePop = false;
  WH.modal = function ({ title, body, wide, onClose } = {}) {
    const reuse = !!(modalEl && modalEl._pushed);
    WH.closeModal({ silent: true });
    const close = () => WH.closeModal();
    const card = WH.h('div', { class: 'modal-card' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
      WH.h('button', { class: 'icon-btn modal-x', 'aria-label': 'Close', onclick: close, html: WH.icons.x }),
      title ? WH.h('h2', { class: 'modal-title' }, title) : null,
      body);
    modalEl = WH.h('div', { class: 'modal', onclick: (e) => { if (e.target === modalEl) close(); } }, card);
    modalEl._onClose = onClose;
    if (reuse) modalEl._pushed = true;
    else { try { history.pushState({ wpModal: true }, ''); modalEl._pushed = true; } catch (e) { /* file:// */ } }
    document.body.append(modalEl);
    requestAnimationFrame(() => modalEl && modalEl.classList.add('open'));
    return { close, el: card };
  };
  // silent: close without touching history (used when navigating away or replacing the modal).
  WH.closeModal = function ({ silent = false } = {}) {
    if (!modalEl) return;
    const m = modalEl; modalEl = null;
    if (!silent && m._pushed && history.state && history.state.wpModal) { ignorePop = true; history.back(); }
    m.classList.remove('open');
    setTimeout(() => m.remove(), 220);
    if (m._onClose) m._onClose();
  };
  WH.modalOpen = () => !!modalEl;
  window.addEventListener('popstate', (e) => {
    if (ignorePop) { ignorePop = false; return; }
    if (modalEl) { modalEl._pushed = false; WH.closeModal({ silent: true }); return; }
    // Landed on a leftover modal entry (e.g. after following a link out of a modal): skip it.
    if (e.state && e.state.wpModal) history.back();
  });

  // ---------- Sound (tiny WebAudio synth) ----------
  let ctx = null;
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur = 0.12, type = 'sine', vol = 0.06, when = 0) {
    if (!data.settings.sound) return;
    const a = ac(); if (!a) return;
    const t0 = a.currentTime + when;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  WH.sound = {
    tone,
    tap: () => tone(520, 0.05, 'triangle', 0.025),
    flip: (i = 0) => tone(392 + i * 40, 0.09, 'sine', 0.035),
    error: () => { tone(220, 0.12, 'triangle', 0.05); tone(180, 0.16, 'triangle', 0.04, 0.08); },
    good: () => { tone(660, 0.1, 'sine', 0.05); tone(880, 0.16, 'sine', 0.05, 0.08); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'sine', 0.06, i * 0.11)),
    soft: () => tone(330, 0.3, 'sine', 0.04),
  };
  WH.vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

  // ---------- Confetti ----------
  WH.confetti = function () {
    if (WH.reducedMotion()) return;
    const c = WH.h('canvas', { class: 'confetti' });
    document.body.append(c);
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const cs = getComputedStyle(document.documentElement);
    const colors = ['--correct', '--present', '--accent', '--a-memory', '--a-perception', '--a-calm']
      .map((v) => cs.getPropertyValue(v).trim());
    const parts = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 12 - 4,
      r: Math.random() * 6 + 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)], shape: Math.random() < 0.5,
    }));
    const start = performance.now();
    (function frame(now) {
      g.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.c;
        if (p.shape) g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        else { g.beginPath(); g.arc(0, 0, p.r / 2.6, 0, Math.PI * 2); g.fill(); }
        g.restore();
      }
      if (now - start < 2600) requestAnimationFrame(frame); else c.remove();
    })(start);
  };

  // ---------- Share ----------
  WH.share = async function (text) {
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      WH.toast('Copied to clipboard');
    } catch (e) {
      const ta = WH.h('textarea', { style: { position: 'fixed', opacity: 0 } }, text);
      document.body.append(ta); ta.select();
      try { document.execCommand('copy'); WH.toast('Copied to clipboard'); } catch (_) { WH.toast('Could not copy'); }
      ta.remove();
    }
  };

  // ---------- On-screen keyboard ----------
  // rows: arrays of key ids; 'enter' and 'back' are special. labels: optional display overrides.
  WH.Keyboard = function ({ rows, onKey, labels = {}, className = '' }) {
    const keys = {};
    const el = WH.h('div', { class: 'keyboard ' + className },
      rows.map((row) => WH.h('div', { class: 'kb-row' }, row.map((k) => {
        const wide = k === 'enter' || k === 'back';
        const label = labels[k] || (k === 'enter' ? 'Enter' : k === 'back' ? '' : k.toUpperCase());
        const b = WH.h('button', {
          class: 'key' + (wide ? ' wide' : ''), 'data-key': k, type: 'button',
          'aria-label': k === 'back' ? 'Backspace' : label,
          html: k === 'back' ? WH.icons.back : null,
          onclick: (e) => { e.currentTarget.blur(); onKey(k === 'enter' ? 'Enter' : k === 'back' ? 'Backspace' : k); },
        }, k === 'back' ? null : label);
        keys[k] = b;
        return b;
      }))));
    const rank = { absent: 1, present: 2, correct: 3 };
    return {
      el,
      // Promote a key's state (never downgrade correct → present).
      mark(k, state) {
        const b = keys[k]; if (!b) return;
        if ((rank[state] || 0) > (rank[b.dataset.state] || 0)) b.dataset.state = state;
      },
      // Multi-board key: 2 states = left/right halves, 4 states = quadrants (TL, TR, BL, BR).
      multi(k, states) {
        const b = keys[k]; if (!b) return;
        b.dataset.state = '';
        const col = (s) => (s ? `var(--${s})` : 'var(--key)');
        ['--ka', '--kb', '--kc', '--kd'].forEach((v, i) => b.style.setProperty(v, col(states[i])));
        const any = states.some(Boolean);
        b.classList.toggle('split', any && states.length === 2);
        b.classList.toggle('quad', any && states.length === 4);
        b.classList.toggle('lit', states.some((s) => s && s !== 'absent'));
        b.classList.toggle('dead', states.every((s) => s === 'absent'));
      },
      reset() { for (const b of Object.values(keys)) { b.dataset.state = ''; b.classList.remove('split', 'quad', 'lit', 'dead'); } },
      keys,
    };
  };
  WH.QWERTY = [
    'qwertyuiop'.split(''),
    'asdfghjkl'.split(''),
    ['enter', ...'zxcvbnm'.split(''), 'back'],
  ];

  // ---------- Tile board (used by Word, Duet, Sums) ----------
  WH.Board = function ({ rows, cols, className = '' }) {
    const tiles = [];
    const rowEls = [];
    const el = WH.h('div', { class: 'board ' + className, style: { '--cols': cols } });
    for (let r = 0; r < rows; r++) {
      const rowEl = WH.h('div', { class: 'board-row' });
      tiles.push([]);
      for (let c = 0; c < cols; c++) {
        const t = WH.h('div', { class: 'tile' });
        tiles[r].push(t); rowEl.append(t);
      }
      rowEls.push(rowEl); el.append(rowEl);
    }
    return {
      el, tiles, rowEls,
      setRow(r, str, display = (ch) => ch.toUpperCase()) {
        tiles[r].forEach((t, c) => {
          const ch = str[c] || '';
          const was = t.textContent;
          t.textContent = ch ? display(ch) : '';
          t.classList.toggle('filled', !!ch);
          if (ch && !was && !WH.reducedMotion()) { t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); }
        });
      },
      paint(r, states) { tiles[r].forEach((t, c) => { t.dataset.state = states[c]; t.classList.add('filled'); }); },
      // Flip tiles one by one; resolves when the row is done.
      reveal(r, states) {
        const rm = WH.reducedMotion();
        const step = rm ? 0 : 260;
        return new Promise((done) => {
          tiles[r].forEach((t, c) => {
            setTimeout(() => {
              if (!rm) t.classList.add('flip');
              setTimeout(() => { t.dataset.state = states[c]; WH.sound.flip(c); }, rm ? 0 : 230);
            }, c * step);
          });
          setTimeout(done, rm ? 30 : (cols - 1) * step + 520);
        });
      },
      shake(r) {
        const el2 = rowEls[r];
        el2.classList.remove('shake'); void el2.offsetWidth; el2.classList.add('shake');
        WH.vibrate(80);
      },
      bounce(r) {
        if (WH.reducedMotion()) return;
        tiles[r].forEach((t, c) => setTimeout(() => t.classList.add('bounce'), c * 90));
      },
      setActive(r) { rowEls.forEach((x, i) => x.classList.toggle('active', i === r)); },
    };
  };

  // Wordle scoring with correct duplicate handling. Works for any symbol strings.
  WH.scoreGuess = function (guess, answer) {
    const res = Array(guess.length).fill('absent');
    const left = {};
    for (let i = 0; i < answer.length; i++) {
      if (guess[i] === answer[i]) res[i] = 'correct';
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < guess.length; i++) {
      if (res[i] !== 'correct' && left[guess[i]] > 0) { res[i] = 'present'; left[guess[i]]--; }
    }
    return res;
  };
  // Accuracy for guess games: share of guessed tiles that landed green or gold. pairs: [[guess, answer], …]
  WH.hitRate = function (pairs) {
    let tot = 0, hit = 0;
    for (const [g, a] of pairs) for (const s of WH.scoreGuess(g, a)) { tot++; if (s !== 'absent') hit++; }
    return tot ? hit / tot : 0;
  };
  WH.pct = (x) => `${Math.round((x || 0) * 100)}%`;
  WH.emoji = { correct: '🟩', present: '🟨', absent: '⬜' };
  WH.emojiRow = (states) => states.map((s) => WH.emoji[s]).join('');

  // ---------- Word lookup ----------
  // Valid lists are stored as concatenated fixed-width strings; binary search them.
  function inPacked(packed, w) {
    const n = w.length, count = packed.length / n;
    let lo = 0, hi = count - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const s = packed.substr(mid * n, n);
      if (s === w) return true;
      if (s < w) lo = mid + 1; else hi = mid - 1;
    }
    return false;
  }
  WH.isWord5 = (w) => inPacked(window.WH_WORDS.valid5, w);
  WH.isWord4 = (w) => inPacked(window.WH_WORDS.valid4, w);
  let valid4Cache = null;
  WH.valid4List = () => {
    if (!valid4Cache) {
      const p = window.WH_WORDS.valid4; valid4Cache = [];
      for (let i = 0; i < p.length; i += 4) valid4Cache.push(p.substr(i, 4));
    }
    return valid4Cache;
  };

  // ---------- Icons ----------
  const svg = (p, vb = '0 0 24 24') =>
    `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  WH.icons = {
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    back: svg('<path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="M15 9l-4 6M11 9l4 6"/>'),
    arrowLeft: svg('<path d="M15 18l-6-6 6-6"/>'),
    help: svg('<circle cx="12" cy="12" r="9.5"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 1c0 1.8-2.5 2.2-2.5 3.7"/><path d="M12 17.2h.01"/>'),
    chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    flame: svg('<path d="M12 22c4 0 7-2.8 7-7 0-3.5-2.3-6-4-8-.4 2-1.5 3.5-3 4 .5-3-1-6.5-4-9 0 4-4 6.5-4 12 0 4.6 3.4 8 8 8z"/>'),
    share: svg('<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4M12 2v14"/>'),
    shuffle: svg('<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'),
    undo: svg('<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>'),
    bulb: svg('<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>'),
    heart: svg('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
    play: svg('<path d="M7 4l13 8-13 8z"/>'),
    check: svg('<path d="M20 6L9 17l-5-5"/>'),
    users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.2 2.5 3.6 5.2"/>'),
    copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
    trophy: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
    sparkle: svg('<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>'),
  };

  return WH;
})();
