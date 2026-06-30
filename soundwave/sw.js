/**
 * SoundWave Service Worker — v2
 * Caches app shell for offline use. Audio blobs live in IndexedDB (app layer).
 */
const CACHE = 'soundwave-v2';
const SHELL  = [
  '/', '/index.html',
  '/css/main.css', '/css/player.css', '/css/sidebar.css', '/css/views.css',
  '/css/modules/auth.css', '/css/modules/admin.css', '/css/modules/visualizer.css',
  '/js/store.js', '/js/audio.js', '/js/ui.js', '/js/views.js', '/js/app.js',
  '/js/modules/cloud.js', '/js/modules/equalizer.js', '/js/modules/lyrics.js',
  '/js/modules/visualizer.js', '/js/modules/youtube.js', '/js/modules/admin.js',
  '/js/modules/capacitor.js',
  '/manifest.json',
  '/assets/icon-192.png', '/assets/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL).catch(err => console.warn('[SW] Cache miss:', err)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Skip cross-origin requests (Supabase, YouTube, Google Fonts etc.)
  if (url.origin !== location.origin) return;

  // Skip Netlify functions — always network first
  if (url.pathname.startsWith('/.netlify/')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        if (e.request.mode === 'navigate') return caches.match('/index.html');
      });
    })
  );
});

// Background sync for cloud uploads (if supported)
self.addEventListener('sync', e => {
  if (e.tag === 'sw-sync-library') {
    console.log('[SW] Background sync triggered');
  }
});
