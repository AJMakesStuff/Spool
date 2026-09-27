'use strict';

// Bump the version whenever the app shell changes. Updates activate after all
// tabs using the previous worker close, keeping each shell version consistent.
const CACHE_PREFIX = 'spool-shell-';
const CACHE_NAME = CACHE_PREFIX + 'v1';
const SHELL = ['/', '/index.html', '/styles.css', '/theme.js', '/data.js', '/app.js', '/icon.svg', '/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key))
  )));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never cache API responses or writes: shared inventory requires the server.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !SHELL.includes(url.pathname)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(url.pathname);
    return cached || fetch(event.request);
  }));
});
