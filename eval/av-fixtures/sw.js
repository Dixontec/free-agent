'use strict';
self.addEventListener('install', event => { event.waitUntil(caches.open('fa-av-demo').then(cache => cache.put('/cached', new Response('fixture-cache-ok'))).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (new URL(event.request.url).pathname === '/sw-proof') event.respondWith(caches.open('fa-av-demo').then(cache => cache.match('/cached')).then(async response => new Response('<!doctype html><title>SW cache persisted</title>' + await response.text(), { headers: { 'content-type': 'text/html' } })));
});
self.addEventListener('message', event => {
  if (typeof event.data?.probe !== 'string' || !event.data.probe.startsWith('http://127.0.0.1:')) return;
  event.waitUntil(fetch(event.data.probe, { mode: 'no-cors' }).then(() => event.source.postMessage('private-reached'), () => event.source.postMessage('private-blocked')));
});
