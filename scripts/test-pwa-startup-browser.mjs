import assert from 'node:assert/strict';

// Uses a disposable Chrome profile and production web assets, not the native
// bundle. Document relaunches are not an iOS process cold-launch benchmark.
const endpoint = 'http://127.0.0.1:9343';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const input = `document.querySelector('input[aria-label="Set 1 Weight (kg)"]')`;
async function open(url, installed = false) {
  const target = await (
    await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' })
  ).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) =>
    socket.addEventListener('open', resolve, { once: true }),
  );
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const result = JSON.parse(event.data);
    const callbacks = pending.get(result.id);
    if (!callbacks) return;
    pending.delete(result.id);
    result.error
      ? callbacks.reject(result.error)
      : callbacks.resolve(result.result);
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const js = async (expression) => {
    const value = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (value.exceptionDetails)
      throw Error(
        value.exceptionDetails.exception?.description ??
          value.exceptionDetails.text,
      );
    return value.result.value;
  };
  const until = async (expression) => {
    for (let retry = 0; retry < 250; retry++) {
      if (await js(expression)) return;
      await pause(50);
    }
    throw Error('Timed out: ' + expression);
  };
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 393,
    height: 852,
    deviceScaleFactor: 1,
    mobile: true,
  });
  if (installed)
    await call('Page.addScriptToEvaluateOnNewDocument', {
      source: `Object.defineProperty(navigator, 'standalone', { value: true }); window.__persistCalls = []; Object.defineProperty(navigator, 'storage', { value: { persisted: async () => false, persist: async () => { window.__persistCalls.push(performance.now()); return false; } } });`,
    });
  await call('Page.navigate', { url });
  await until(
    `performance.getEntriesByName('liftline:ready').length > 0 && !!${input} && !${input}.matches(':disabled')`,
  );
  return {
    call,
    js,
    until,
    close: async () => {
      socket.close();
      await fetch(`${endpoint}/json/close/${target.id}`);
    },
  };
}
const results = {};
for (const [name, port] of [
  ['baseline', 9340],
  ['current', 9341],
]) {
  const url = `http://127.0.0.1:${port}/?source=pwa`;
  let page = await open(url + '&v=fixture', name === 'current');
  await page.until('!!navigator.serviceWorker.controller');
  await pause(1500);
  if (name === 'current') {
    const missing = await page.js(
      `fetch('/startup-assets.json').then(r=>r.json()).then(manifest=>performance.getEntriesByType('resource').map(entry=>new URL(entry.name).pathname).filter(url=>url.startsWith('/_next/static/') && /\.(js|css)$/.test(url) && !manifest.assets.includes(url)))`,
    );
    assert.deepEqual(
      missing,
      [],
      'Every actual startup JS/CSS dependency must be in the manifest.',
    );
    await page.until(
      `caches.keys().then(async names => { for (const name of names.filter(n=>n.endsWith('-shell'))) if(await (await caches.open(name)).match('/__liftline_startup_ready__')) return true; return false; })`,
    );
    await page.until('window.__persistCalls.length === 1');
    assert.equal(
      await page.js(
        `window.__persistCalls[0] >= performance.getEntriesByName('liftline:ready')[0].startTime`,
      ),
      true,
    );
  }
  await page.js(
    `(() => { const field = ${input}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'42.5'); field.dispatchEvent(new Event('input',{ bubbles:true })); })()`,
  );
  await page.until(
    `Object.keys(localStorage).some(key=>key.startsWith('liftline.exercise-draft.v2.') && localStorage.getItem(key).includes('42.5'))`,
  );
  await page.close();
  const samples = [];
  for (let count = 0; count < 5; count++) {
    page = await open(url);
    assert.equal(await page.js(`${input}.value`), '42.5');
    assert.equal(
      await page.js('document.documentElement.scrollWidth <= innerWidth'),
      true,
    );
    samples.push(
      Math.round(
        await page.js(
          `performance.getEntriesByName('liftline:ready')[0].startTime`,
        ),
      ),
    );
    await page.close();
  }
  page = await open(url);
  await page.call('Network.enable');
  await page.call('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await page.call('Page.reload');
  await page.until(`!!${input} && !${input}.matches(':disabled')`);
  assert.equal(await page.js(`${input}.value`), '42.5');
  await page.call('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  // Verify Progress loads on demand with the same underlying records.
  await page.js(
    `Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Progress').click()`,
  );
  await page.until(`document.body.textContent.includes('TRAINING SUMMARY')`);
  if (name === 'current') {
    await page.js(
      `Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Data').click()`,
    );
    await page.until(
      `Array.from(document.querySelectorAll('[role="menuitem"]')).some(item=>item.textContent.includes('Startup details'))`,
    );
    await page.js(
      `Array.from(document.querySelectorAll('[role="menuitem"]')).find(item=>item.textContent.includes('Startup details')).click()`,
    );
    await page.until(
      `document.querySelector('[role="dialog"]')?.textContent.includes('Current interface verified')`,
    );
    assert.equal(
      await page.js(
        `document.querySelector('[role="dialog"]').textContent.includes('Page to usable logger')`,
      ),
      true,
    );
  }
  await page.close();
  samples.sort((a, b) => a - b);
  results[name] = { medianMs: samples[2], rangeMs: [samples[0], samples[4]] };
}
// Simulate an incomplete release cache on the real worker, not a mock: retain
// a legacy working pair, remove the current pair, fail one critical download.
let page = await open('http://127.0.0.1:9341/?source=pwa');
await page.js(`(async () => {
  const names = await caches.keys(); const shellName = names.find(n=>n.endsWith('-shell') && !n.includes('fixture-backup'));
  const shell = await caches.open(shellName); const legacy = await caches.open('liftline-fixture-backup-shell');
  await legacy.put('/', await shell.match('/'));
  const oldAssets = await caches.open('liftline-fixture-backup-assets');
  const assets = await caches.open(shellName.replace(/-shell$/,'-assets'));
  for(const key of await assets.keys()) await oldAssets.put(key, await assets.match(key));
  await caches.delete(shellName); await caches.delete(shellName.replace(/-shell$/,'-assets'));
})()`);
await fetch('http://127.0.0.1:9341/__test/fail-critical?on');
await page.call('Page.reload');
await page.until(`!!${input} && !${input}.matches(':disabled')`);
await pause(2500);
assert.equal(
  await page.js(
    `caches.keys().then(names=>names.includes('liftline-fixture-backup-shell') && names.includes('liftline-fixture-backup-assets'))`,
  ),
  true,
);
assert.equal(
  await page.js(
    `caches.keys().then(async names=>{ const name=names.find(n=>n.endsWith('-shell')&&!n.includes('fixture-backup')); return !!(name && await (await caches.open(name)).match('/__liftline_startup_ready__')); })`,
  ),
  false,
);
await fetch('http://127.0.0.1:9341/__test/fail-critical');
await page.call('Page.reload');
await page.until(
  `caches.keys().then(async names=>{ const name=names.find(n=>n.endsWith('-shell')&&!n.includes('fixture-backup')); return !!(name && await (await caches.open(name)).match('/__liftline_startup_ready__')); })`,
);
assert.equal(await page.js(`${input}.value`), '42.5');
await page.close();
console.log(
  JSON.stringify(
    {
      conditions:
        'Production web UI; desktop Chrome documents at 393px; 1500ms HTML delay; not iOS process launch',
      results,
      draftRecovery: true,
      offlineReopen: true,
      interruptedUpdateRecovery: true,
      persistenceDenialSafe: true,
    },
    null,
    2,
  ),
);
