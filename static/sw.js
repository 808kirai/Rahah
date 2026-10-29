// rahah's service worker, it lets phones install rahah as an app and shows a friendly page when offline
// nothing else is cached, so every page and answer always comes fresh from the server

const offline_cache = "rahah-offline-2";
const offline_page = "/static/offline.html";
const offline_icon = "/static/img/icon-192.png";

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(offline_cache).then((cache) => cache.addAll([offline_page, offline_icon])));
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    // older offline caches are cleared when this one takes over
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== offline_cache).map((k) => caches.delete(k)))));
    self.clients.claim();
});

// only page loads are watched, to show the offline page when the network is down, plus the logo that page shows
self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.mode === "navigate") {
        event.respondWith(fetch(request).catch(() => caches.match(offline_page)));
    } else if (new URL(request.url).pathname === offline_icon) {
        event.respondWith(fetch(request).catch(() => caches.match(offline_icon)));
    }
});
