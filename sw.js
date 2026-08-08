/* ==========================================================================
   WEEKLY PLANNER PRO - SERVICE WORKER (NETWORK FIRST STRATEGY V3)
   Always fetch fresh files online, fallback to cache offline only
   ========================================================================== */

const CACHE_NAME = 'weekly-planner-v3';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Network First Strategy: Always get fresh files online!
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
        }).catch(() => {
            return caches.match(event.request) || caches.match('./index.html');
        })
    );
});
