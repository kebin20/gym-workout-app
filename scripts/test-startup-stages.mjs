import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { routeFixture } from './route-test-harness.mjs';
import { markStartup, startupTimingRows } from '../lib/startup-timing.ts';
import { afterStartup } from '../lib/after-startup.ts';
const require = createRequire(import.meta.url);

test('startup timing is first-occurrence, local-only, safe on server and precise about overlapping stages', () => {
  const marks = new Map();
  let now = 0;
  const clock = {
    getEntriesByName: (name) =>
      marks.has(name) ? [{ startTime: marks.get(name) }] : [],
    mark: (name) => marks.set(name, now),
    getEntriesByType: () => [{ responseStart: 12 }],
  };
  assert.doesNotThrow(() => markStartup('app-module'));
  for (const [stage, time] of [
    ['app-module', 50],
    ['cache-start', 60],
    ['cache-read', 63],
    ['session-recovered', 70],
    ['refresh-start', 64],
    ['refresh-received', 180],
  ]) {
    now = time;
    markStartup(stage, clock);
  }
  now = 900;
  markStartup('app-module', clock);
  assert.equal(marks.get('liftline:app-module'), 50);
  marks.set('liftline:shell', 20);
  marks.set('liftline:ready', 100);
  const rows = Object.fromEntries(startupTimingRows(clock));
  assert.equal(rows['Shell script to app module'], '30 ms');
  assert.equal(rows['Cached records and queue recovery'], '3 ms');
  assert.equal(rows['Selection to usable logger'], '30 ms');
  assert.equal(rows['First server refresh'], '116 ms');
  assert.doesNotThrow(() =>
    markStartup('cache-read', {
      getEntriesByName() {
        throw Error('unsupported');
      },
    }),
  );
  const empty = startupTimingRows({
    getEntriesByName: () => [],
    getEntriesByType: () => [],
  });
  assert.ok(empty.every(([, value]) => value === 'Not measured'));
});

