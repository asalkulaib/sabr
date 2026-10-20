// Sabr service worker. Every file is precached, so the app works fully offline.
// VERSION and ASSETS are stamped by tools/release.mjs on every release.

const VERSION = '2026.10.20-ce36a067';
const ASSETS = [
  'css/base.css',
  'css/components.css',
  'css/fonts.css',
  'css/history.css',
  'css/more.css',
  'css/satiety.css',
  'css/sheets.css',
  'css/stages.css',
  'css/today.css',
  'css/tokens.css',
  'css/week.css',
  'css/welcome.css',
  'fonts/OFL.txt',
  'fonts/nunito-600-45f437de.woff2',
  'fonts/nunito-700-fa89300b.woff2',
  'fonts/nunito-800-2363d3ed.woff2',
  'fonts/nunito-900-9ca32f5d.woff2',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-32.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon.svg',
  'import/index.html',
  'index.html',
  'js/app.js',
  'js/copies.js',
  'js/core/added-meal.js',
  'js/core/backup.js',
  'js/core/copies.js',
  'js/core/csv.js',
  'js/core/fisher.js',
  'js/core/fullness.js',
  'js/core/history.js',
  'js/core/ics.js',
  'js/core/insights.js',
  'js/core/meal-types.js',
  'js/core/review.js',
  'js/core/rules.js',
  'js/core/satiety.js',
  'js/core/stage-more.js',
  'js/core/stages.js',
  'js/core/time.js',
  'js/core/weight.js',
  'js/db.js',
  'js/import-page.js',
  'js/rescue.js',
  'js/store.js',
  'js/strip-hash.js',
  'js/ui/alarm.js',
  'js/ui/art.js',
  'js/ui/begin-fast.js',
  'js/ui/chart.js',
  'js/ui/components.js',
  'js/ui/copies.js',
  'js/ui/day.js',
  'js/ui/dom.js',
  'js/ui/fullness.js',
  'js/ui/goal.js',
  'js/ui/help.js',
  'js/ui/history.js',
  'js/ui/icons.js',
  'js/ui/meal.js',
  'js/ui/more.js',
  'js/ui/outside.js',
  'js/ui/palette.js',
  'js/ui/pause.js',
  'js/ui/rings.js',
  'js/ui/satiety.js',
  'js/ui/share.js',
  'js/ui/shared.js',
  'js/ui/sheet.js',
  'js/ui/stages.js',
  'js/ui/temptation.js',
  'js/ui/today-parts.js',
  'js/ui/today.js',
  'js/ui/week.js',
  'js/ui/weight.js',
  'js/ui/welcome.js',
  'js/ui/window-times.js',
  'js/version.js',
  'js/weight-import.js',
  'manifest.webmanifest',
];

const CACHE = `sabr-${VERSION}`;
const scope = self.registration.scope;
const INDEX = new URL('./', scope).href;
const IMPORT_PAGE = new URL('import/', scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 'reload' skips the HTTP cache so a release never mixes old and new files.
    await cache.addAll([INDEX, IMPORT_PAGE, ...ASSETS].map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('sabr-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    const path = url.href.split(/[?#]/)[0];
    // /sabr/import without the slash: redirect like the server does, so the
    // page's relative links resolve. The #payload survives the redirect.
    if (path === IMPORT_PAGE.replace(/\/$/, '')) {
      event.respondWith(Response.redirect(IMPORT_PAGE + url.search, 301));
      return;
    }
    let page = null;
    if (path === INDEX || path === `${INDEX}index.html`) page = INDEX;
    else if (path === IMPORT_PAGE || path === `${IMPORT_PAGE}index.html`) page = IMPORT_PAGE;
    if (page) {
      event.respondWith((async () => {
        const hit = await caches.match(page, { cacheName: CACHE });
        return hit || fetch(req);
      })());
      return;
    }
  }

  event.respondWith((async () => {
    const hit = await caches.match(req, { cacheName: CACHE, ignoreSearch: true });
    return hit || fetch(req);
  })());
});
