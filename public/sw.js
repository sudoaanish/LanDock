const CACHE_NAME = 'landock-cache-v6';
const ASSETS = [
    'client.html',
    'global.css',
    'client.js',
    'manifest.json',
    'icon.png',
    'icon-512.png',
    'icons/apple-touch-icon.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'logo.png'
];

// Install Event
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching static client assets');
            return cache.addAll(ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Activate Event
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[SW] Clearing old cache');
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event (Cache-first with Network fallback)
self.addEventListener('fetch', (e) => {
    // Avoid caching REST API requests (like status check or websocket handshakes)
    if (e.request.url.includes('/api/') || e.request.url.startsWith('ws') || e.request.url.startsWith('http') === false) {
        return;
    }

    e.respondWith(
        caches.match(e.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Fetch in background to update cache (stale-while-revalidate)
                fetch(e.request).then((networkResponse) => {
                    if (networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
                    }
                }).catch(() => {/* Ignore background fetch failures */});
                
                return cachedResponse;
            }
            return fetch(e.request);
        })
    );
});
