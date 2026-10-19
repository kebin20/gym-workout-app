import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createWorkoutRefreshCoordinator } from '../lib/workout-refresh.ts';

const workoutKey = 'liftline.workout-entries.v1';
const sessionKey = 'liftline.session-exercises.v1';
const scheduleKey = 'liftline.programme-schedule.v1';

function target() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener(name, callback) {
      listeners.get(name)?.delete(callback);
    },
    emit(name, event = {}) {
      for (const callback of listeners.get(name) ?? []) callback(event);
    },
    get listenerCount() {
      return [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
    },
  };
}

async function settle() {
  for (let index = 0; index < 6; index++) await Promise.resolve();
}

function fixture(refresh = async () => {}) {
  const windowTarget = target();
  const documentTarget = target();
  const timers = new Map();
  const errors = [];
  let clock = 0;
  let nextTimer = 0;
  let calls = 0;
  let online = true;
  let visible = true;
  let blocked = false;
  windowTarget.setTimeout = (callback, delay) => {
    const id = nextTimer++;
    timers.set(id, { callback, at: clock + delay });
    return id;
  };
  windowTarget.clearTimeout = (id) => timers.delete(id);
  const coordinator = createWorkoutRefreshCoordinator({
    windowTarget,
    documentTarget,
    refresh: async () => {
      calls++;
      await refresh();
    },
    isOnline: () => online,
    isVisible: () => visible,
    isBlocked: () => blocked,
    storageKeys: [workoutKey, sessionKey, scheduleKey],
    onError: (error) => errors.push(error),
    now: () => clock,
  });
  return {
    windowTarget,
    documentTarget,
    timers,
    coordinator,
    errors,
    get calls() {
      return calls;
    },
    get now() {
      return clock;
    },
    set online(value) {
      online = value;
    },
    set visible(value) {
      visible = value;
    },
    set blocked(value) {
      blocked = value;
    },
    async advance(milliseconds) {
      const until = clock + milliseconds;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > until) break;
        clock = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
        await settle();
      }
      clock = until;
      await settle();
    },
  };
}

test('lifecycle refresh does not fetch on registration and coalesces resume bursts', async () => {
  const f = fixture();
  assert.equal(f.calls, 0);
  assert.equal(f.timers.size, 0);
  f.coordinator.resumePending();
  assert.equal(
    f.timers.size,
    0,
    'unblocking without an event does not duplicate startup',
  );
  f.windowTarget.emit('focus');
  f.windowTarget.emit('pageshow', { persisted: true });
  f.documentTarget.emit('visibilitychange');
  assert.equal(f.timers.size, 1);
  await f.advance(249);
  assert.equal(f.calls, 0);
  await f.advance(1);
  assert.equal(f.calls, 1);
  assert.equal(f.timers.size, 0);
  f.windowTarget.emit('focus');
  f.documentTarget.emit('visibilitychange');
  await f.advance(14_999);
  assert.equal(f.calls, 1);
  await f.advance(1);
  assert.equal(f.calls, 2);
  assert.equal(f.timers.size, 0);
});

test('normal pageshow does not repeat the startup read; a back/forward-cache restore does refresh', async () => {
  const f = fixture();
  f.blocked = true;
  f.windowTarget.emit('pageshow', { persisted: false });
  f.blocked = false;
  f.coordinator.resumePending();
  await f.advance(30_000);
  assert.equal(f.calls, 0);
  assert.equal(f.timers.size, 0);
  f.windowTarget.emit('pageshow', { persisted: true });
  await f.advance(250);
  assert.equal(f.calls, 1);
});

test('hidden, offline and critical-action refreshes wait for a later safe event without polling', async () => {
  const f = fixture();
  f.visible = false;
  f.documentTarget.emit('visibilitychange');
  f.windowTarget.emit('focus');
  await f.advance(60_000);
  assert.equal(f.calls, 0);
  assert.equal(f.timers.size, 0);
  f.visible = true;
  f.online = false;
  f.documentTarget.emit('visibilitychange');
  await f.advance(60_000);
  assert.equal(f.calls, 0);
  f.online = true;
  f.blocked = true;
  f.windowTarget.emit('online');
  await f.advance(60_000);
  assert.equal(f.calls, 0);
  assert.equal(f.timers.size, 0);
  f.blocked = false;
  f.coordinator.resumePending();
  await f.advance(250);
  assert.equal(f.calls, 1);
  f.windowTarget.emit('focus');
  f.visible = false;
  await f.advance(15_000);
  assert.equal(f.calls, 1, 'recheck visibility when a pending timer fires');
  assert.equal(f.timers.size, 0);
  f.visible = true;
  f.windowTarget.emit('pageshow', { persisted: true });
  await f.advance(250);
  assert.equal(f.calls, 2);
});

