const startupVersion = '3.13.2';
const cacheVersion = `liftline-${startupVersion}-1`;
const shellCache = `${cacheVersion}-shell`;
const assetCache = `${cacheVersion}-assets`;
const readyKey = '/__liftline_startup_ready__';

const coreShell = [
  '/',
  '/manifest.webmanifest',
  '/favicon-v9-32.png',
  '/favicon-v9.png',
  '/apple-touch-icon.png',
  '/liftline-icon-192-v9.png',
  '/illustrations/goblet-squat.webp',
];

function isCacheable(response) {
  return response.ok && response.type === 'basic' && !response.redirected;
}

function isStaticAsset(value) {
  if (typeof value !== 'string') return false;
  const url = new URL(value, self.location.origin);
  return (
    url.origin === self.location.origin &&
    url.pathname.startsWith('/_next/static/')
  );
}

async function download(url) {
  return fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    signal: AbortSignal.timeout(8000),
  });
}

function validStartupAsset(response, url) {
  const type = response.headers.get('content-type') ?? '';
  const path = new URL(url, self.location.origin).pathname;
  return (
    isCacheable(response) &&
    ((path.endsWith('.js') && /javascript/.test(type)) ||
      (path.endsWith('.css') && type.includes('text/css')))
  );
}

// Commit the HTML last, only after every required asset is actually stored.
// Failed downloads/permissions/quota never replace a working offline shell.
async function prepareShell(response) {
  try {
    if (
      !isCacheable(response) ||
      !(response.headers.get('content-type') ?? '').includes('text/html')
    )
      return false;
    const html = await response.clone().text();
    if (!html.includes(`name="liftline-build" content="${startupVersion}"`))
      return false;
    const assets = await caches.open(assetCache);
    const shell = await caches.open(shellCache);
    const oldReady = await shell.match(readyKey);
    const manifestResponse =
      oldReady ?? (await download('/startup-assets.json'));
    if (!oldReady && !isCacheable(manifestResponse)) return false;
    const manifest = await manifestResponse.json();
    if (
      manifest.version !== startupVersion ||
      !Array.isArray(manifest.assets) ||
      !manifest.assets.length ||
      manifest.assets.length > 100 ||
      !manifest.assets.every(isStaticAsset)
    )
      return false;
    const expected = new Set(
      manifest.assets.map((url) => new URL(url, self.location.origin).href),
    );
    const referenced = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter(isStaticAsset);
    if (
      !referenced.some((url) => url.endsWith('.js')) ||
      !referenced.some((url) => url.endsWith('.css')) ||
      referenced.some(
        (url) => !expected.has(new URL(url, self.location.origin).href),
      )
    )
      return false;
    // Bound concurrent fetches rather than flooding the phone's connections.
    for (let offset = 0; offset < manifest.assets.length; offset += 6) {
      await Promise.all(
        manifest.assets.slice(offset, offset + 6).map(async (url) => {
          const cached = await assets.match(url);
          if (cached && validStartupAsset(cached, url)) return;
          const asset = await download(url);
          if (!validStartupAsset(asset, url))
            throw Error('Startup asset unavailable');
          await assets.put(url, asset);
        }),
      );
    }
    await shell.put('/', response);
    await shell.put(readyKey, Response.json(manifest));
    return true;
  } catch {
    return false;
  }
}

async function cachedShell() {
  const current = await caches.open(shellCache);
  const cached = await current.match('/');
  if (cached) return cached;
  // Legacy shells lack a ready marker; preserve them during the first upgrade.
  const names = (await caches.keys())
    .filter(
      (name) =>
        name.startsWith('liftline-') &&
        name.endsWith('-shell') &&
        name !== shellCache,
    )
    .reverse();
  for (const name of names) {
    const previous = await (await caches.open(name)).match('/');
    if (previous) return previous;
  }
}

async function pruneVerifiedCaches() {
  if (!(await (await caches.open(shellCache)).match(readyKey))) return;
  const names = await caches.keys();
  const previous = names.filter(
    (name) =>
      name.startsWith('liftline-') &&
      name.endsWith('-shell') &&
      name !== shellCache,
  );
  const keep = new Set([shellCache, assetCache]);
  // Retain two previous shell/asset pairs for open tabs and rollback, in cache
  // creation order (not lexicographic version order: 3.9 > 3.13 as text).
  for (const name of previous.slice(-2)) {
    keep.add(name);
    keep.add(name.replace(/-shell$/, '-assets'));
  }
  await Promise.all(
    names
      .filter(
        (name) =>
          name.startsWith('liftline-') &&
          /-(shell|assets)$/.test(name) &&
          !keep.has(name),
      )
      .map((name) => caches.delete(name)),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // A failed update still installs, but serves the previous shell until a
      // later online refresh verifies the complete replacement.
      try {
        await prepareShell(await download('/'));
      } catch {
        /* Offline. */
      }
      const cache = await caches.open(shellCache);
      await Promise.allSettled(
        coreShell
          .filter((url) => url !== '/')
          .map(async (url) => {
            const response = await download(url);
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
      await pruneVerifiedCaches();
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
          const cached = await cache.match(asset);
          if (cached && validStartupAsset(cached, asset)) return;
          const response = await fetch(asset, { credentials: 'same-origin' });
          if (validStartupAsset(response, asset))
            await cache.put(asset, response);
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
    // Authentication and other platform routes must never be replaced by the
    // cached workout interface or overwrite its root shell.
    if (url.pathname !== '/') return;
    const refresh = (async () => {
      try {
        return (await event.preloadResponse) ?? (await download(request));
      } catch {
        return null;
      }
    })();
    // Do not hold a first/explicit launch behind asset warming. Register the
    // lifetime promise synchronously; warming continues after HTML is returned.
    event.waitUntil(
      refresh
        .then(async (response) => {
          if (response && (await prepareShell(response.clone())))
            await pruneVerifiedCaches();
        })
        .catch(() => {}),
    );
    event.respondWith(
      (async () => {
        const cached = await cachedShell();
        const preferFresh = url.searchParams.has('v');

        if (preferFresh) {
          const response = await refresh;
          if (response) return response;
          if (cached) return cached;
          return Response.error();
        }

        if (cached) {
          // The installed app already has a device-local shell. Paint it
          // immediately instead of waiting for network validation (up to 1s).
          // API requests and sign-in routes still go through the private gate;
          // redirected sign-in HTML is never allowed to replace this shell.
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
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2') ||
    (url.pathname.startsWith('/fonts/') && url.pathname.endsWith('.ttf'));

  if (!cacheableAsset) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(assetCache);
      const cached = await caches.match(request);
      const scriptOrStyle = /\.(js|css)$/.test(url.pathname);
      if (cached && (!scriptOrStyle || validStartupAsset(cached, url.href)))
        return cached;

      const response = await fetch(request);
      if (
        isCacheable(response) &&
        (!scriptOrStyle || validStartupAsset(response, url.href))
      )
        await cache.put(request, response.clone());
      return response;
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const tabs = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const tab of tabs) {
        if (new URL(tab.url).origin === self.location.origin && 'focus' in tab)
          return tab.focus();
      }
      return clients.openWindow('/');
    })(),
  );
});
