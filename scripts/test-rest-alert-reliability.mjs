import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { showRestNotification } from '../lib/rest-timer-alerts.ts';

test('notification readiness reacquires a worker and submits the alert once', async () => {
  let checks = 0;
  const sent = [];
  await showRestNotification(
    async () => {
      checks++;
      if (checks === 1) return undefined;
      if (checks === 2) return { active: null };
      return {
        active: {},
        showNotification: async (_, options) => sent.push(options),
      };
    },
    { tag: 'one-rest' },
    1000,
  );
  assert.equal(checks, 3);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].tag, 'one-rest');
});

test('only confirmed inactive-worker rejections are retried, with a bound', async () => {
  let checks = 0,
    rejected = 0,
    sent = 0;
  await showRestNotification(
    async () => {
      checks++;
      return {
        active: {},
        showNotification: async () => {
          if (checks === 1) {
            rejected++;
            throw new DOMException('No active worker', 'InvalidStateError');
          }
          sent++;
        },
      };
    },
    { tag: 'same-id' },
    1000,
  );
  assert.equal(rejected, 1);
  assert.equal(sent, 1);
  for (const name of ['NotAllowedError', 'AbortError', 'UnknownError']) {
    let attempts = 0;
    await assert.rejects(
      showRestNotification(
        async () => ({
          active: {},
          showNotification: async () => {
            attempts++;
            throw new DOMException(name, name);
          },
        }),
        {},
        1000,
      ),
      { name },
    );
    assert.equal(
      attempts,
      1,
      'Ambiguous or permission failures must not be retried',
    );
  }
  let attempts = 0;
  await assert.rejects(
    showRestNotification(
      async () => ({
        active: {},
        showNotification: async () => {
          attempts++;
          throw new DOMException('Unavailable', 'InvalidStateError');
        },
      }),
      {},
      1000,
    ),
    { name: 'InvalidStateError' },
  );
  assert.equal(attempts, 3);
});

test('expired or cancelled readiness requests cannot post a late notification', async () => {
  let resolve,
    sent = 0;
  const worker = {
    active: {},
    showNotification: async () => {
      sent++;
    },
  };
  const pending = new Promise((done) => {
    resolve = done;
  });
  await assert.rejects(
    showRestNotification(() => pending, {}, 5),
    /could not be confirmed/,
  );
  resolve(worker);
  await new Promise((done) => setImmediate(done));
  assert.equal(sent, 0);

  let current = true;
  const cancelled = new Promise((done) => {
    resolve = done;
  });
  const delivery = showRestNotification(
    () => cancelled,
    {},
    1000,
    () => current,
  );
  current = false;
  resolve(worker);
  await assert.rejects(delivery, /cancelled/);
  assert.equal(sent, 0);
  await assert.rejects(
    showRestNotification(
      async () => worker,
      {},
      1000,
      () => false,
    ),
    /cancelled/,
  );
  assert.equal(sent, 0);
});

test('uncertain submission timeouts never dispatch a second notification', async () => {
  let resolve,
    attempts = 0;
  const pending = new Promise((done) => {
    resolve = done;
  });
  await assert.rejects(
    showRestNotification(
      async () => ({
        active: {},
        showNotification: () => {
          attempts++;
          return pending;
        },
      }),
      { tag: 'stable-rest' },
      5,
    ),
    /could not be confirmed/,
  );
  resolve();
  await new Promise((done) => setImmediate(done));
  assert.equal(attempts, 1);
});

test('audio recovers interruption, reports failure, and cannot beep after cancellation or timeout', async () => {
  let context,
    created = 0,
    beeps = 0,
    mode = 'run',
    resumeLate;
  class FakeAudio {
    state = 'suspended';
    currentTime = 0;
    destination = {};
    constructor() {
      context = this;
      created++;
    }
    async resume() {
      if (mode === 'blocked') throw Error('Audio blocked');
      if (mode === 'hang')
        await new Promise((resolve) => {
          resumeLate = resolve;
        });
      this.state = 'running';
    }
    createOscillator() {
      return {
        frequency: {},
        connect() {},
        disconnect() {},
        start() {
          beeps++;
        },
        stop() {},
      };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
        disconnect() {},
      };
    }
  }
  const module = { exports: {} };
  const source = ts.transpileModule(
    readFileSync('lib/rest-timer-alerts.ts', 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    AudioContext: FakeAudio,
    setTimeout,
    clearTimeout,
  });
  const { prepareTimerSound, playRestTimerSound } = module.exports;
  assert.equal(await playRestTimerSound(), false);
  prepareTimerSound();
  await Promise.resolve();
  context.state = 'interrupted';
  assert.equal(await playRestTimerSound(), true);
  assert.equal(beeps, 3);
  mode = 'blocked';
  context.state = 'suspended';
  assert.equal(await playRestTimerSound(), false);
  assert.equal(beeps, 3);
  mode = 'hang';
  assert.equal(await playRestTimerSound(5), false);
  resumeLate();
  await new Promise((done) => setImmediate(done));
  assert.equal(beeps, 3);
  assert.equal(await playRestTimerSound(100, () => false), false);
  assert.equal(beeps, 3);
  context.state = 'closed';
  mode = 'run';
  prepareTimerSound();
  await Promise.resolve();
  assert.equal(created, 2);
  assert.equal(await playRestTimerSound(), true);
  assert.equal(beeps, 6);
});
