const CACHE_NAME = 'anitrack-v5.1';

// Dynamically determine the base path (e.g. '/' or '/AniTrack/') based on service worker location
const BASE_PATH = self.location.pathname.substring(0, self.location.pathname.lastIndexOf('/') + 1);

const RELATIVE_ASSETS = [
  '',
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'favicon.png',
  'css/style.css',
  'js/storage.js',
  'js/ui.js',
  'js/catalogue.js',
  'js/collection.js',
  'js/franchise.js',
  'js/app.js'
];

const STATIC_ASSETS = RELATIVE_ASSETS.map(asset => BASE_PATH + asset).concat([
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
]);

// Install Event - Pre-cache App Shell with fail-safe resilience
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Use allSettled so a single missing file or slow CDN request never aborts service worker activation
      await Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => {
            console.warn('PWA: Failed to precache asset:', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean Up Obsolete Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Stale-While-Revalidate with Navigation Fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Handle HTML navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        return (
          (await caches.match(BASE_PATH + 'index.html')) ||
          (await caches.match(BASE_PATH)) ||
          (await caches.match('./index.html')) ||
          (await caches.match('/index.html')) ||
          (await caches.match('/'))
        );
      })
    );
    return;
  }

  // Never cache external API search requests
  if (event.request.url.includes('kitsu.io') || event.request.url.includes('anilist.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for offline network failures
      });

      return cachedResponse || fetchPromise;
    })
  );
});
