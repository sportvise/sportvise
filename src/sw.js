// SPORTVISE Service Worker v21 — NUCLEAR: self-destruct mode
// This SW exists ONLY to kill old service workers and clear all caches.
// Once activated, it unregisters itself so no SW interferes with fresh loads.

const CACHE_NAME = 'sportvise-v21';
const APP_VERSION = '21';

// Install — skip waiting immediately to take over from old SW
self.addEventListener('install', e => {
  self.skipWaiting();
});

// Activate — NUKE everything, notify clients, then self-destruct
self.addEventListener('activate', e => {
  e.waitUntil(
    // Step 1: Delete ALL caches
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => {
      // Step 2: Take control of all clients
      return self.clients.claim();
    }).then(() => {
      // Step 3: Tell all open windows to reload
      return self.clients.matchAll({ type: 'window' });
    }).then(clients => {
      clients.forEach(client => {
        client.postMessage({ type: 'SW_UPDATED', version: APP_VERSION });
      });
    }).then(() => {
      // Step 4: SELF-DESTRUCT — unregister this service worker
      return self.registration.unregister();
    }).then(() => {
      console.log('[SW v21] Self-destructed. No more service worker.');
    })
  );
});

// Fetch — ALWAYS network, NEVER cache anything
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Pass everything straight to network, no caching
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).catch(() => {
      // If offline, try cache as absolute last resort
      return caches.match(e.request);
    })
  );
});

// Listen for messages
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data === 'CHECK_VERSION') {
    e.source.postMessage({ type: 'SW_VERSION', version: APP_VERSION });
  }
});
