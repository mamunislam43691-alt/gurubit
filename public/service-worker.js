/**
 * Service Worker - Network First strategy
 * Always tries network first; cache is only a fallback for offline/error
 * Static assets use stale-while-revalidate (show cache instantly, update in background)
 */

const CACHE_VERSION = 'gurubit-v6-' + '2026-07-05';
const STATIC_ASSETS = [
  '/css/output.css',
  '/assets/logo.svg',
  '/assets/logo-icon.svg',
  '/manifest.json'
];

// Install: pre-cache only truly static assets (CSS, images)
self.addEventListener('install', (event) => {
  // Skip waiting immediately — don't hold back new SW
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
});

// Handle SKIP_WAITING message from client
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Handle notification click — open /numbers page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/numbers';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return;
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Activate: delete ALL old caches immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and non-http
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) return;

  // Skip WebSocket upgrades
  if (request.headers.get('upgrade') === 'websocket') return;

  // ── API calls: Network ONLY — never serve from cache ──────────────────────
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // ── HTML pages (/, /numbers, /dashboard etc): Network first ───────────────
  // If network fails → show offline page, NOT stale HTML
  if (request.headers.get('accept')?.includes('text/html') ||
      url.pathname === '/' ||
      !url.pathname.includes('.')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Update cache with fresh HTML
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Server is down — return cached HTML if available
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            // Return a minimal offline notice
            return new Response(
              `<!DOCTYPE html><html><head><meta charset="utf-8">
              <title>GURUBIT - Offline</title>
              <style>body{background:#020b18;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px}
              h2{color:#00d2ff}p{color:#94a3b8;font-size:14px}</style></head>
              <body><h2>⚡ GURUBIT</h2><p>Server is starting up — please refresh in a moment.</p>
              <button onclick="location.reload()" style="background:#00d2ff;color:#020b18;border:none;padding:10px 24px;border-radius:8px;font-weight:bold;cursor:pointer;margin-top:8px">Retry</button>
              </body></html>`,
              { headers: { 'Content-Type': 'text/html' } }
            );
          });
        })
    );
    return;
  }

  // ── JS files: Network first, cache fallback ────────────────────────────────
  if (url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // ── CSS / images / fonts: Stale-while-revalidate ──────────────────────────
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
        }
        return response;
      }).catch(() => cached);

      // Return cache immediately if available, update in background
      return cached || networkFetch;
    })
  );
});
