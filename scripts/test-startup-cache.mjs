import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { retainInstalledStorage } from '../lib/startup-storage.ts';

const source = readFileSync(
  new URL('../public/sw.js', import.meta.url),
  'utf8',
);
const { appVersion } = JSON.parse(
  readFileSync(new URL('../app-release.json', import.meta.url), 'utf8'),
);
const current = `liftline-${appVersion}-1`;
const marker = '/__liftline_startup_ready__';
const assets = ['/_next/static/main.js', '/_next/static/main.css'];
function response(body, init = {}) {
  const value = new Response(body, init);
  Object.defineProperties(value, {
    type: { value: 'basic' },
    redirected: { value: !!init.redirected },
  });
  value.clone = () => response(body, init);
  return value;
}
const html = (version = appVersion) =>
  response(
    `<meta name="liftline-build" content="${version}"><script src="${assets[0]}"></script><link href="${assets[1]}">`,
    { headers: { 'content-type': 'text/html' } },
  );
function fixture({
  fail = '',
  quota = '',
  redirect = false,
  manifestAssets = assets,
  version = appVersion,
} = {}) {
  const listeners = new Map();
  const data = new Map();
  const fetched = [];
  const deleted = [];
  let skipped = 0;
  const storage = {
    open: async (name) => {
      if (!data.has(name)) data.set(name, new Map());
      const cache = data.get(name);
      return {
        match: async (url) => cache.get(url)?.clone(),
        put: async (url, value) => {
          if (url === quota && name.startsWith(current))
            throw Error('Quota exceeded');
          cache.set(url, value.clone());
        },
      };
    },
    keys: async () => [...data.keys()],
    delete: async (name) => {
      deleted.push(name);
      return data.delete(name);
    },
    match: async (request) => {
      const url =
        typeof request === 'string' ? request : new URL(request.url).pathname;
      for (const cache of data.values())
        if (cache.has(url)) return cache.get(url).clone();
    },
  };
  vm.runInNewContext(source, {
    self: {
      location: { origin: 'https://liftline.test' },
      addEventListener: (type, handler) => listeners.set(type, handler),
      skipWaiting: async () => {
        skipped++;
      },
      clients: { claim: async () => {} },
      registration: {},
    },
    caches: storage,
    URL,
    Response,
    AbortSignal,
    fetch: async (request) => {
      const url =
        typeof request === 'string' ? request : new URL(request.url).pathname;
      fetched.push(url);
      if (url === fail) throw Error('Offline');
      if (url === '/')
        return redirect
          ? response('<html>Sign in</html>', {
              redirected: true,
              headers: { 'content-type': 'text/html' },
            })
          : html();
      if (url === '/startup-assets.json')
        return response(JSON.stringify({ version, assets: manifestAssets }), {
          headers: { 'content-type': 'application/json' },
        });
      return response('asset', {
        headers: {
          'content-type': url.endsWith('.css')
            ? 'text/css'
            : 'application/javascript',
        },
      });
    },
  });
  return {
    data,
    fetched,
    deleted,
    get skipped() {
      return skipped;
    },
    async seed(name, key = '/', value = html('3.13.1')) {
      await (await storage.open(name)).put(key, value);
    },
    async lifecycle(type) {
      const waits = [];
      listeners.get(type)({ waitUntil: (promise) => waits.push(promise) });
      await Promise.all(waits);
    },
    async navigate(url = '/?source=pwa', preloadResponse) {
      let result;
      const waits = [];
      listeners.get('fetch')({
        request: {
          url: 'https://liftline.test' + url,
          mode: 'navigate',
          method: 'GET',
        },
        preloadResponse: Promise.resolve(preloadResponse),
        waitUntil: (promise) => waits.push(promise),
        respondWith: (promise) => {
          result = promise;
        },
      });
      const served = await result;
      await Promise.all(waits);
      return served;
    },
  };
}

test('install commits a shell only after every critical JS/CSS asset is cached', async () => {
  const f = fixture();
  await f.lifecycle('install');
  assert.equal(f.skipped, 1);
  assert.ok(f.data.get(current + '-shell').has(marker));
  for (const asset of assets)
    assert.ok(f.data.get(current + '-assets').has(asset));
  assert.ok(f.data.get(current + '-shell').has('/'));
});

test('failed asset downloads and auth redirects preserve the previous offline interface', async () => {
  for (const options of [
    { fail: assets[0] },
    { fail: '/startup-assets.json' },
    { redirect: true },
    { quota: assets[0] },
    { quota: '/' },
  ]) {
    const f = fixture(options);
    await f.seed('liftline-3.13.1-1-shell');
    await f.seed('liftline-3.13.1-1-assets', assets[0], response('old JS'));
    await f.lifecycle('install');
    await f.lifecycle('activate');
    assert.ok(!f.data.get(current + '-shell').has('/'));
    assert.equal(f.deleted.length, 0);
    assert.match(await (await f.navigate()).text(), /3\.13\.1/);
    assert.ok(f.data.has('liftline-3.13.1-1-assets'));
  }
});

