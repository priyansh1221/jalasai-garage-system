const CACHE = 'jalasai-BUILD_TIMESTAMP';
const CACHE_PREFIX = 'jalasai-';
const APP_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './assets/jalasai-logo-premium.jpg',
  './icons/favicon.png',
  './icons/jalasai-icon-192.png',
  './icons/jalasai-icon-512.png',
  './js/qrgen.js',
  './js/cloud-config.js',
  './js/vendor/lz-string.min.js',
  './js/data.js',
  './js/utils.js',
  './js/jobs.js',
  './js/stock.js',
  './js/customers.js',
  './js/reminders.js',
  './js/mechanics.js',
  './js/expenses.js',
  './js/reports.js',
  './js/scanner.js',
  './js/print.js',
  './js/sync.js',
  './js/shell.js',
  './js/new-ui.js',
  './js/vendor/supabase.js',
  './newui/',
  './newui/index.html',
  './newui/style.css',
  './newui/manifest.webmanifest',
  './newui/assets/jalasai-logo-premium.jpg',
  './newui/icons/favicon.png',
  './newui/icons/jalasai-icon-192.png',
  './newui/icons/jalasai-icon-512.png',
];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function normalizePathname(url) {
  const path = url.pathname || '/';
  if (path === '/') return './index.html';
  if (path.endsWith('/index.html')) return `.${path}`;
  return `.${path}`;
}

function isAppShellRequest(request) {
  const url = new URL(request.url);
  if (!isSameOrigin(url)) return false;
  if (request.mode === 'navigate') return true;
  const normalized = normalizePathname(url);
  return APP_ASSETS.includes(normalized);
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const sameOrigin = isSameOrigin(new URL(event.request.url));

  if (isAppShellRequest(event.request)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const refresh = fetch(event.request)
          .then(networkRes => {
            if (networkRes && networkRes.ok && sameOrigin) {
              const copy = networkRes.clone();
              caches.open(CACHE).then(cache => cache.put(event.request, copy));
            }
            return networkRes;
          })
          .catch(() => null);
        if (cached) return cached;
        return refresh.then(networkRes => {
          if (networkRes) return networkRes;
          if (event.request.mode === 'navigate') {
            const url = new URL(event.request.url);
            if (url.pathname.startsWith('/newui/')) {
              return caches.match('./newui/index.html') || caches.match(event.request);
            }
            return caches.match('./index.html') || caches.match(event.request);
          }
          return caches.match(event.request);
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request)
        .then(networkRes => {
          if (networkRes && networkRes.ok && sameOrigin) {
            const copy = networkRes.clone();
            caches.open(CACHE).then(cache => cache.put(event.request, copy));
          }
          return networkRes;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
