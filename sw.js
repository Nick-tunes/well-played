// Well Played service worker.
// - Precaches the whole app (and the curated-puzzle window in js/data/daily.js) for offline play.
// - Network-first with revalidation, so fixes and new puzzles show up as soon as they're live.
// - A new version waits until the page asks it to take over (the "Update ready" banner).
// CACHE is replaced with a per-deploy stamp by scripts/deploy-site.sh.
const CACHE = 'wellplayed-dev';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'css/styles.css', 'css/checkin.css',
  'js/core.js', 'js/data/cosmetics.js', 'js/avatars.js', 'js/progress.js', 'js/net.js', 'js/install.js',
  'js/data/words.js', 'js/data/groups.js', 'js/data/tunes.js', 'js/data/daily.js',
  'js/games/wordle.js', 'js/games/sums.js', 'js/games/ladder.js', 'js/games/hue.js', 'js/games/echo.js',
  'js/games/groups.js', 'js/games/swap.js', 'js/games/code.js', 'js/games/tune.js',
  'js/profile.js', 'js/checkin.js', 'js/app.js',
];

self.addEventListener('install', (e) => {
  // One missing file must never break installation, so add them individually.
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(ASSETS.map((a) => c.add(new Request(a, { cache: 'reload' }))))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'api.well-played.win' || url.pathname.startsWith('/api/')) return; // live API: always network
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (!sameOrigin && !fonts) return;

  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: fonts ? 'default' : 'no-cache' });
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    } catch (err) {
      // Offline: same file at any version, then the app shell for page loads.
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await caches.match('./')) || (await caches.match('index.html'));
      throw err;
    }
  })());
});
