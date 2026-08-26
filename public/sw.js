// Hybrid Athlete Service Worker (Offline-First PWA)
//
// Strategien:
//  - /_next/static/*  → Cache-first (gehashte, immutable Assets)
//  - Navigationen     → Network-first mit Cache-Fallback (Offline-Shell)
//  - /api/*           → IMMER Netzwerk, kein Caching (Auth-Cookies + Live-Daten)
//  - Sonstige GETs    → Stale-while-revalidate (Manifest, Icons, Fonts …)
//
// Offline-Fähigkeit der DATEN läuft über IndexedDB (src/lib/offline/*),
// nicht über diesen SW – hier geht es nur um die App-Shell/Assets.
const CACHE_NAME = "hybrid-athlete-v3";
const OFFLINE_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Neue Version sofort aktivieren, sobald die Seite es anfordert
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function putInCache(request, response) {
  if (!response || !response.ok || response.type === "opaque") return Promise.resolve();
  return caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // In Development oder auf Localhost niemals cachen
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.pathname.includes("/development/")) {
    return;
  }

  // API-Aufrufe nie cachen (Auth-Cookies + Live-Daten).
  // Mutations laufen über die IndexedDB-Sync-Queue im Client.
  if (url.pathname.startsWith("/api/")) return;

  // Gehashte Build-Assets: cache-first mit Background-Update (immutable)
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            const clone = response.clone();
            putInCache(request, response).then(() => clone);
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // Navigationen: network-first, Fallback auf Cache → Offline-Shell.
  // Damit startet die App komplett offline (App-Shell aus dem Cache).
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          putInCache(request, response).then(() => clone);
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || (await caches.match(OFFLINE_URL)) || Response.error();
        })
    );
    return;
  }

  // Übrige same-origin GETs (manifest, fonts …): stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          const clone = response.clone();
          putInCache(request, response).then(() => clone);
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
