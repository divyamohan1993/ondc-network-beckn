// Service Worker for ONDC Bazaar
// Caches the app shell and cart data for offline access on low-connectivity networks.

const CACHE_NAME = "ondc-bazaar-v1";
const APP_SHELL = [
  "/",
  "/offline",
];

// Install: pre-cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for API, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // API routes: network only, never cache
  if (url.pathname.startsWith("/api/")) return;

  // Cart data stored in IndexedDB/localStorage by the app, not here.
  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);

      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          // Only cache successful responses for same-origin
          if (
            networkResponse.ok &&
            url.origin === self.location.origin
          ) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => {
          // Network failed; if no cache either, serve offline page
          if (!cachedResponse) {
            return cache.match("/offline") || new Response(
              "You are offline. Check your connection.",
              { status: 503, headers: { "Content-Type": "text/plain" } }
            );
          }
          return cachedResponse;
        });

      // Return cached version immediately, update in background
      return cachedResponse || fetchPromise;
    })
  );
});
