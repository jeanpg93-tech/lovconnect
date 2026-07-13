// Kill-switch service worker.
// Unregisters any previously installed service worker and clears all
// caches so devices that had a stale PWA cache recover automatically
// on next load.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) {}
    try {
      await self.registration.unregister();
    } catch (_) {}
    try {
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        try { client.navigate(client.url); } catch (_) {}
      }
    } catch (_) {}
  })());
});