test('optional warming waits for readiness and idle; cancellation includes handle zero', () => {
  const events = new Map(),
    jobs = new Map(),
    cancelled = [];
  let ready = false,
    ran = 0;
  const target = {
    performance: { getEntriesByName: () => (ready ? [{}] : []) },
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: (name) => events.delete(name),
    requestIdleCallback: (fn) => {
      jobs.set(0, fn);
      return 0;
    },
    cancelIdleCallback: (id) => {
      cancelled.push(id);
      jobs.delete(id);
    },
  };
  const cleanup = afterStartup(() => ran++, target);
  assert.equal(jobs.size, 0);
  events.get('liftline:ready')();
  assert.equal(ran, 0);
  assert.equal(jobs.size, 1);
  cleanup();
  assert.deepEqual(cancelled, [0]);
  assert.equal(jobs.size, 0);
  ready = true;
  afterStartup(() => ran++, target);
  jobs.get(0)();
  assert.equal(ran, 1);
  const timers = new Map();
  const fallback = {
    ...target,
    requestIdleCallback: undefined,
    setTimeout: (fn) => {
      timers.set(0, fn);
      return 0;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const cancel = afterStartup(() => ran++, fallback);
  cancel();
  assert.equal(timers.size, 0);
});

function actionFixture({
  queue = false,
  fetcher = async () => Response.json({ ok: true }),
} = {}) {
  const f = routeFixture(),
    states = {},
    requests = [];
  let refreshes = 0;
  const ctx = {
    hasPendingOutbox: () => queue,
    programmeId: 'initial',
    getCurrentProgrammeId: () => ctx.programmeId,
    backupData: { entries: [] },
    selectedImportKeys: ['1|A|1'],
    importPreview: { items: [{ key: '1|A|1', status: 'protected' }] },
    exerciseDraft: { dirty: false },
    saving: false,
    programSaving: false,
    refreshWorkoutData: async () => {
      refreshes++;
    },
  };
  for (const name of [
    'Error',
    'Notice',
    'SyncingSheet',
    'ImportOpen',
    'LoadingImport',
    'ImportingSheet',
    'ImportPreview',
    'SelectedImportKeys',
    'SheetImportError',
    'BackupBusy',
    'BackupSummary',
    'BackupFileName',
    'BackupData',
    'BackupOpen',
  ])
    ctx['set' + name] = (value) => {
      states[name] =
        typeof value === 'function' ? value(states[name] ?? []) : value;
    };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync('app/workout-data-actions.ts', 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      Error,
      window: {
        localStorage: {
          length: 0,
          getItem: () => (queue ? 'pending' : null),
          key: () => null,
        },
      },
      require: (name) =>
        name.startsWith('@/') ? f.load(name.slice(2) + '.ts') : require(name),
      fetch: async (path, options) => {
        requests.push({ path, options });
        return fetcher(path, options);
      },
    },
  );
  return {
    ctx,
    states,
    requests,
    actions: () => exports.createDataActions(ctx),
    get refreshes() {
      return refreshes;
    },
    close: () => f.close(),
  };
}

test('deferred data action setup performs no fetch; restores still refuse queues and dirty/in-flight saves', async () => {
  for (const guard of ['queue', 'dirty', 'saving', 'programSaving']) {
    const f = actionFixture({ queue: guard === 'queue' });
    try {
      if (guard === 'dirty') f.ctx.exerciseDraft.dirty = true;
      else if (guard !== 'queue') f.ctx[guard] = true;
      const actions = f.actions();
      assert.equal(f.requests.length, 0);
      await actions.restoreBackup();
      assert.equal(f.requests.length, 0);
      assert.match(f.states.Error, /Sync queued saves/);
    } finally {
      f.close();
    }
  }
});

test('deferred backup preview and restore retain programme identity and authoritative refresh', async () => {
  const f = actionFixture({
    fetcher: async () =>
      Response.json({ ok: true, summary: { workoutRecords: 1 } }),
  });
  try {
    const file = {
      name: 'backup.json',
      text: async () => JSON.stringify({ entries: [] }),
    };
    await f.actions().previewBackupFile({ target: { files: [file] } });
    assert.equal(JSON.parse(f.requests[0].options.body).programmeId, 'initial');
    assert.equal(f.states.BackupFileName, 'backup.json');
    await f.actions().restoreBackup();
    assert.equal(f.refreshes, 1);
    assert.equal(f.states.BackupOpen, false);
    assert.equal(f.states.BackupBusy, false);
    assert.equal(JSON.parse(f.requests[1].options.body).mode, 'restore');
  } finally {
    f.close();
  }
});

test('deferred Sheet import retains explicit overwrite keys and refreshes through the scoped cache path', async () => {
  const f = actionFixture({
    fetcher: async () => Response.json({ ok: true, imported: 1 }),
  });
  try {
    await f.actions().importSelectedSheetEntries();
    assert.deepEqual(JSON.parse(f.requests[0].options.body), {
      keys: ['1|A|1'],
      overwriteKeys: ['1|A|1'],
    });
    assert.equal(f.requests.length, 1);
    assert.equal(f.refreshes, 1);
    assert.equal(f.states.ImportingSheet, false);
  } finally {
    f.close();
  }
});

test('startup graph excludes optional controllers/panel, while emergency recovery and the timer engine remain eager', () => {
  const graph = JSON.parse(
    readFileSync('dist/client/startup-assets.json', 'utf8'),
  );
  assert.equal(
    graph.version,
    JSON.parse(readFileSync('app-release.json', 'utf8')).appVersion,
  );
  assert.ok(
    !graph.assets.some((path) =>
      /workout-data-actions|rest-timer-alerts-panel/.test(path),
    ),
  );
  const app = readFileSync('app/workout-app.tsx', 'utf8'),
    timer = readFileSync('app/rest-timer.tsx', 'utf8');
  assert.match(app, /await import\('\.\/workout-data-actions'\)/);
  assert.match(app, /function downloadDeviceRecovery/);
  assert.match(timer, /const RestTimerAlerts = lazy\(loadAlertSettings\)/);
  assert.match(timer, /if \(soundEnabled\) prepareTimerSound\(\)/);
  assert.match(timer, /startEngine\(\)/);
  assert.match(timer, /afterStartup/);
});

test('deferred alert settings preserve permission refresh and gesture-time sound preparation', async () => {
  const state = [],
    changes = [],
    messages = [],
    sent = [];
  let cursor = 0,
    installed = false,
    refresh,
    effect,
    prepared = 0,
    played = 0;
  const preferences = { sound: true, awake: true, notifications: false };
  const permission = {
    permission: 'granted',
    requestPermission: async () => permission.permission,
  };
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync('app/rest-timer-alerts-panel.tsx', 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      module,
      exports: module.exports,
      Notification: permission,
      window: { Notification: permission },
      navigator: {
        serviceWorker: { getRegistration: async () => ({ active: {} }) },
      },
      Error,
      setTimeout,
      require: (name) => {
        if (name === 'react')
          return {
            useState: (initial) => {
              const i = cursor++;
              if (!(i in state))
                state[i] = typeof initial === 'function' ? initial() : initial;
              return [
                state[i],
                (next) => {
                  state[i] = typeof next === 'function' ? next(state[i]) : next;
                },
              ];
            },
            useEffect: (fn) => {
              if (!installed) {
                effect = fn;
                installed = true;
              }
            },
          };
        if (name === '@/components/ui/button') return { Button: () => null };
        if (name === '@/lib/rest-timer-alerts')
          return {
            prepareTimerSound: () => prepared++,
            playRestTimerSound: async () => {
              played++;
              return true;
            },
            showRestNotification: async (_getter, options) =>
              sent.push(options),
          };
        return require(name);
      },
    },
  );
  const props = {
    services: {
      prepareTimerSound: () => prepared++,
      playRestTimerSound: async () => {
        played++;
        return true;
      },
      showRestNotification: async (_getter, options) => sent.push(options),
    },
    notificationIconHref: '/icon.png',
    readPreferences: () => ({ ...preferences }),
    setPreference: (key, value) => {
      preferences[key] = value;
      changes.push([key, value]);
      refresh?.();
    },
    subscribe: (callback) => {
      refresh = callback;
      return () => {
        refresh = undefined;
      };
    },
    reportStatus: (message) => messages.push(message),
  };
  const render = () => {
    cursor = 0;
    return module.exports.default(props);
  };
  const elements = (node) =>
    !node || typeof node !== 'object'
      ? []
      : Array.isArray(node)
        ? node.flatMap(elements)
        : [node, ...elements(node.props?.children)];
  const text = (node) =>
    Array.isArray(node)
      ? node.map(text).join(' ')
      : node && typeof node === 'object'
        ? text(node.props?.children)
        : typeof node === 'string'
          ? node
          : '';
  const button = (tree, label) =>
    elements(tree).find(
      (node) =>
        node.props?.onClick && text(node).replace(/\s+/g, ' ').trim() === label,
    );
  render();
  const cleanup = effect();
  button(render(), 'Notifications off').props.onClick();
  assert.deepEqual(changes.at(-1), ['notifications', true]);
  permission.permission = 'denied';
  refresh();
  assert.ok(
    button(render(), 'Enable notifications'),
    'permission display refreshes while panel remains open',
  );
  button(render(), 'Enable notifications').props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(preferences.notifications, false);
  assert.match(messages.at(-1), /blocked/);
  permission.permission = 'granted';
  refresh();
  const testing = button(render(), 'Test alert').props.onClick();
  assert.equal(
    prepared,
    1,
    'audio preparation occurs synchronously inside the tap handler',
  );
  await testing;
  assert.equal(played, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].icon, '/icon.png');
  assert.equal(sent[0].silent, false);
  button(render(), 'Sound on').props.onClick();
  await button(render(), 'Test alert').props.onClick();
  assert.equal(sent.at(-1).silent, true);
  assert.equal(played, 1);
  cleanup();
  assert.equal(refresh, undefined);
});

test('optional-panel load failures do not swallow or replace the core timer controls', () => {
  const f = routeFixture();
  try {
    const Boundary = f.load('app/optional-panel-boundary.tsx').default;
    const child = { timer: 'untouched' };
    const boundary = new Boundary({
      children: child,
      message: 'Reconnect; core timer remains available.',
    });
    assert.equal(boundary.render(), child);
    boundary.state = Boundary.getDerivedStateFromError();
    assert.equal(boundary.render().props.role, 'alert');
    assert.match(
      boundary.render().props.children,
      /core timer remains available/,
    );
    const source = readFileSync('app/rest-timer.tsx', 'utf8');
    assert.ok(
      source.indexOf('onClick={toggle}') <
        source.indexOf('<OptionalPanelBoundary'),
    );
  } finally {
    f.close();
  }
});
