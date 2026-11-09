/**
 * Hafz Service Worker (Phase 4: Offline Support & Caching Strategies)
 *
 * Strategies (following Modern Web Guidance):
 *   - HTML Navigation: NetworkFirst (fresh shell online, cached fallback offline)
 *   - Dynamic Manifest (tracks.json): StaleWhileRevalidate
 *   - Static App Shell (CSS, JS, Icons, Manifest): CacheFirst
 *   - Audio Recordings (.m4a, .mp3): CacheFirst with bounded cache entries
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `hafz-shell-${CACHE_VERSION}`;
const AUDIO_CACHE = `hafz-audio-${CACHE_VERSION}`;
const MAX_AUDIO_ENTRIES = 60;

const APP_SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/main.css',
  './src/main.js',
  './src/player.js',
  './src/quran.js',
  './src/loader.js',
  './src/parser.js',
  './public/icons/icon.svg',
  './public/icons/icon-192.png',
  './public/icons/icon-512.png',
  './public/icons/icon-maskable-512.png',
  './public/icons/apple-touch-icon.png',
  './public/audio/tracks.json',
  './public/quran/pages.json'
];

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const excess = keys.length - maxEntries;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = (await cache.match(request)) || (await cache.match('./index.html'));
    if (cached) return cached;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function cacheFirst(request, cacheName, maxEntries = 0) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.status === 200) {
    await cache.put(request, response.clone());
    if (maxEntries > 0) {
      await trimCache(cacheName, maxEntries);
    }
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || (await networkPromise) || new Response('[]', { status: 200 });
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches
        .open(SHELL_CACHE)
        .then((cache) => cache.addAll(APP_SHELL_URLS))
        .then(() => self.skipWaiting?.())
    );
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key !== SHELL_CACHE && key !== AUDIO_CACHE)
              .map((key) => caches.delete(key))
          )
        )
        .then(() => self.clients?.claim?.())
    );
  });

  self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // 1. HTML Navigation -> NetworkFirst
    if (request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
      event.respondWith(networkFirst(request, SHELL_CACHE));
      return;
    }

    // 2. Dynamic Tracks Manifest -> StaleWhileRevalidate
    if (url.pathname.endsWith('/tracks.json')) {
      event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
      return;
    }

    // 3. Audio Recordings (.m4a, .mp3) -> CacheFirst (skip caching partial 206 responses)
    if (url.pathname.endsWith('.m4a') || url.pathname.endsWith('.mp3')) {
      if (request.headers.get('range')) {
        return;
      }
      event.respondWith(cacheFirst(request, AUDIO_CACHE, MAX_AUDIO_ENTRIES));
      return;
    }

    // 4. Static App Shell Assets (CSS, JS, Icons, Webmanifest) -> CacheFirst
    event.respondWith(cacheFirst(request, SHELL_CACHE));
  });
}

globalThis.__hafzSW = {
  CACHE_VERSION,
  SHELL_CACHE,
  AUDIO_CACHE,
  MAX_AUDIO_ENTRIES,
  APP_SHELL_URLS,
  networkFirst,
  cacheFirst,
  staleWhileRevalidate
};