test('only meaningful shared workout, programme, session or schedule changes trigger storage refreshes', async () => {
  const f = fixture();
  for (const key of ['workout:5:A:1', 'liftline.workout-focus.v1', 'unrelated'])
    f.windowTarget.emit('storage', { key, oldValue: '1', newValue: '2' });
  const snapshot = {
    entries: [{ week: 5, weight1: 50 }],
    programmeId: 'initial',
    syncedAt: '10',
    cachedAt: 100,
  };
  f.windowTarget.emit('storage', {
    key: workoutKey,
    oldValue: JSON.stringify(snapshot),
    newValue: JSON.stringify({ ...snapshot, cachedAt: 200 }),
  });
  f.windowTarget.emit('storage', {
    key: scheduleKey,
    oldValue: 'same',
    newValue: 'same',
  });
  assert.equal(
    f.timers.size,
    0,
    'cache age updates cannot cause two-tab refresh ping-pong',
  );
  f.windowTarget.emit('storage', {
    key: workoutKey,
    oldValue: JSON.stringify(snapshot),
    newValue: JSON.stringify({ ...snapshot, programmeId: 'next' }),
  });
  f.windowTarget.emit('storage', {
    key: sessionKey,
    oldValue: '[]',
    newValue: '[{}]',
  });
  f.windowTarget.emit('storage', {
    key: scheduleKey,
    oldValue: null,
    newValue: '{}',
  });
  await f.advance(250);
  assert.equal(f.calls, 1);
  f.windowTarget.emit('storage', {
    key: workoutKey,
    oldValue: JSON.stringify(snapshot),
    newValue: JSON.stringify({
      ...snapshot,
      entries: [{ week: 5, weight1: 70 }],
    }),
  });
  await f.advance(15_000);
  assert.equal(f.calls, 2);
  f.windowTarget.emit('storage', { key: null, oldValue: null, newValue: null });
  await f.advance(15_000);
  assert.equal(
    f.calls,
    3,
    'cleared shared storage requests an authoritative read',
  );
});

test('concurrent triggers produce at most one in-flight refresh and one throttled follow-up', async () => {
  const pending = [];
  const f = fixture(() => new Promise((resolve) => pending.push(resolve)));
  f.windowTarget.emit('focus');
  await f.advance(250);
  assert.equal(f.calls, 1);
  f.windowTarget.emit('online');
  f.windowTarget.emit('storage', {
    key: workoutKey,
    oldValue: '[]',
    newValue: '[{}]',
  });
  f.documentTarget.emit('visibilitychange');
  await f.advance(10_000);
  assert.equal(f.calls, 1);
  assert.equal(f.timers.size, 0);
  pending.shift()();
  await settle();
  assert.equal(f.timers.size, 1);
  await f.advance(5_000);
  assert.equal(f.calls, 2);
  pending.shift()();
  await settle();
  assert.equal(f.timers.size, 0);
});

test('failed refresh reports once without background retry loops; reconnect can retry', async () => {
  const failure = Error('Connection interrupted');
  const f = fixture(async () => {
    throw failure;
  });
  f.windowTarget.emit('focus');
  await f.advance(250);
  assert.deepEqual(f.errors, [failure]);
  assert.equal(f.timers.size, 0);
  await f.advance(120_000);
  assert.equal(f.calls, 1);
  f.windowTarget.emit('online');
  await f.advance(250);
  assert.equal(f.calls, 2);
  assert.deepEqual(f.errors, [failure, failure]);
});

