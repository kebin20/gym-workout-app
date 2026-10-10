import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { startupLoggerSelector } from '../lib/startup-readiness.ts';
import { routeFixture } from './route-test-harness.mjs';

function readinessFixture() {
  let input = null;
  let notify;
  let nextFrame = 0;
  let disconnected = 0;
  const frames = new Map();
  const cancelled = [];
  const body = {};
  const source = ts.transpileModule(
    readFileSync(
      new URL('../lib/startup-readiness.ts', import.meta.url),
      'utf8',
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    document: {
      body,
      querySelector(selector) {
        assert.equal(selector, startupLoggerSelector);
        return input;
      },
    },
    MutationObserver: class {
      constructor(callback) {
        notify = callback;
      }
      observe(target, options) {
        assert.equal(target, body);
        assert.equal(options.subtree, true);
        assert.ok(options.attributeFilter.includes('disabled'));
      }
      disconnect() {
        disconnected++;
      }
    },
    requestAnimationFrame(callback) {
      frames.set(nextFrame, callback);
      return nextFrame++;
    },
    cancelAnimationFrame(id) {
      cancelled.push(id);
      frames.delete(id);
    },
  });
  return {
    observe: exports.observeWorkoutLoggerReady,
    frames,
    cancelled,
    get disconnected() {
      return disconnected;
    },
    setInput(disabled) {
      input = {
        matches(selector) {
          assert.equal(selector, ':disabled');
          return disabled;
        },
      };
    },
    notify() {
      notify();
    },
    paint() {
      for (const [id, callback] of frames) {
        frames.delete(id);
        callback();
      }
    },
  };
}

test('the rendered first weight input exposes the startup marker independently of its accessible label', () => {
  const fixture = routeFixture();
  try {
    const { WorkoutSetCard } = fixture.load('app/workout-set-card.tsx');
    const props = {
      set: { weight: '', reps: '', rir: '', done: false },
      timed: false,
      onChange() {},
      onStep() {},
      onToggleDone() {},
    };
    const first = renderToStaticMarkup(
      createElement(WorkoutSetCard, { ...props, number: 1 }),
    );
    const later = renderToStaticMarkup(
      createElement(WorkoutSetCard, { ...props, number: 2 }),
    );
    assert.equal((first.match(/data-startup-logger=""/g) ?? []).length, 1);
    assert.match(
      first,
      /<input[^>]*data-startup-logger=""[^>]*aria-label="Set 1 Weight \(kg\)"/,
    );
    assert.doesNotMatch(later, /data-startup-logger/);
    assert.equal(startupLoggerSelector, 'input[data-startup-logger]');
  } finally {
    fixture.close();
  }
});

test('readiness waits for the mounted, enabled logger and a rendering frame, then fires once', () => {
  const fixture = readinessFixture();
  let ready = 0;
  const stop = fixture.observe(() => ready++);
  assert.equal(fixture.frames.size, 0);
  fixture.setInput(true);
  fixture.notify();
  assert.equal(fixture.frames.size, 0);
  fixture.setInput(false);
  fixture.notify();
  assert.equal(ready, 0);
  assert.equal(fixture.frames.size, 1);
  assert.equal(fixture.disconnected, 0);
  fixture.notify();
  assert.equal(fixture.frames.size, 1);
  fixture.paint();
  assert.equal(fixture.disconnected, 1);
  fixture.notify();
  fixture.paint();
  assert.equal(ready, 1);
  stop();
});

test('a logger disabled before the queued frame is not marked ready and can recover', () => {
  const fixture = readinessFixture();
  fixture.setInput(false);
  let ready = 0;
  const stop = fixture.observe(() => ready++);
  fixture.setInput(true);
  fixture.paint();
  assert.equal(ready, 0);
  assert.equal(fixture.disconnected, 0);
  fixture.setInput(false);
  fixture.notify();
  fixture.paint();
  assert.equal(ready, 1);
  stop();
});

test('unmount cancels a pending frame even when its identifier is zero', () => {
  const fixture = readinessFixture();
  fixture.setInput(false);
  let ready = 0;
  const stop = fixture.observe(() => ready++);
  assert.equal(fixture.frames.size, 1);
  stop();
  assert.deepEqual(fixture.cancelled, [0]);
  fixture.paint();
  assert.equal(ready, 0);
});
