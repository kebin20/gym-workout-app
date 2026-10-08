import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { PDFDocument } from 'pdf-lib';
import { routeFixture } from './route-test-harness.mjs';
import {
  showRestNotification,
  shouldAlertForTimer,
} from '../lib/rest-timer-alerts.ts';

export const sample = (patch = {}) => ({
  week: 1,
  day: 'A',
  exerciseOrder: 1,
  exercise: 'Back Squat',
  target: '3 x 6-8',
  set1Weight: 40,
  set1Reps: 8,
  set2Weight: 40,
  set2Reps: 8,
  set3Weight: null,
  set3Reps: null,
  rir: 2,
  notes: 'Controlled tempo.',
  completed: true,
  completedAt: '2026-08-26T09:00:00Z',
  updatedAt: '2026-08-26T09:00:00Z',
  ...patch,
});

test('day reports include all phases and partial/pending saves, excluding other days and cleared undo rows', () => {
  const fixture = routeFixture();
  try {
    const { buildDayReport } = fixture.load('lib/day-report.ts');
    const report = buildDayReport('A', [
      sample(),
      sample({ day: 'B' }),
      sample({ week: 2, completed: false, offlinePending: true }),
      sample({ week: 13 }),
      sample({
        week: 3,
        completed: false,
        set1Weight: null,
        set1Reps: null,
        set2Weight: null,
        set2Reps: null,
        notes: '',
      }),
    ]);
    assert.equal(report.sessions.length, 3);
    assert.equal(report.records.length, 3);
    assert.equal(report.pending, 1);
    assert.equal(report.exercises.length, 2);
    assert.equal(report.volume, 1920);
  } finally {
    fixture.close();
  }
});
test('timed holds and invalid historical sets never inflate kg volume or load trends', () => {
  const fixture = routeFixture();
  try {
    const { reportMetrics, buildDayReport } = fixture.load('lib/day-report.ts');
    const metric = reportMetrics(
      sample({
        exercise: 'Plank',
        target: '2 x 30-60 sec',
        set1Weight: 0,
        set1Reps: 45,
        set2Weight: 0,
        set2Reps: 30,
      }),
    );
    assert.equal(metric.volume, 0);
    assert.equal(metric.seconds, 75);
    assert.equal(metric.topWeight, null);
    const invalid = reportMetrics(
      sample({ set1Weight: -10, set1Reps: 8, set2Weight: 50, set2Reps: 0 }),
    );
    assert.equal(invalid.workingSets, 0);
    assert.equal(invalid.volume, 0);
    assert.equal(
      buildDayReport('A', [
        sample(),
        sample({ week: 2, exercise: 'Hack Squat' }),
      ]).exercises.length,
      2,
    );
  } finally {
    fixture.close();
  }
});
test('duplicate logical logs use the latest revision and all five sets are retained', () => {
  const fixture = routeFixture();
  try {
    const { buildDayReport, reportSets } = fixture.load('lib/day-report.ts');
    const newer = sample({
      updatedAt: '2026-08-27T09:00:00Z',
      set5Weight: 80,
      set5Reps: 6,
    });
    const report = buildDayReport('A', [newer, sample()]);
    assert.equal(report.records.length, 1);
    assert.equal(reportSets(report.records[0]).at(-1).set, 5);
  } finally {
    fixture.close();
  }
});
test('the actual PDF generator produces valid multipage documents including long notes and Japanese text', async () => {
  const fixture = routeFixture();
  try {
    const { buildDayReport } = fixture.load('lib/day-report.ts');
    const { createDayReportPdf, reportFontPath } = fixture.load(
      'lib/day-report-pdf.ts',
    );
    const records = Array.from({ length: 24 }, (_, index) =>
      sample({
        week: index + 1,
        set1Rir: 0,
        set2Rir: 2,
        notes: 'Form cue and machine settings. '.repeat(20),
      }),
    );
    const report = buildDayReport('A', records);
    assert.equal(reportFontPath(report), '/fonts/NotoSans-Regular.ttf');
    const bytes = await createDayReportPdf(
      report,
      readFileSync('public/fonts/NotoSans-Regular.ttf'),
    );
    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() >= 4);
    assert.equal(pdf.getTitle(), 'Liftline Day A training report');
    const jp = buildDayReport('A', [
      sample({ notes: '今日はスクワット。フォームを確認。' }),
    ]);
    assert.equal(reportFontPath(jp), '/fonts/NotoSansJP.ttf');
    const japanese = await createDayReportPdf(
      jp,
      readFileSync('public/fonts/NotoSans-Regular.ttf'),
      new Date(),
      readFileSync('public/fonts/NotoSansJP.ttf'),
    );
    assert.ok((await PDFDocument.load(japanese)).getPageCount() >= 2);
  } finally {
    fixture.close();
  }
});
test('system timer alerts are sent through the active worker and failures are observable', async () => {
  const calls = [];
  const active = {
    active: {},
    showNotification: async (...args) => calls.push(args),
  };
  await showRestNotification(Promise.resolve(active), {
    tag: 'timer-1',
    body: 'Next set',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].tag, 'timer-1');
  await assert.rejects(
    showRestNotification(Promise.resolve(undefined), {}),
    /not ready/,
  );
  await assert.rejects(
    showRestNotification(
      Promise.resolve({
        active: {},
        showNotification: async () => {
          throw Error('Blocked by device');
        },
      }),
      {},
    ),
    /Blocked by device/,
  );
  await assert.rejects(
    showRestNotification(new Promise(() => {}), {}, 5),
    /could not be confirmed/,
  );
});
test('timer completions alert promptly but do not generate stale alarms after suspension', () => {
  assert.equal(shouldAlertForTimer(1000, 999), false);
  assert.equal(shouldAlertForTimer(1000, 1000), true);
  assert.equal(shouldAlertForTimer(1000, 30000), true);
  assert.equal(shouldAlertForTimer(1000, 31000), false);
});

