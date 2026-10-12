// Sums: guess the hidden 8-character equation (Nerdle-style).
(function () {
  const { h } = WH;
  const LEN = 8, MAX = 6;
  const SHOW = { '*': '×', '/': '÷', '-': '−' };
  const show = (ch) => SHOW[ch] || ch;

  // Exact rational evaluation of "a op b op c" with normal precedence. Returns [num, den] or null.
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  function evaluate(expr) {
    const parts = expr.split(/([+\-*/])/);
    if (parts.length % 2 === 0) return null;
    for (let i = 0; i < parts.length; i += 2) {
      if (!/^\d+$/.test(parts[i]) || (parts[i].length > 1 && parts[i][0] === '0')) return null;
    }
    // First pass: * and /
    const terms = [[+parts[0], 1]], ops = [];
    for (let i = 1; i < parts.length; i += 2) {
      const op = parts[i], n = +parts[i + 1];
      if (op === '*' || op === '/') {
        const t = terms[terms.length - 1];
        if (op === '*') t[0] *= n;
        else { if (n === 0) return null; t[1] *= n; }
        const g = gcd(t[0], t[1]) || 1; t[0] /= g; t[1] /= g;
      } else { ops.push(op); terms.push([n, 1]); }
    }
    let [num, den] = terms[0];
    ops.forEach((op, i) => {
      const [n, d] = terms[i + 1];
      num = op === '+' ? num * d + n * den : num * d - n * den;
      den *= d;
      const g = gcd(num, den) || 1; num /= g; den /= g;
    });
    return [num, den];
  }

  function validate(s) {
    if (s.length !== LEN) return 'Not enough characters';
    if ((s.match(/=/g) || []).length !== 1) return 'Needs exactly one “=”';
    const [lhs, rhs] = s.split('=');
    if (!lhs || !rhs) return 'Needs something on both sides';
    if (!/^\d+$/.test(rhs) || (rhs.length > 1 && rhs[0] === '0')) return 'Right side must be a single number';
    if (!/[+\-*/]/.test(lhs)) return 'Left side needs an operator';
    const v = evaluate(lhs);
    if (!v) return 'That isn’t a valid expression';
    if (v[1] !== 1 || v[0] !== +rhs) return 'That doesn’t compute';
    return null;
  }

  function generate(rng) {
    const ops = ['+', '-', '*', '/'];
    for (let t = 0; t < 20000; t++) {
      const nOps = rng() < 0.5 ? 1 : 2;
      let expr = '';
      const nums = [];
      for (let i = 0; i <= nOps; i++) {
        const digits = nOps === 1 ? (rng() < 0.5 ? 2 : WH.randInt(1, 3, rng)) : (rng() < 0.6 ? 1 : 2);
        const n = digits === 1 ? WH.randInt(2, 9, rng) : WH.randInt(10 ** (digits - 1), 10 ** digits - 1, rng);
        nums.push(n);
        expr += (i ? WH.pick(ops, rng) : '') + n;
      }
      // Keep division exact at every step for a fair daily answer.
      const v = evaluate(expr);
      if (!v || v[1] !== 1 || v[0] < 0) continue;
      if (/\/\d+/.test(expr) && !exactDivisions(expr)) continue;
      const eq = `${expr}=${v[0]}`;
      if (eq.length === LEN && !validate(eq)) return eq;
    }
    return '12+35=47';
  }
  function exactDivisions(expr) {
    const parts = expr.split(/([+\-*/])/);
    let acc = +parts[0];
    for (let i = 1; i < parts.length; i += 2) {
      const n = +parts[i + 1];
      if (parts[i] === '/') { if (acc % n) return false; acc /= n; }
      else if (parts[i] === '*') acc *= n;
      else acc = n;
    }
    return true;
  }

  function mount(root, ctx) {
    const cur0 = ctx.content && ctx.content.equation;
    const answer = cur0 && !validate(cur0) ? cur0 : generate(ctx.rng);
    const st = ctx.load() || { guesses: [] };
    const board = WH.Board({ rows: MAX, cols: LEN, className: 'sums' });
    const kb = WH.Keyboard({
      rows: ['1234567890'.split(''), ['enter', '+', '-', '*', '/', '=', 'back']],
      labels: { '*': '×', '/': '÷', '-': '−' }, onKey, className: 'kb-sums',
    });
    root.append(h('div', { class: 'play-area' }, board.el), kb.el);
    let cur = '', busy = false, done = false;

    function paintKeys(g, states) { states.forEach((s, i) => kb.mark(g[i], s)); }
    function render() { board.setRow(st.guesses.length, cur, show); board.setActive(st.guesses.length); }

    function finish(animate) {
      done = true;
      const won = st.guesses[st.guesses.length - 1] === answer;
      const n = st.guesses.length;
      const label = won ? `${n}/${MAX}` : `X/${MAX}`;
      ctx.complete({
        won, score: won ? n : 'X', label,
        title: won ? ['Genius!', 'Brilliant!', 'Sharp!', 'Solid!', 'Nice!', 'Phew!'][n - 1] : 'Good effort',
        sub: `The equation was ${answer.split('').map(show).join('')}`,
        share: `Sums ${ctx.label} ${label}\n` + st.guesses.map((g) => WH.emojiRow(WH.scoreGuess(g, answer))).join('\n'),
      }, { animate });
    }

    async function submit() {
      const err = validate(cur);
      if (err) { board.shake(st.guesses.length); WH.toast(err); WH.sound.error(); return; }
      busy = true;
      const g = cur, r = st.guesses.length;
      st.guesses.push(g); cur = ''; ctx.save(st);
      board.setActive(-1);
      const states = WH.scoreGuess(g, answer);
      await board.reveal(r, states);
      paintKeys(g, states);
      busy = false;
      if (g === answer || st.guesses.length >= MAX) {
        if (g === answer) { board.bounce(r); WH.sound.win(); } else WH.sound.soft();
        await WH.wait(700); finish(true);
      } else render();
    }

    function onKey(k) {
      if (busy || done) return;
      if (k === 'x') k = '*';
      if (k === 'Enter') return submit();
      if (k === 'Backspace') { cur = cur.slice(0, -1); render(); return; }
      if (/^[0-9+\-*/=]$/.test(k) && cur.length < LEN) { cur += k; WH.sound.tap(); render(); }
    }

    st.guesses.forEach((g, r) => { const s = WH.scoreGuess(g, answer); board.setRow(r, g, show); board.paint(r, s); paintKeys(g, s); });
    if (st.guesses.includes(answer) || st.guesses.length >= MAX) finish(false); else render();
    return { onKey };
  }

  WH.sums = { validate, generate };
  WH.register({
    id: 'sums', name: 'Sums', area: 'Logic', statType: 'guesses', maxGuesses: MAX,
    tagline: 'Crack the hidden equation, one calculation at a time.',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" fill="currentColor" opacity=".18"/><path d="M7 9.5h4M9 7.5v4M13.5 9.5h4M7 15h4M13.5 14h4M13.5 16.5h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    howTo: `<p>Guess the hidden <b>equation</b> in <b>6 tries</b>. Each guess must be a true calculation, 8 characters long, like:</p>
      <div class="demo-row sums">${'12+35=47'.split('').map((c) => `<div class="tile filled">${show(c)}</div>`).join('')}</div>
      <p>Use <b>0–9 + − × ÷</b> and one <b>=</b>. The right side is just a number. Normal order of operations applies (× and ÷ before + and −).</p>
      <p>Tiles turn <span class="chip-c correct">green</span> when the character is in the right spot, <span class="chip-c present">gold</span> when it's in the equation elsewhere.</p>`,
    mount,
  });
})();