test('mismatched builds and cross-origin/API manifests are never committed', async () => {
  for (const options of [
    { version: 'old' },
    { manifestAssets: [...assets, '/api/workouts'] },
    { manifestAssets: [...assets, 'https://other.test/_next/static/a.js'] },
    { manifestAssets: [assets[0]] },
  ]) {
    const f = fixture(options);
    await f.lifecycle('install');
    assert.ok(!f.data.get(current + '-shell').has('/'));
    assert.ok(!f.fetched.includes('/api/workouts'));
  }
});

test('an HTML error cached under a JS URL is replaced with verified JavaScript before committing the shell', async () => {
  const f = fixture();
  await f.seed(
    current + '-assets',
    assets[0],
    response('<html>Sign in</html>', {
      headers: { 'content-type': 'text/html' },
    }),
  );
  await f.lifecycle('install');
  assert.ok(f.fetched.includes(assets[0]));
  assert.ok(f.data.get(current + '-shell').has(marker));
  assert.equal(
    f.data
      .get(current + '-assets')
      .get(assets[0])
      .headers.get('content-type'),
    'application/javascript',
  );
});

test('verified updates keep two prior shell/asset pairs using creation order, and never delete unrelated storage', async () => {
  const f = fixture();
  for (const version of ['3.8.0', '3.9.0', '3.13.1']) {
    await f.seed(`liftline-${version}-1-shell`);
    await f.seed(`liftline-${version}-1-assets`, assets[0], response('old'));
  }
  await f.seed('another-app-cache');
  await f.lifecycle('install');
  await f.lifecycle('activate');
  assert.deepEqual(f.deleted.sort(), [
    'liftline-3.8.0-1-assets',
    'liftline-3.8.0-1-shell',
  ]);
  for (const version of ['3.9.0', '3.13.1'])
    assert.ok(f.data.has(`liftline-${version}-1-shell`));
  assert.ok(f.data.has('another-app-cache'));
});

test('fresh HTML whose assets cannot be verified is returned online but never replaces the offline shell', async () => {
  const f = fixture({ fail: assets[1] });
  await f.seed('liftline-3.13.1-1-shell');
  assert.match(
    await (await f.navigate('/?v=' + appVersion)).text(),
    new RegExp(appVersion),
  );
  assert.ok(!f.data.get(current + '-shell').has('/'));
  assert.ok(f.data.has('liftline-3.13.1-1-shell'));
});

test('navigation preload is consumed without a duplicate HTML fetch', async () => {
  const f = fixture();
  await f.navigate('/?v=' + appVersion, html());
  assert.ok(!f.fetched.includes('/'));
  assert.ok(f.data.get(current + '-shell').has(marker));
});

test('persistent storage is optional, does not re-request existing grants, and handles denial/unsupported/throwing APIs', async () => {
  let calls = 0;
  const persist = async () => {
    calls++;
    return true;
  };
  assert.equal(await retainInstalledStorage(undefined), 'unavailable');
  assert.equal(
    await retainInstalledStorage({ persisted: async () => true, persist }),
    'persistent',
  );
  assert.equal(calls, 0);
  assert.equal(
    await retainInstalledStorage({ persisted: async () => false, persist }),
    'persistent',
  );
  assert.equal(calls, 1);
  assert.equal(
    await retainInstalledStorage({
      persisted: async () => false,
      persist: async () => false,
    }),
    'best-effort',
  );
  assert.equal(
    await retainInstalledStorage({
      persisted: async () => {
        throw Error('blocked');
      },
      persist,
    }),
    'unavailable',
  );
});

test('startup asset manifest uses the production graph and excludes optional views/reports/fonts', () => {
  const file = new URL('../dist/client/startup-assets.json', import.meta.url);
  assert.ok(existsSync(file), 'Run the production build before this test.');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(manifest.version, appVersion);
  assert.ok(manifest.assets.some((url) => url.includes('workout-app-')));
  assert.ok(manifest.assets.some((url) => url.includes('checkbox-')));
  assert.ok(
    manifest.assets.some((url) => url.includes('layout-segment-context-')),
  );
  assert.ok(manifest.assets.some((url) => url.endsWith('.css')));
  for (const url of manifest.assets) {
    assert.match(url, /^\/_next\/static\//);
    assert.ok(existsSync(new URL('../dist/client' + url, import.meta.url)));
    assert.doesNotMatch(
      url,
      /progress-view|startup-details|day-report-pdf|\.ttf|nutrition-view|holiday-workout/,
    );
  }
});

test('PR history scans stay off the Today render path and storage retention is scheduled after logger readiness', () => {
  const app = readFileSync(
    new URL('../app/workout-app.tsx', import.meta.url),
    'utf8',
  );
  assert.match(app, /view === 'progress' \? totalPersonalRecords/);
  assert.match(app, /sessionSummaryOpen\s*\?\s*currentSessionEntries\.reduce/);
  assert.match(app, /addEventListener\('liftline:ready'/);
  assert.match(app, /requestIdleCallback/);
});
