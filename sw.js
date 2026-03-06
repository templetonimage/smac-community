// SMAC Community — Service Worker
// Provides basic offline support and home screen install

const CACHE_NAME = "smac-v1";
const ASSETS = [
  "./index.html",
  "./manifest.json"
];

// Install: cache core assets
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first, fallback to cache
self.addEventListener("fetch", event => {
  // Skip non-GET and Firebase/Google requests (always need network)
  if (event.request.method !== "GET") return;
  const url = event.request.url;
  if (url.includes("firebase") || url.includes("googleapis") || url.includes("gstatic")) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache fresh responses
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
