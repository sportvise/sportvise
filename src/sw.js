// SPORTVISE Service Worker v23 — INTELLIGENT CACHING + WEB PUSH
// ═══════════════════════════════════════════════════════════════════
// v22 → v23 : ajout des listeners 'push' (réception brief matinal) et
// 'notificationclick' (ouverture dashboard au clic). Pas de changement
// dans la cache strategy déjà éprouvée en prod.
//
// Cache strategies par type d'URL (inchangé v22) :
//   • CACHE-FIRST IMMUTABLE  → /assets/*, /icons/* (hashés ou stables)
//   • NETWORK-FIRST FALLBACK → HTML pages (/dashboard.html, /login.html, /, /index.html, etc.)
//   • STALE-WHILE-REVALIDATE → /manifest.json, /og-image.png
//   • NETWORK-ONLY PASSTHRU  → /.netlify/functions/*, Supabase, Sentry, /sw.js, /version.json, POSTs
//
// Web Push v23 :
//   • Subscription via VAPID public key (récupérée via /api/get-vapid-key OU env injectée
//     dans le bundle build.js). Stockée dans Supabase push_subscriptions.
//   • Listener 'push' parse le payload JSON et appelle showNotification().
//   • Listener 'notificationclick' focus la fenêtre existante OU ouvre /dashboard.html.
//
// Pre-cache au install : login.html + manifest + 2 icons (offline-ready minimum).
// Activate nettoie tous les caches dont le nom ne match pas CACHE_VERSION courant.
// ═══════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'sportvise-v23-1';
const APP_VERSION = '23';

// Liste des assets à pré-cacher au moment de l'installation. On garde minimal
// (les assets hashés sont énormes et seront cachés on-demand au premier fetch).
const PRECACHE_URLS = [
  '/login.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// URLs à NE JAMAIS cacher (passthrough direct au réseau)
const NETWORK_ONLY_PATHS = [
  '/version.json',
  '/sw.js',
  '/.netlify/functions/',
  '/auth/',  // Supabase callbacks
];

// Domaines tiers à laisser passer sans interception
const NETWORK_ONLY_HOSTS = [
  'supabase.co',
  'supabase.in',
  'sentry.io',
  'ingest.sentry.io',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// ── Install : pré-cache des essentials, skipWaiting pour update rapide ──
self.addEventListener('install', e => {
  console.log('[SW v22] Install — pre-caching essentials');
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(err => {
        // Si un asset n'existe pas (ex. pas encore déployé), on log mais
        // on ne bloque pas l'install. Le SW reste fonctionnel.
        console.warn('[SW v22] Pre-cache partial failure:', err);
      }))
      .then(() => self.skipWaiting())
  );
});

// ── Activate : nettoie les anciens caches, prend le contrôle ──
self.addEventListener('activate', e => {
  console.log('[SW v22] Activate — cleaning old caches');
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => {
          console.log('[SW v22] Deleting old cache:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch : router par type d'URL ──
self.addEventListener('fetch', e => {
  const req = e.request;

  // Méthode non-GET → passthrough total
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Cross-origin tiers (Supabase, Sentry, Google Fonts) → passthrough
  if (url.origin !== self.location.origin) {
    if (NETWORK_ONLY_HOSTS.some(host => url.hostname.endsWith(host))) {
      return; // let browser handle natively
    }
  }

  // Same-origin paths qu'on ne veut JAMAIS cacher
  if (NETWORK_ONLY_PATHS.some(p => url.pathname === p || url.pathname.startsWith(p))) {
    return; // passthrough
  }

  // Cache-first immutable : /assets/* (CSS/JS hashés) et /icons/*
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(cacheFirstImmutable(req));
    return;
  }

  // Stale-while-revalidate : /manifest.json, /og-image.png
  if (url.pathname === '/manifest.json' || url.pathname === '/og-image.png') {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Network-first avec fallback cache : HTML pages, racine, et tout le reste same-origin
  e.respondWith(networkFirstWithCacheFallback(req));
});

// ── Stratégie : cache-first, network seulement si miss ──
// Pour les assets hashés : si c'est en cache, ne JAMAIS aller au réseau (le
// hash dans le nom garantit que le contenu n'a pas bougé). Économie bandwidth max.
async function cacheFirstImmutable(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    // Status 200 + basique → cacher pour réutilisation infinie
    if (fresh && fresh.status === 200 && fresh.type === 'basic') {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    // Offline et pas en cache → on ne peut rien faire
    return new Response('Offline asset unavailable', { status: 503 });
  }
}

// ── Stratégie : network-first, fallback cache si offline ──
// Pour HTML : on veut TOUJOURS la dernière version (qui contient les hashes
// d'assets à jour). Si offline, on sert depuis cache (= page accessible offline).
async function networkFirstWithCacheFallback(req) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.status === 200 && fresh.type === 'basic') {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Last resort : offline page minimale
    return new Response(
      '<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px"><h1>Hors ligne</h1><p>SPORTVISE n\'est pas accessible sans connexion. Reconnecte-toi pour continuer.</p></body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
    );
  }
}

// ── Stratégie : sert le cache immédiatement, refresh en arrière-plan ──
// Pour les assets stables mais qui peuvent changer occasionnellement (manifest,
// og-image). UX rapide + fraîcheur éventuelle au prochain fetch.
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then(fresh => {
    if (fresh && fresh.status === 200 && fresh.type === 'basic') {
      cache.put(req, fresh.clone());
    }
    return fresh;
  }).catch(() => null);
  return cached || networkPromise || new Response('Offline', { status: 503 });
}

// ── Listen for messages (compat avec le pattern existant) ──
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data === 'CHECK_VERSION') {
    e.source.postMessage({ type: 'SW_VERSION', version: APP_VERSION });
  }
});

// ═══════════════════════════════════════════════════════════════════
// v23 — WEB PUSH SUPPORT
// ═══════════════════════════════════════════════════════════════════

// ── Push event : reçoit le brief matinal envoyé par send-morning-brief ──
// Payload attendu (JSON) :
//   { title: string, body: string, url?: string, tag?: string, badge?: string }
// Le url est ouvert au clic (default: /dashboard.html).
self.addEventListener('push', e => {
  if (!e.data) return;

  let payload = {};
  try {
    payload = e.data.json();
  } catch (err) {
    // Payload texte simple (fallback)
    payload = { title: 'SPORTVISE', body: e.data.text() };
  }

  const title = payload.title || 'SPORTVISE';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    tag: payload.tag || 'morning-brief',
    data: { url: payload.url || '/dashboard.html' },
    requireInteraction: false,
    silent: false,
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click : focus l'onglet existant ou ouvre /dashboard.html ──
// Si l'app est déjà ouverte dans un onglet → on focus celui-là.
// Sinon → on ouvre une nouvelle window/onglet sur l'URL spécifiée dans le payload.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/dashboard.html';

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Si un onglet SPORTVISE est déjà ouvert, focus-le et navigate vers l'url cible
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url).catch(() => {});
            return client.focus();
          }
        }
        // Sinon, ouvre une nouvelle window
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});
