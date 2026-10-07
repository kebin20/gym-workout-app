import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const endpoint = 'http://127.0.0.1:9343';
const weightInput = `document.querySelector(${JSON.stringify('input[aria-label="Set 1 weight in kilograms"]')})`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(url, { bootstrap, logger = true } = {}) {
  const target = await (
    await fetch(`${endpoint}/json/new?${encodeURIComponent('about:blank')}`, {
      method: 'PUT',
    })
  ).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(message.error) : resolve(message.result);
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const js = async (expression) => {
    const result = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text,
      );
    return result.result.value;
  };
  const until = async (expression) => {
    for (let i = 0; i < 200; i++) {
      if (await js(expression)) return;
      await delay(50);
    }
    throw Error('Timed out: ' + expression);
  };
  await call('Page.enable');
  if (bootstrap)
    await call('Page.addScriptToEvaluateOnNewDocument', { source: bootstrap });
  await call('Emulation.setDeviceMetricsOverride', {
    width: 393,
    height: 852,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await call('Page.navigate', { url });
  if (logger) {
    await until('performance.getEntriesByName("liftline:ready").length > 0');
    await until(`!!${weightInput}`);
    await until(`!${weightInput}.matches(':disabled')`);
  }
  return {
    js,
    until,
    call,
    close: async () => {
      ws.close();
      await fetch(`${endpoint}/json/close/${target.id}`);
    },
  };
}
const results = {};
for (const [name, port] of [
  ['original', 9340],
  ['updated', 9341],
  ['bundle', 9342],
]) {
  const url = `http://127.0.0.1:${port}/?source=pwa`;
  let page = await open(url + '&v=fixture');
  if (name !== 'bundle') {
    await page.until('!!navigator.serviceWorker.controller');
    await page.js('navigator.serviceWorker.ready.then(() => true)');
    await delay(1000); // let cache warming finish before measuring relaunches
  } else {
    assert.equal(
      await page.js('navigator.serviceWorker.controller === null'),
      true,
    );
  }
  assert.equal(
    await page.js('document.documentElement.scrollWidth <= innerWidth'),
    true,
  );
  await page.js(`(() => {
    const input = document.querySelector('input[aria-label="Set 1 weight in kilograms"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '42.5');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await page.until(
    `Object.keys(localStorage).some(k => k.startsWith('liftline.exercise-draft.v2.') && localStorage.getItem(k).includes('42.5'))`,
  );
  await page.close();
  const samples = [];
  for (let i = 0; i < 5; i++) {
    page = await open(url);
    assert.equal(await page.js(`${weightInput}.value`), '42.5');
    assert.equal(
      await page.js('document.documentElement.scrollWidth <= innerWidth'),
      true,
    );
    samples.push(
      await page.js(
        'performance.getEntriesByName("liftline:ready")[0].startTime',
      ),
    );
    await page.close();
  }
  // Disable every actual network request: warmed PWA or compiled local-asset
  // fixture must still reopen with the draft. Bundled iOS file serving is not
  // emulated by Chrome offline mode, so test that case by failing APIs only.
  if (name !== 'bundle') {
    page = await open(url);
    await page.call('Network.enable');
    await page.call('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await page.call('Page.reload', { ignoreCache: false });
    await page.until(
      `performance.getEntriesByName("liftline:ready").length > 0 && !!${weightInput}`,
    );
    assert.equal(await page.js(`${weightInput}.value`), '42.5');
    await page.call('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await page.close();
  } else {
    page = await open(url);
    await page.call('Network.enable');
    await page.call('Network.setBlockedURLs', { urls: ['*://*/api/*'] });
    await page.call('Page.reload');
    await page.until(
      `performance.getEntriesByName("liftline:ready").length > 0 && !!${weightInput}`,
    );
    assert.equal(await page.js(`${weightInput}.value`), '42.5');
    await page.close();
  }
  samples.sort((a, b) => a - b);
  results[name] = {
    samplesMs: samples.map((v) => Math.round(v)),
    medianMs: Math.round(samples[2]),
  };
}
const guarded = await open('http://127.0.0.1:9342/', {
  logger: false,
  bootstrap:
    'window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };',
});
await guarded.until(
  'document.body.textContent.includes("Native storage setup pending")',
);
assert.equal(await guarded.js('document.querySelectorAll("input").length'), 0);
assert.equal(
  await guarded.js(
    'performance.getEntriesByType("resource").some(e=>e.name.includes("/api/"))',
  ),
  false,
);
await guarded.close();
console.log(
  JSON.stringify(
    {
      conditions:
        'Chrome new-document relaunch; same compiled UI, test-only API; web navigation server delay 1500ms; not an iOS cold-launch benchmark',
      results,
    },
    null,
    2,
  ),
);
if (process.argv[2])
  writeFileSync(process.argv[2], JSON.stringify(results, null, 2));
