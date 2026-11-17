/* Recursos locales para uso offline; nunca consultamos GeneradorExamenes al ejecutar. */
'use strict';
const VERSION = 'examinator2-v1-bancos-20261117';
const PREFIX = 'examinator2-';
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.png",
  "./icono.svg",
  "./styles.css",
  "./fonts.css",
  "./fonts/gentium-book-plus-latin-400-italic.woff2",
  "./fonts/gentium-book-plus-latin-400-normal.woff2",
  "./fonts/gentium-book-plus-latin-700-italic.woff2",
  "./fonts/gentium-book-plus-latin-700-normal.woff2",
  "./fonts/gentium-book-plus-latin-ext-400-italic.woff2",
  "./fonts/gentium-book-plus-latin-ext-400-normal.woff2",
  "./fonts/gentium-book-plus-latin-ext-700-italic.woff2",
  "./fonts/gentium-book-plus-latin-ext-700-normal.woff2",
  "./lib/jszip.min.js",
  "./js/datos.js",
  "./js/bancos-datos.js",
  "./js/bancos-loader.js",
  "./js/incluidos.js",
  "./js/shim.js",
  "./js/motor.js",
  "./js/util.js",
  "./js/vocabulario.js",
  "./js/render.js",
  "./js/propose.js",
  "./js/exam.js",
  "./js/library.js",
  "./js/lists.js",
  "./js/start.js",
  "./js/pwa.js"
];
const HOME = new URL('./index.html', self.registration.scope).href;
const assets = new Set(PRECACHE.map((p) => new URL(p, self.registration.scope).href));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(PRECACHE.map((p) => new URL(p, self.registration.scope).href));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const online = await fetch(event.request);
        if (online.ok) return online;
      } catch (_) { /* offline */ }
      return (await caches.match(HOME)) || Response.error();
    })());
    return;
  }
  if (!assets.has(url.href)) return; // Perseus y otros datos externos siguen siendo opcionales
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const online = await fetch(event.request);
    if (online.ok) (await caches.open(VERSION)).put(event.request, online.clone());
    return online;
  })());
});
