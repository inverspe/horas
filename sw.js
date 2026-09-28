/* Bump CACHE on every deploy — it's how installed phones learn there's a new version.
 *
 * Each version's files live in ONE cache, downloaded together at install and served
 * together afterwards. Never mix versions: app.js imports named exports from
 * charts.js and friends, and if the two come from different deploys the browser
 * refuses to run the whole app (a module-link error, not a runtime one). */
const CACHE = 'horas-v12';

const SHELL = [
  './',
  './index.html',
  './boot-guard.js',
  './styles.css',
  './app.js',
  './store.js',
  './stats.js',
  './charts.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// cache:'reload' skips the browser's HTTP cache. GitHub Pages sends max-age=600, so
// a plain fetch can return a 10-minute-old copy of one file beside a fresh copy of
// another — that is exactly how a new app.js ended up next to an old charts.js.
const precache = () => caches.open(CACHE).then((c) =>
  c.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))));

self.addEventListener('install', (event) => {
  // If any file fails, install fails and the previous version keeps serving intact.
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  // Deletes old app-file caches only. Sessions live in IndexedDB and are never touched.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// boot-guard.js asks for this when the app failed to start: re-download a matching
// set of files, then tell the page to reload.
self.addEventListener('message', (event) => {
  if (event.data !== 'repair') return;
  event.waitUntil(
    caches.delete(CACHE)
      .then(precache)
      .then(() => event.source && event.source.postMessage('repaired'))
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Pages and files both come from this version's cache, so a page can never be
  // served with files from a different deploy. New versions arrive by a new sw.js:
  // the browser checks it on launch, installs it, and boot-guard.js reloads once.
  const key = request.mode === 'navigate' ? './index.html' : request;
  event.respondWith(caches.match(key).then((hit) => hit || fetch(request)));
});
