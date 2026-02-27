const CACHE_NAME = "yaNote-remix-cache-v1.0.5";
const APP_ASSETS = [
    "./",
    "./index.html",
    "./manifest.json",
    "./icons/icon-192x192.png",
    "./icons/icon-512x512.png",
    "./css/variables.css",
    "./css/base.css",
    "./css/canvas.css",
    "./css/node.css",
    "./css/connection.css",
    "./css/controls.css",
    "./css/modal.css",
    "./js/app.js",
    "./js/utils.js",
    "./js/node.js",
    "./js/connection.js",
    "./js/hierarchy.js",
    "./js/tooltip.js"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
    } else if (APP_ASSETS.some(asset => event.request.url.endsWith(asset) || event.request.url.includes(asset.replace('./', '/')))) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
    } else {
        event.respondWith(
            caches.match(event.request).then(response => response || fetch(event.request))
        );
    }
});
