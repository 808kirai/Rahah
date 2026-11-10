// rahah's service worker, it lets phones install rahah as an app and keeps studying going without internet
// everything is fetched fresh first, and the saved copy is only used when the network is down, so
// nothing goes stale while online. saved are the app itself, flashcard decks and tests, and the lists
// the home page shows, so decks and tests that were opened before still work offline

const shell_cache = "rahah-shell-6";
const data_cache = "rahah-data-1";
const offline_page = "/static/offline.html";

// the app itself, kept at install so the first offline visit works
const shell = [
    "/",
    "/static/js/core.js",
    "/static/js/chat.js",
    "/static/js/pages.js",
    "/static/js/reminders.js",
    "/static/js/study.js",
    "/static/js/performance.js",
    "/static/js/friends.js",
    "/static/js/slides.js",
    "/static/js/main.js",
    "/static/sketches.js",
    "/static/style.css",
    "/static/manifest.webmanifest",
    "/static/img/icon-192.png",
    "/static/img/icon-64.png",
    offline_page,
    "https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js",
    "https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css",
];

// answers from the server worth keeping for offline use, everything else always needs the internet
const kept_api = [
    /^\/api\/modes$/,
    /^\/api\/sets$/,
    /^\/api\/sets\/[0-9a-f]+$/,
    /^\/api\/conversations$/,
    /^\/api\/conversations\/[0-9a-f-]+$/,
    /^\/api\/recommendations$/,
    /^\/api\/reminders$/,
    /^\/api\/timetable$/,
    /^\/api\/today$/,
    /^\/api\/performance$/,
    /^\/api\/report$/,
];

// libraries from these sites have their version in the address, so a saved copy never goes out of date
const library_hosts = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
    // one file that won't download doesn't stop the rest
    event.waitUntil(caches.open(shell_cache).then((cache) => Promise.all(shell.map((url) => cache.add(url).catch(() => {})))));
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    const keep = [shell_cache, data_cache];
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)))));
    self.clients.claim();
});

// fresh from the network, saved for later, and the saved copy when the network is down
async function network_first(request, cache_name, fallback_key = request, ignore_search = false) {
    const cache = await caches.open(cache_name);
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(fallback_key, response.clone());
        return response;
    } catch (error) {
        const saved = await cache.match(fallback_key, { ignoreSearch: ignore_search });
        if (saved) return saved;
        throw error;
    }
}

async function library(request) {
    const cache = await caches.open(shell_cache);
    const saved = await cache.match(request);
    if (saved) return saved;
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") cache.put(request, response.clone());
    return response;
}

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);

    if (request.mode === "navigate") {
        // the app is one page, so any page load offline gets the saved app, or the offline page before it's saved
        event.respondWith(
            network_first(request, shell_cache, "/").catch(() => caches.match(offline_page)),
        );
    } else if (url.origin === self.location.origin && url.pathname.startsWith("/static/")) {
        event.respondWith(network_first(request, shell_cache, url.pathname));
    } else if (url.origin === self.location.origin && kept_api.some((pattern) => pattern.test(url.pathname))) {
        // today's nudge and the weekly report ask with the date, the last one saved is close enough offline
        event.respondWith(network_first(request, data_cache, url.pathname + url.search, true));
    } else if (library_hosts.includes(url.hostname)) {
        event.respondWith(library(request));
    }
});

// a reminder notification from rahah's server, shown even when rahah is closed
self.addEventListener("push", (event) => {
    let note = {};
    try {
        note = event.data ? event.data.json() : {};
    } catch (e) {}
    event.waitUntil(
        self.registration.showNotification(note.title || "Rahah", {
            body: note.body || "",
            tag: note.tag,
            icon: "/static/img/icon-192.png",
            badge: "/static/img/icon-64.png",
            data: { url: note.url || "/" },
        }),
    );
});

// tapping the notification opens rahah on the reminders page, in a tab that's already open if there is one
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
            const tab = tabs.find((t) => t.url.startsWith(self.location.origin));
            if (tab) return tab.navigate(url).then((t) => (t || tab).focus());
            return self.clients.openWindow(url);
        }),
    );
});
