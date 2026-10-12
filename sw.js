// Network-first service worker: fresh daily content when online, cached app when offline.
const CACHE = 'wellplayed-v8';
const ASSETS = [
  './', 'index.html', 'css/styles.css', 'css/checkin.css', 'js/checkin.js', 'icon.svg', 'manifest.webmanifest',
  'js/core.js', 'js/progress.js', 'js/net.js', 'js/app.js', 'js/data/words.js', 'js/data/groups.js', 'js/data/tunes.js', 'js/data/daily.js',
  'js/games/wordle.js', 'js/games/sums.js', 'js/games/ladder.js', 'js/games/swap.js', 'js/games/code.js',
  'js/games/hue.js', 'js/games/tune.js', 'js/games/echo.js', 'js/games/groups.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('api.well-played.win') || new URL(e.request.url).pathname.startsWith('/api/')) return; // live API: always network
  e.respondWith(
    // no-cache: always revalidate with the server so new daily content and fixes show up right away.
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok && (e.request.url.startsWith(self.location.origin) || e.request.url.includes('fonts.g'))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