test('one actual timer engine survives view unmount, alerts in foreground once, and releases the screen lock', async () => {
  const require = createRequire(import.meta.url);
  const fixture = routeFixture();
  const effects = [],
    intervals = new Map(),
    storage = new Map(),
    handles = [],
    events = new Map();
  const notifications = [];
  const stateChanges = [];
  const permission = { permission: 'granted' };
  let soundPlays = true,
    notificationFailure = false,
    deliveryAttempts = 0;
  let timestamp = 100_000,
    sequence = 0,
    releases = 0;
  const lock = {
    released: false,
    release: async () => {
      releases++;
      lock.released = true;
    },
  };
  const module = { exports: {} };
  const source = ts.transpileModule(
    readFileSync('app/rest-timer.tsx', 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  try {
    vm.runInNewContext(source, {
      module,
      exports: module.exports,
      require: (name) => {
        if (name === 'react')
          return {
            forwardRef: (component) => component,
            useCallback: (callback) => callback,
            useEffect: (effect) => effects.push(effect),
            useImperativeHandle: (_, factory) => handles.push(factory()),
            useState: (value) => [value, (next) => stateChanges.push(next)],
            useSyncExternalStore: (_, get) => get(),
          };
        if (name === '@/components/ui/button') return { Button: () => null };
        if (name === '@/lib/rest-timer-state') {
          const state = fixture.load('lib/rest-timer-state.ts');
          return {
            ...state,
            readTimerState: (value) => state.readTimerState(value, timestamp),
          };
        }
        if (name === '@/lib/rest-timer-alerts')
          return {
            prepareTimerSound: () => {},
            playTimerSound: () => true,
            playRestTimerSound: async () => soundPlays,
            shouldAlertForTimer,
            showRestNotification: async (_, options) => {
              deliveryAttempts++;
              if (notificationFailure)
                throw Error('Device rejected the notification');
              notifications.push(options);
            },
          };
        return require(name);
      },
      Date: class extends Date {
        static now() {
          return timestamp;
        }
      },
      crypto: { randomUUID: () => 'test-timer' },
      Notification: permission,
      window: {
        Notification: {},
        addEventListener: (type, fn) => events.set(type, fn),
        removeEventListener: () => {},
        setInterval: (fn) => {
          const id = ++sequence;
          intervals.set(id, fn);
          return id;
        },
        clearInterval: (id) => intervals.delete(id),
      },
      document: {
        hidden: false,
        addEventListener: (type, fn) => events.set(type, fn),
        removeEventListener: () => {},
      },
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
      navigator: {
        serviceWorker: { getRegistration: async () => ({ active: {} }) },
        vibrate: () => true,
        wakeLock: { request: async () => lock },
      },
      setInterval: (fn) => {
        const id = ++sequence;
        intervals.set(id, fn);
        return id;
      },
      clearInterval: (id) => intervals.delete(id),
    });
    const props = {
      exerciseName: 'Squat',
      contextKey: 'main:1:A:1',
      restLabel: '1 sec',
      suggestedSeconds: 1,
      notificationIconHref: '/icon.png',
    };
    const render = (patch = {}) => {
      const tree = module.exports.default({ ...props, ...patch }, null);
      const cleanup = effects.splice(0).map((effect) => effect());
      return { tree, cleanup };
    };
    const { cleanup } = render();
    handles[0].start();
    await Promise.resolve();
    // Simulate the timer component leaving the page. The engine is not its UI interval.
    cleanup.forEach((fn) => fn?.());
    assert.equal(intervals.size, 1);
    timestamp += 1000;
    [...intervals.values()].forEach((tick) => tick());
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].tag, 'test-timer');
    assert.equal(intervals.size, 0);
    assert.equal(releases, 1);
    assert.equal(
      JSON.parse(storage.get('liftline.rest-timer.v2')).remaining,
      0,
    );
    events.get('pageshow')();
    assert.equal(notifications.length, 1);

    // Reopening the same exercise must preserve an intentionally started rest.
    handles.at(-1).start();
    const running = storage.get('liftline.rest-timer.v2');
    const resumed = render();
    resumed.cleanup.forEach((fn) => fn?.());
    assert.equal(storage.get('liftline.rest-timer.v2'), running);
    assert.equal(intervals.size, 1);

    // The same exercise name in another week is a different workout context.
    const changed = render({ contextKey: 'main:2:A:1' });
    changed.cleanup.forEach((fn) => fn?.());
    assert.equal(storage.has('liftline.rest-timer.v2'), false);
    assert.equal(intervals.size, 0);
    timestamp += 1000;
    [...intervals.values()].forEach((tick) => tick());
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(notifications.length, 1, 'Cancelled rests must not alert');
    handles.at(-1).start();
    assert.equal(
      JSON.parse(storage.get('liftline.rest-timer.v2')).contextKey,
      'main:2:A:1',
    );
    const holiday = render({
      contextKey: 'holiday:session-1:1',
      exerciseName: 'Split squat',
    });
    holiday.cleanup.forEach((fn) => fn?.());
    assert.equal(storage.has('liftline.rest-timer.v2'), false);
    assert.equal(intervals.size, 0);

    // Legacy persisted timers remain readable, but never follow a new exercise.
    const legacy = {
      id: 'old-timer',
      exerciseName: 'Squat',
      restLabel: '1 sec',
      endsAt: timestamp + 1000,
      remaining: 1,
      updatedAt: timestamp,
    };
    storage.set('liftline.rest-timer.v2', JSON.stringify(legacy));
    events.get('storage')({
      key: 'liftline.rest-timer.v2',
      newValue: JSON.stringify(legacy),
    });
    const old = render();
    old.cleanup.forEach((fn) => fn?.());
    assert.equal(storage.has('liftline.rest-timer.v2'), true);
    assert.equal(intervals.size, 1);
    const next = render({ exerciseName: 'Row', contextKey: 'main:1:A:2' });
    next.cleanup.forEach((fn) => fn?.());
    assert.equal(storage.has('liftline.rest-timer.v2'), false);
    assert.equal(intervals.size, 0);
    // Completion must report sound/delivery failure, not silently mark success.
    soundPlays = false;
    notificationFailure = true;
    handles.at(-1).start();
    timestamp += 1000;
    [...intervals.values()].forEach((tick) => tick());
    await new Promise((resolve) => setImmediate(resolve));
    const text = (node) => {
      if (Array.isArray(node)) return node.map(text).join(' ');
      if (node && typeof node === 'object') return text(node.props?.children);
      return typeof node === 'string' ? node : '';
    };
    const failed = render({ exerciseName: 'Row', contextKey: 'main:1:A:2' });
    failed.cleanup.forEach((fn) => fn?.());
    assert.match(text(failed.tree), /In-app sound was unavailable/);
    assert.match(text(failed.tree), /notification failed/);
    const attempts = deliveryAttempts;
    events.get('focus')();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      deliveryAttempts,
      attempts,
      'Completed timers never redispatch on focus',
    );
    storage.set('liftline.timer-alerts.v1', 'off');
    events.get('storage')({ key: 'liftline.timer-alerts.v1', newValue: 'off' });
    handles.at(-1).start();
    timestamp += 1000;
    [...intervals.values()].forEach((tick) => tick());
    await new Promise((resolve) => setImmediate(resolve));
    const off = render({ exerciseName: 'Row', contextKey: 'main:1:A:2' });
    assert.match(text(off.tree), /Notifications are off/);
    assert.equal(deliveryAttempts, attempts);
    stateChanges.length = 0;
    permission.permission = 'denied';
    events.get('focus')();
    assert.ok(
      stateChanges.includes('denied'),
      'Permission UI refreshes after returning from device settings',
    );
    off.cleanup.forEach((fn) => fn?.());
  } finally {
    fixture.close();
  }
});
