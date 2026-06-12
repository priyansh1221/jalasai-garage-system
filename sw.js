const CACHE = 'jalasai-BUILD_TIMESTAMP';
const CACHE_PREFIX = 'jalasai-';
const CACHE_BUST = 'BUILD_TIMESTAMP';
const APP_ASSETS = [
  './',
  './index.html',
  './style.css?v=BUILD_TIMESTAMP',
  './manifest.webmanifest',
  './assets/jalasai-logo-premium.jpg',
  './icons/favicon.png',
  './icons/jalasai-icon-192.png',
  './icons/jalasai-icon-512.png',
  './js/qrgen.js?v=BUILD_TIMESTAMP',
  './js/cloud-config.js?v=BUILD_TIMESTAMP',
  './js/vendor/lz-string.min.js?v=BUILD_TIMESTAMP',
  './js/data.js?v=BUILD_TIMESTAMP',
  './js/utils.js?v=BUILD_TIMESTAMP',
  './js/jobs.js?v=BUILD_TIMESTAMP',
  './js/stock.js?v=BUILD_TIMESTAMP',
  './js/customers.js?v=BUILD_TIMESTAMP',
  './js/reminders.js?v=BUILD_TIMESTAMP',
  './js/mechanics.js?v=BUILD_TIMESTAMP',
  './js/expenses.js?v=BUILD_TIMESTAMP',
  './js/reports.js?v=BUILD_TIMESTAMP',
  './js/scanner.js?v=BUILD_TIMESTAMP',
  './js/print.js?v=BUILD_TIMESTAMP',
  './js/sync.js?v=BUILD_TIMESTAMP',
  './js/shell.js?v=BUILD_TIMESTAMP',
  './js/new-ui.js?v=BUILD_TIMESTAMP',
  './js/vendor/supabase.js?v=BUILD_TIMESTAMP',
  './newui/',
  './newui/index.html',
  './newui/style.css?v=BUILD_TIMESTAMP',
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
  return APP_ASSETS.some(asset => asset.split('?')[0] === normalized);
}

function shouldNetworkFirst(request) {
  const url = new URL(request.url);
  const path = url.pathname || '/';
  return request.mode === 'navigate'
    || path.endsWith('.html')
    || path.endsWith('.css')
    || path.endsWith('.js')
    || path === '/'
    || path === '/newui/';
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll(APP_ASSETS.map(asset =>
        asset.includes('?') || asset.endsWith('/') || asset.endsWith('.html')
          ? asset
          : `${asset}?v=${CACHE_BUST}`
      ))
    )
  );
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
        const request = shouldNetworkFirst(event.request)
          ? new Request(event.request, { cache: 'reload' })
          : event.request;
        const refresh = fetch(request)
          .then(networkRes => {
            if (networkRes && networkRes.ok && sameOrigin) {
              const copy = networkRes.clone();
              caches.open(CACHE).then(cache => cache.put(event.request, copy));
            }
            return networkRes;
          })
          .catch(() => null);
        if (shouldNetworkFirst(event.request)) {
          return refresh.then(networkRes => {
            if (networkRes) return networkRes;
            if (cached) return cached;
            if (event.request.mode === 'navigate') {
              const url = new URL(event.request.url);
              if (url.pathname.startsWith('/newui/')) {
                return caches.match('./newui/index.html') || caches.match(event.request);
              }
              return caches.match('./index.html') || caches.match(event.request);
            }
            return caches.match(event.request);
          });
        }
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
