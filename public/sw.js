const cacheVersion = 'liftline-2026-09-03-1';
const shellCache = `${cacheVersion}-shell`;
const assetCache = `${cacheVersion}-assets`;

const coreShell = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/app-icon.svg',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

function isCacheable(response) {
  return response.ok && response.type === 'basic' && !response.redirected;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(shellCache);
    await Promise.allSettled(coreShell.map(async (url) => {
      const response = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
      if (isCacheable(response)) await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith('liftline-') && name !== shellCache && name !== assetCache)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'WARM_ASSETS' || !Array.isArray(event.data.assets)) return;

  event.waitUntil((async () => {
    const cache = await caches.open(assetCache);
    const assets = [...new Set(event.data.assets)].filter((asset) => {
      try {
        const url = new URL(asset);
        return url.origin === self.location.origin && url.pathname.startsWith('/_next/static/');
      } catch {
        return false;
      }
    });

    await Promise.allSettled(assets.map(async (asset) => {
      if (await cache.match(asset)) return;
      const response = await fetch(asset, { credentials: 'same-origin' });
      if (isCacheable(response)) await cache.put(asset, response);
    }));
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(shellCache);
      const cached = await cache.match('/');
      const refresh = fetch(request, { credentials: 'same-origin' }).then(async (response) => {
        const contentType = response.headers.get('content-type') ?? '';
        if (isCacheable(response) && contentType.includes('text/html')) {
          await cache.put('/', response.clone());
        }
        return response;
      });

      if (cached) {
        event.waitUntil(refresh.catch(() => undefined));
        return cached;
      }

      try {
        return await refresh;
      } catch {
        return Response.error();
      }
    })());
    return;
  }

  const cacheableAsset = url.pathname.startsWith('/_next/static/')
    || url.pathname === '/manifest.webmanifest'
    || url.pathname.endsWith('.png')
    || url.pathname.endsWith('.svg')
    || url.pathname.endsWith('.woff2');

  if (!cacheableAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(assetCache);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (isCacheable(response)) await cache.put(request, response.clone());
    return response;
  })());
});
