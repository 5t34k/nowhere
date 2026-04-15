/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />
import { build, files, prerendered, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const CACHE = `nowhere-${version}`;
const ASSETS = [...build, ...files, ...prerendered];

// Install: cache all assets. Individual failures are swallowed so one
// bad asset doesn't abort the entire install.
self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => Promise.all(ASSETS.map((a) => cache.add(a).catch(() => {}))))
			.then(() => self.skipWaiting())
	);
});

// Activate: delete old caches then claim all clients immediately.
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

// Fetch: cache-first with full try/catch so a Cache API error on iOS never
// causes respondWith() to receive a rejected promise (which makes WebKit
// fall through to the network and trigger the OS "Turn Off Airplane Mode" popup).
self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	let url: URL;
	try {
		url = new URL(event.request.url);
	} catch {
		return;
	}
	if (url.origin !== self.location.origin) return;

	event.respondWith(
		(async () => {
			try {
				const cached =
					(await caches.match(event.request)) ??
					(event.request.mode === 'navigate'
						? await caches.match(event.request, { ignoreSearch: true })
						: undefined);
				if (cached) return cached;

				// Not in cache — try the network and cache the result.
				const response = await fetch(event.request);
				if (response.ok) {
					const clone = response.clone();
					caches.open(CACHE).then((cache) => cache.put(event.request, clone));
				}
				return response;
			} catch {
				// Network failed (or Cache API threw) — for navigations serve the app shell.
				if (event.request.mode === 'navigate') {
					try {
						const shell =
							(await caches.match('/app/')) ??
							(await caches.match('/'));
						if (shell) return shell;
					} catch {
						// ignore
					}
				}
				return new Response('Offline', {
					status: 503,
					headers: { 'Content-Type': 'text/plain' }
				});
			}
		})()
	);
});