test('disposal removes listeners and handle zero, and cannot schedule follow-up after an in-flight refresh', async () => {
  const f = fixture();
  f.windowTarget.emit('focus');
  assert.ok(f.timers.has(0));
  f.coordinator.dispose();
  f.coordinator.dispose();
  assert.equal(f.timers.size, 0);
  assert.equal(f.windowTarget.listenerCount, 0);
  assert.equal(f.documentTarget.listenerCount, 0);
  f.coordinator.trigger();
  await f.advance(120_000);
  assert.equal(f.calls, 0);
  let finish;
  const running = fixture(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  running.windowTarget.emit('focus');
  await running.advance(250);
  running.windowTarget.emit('online');
  running.coordinator.dispose();
  finish();
  await settle();
  assert.equal(running.calls, 1);
  assert.equal(running.timers.size, 0);
});

test('actual root lifecycle bindings defer initial reads and dirty drafts, then read the latest cache without recreating listeners', async () => {
  const source = ts.createSourceFile(
    'app/workout-app.tsx',
    readFileSync(new URL('../app/workout-app.tsx', import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let assignment;
  const effects = [];
  function visit(node) {
    if (
      ts.isExpressionStatement(node) &&
      ts.isBinaryExpression(node.expression) &&
      node.expression.left.getText(source) === 'latestLifecycle.current'
    )
      assignment = node.getText(source);
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === 'useEffect' &&
      (node
        .getText(source)
        .includes('const coordinator = createWorkoutRefreshCoordinator') ||
        node
          .getText(source)
          .includes('lifecycleRefresh.current?.resumePending()'))
    )
      effects.push(node.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(assignment, 'test extracts the real latest-lifecycle binding');
  assert.equal(
    effects.length,
    2,
    'test extracts registration and pending-resume effects',
  );
  const f = fixture();
  f.coordinator.dispose();
  f.documentTarget.hidden = false;
  const registeredEffects = [];
  const reads = [];
  let snapshot = {
    entries: ['initial cache'],
    syncedAt: '10',
    programmeId: 'initial',
  };
  const ctx = {
    window: f.windowTarget,
    document: f.documentTarget,
    navigator: { onLine: true },
    latestLifecycle: { current: null },
    lifecycleRefresh: { current: null },
    initialRefreshPending: { current: true },
    dataActionRunning: { current: false },
    exerciseDraft: { dirty: false },
    saving: false,
    programSaving: false,
    undoing: false,
    backupBusy: false,
    loading: false,
    dataActionLoading: false,
    workoutCacheKey: workoutKey,
    sessionExerciseCacheKey: sessionKey,
    scheduleCacheKey: scheduleKey,
    readCachedWorkoutEntries: () => snapshot,
    refreshWorkoutData: async (...args) => reads.push(args),
    setRefreshIssue: () => {},
    createWorkoutRefreshCoordinator: (options) =>
      createWorkoutRefreshCoordinator({ ...options, now: () => f.now }),
    useEffect: (callback) => registeredEffects.push(callback),
  };
  const run = (text) =>
    vm.runInNewContext(
      ts.transpileModule(text, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText,
      ctx,
    );
  run(`${assignment}\n${effects.join(';\n')};`);
  const cleanup = registeredEffects[0]();
  const listenerCount = f.windowTarget.listenerCount;
  registeredEffects[1]();
  await f.advance(250);
  assert.equal(reads.length, 0, 'mount does not create a second startup read');
  f.windowTarget.emit('pageshow', { persisted: true });
  assert.equal(
    f.timers.size,
    0,
    'cached startup still blocks lifecycle overlap until GET settles',
  );
  ctx.initialRefreshPending.current = false;
  ctx.lifecycleRefresh.current.resumePending();
  snapshot = {
    entries: ['updated by another tab'],
    syncedAt: '12',
    programmeId: 'initial',
  };
  await f.advance(250);
  assert.equal(reads.length, 1);
  assert.deepEqual(
    reads[0],
    [snapshot.entries, '12', 'initial'],
    'callback reads cache at execution time',
  );
  ctx.exerciseDraft.dirty = true;
  run(assignment);
  f.windowTarget.emit('focus');
  registeredEffects[1]();
  await f.advance(30_000);
  assert.equal(
    reads.length,
    1,
    'draft edits defer programme and plan refreshes',
  );
  ctx.exerciseDraft.dirty = false;
  run(assignment);
  registeredEffects[1]();
  await f.advance(250);
  assert.equal(
    reads.length,
    2,
    'finishing the draft resumes the existing event',
  );
  assert.equal(
    f.windowTarget.listenerCount,
    listenerCount,
    'updates use refs rather than listener remounts',
  );
  cleanup();
  assert.equal(f.windowTarget.listenerCount, 0);
  assert.equal(f.documentTarget.listenerCount, 0);
});
