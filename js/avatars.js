// Avatar illustrations: 16 characters drawn as SVG on a coloured disc, with optional frames.
// A spec is { species, color, frame } using ids from shared/cosmetics.json.
(function () {
  const C = window.WH_COSMETICS;
  const INK = '#2a2733';
  const byId = (list, id) => list.find((x) => x.id === id) || list[0];

  const eye = (x, y, r = 4.6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${x + r * 0.33}" cy="${y - r * 0.35}" r="${r * 0.32}" fill="#fff"/>`;
  const eyes = (y = 52, dx = 10, r) => eye(50 - dx, y, r) + eye(50 + dx, y, r);
  const smile = (y, w = 8) => `<path d="M${50 - w / 2} ${y}q${w / 2} ${w * 0.55} ${w} 0" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  const cheeks = (y = 60, dx = 17) => `<ellipse cx="${50 - dx}" cy="${y}" rx="4.6" ry="2.8" fill="#ff8fa3" opacity=".5"/><ellipse cx="${50 + dx}" cy="${y}" rx="4.6" ry="2.8" fill="#ff8fa3" opacity=".5"/>`;
  const body = (fill) => `<path d="M14 104 Q50 72 86 104Z" fill="${fill}"/>`;

  const SPECIES = {
    tile: () => body('#5a9468') + `<rect x="22" y="22" width="56" height="56" rx="14" fill="#6aa37a"/><rect x="27" y="26" width="46" height="10" rx="5" fill="#fff" opacity=".18"/>` + eyes(50, 10) + smile(60) + cheeks(58, 18),
    cat: () => body('#e08f4a') + `<path d="M25 42 L31 16 L47 33Z M75 42 L69 16 L53 33Z" fill="#f0a35e"/><path d="M29 36 L32 23 L41 32Z M71 36 L68 23 L59 32Z" fill="#ffc4cf"/><circle cx="50" cy="55" r="26" fill="#f0a35e"/><ellipse cx="50" cy="64" rx="12" ry="8.5" fill="#fde3c4"/>` + eyes(52, 10) + `<path d="M47 60h6l-3 3.5z" fill="#e8687f"/><path d="M50 63.5v3M50 66.5q-3 2.5-6 0M50 66.5q3 2.5 6 0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M20 60l12 1M20 66l12-2M80 60l-12 1M80 66l-12-2" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>`,
    bear: () => body('#8f6140') + `<circle cx="29" cy="32" r="10" fill="#9a6a48"/><circle cx="71" cy="32" r="10" fill="#9a6a48"/><circle cx="29" cy="32" r="5" fill="#c9926a"/><circle cx="71" cy="32" r="5" fill="#c9926a"/><circle cx="50" cy="55" r="27" fill="#a9744f"/><ellipse cx="50" cy="65" rx="13" ry="10" fill="#e3c29f"/>` + eyes(51, 10.5) + `<ellipse cx="50" cy="61" rx="4.5" ry="3.2" fill="${INK}"/>` + smile(66, 7),
    frog: () => body('#62ab5c') + `<circle cx="33" cy="38" r="12" fill="#7cc576"/><circle cx="67" cy="38" r="12" fill="#7cc576"/><ellipse cx="50" cy="61" rx="33" ry="23" fill="#7cc576"/><circle cx="33" cy="37" r="8" fill="#fff"/><circle cx="67" cy="37" r="8" fill="#fff"/>` + eye(33, 38, 4.2) + eye(67, 38, 4.2) + `<path d="M31 64 Q50 80 69 64" stroke="${INK}" stroke-width="2.8" fill="none" stroke-linecap="round"/>` + cheeks(62, 25),
    fox: () => body('#d7652f') + `<path d="M23 40 L28 10 L47 30Z M77 40 L72 10 L53 30Z" fill="#e8743b"/><path d="M28 33 L30 19 L40 29Z M72 33 L70 19 L60 29Z" fill="#fff1e6"/><path d="M22 44 Q50 22 78 44 Q76 70 50 84 Q24 70 22 44Z" fill="#e8743b"/><path d="M28 54 Q42 58 50 82 Q31 74 28 54Z M72 54 Q58 58 50 82 Q69 74 72 54Z" fill="#fff6ee"/>` + eyes(52, 10.5) + `<circle cx="50" cy="75" r="3.6" fill="${INK}"/>`,
    owl: () => `<ellipse cx="50" cy="62" rx="31" ry="32" fill="#8b6b4e"/><path d="M22 38 L27 18 L39 32Z M78 38 L73 18 L61 32Z" fill="#8b6b4e"/><ellipse cx="50" cy="78" rx="18" ry="15" fill="#c9a27e"/><circle cx="38" cy="51" r="12" fill="#fff" stroke="#e0b04a" stroke-width="3"/><circle cx="62" cy="51" r="12" fill="#fff" stroke="#e0b04a" stroke-width="3"/>` + eye(38, 52, 5.6) + eye(62, 52, 5.6) + `<path d="M45.5 60h9l-4.5 8z" fill="#e0b04a"/>`,
    penguin: () => body('#2a2733') + `<circle cx="50" cy="54" r="28" fill="#2f2c3a"/><circle cx="40" cy="57" r="13" fill="#fff"/><circle cx="60" cy="57" r="13" fill="#fff"/><ellipse cx="50" cy="67" rx="16" ry="12" fill="#fff"/>` + eyes(55, 9.5, 4.2) + `<path d="M44 63h12l-6 7z" fill="#f0a35e"/>` + cheeks(64, 16),
    bunny: () => body('#e6d9cf') + `<ellipse cx="38" cy="25" rx="8" ry="21" fill="#f3e9e2" transform="rotate(-8 38 25)"/><ellipse cx="62" cy="25" rx="8" ry="21" fill="#f3e9e2" transform="rotate(8 62 25)"/><ellipse cx="38" cy="27" rx="4" ry="14" fill="#ffc4cf" transform="rotate(-8 38 27)"/><ellipse cx="62" cy="27" rx="4" ry="14" fill="#ffc4cf" transform="rotate(8 62 27)"/><circle cx="50" cy="59" r="25" fill="#f3e9e2"/>` + eyes(56, 9.5) + `<path d="M47 63h6l-3 3.4z" fill="#e8687f"/><path d="M50 66.4q-3 2.6-6 0M50 66.4q3 2.6 6 0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>` + cheeks(63, 15),
    ghost: () => `<path d="M24 52 a26 26 0 0 1 52 0 V92 q-6.5 7 -13 0 t-13 0 t-13 0 t-13 0Z" fill="#f6f4fb"/><ellipse cx="41" cy="52" rx="4.6" ry="6.6" fill="${INK}"/><ellipse cx="59" cy="52" rx="4.6" ry="6.6" fill="${INK}"/><ellipse cx="50" cy="65" rx="3.6" ry="4.6" fill="${INK}"/>` + cheeks(60, 17),
    alien: () => body('#76bd70') + `<path d="M40 30 L33 13 M60 30 L67 13" stroke="#76bd70" stroke-width="3" stroke-linecap="round"/><circle cx="33" cy="12" r="4.5" fill="#f2c14e"/><circle cx="67" cy="12" r="4.5" fill="#f2c14e"/><ellipse cx="50" cy="54" rx="28" ry="27" fill="#8fd18a"/><ellipse cx="39" cy="54" rx="8" ry="11" fill="${INK}" transform="rotate(-25 39 54)"/><ellipse cx="61" cy="54" rx="8" ry="11" fill="${INK}" transform="rotate(25 61 54)"/><circle cx="37" cy="50" r="2.2" fill="#fff"/><circle cx="59" cy="50" r="2.2" fill="#fff"/>` + smile(69, 6),
    octopus: () => `<path d="M24 54 a26 26 0 0 1 52 0 v20 q-4 12 -9 2 q-4 12 -8 2 q-4 12 -8 2 q-4 12 -8 2 q-4 12 -9 -6Z" fill="#b688d6"/><circle cx="38" cy="38" r="3" fill="#d6b8ea"/><circle cx="62" cy="34" r="4" fill="#d6b8ea"/>` + eyes(54, 10) + smile(63) + cheeks(61, 18),
    whale: () => `<path d="M50 34 q-6 -10 -13 -8 M50 34 q6 -10 13 -8 M50 34 v-13" stroke="#9fd0f5" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M14 68 Q14 38 50 38 Q86 38 86 64 Q86 90 50 90 Q18 90 14 68Z" fill="#5c9fd6"/><path d="M24 74 Q50 92 78 72 Q72 88 50 88 Q30 88 24 74Z" fill="#cfe6f7"/>` + eyes(58, 12) + smile(68, 9) + cheeks(66, 21),
    robot: () => body('#9aa0ae') + `<path d="M50 20 V30" stroke="#9aa0ae" stroke-width="3"/><circle cx="50" cy="17" r="4.5" fill="#e07a5f"/><rect x="22" y="30" width="56" height="48" rx="11" fill="#c8ccd6"/><rect x="29" y="38" width="42" height="28" rx="7" fill="${INK}"/><rect x="35" y="45" width="10" height="8" rx="2.5" fill="#7ee0c3"/><rect x="55" y="45" width="10" height="8" rx="2.5" fill="#7ee0c3"/><path d="M42 59h16" stroke="#7ee0c3" stroke-width="2.4" stroke-linecap="round"/><circle cx="18" cy="54" r="4" fill="#9aa0ae"/><circle cx="82" cy="54" r="4" fill="#9aa0ae"/>`,
    panda: () => body('#2a2733') + `<circle cx="29" cy="32" r="10" fill="${INK}"/><circle cx="71" cy="32" r="10" fill="${INK}"/><circle cx="50" cy="56" r="27" fill="#fff"/><ellipse cx="39" cy="54" rx="7.5" ry="10" fill="${INK}" transform="rotate(25 39 54)"/><ellipse cx="61" cy="54" rx="7.5" ry="10" fill="${INK}" transform="rotate(-25 61 54)"/><circle cx="40" cy="53" r="3.4" fill="#fff"/><circle cx="60" cy="53" r="3.4" fill="#fff"/><circle cx="40.6" cy="53.4" r="1.7" fill="${INK}"/><circle cx="59.4" cy="53.4" r="1.7" fill="${INK}"/><ellipse cx="50" cy="64" rx="4.2" ry="3" fill="${INK}"/>` + smile(68, 6) + cheeks(63, 18),
    unicorn: () => body('#e9dff7') + `<path d="M45.5 32 L50 6 L54.5 32Z" fill="#f2c14e"/><path d="M46.5 26l7-3M47.3 20l5.6-2.4" stroke="#d99b1f" stroke-width="1.5"/><path d="M26 42 L30 26 L40 36Z M74 42 L70 26 L60 36Z" fill="#fbf7ff"/><path d="M72 34 Q86 46 80 70 Q74 56 66 50Z" fill="#f08bb8"/><path d="M70 30 Q78 30 82 40 Q74 38 68 40Z" fill="#8fd0ff"/><circle cx="50" cy="57" r="26" fill="#fbf7ff"/><path d="M36 54q4-4 8 0M56 54q4-4 8 0" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>` + smile(64, 7) + cheeks(62, 17),
    dragon: () => body('#4c9d66') + `<path d="M31 38 L24 14 L41 31Z M69 38 L76 14 L59 31Z" fill="#f2e3c4"/><path d="M42 30l4-9 4 8 4-8 4 9" fill="#3f8f5b"/><circle cx="50" cy="55" r="27" fill="#5fb37a"/><ellipse cx="50" cy="67" rx="15" ry="10" fill="#82c99a"/><ellipse cx="45" cy="65" rx="2" ry="2.8" fill="${INK}"/><ellipse cx="55" cy="65" rx="2" ry="2.8" fill="${INK}"/><circle cx="40" cy="50" r="6" fill="#f2c14e"/><circle cx="60" cy="50" r="6" fill="#f2c14e"/><ellipse cx="40" cy="50" rx="1.8" ry="4.6" fill="${INK}"/><ellipse cx="60" cy="50" rx="1.8" ry="4.6" fill="${INK}"/>` + smile(72, 7),
  };

  const FRAMES = {
    none: () => '',
    bronze: () => ring('#c98a4b'),
    silver: () => ring('#cfd3dc'),
    gold: () => ring('#f2c14e', 5),
    flame: (id) => `<defs><linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff7a3d"/><stop offset=".6" stop-color="#ffb347"/><stop offset="1" stop-color="#ffe08a"/></linearGradient></defs>` + ring(`url(#${id})`, 5.5),
    rainbow: (id) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6b6b"/><stop offset=".25" stop-color="#ffd166"/><stop offset=".5" stop-color="#6ee7a7"/><stop offset=".75" stop-color="#60a5fa"/><stop offset="1" stop-color="#c084fc"/></linearGradient></defs>` + ring(`url(#${id})`, 5),
    leaf: () => ring('#6aa37a', 4) + `<g fill="#6aa37a">${[200, 225, 250, 290, 315, 340].map((a) => leaf(a)).join('')}</g>`,
  };
  function ring(stroke, w = 4.5) { return `<circle cx="50" cy="50" r="${50 - w / 2}" fill="none" stroke="${stroke}" stroke-width="${w}"/>`; }
  function leaf(deg) {
    const r = 46, a = (deg * Math.PI) / 180, x = 50 + r * Math.cos(a), y = 50 + r * Math.sin(a);
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="4.5" ry="2.4" transform="rotate(${deg + 60} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }

  let uid = 0;
  function svg(spec = {}) {
    const sp = byId(C.species, spec.species).id;
    const col = byId(C.colors, spec.color);
    const fr = byId(C.frames, spec.frame).id;
    const id = `av${++uid}`;
    const inset = fr === 'none' ? 0 : 6; // shrink the disc so the frame sits around it
    const scale = (100 - inset * 2) / 100;
    return `<svg viewBox="0 0 100 100" role="img" aria-label="${byId(C.species, sp).name} avatar">
      <defs><clipPath id="${id}c"><circle cx="50" cy="50" r="50"/></clipPath></defs>
      <g transform="translate(${inset} ${inset}) scale(${scale})" clip-path="url(#${id}c)">
        <circle cx="50" cy="50" r="50" fill="${col.hex}"/>
        ${col.id === 'midnight' ? '<circle cx="20" cy="22" r="1.4" fill="#fff"/><circle cx="80" cy="30" r="1.1" fill="#fff"/><circle cx="72" cy="12" r="1.6" fill="#fff"/><circle cx="12" cy="44" r="1" fill="#fff"/>' : ''}
        ${SPECIES[sp]()}
      </g>
      ${FRAMES[fr](id + 'f')}
    </svg>`;
  }

  WH.avatar = {
    svg,
    // Returns an element; size in px.
    el(spec, size = 40, extra = '') {
      const span = document.createElement('span');
      span.className = 'av ' + extra;
      span.style.width = span.style.height = size + 'px';
      span.innerHTML = svg(spec);
      return span;
    },
    defaults: () => ({ species: 'tile', color: 'violet', frame: 'none', title: 'puzzler' }),
  };
})();
