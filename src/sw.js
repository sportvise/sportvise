// SPORTVISE Service Worker v22 — INTELLIGENT CACHING
// ═══════════════════════════════════════════════════════════════════
// Sortie de l'ère "v21 nuclear self-destruct". v22 réintroduit du caching
// sélectif pour réduire le bandwidth Netlify et accélérer les chargements
// répétés sans risquer de servir une version périmée.
//
// Cache strategies par type d'URL :
//   • CACHE-FIRST IMMUTABLE  → /assets/*, /icons/* (hashés ou stables)
//   • NETWORK-FIRST FALLBACK → HTML pages (/dashboard.html, /login.html, /, /index.html, etc.)
//   • STALE-WHILE-REVALIDATE → /manifest.json, /og-image.png
//   • NETWORK-ONLY PASSTHRU  → /.netlify/functions/*, Supabase, Sentry, /sw.js, /version.json, POSTs
//
// Pre-cache au install : login.html + manifest + 2 icons (offline-ready minimum).
// Activate nettoie tous les caches dont le nom ne match pas CACHE_VERSION courant.
// ═══════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'sportvise-v22-1';
const APP_VERSION = '22';

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
