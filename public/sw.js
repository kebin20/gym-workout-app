const cacheVersion = 'liftline-2026-09-21-8';
const shellCache = `${cacheVersion}-shell`;
const assetCache = `${cacheVersion}-assets`;

const coreShell = [
  '/',
  '/manifest.webmanifest',
  '/manifest-v2.webmanifest',
  '/manifest-v3.webmanifest',
  '/manifest-v4.webmanifest',
  '/manifest-v5.webmanifest',
  '/manifest-v6.webmanifest',
  '/manifest-v7.webmanifest',
  '/liftline-app-icon-v7.svg',
  '/favicon-v8-32.png',
  '/favicon-v8.png',
  '/apple-touch-icon.png',
  '/apple-touch-icon-180x180.png',
  '/icon-192.png',
  '/icon-512.png',
  '/liftline-apple-touch-icon-v2.png',
  '/liftline-icon-192-v2.png',
  '/liftline-icon-512-v2.png',
  '/liftline-apple-touch-icon-v3.png',
  '/liftline-icon-192-v3.png',
  '/liftline-icon-512-v3.png',
  '/liftline-apple-touch-icon-v4.png',
  '/liftline-icon-192-v4.png',
  '/liftline-icon-512-v4.png',
  '/liftline-apple-touch-icon-120-v6.png',
  '/liftline-apple-touch-icon-152-v6.png',
  '/liftline-apple-touch-icon-167-v6.png',
  '/liftline-apple-touch-icon-v6.png',
  '/liftline-icon-192-v6.png',
  '/liftline-icon-512-v6.png',
  '/liftline-icon-512-maskable-v6.png',
  '/liftline-apple-touch-icon-120-v7.png',
  '/liftline-apple-touch-icon-152-v7.png',
  '/liftline-apple-touch-icon-167-v7.png',
  '/liftline-apple-touch-icon-v7.png',
  '/liftline-icon-192-v7.png',
  '/liftline-icon-512-v7.png',
  '/liftline-icon-512-maskable-v7.png',
];

function isCacheable(response) {
  return response.ok && response.type === 'basic' && !response.redirected;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(shellCache);
      await Promise.allSettled(
        coreShell.map(async (url) => {
          const response = await fetch(url, {
            cache: 'reload',
            credentials: 'same-origin',
          });
          if (isCacheable(response)) await cache.put(url, response);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      const previousAssetCaches = cacheNames
        .filter(
          (name) =>
            name.startsWith('liftline-') &&
            name.endsWith('-assets') &&
            name !== assetCache,
        )
        .sort();
      const assetCachesToDelete = previousAssetCaches.slice(
        0,
        Math.max(0, previousAssetCaches.length - 2),
      );
      await Promise.all(
        cacheNames
          .filter(
            (name) =>
              name.startsWith('liftline-') &&
              ((name.endsWith('-shell') && name !== shellCache) ||
                assetCachesToDelete.includes(name)),
          )
          .map((name) => caches.delete(name)),
      );
      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'WARM_ASSETS' || !Array.isArray(event.data.assets))
    return;

  event.waitUntil(
    (async () => {
      const cache = await caches.open(assetCache);
      const assets = [...new Set(event.data.assets)].filter((asset) => {
        try {
          const url = new URL(asset);
          return (
            url.origin === self.location.origin &&
            url.pathname.startsWith('/_next/static/')
          );
        } catch {
          return false;
        }
      });

      await Promise.allSettled(
        assets.map(async (asset) => {
          if (await cache.match(asset)) return;
          const response = await fetch(asset, { credentials: 'same-origin' });
          if (isCacheable(response)) await cache.put(asset, response);
        }),
      );
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/'))
    return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(shellCache);
        const cached = await cache.match('/');
        const preferFresh =
          url.searchParams.has('v') || url.searchParams.get('source') === 'pwa';
        const refresh = (async () => {
          try {
            const response =
              (await event.preloadResponse) ??
              (await fetch(request, {
                cache: 'no-store',
                credentials: 'same-origin',
              }));
            const contentType = response.headers.get('content-type') ?? '';
            if (isCacheable(response) && contentType.includes('text/html')) {
              await cache.put('/', response.clone());
            }
            return response;
          } catch {
            return null;
          }
        })();

        if (preferFresh) {
          const response = await refresh;
          if (response) return response;
          if (cached) return cached;
          return Response.error();
        }

        if (cached) {
          event.waitUntil(refresh);
          return cached;
        }

        const response = await refresh;
        if (response) {
          return response;
        }
        return Response.error();
      })(),
    );
    return;
  }

  const cacheableAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.endsWith('.webmanifest') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2');

  if (!cacheableAsset) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(assetCache);
      const cached = await caches.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (isCacheable(response)) await cache.put(request, response.clone());
      return response;
    })(),
  );
});
