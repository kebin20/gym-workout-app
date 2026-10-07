import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { parseSyncCursor } from '../lib/sync-cursor.ts';
import {
  validateWorkoutNumbers,
  recallSets,
} from '../lib/workout-validation.ts';
import { normalizeHolidayBackup } from '../lib/holiday-backup.ts';
import { remainingSeconds, readTimerState } from '../lib/rest-timer-state.ts';
import { routeFixture } from './route-test-harness.mjs';
import { undoWorkoutPayload } from '../lib/workout-undo.ts';
import {
  confirmOutboxResponse,
  hasPendingOutbox,
  outboxStorageIssue,
} from '../lib/workout-outbox.ts';
import {
  exerciseDraftStorageKey,
  exerciseDraftPrefix,
  readExerciseDraft,
  writeExerciseDraft,
  latestDraftKey,
} from '../lib/exercise-drafts.ts';
import { sessionProgress } from '../lib/session-progress.ts';
import { findStartupWeek } from '../lib/startup-week.ts';
const { appVersion } = JSON.parse(
  readFileSync(new URL('../app-release.json', import.meta.url), 'utf8'),
);
import {
  acknowledgeOutbox,
  enqueueOutbox,
  migrateWorkoutOutbox,
  overlayOutbox,
  readOutbox,
  singleFlight,
  retryableStatus,
} from '../lib/workout-outbox.ts';

function memoryStorage() {
  const data = new Map();
  return {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}
const draft = {
  sets: Array.from({ length: 5 }, (_, index) => ({
    weight: index === 0 ? '51.3' : '',
    reps: index === 0 ? '10' : '',
    done: index === 0,
  })),
  setCount: 4,
  rir: '2',
  notes: 'Use the same machine settings.',
};

test('the refactored Today and Holiday loggers render on the server without browser globals', () => {
  const fixture = routeFixture();
  try {
    const { WorkoutApp } = fixture.load('app/workout-app.tsx');
    const html = renderToString(createElement(WorkoutApp));
    assert.ok(!html.includes('Weight adjustment increment'));
    assert.ok(!html.includes('Weight steps'));
    const rirInput = html.match(/<input\b[^>]*\bid="rir"[^>]*>/)?.[0];
    assert.ok(rirInput);
    assert.ok(rirInput.includes('placeholder="2"'));
    assert.ok(rirInput.includes('placeholder:text-placeholder'));
    assert.ok(rirInput.includes('placeholder:font-normal'));
    assert.ok(html.includes('Save &amp; next'));
    assert.ok(html.includes(appVersion));
    assert.equal((html.match(/data-workout-set-row=""/g) ?? []).length, 3);
    assert.ok(html.includes('max-w-[21.5rem]'));
    assert.ok(!html.includes('max-w-60'));
    const primaryNav = html.match(
      /<nav\b[^>]*aria-label="Primary navigation"[^>]*>[\s\S]*?<\/nav>/,
    )?.[0];
    assert.ok(primaryNav);
    assert.equal((primaryNav.match(/<button\b/g) ?? []).length, 3);
    for (const label of ['Today', 'Plan', 'Progress'])
      assert.ok(primaryNav.includes(label));
    assert.ok(!primaryNav.includes('Nutrition'));
    const Holiday = fixture.load('app/holiday-workout.tsx').default;
    const holiday = renderToString(
      createElement(Holiday, {
        appVersion,
        isOnline: true,
        onExit: () => {},
      }),
    );
    assert.ok(holiday.includes('Liftline Holiday'));
    assert.ok(holiday.includes('Rest timer'));
  } finally {
    fixture.close();
  }
});

test('the simplified programme menu opens Nutrition, schedule and guide without the removed tool entries', () => {
  const fixture = routeFixture();
  try {
    const { ProgrammeToolsMenu } = fixture.load('app/programme-tools-menu.tsx');
    const selected = [];
    const menu = ProgrammeToolsMenu({
      view: 'nutrition',
      onSelect: (destination) => selected.push(destination),
    });
    const html = renderToString(menu);
    for (const label of ['Training schedule', 'Nutrition', 'Training guide'])
      assert.ok(html.includes(label));
    for (const label of [
      'Readiness check',
      'Warm-up &amp; plates',
      'Body metrics',
    ])
      assert.ok(!html.includes(label));
    const buttons = [];
    const visit = (node) => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== 'object') return;
      if (node.type === 'button') buttons.push(node.props);
      visit(node.props?.children);
    };
    visit(menu);
    assert.equal(buttons.length, 3);
    assert.equal(buttons[1]['aria-current'], 'page');
    for (const button of buttons) button.onClick();
    assert.deepEqual(selected, ['schedule', 'nutrition', 'guide']);
    const NutritionView = fixture.load('app/nutrition-view.tsx').default;
    assert.ok(renderToString(createElement(NutritionView)).includes('protein'));
  } finally {
    fixture.close();
  }
});

test('UI polish keeps the focus toggle, desktop-only rail, day identity and all data actions', () => {
  const fixture = routeFixture();
  try {
    const { WorkoutApp } = fixture.load('app/workout-app.tsx');
    const html = renderToString(createElement(WorkoutApp));
    const menuTrigger = html.match(
      /<button\b[^>]*aria-controls="programme-tools-menu"[^>]*>[\s\S]*?<\/button>/,
    )?.[0];
    assert.ok(menuTrigger?.includes('Menu'));
    assert.ok(menuTrigger?.includes('aria-haspopup="menu"'));
    assert.ok(html.includes('lg:grid-cols-[minmax(0,1fr)_320px]'));
    assert.ok(!html.includes('md:grid-cols-[minmax(0,1fr)_320px]'));
    assert.ok(html.includes('aria-pressed="false"'));
    assert.ok(html.includes('Workout focus'));

    const { dayPresentation } = fixture.load('lib/day-presentation.ts');
    const Plan = fixture.load('app/plan-view.tsx').default;
    const planHtml = renderToString(
      createElement(Plan, {
        activePhase: 1,
        activeDisplayWeek: 1,
        activeWeek: 1,
        sessionExercises: [],
        onChooseDay: () => {},
        onEditDay: () => {},
      }),
    );
    for (const day of ['A', 'B', 'C']) {
      assert.ok(planHtml.includes(dayPresentation[day].badge));
      assert.ok(
        planHtml.replaceAll('<!-- -->', '').includes(`Start Day ${day}`),
      );
      assert.ok(html.includes(dayPresentation[day].badge));
    }

    const DataMenu = fixture.load('app/progress-data-menu.tsx').default;
    const { DropdownMenuItem } = fixture.load(
      'components/ui/dropdown-menu.tsx',
    );
    const calls = [];
    const props = {
      activePhase: 1,
      loading: false,
      loadingImport: false,
      importingSheet: false,
      syncingSheet: false,
      backupBusy: false,
      previewGoogleSheetImport: () => calls.push('import'),
      syncGoogleSheet: () => calls.push('sync'),
      downloadBackup: () => calls.push('download'),
      onRestoreBackup: () => calls.push('restore'),
    };
    const items = (element) => {
      const found = [];
      const visit = (node) => {
        if (Array.isArray(node)) return node.forEach(visit);
        if (!node || typeof node !== 'object') return;
        if (node.type === DropdownMenuItem) found.push(node.props);
        visit(node.props?.children);
      };
      visit(element);
      return found;
    };
    const actions = items(DataMenu(props));
    assert.equal(actions.length, 4);
    for (const action of actions) {
      assert.equal(action.disabled, false);
      action.onClick();
      assert.ok(action.className.includes('min-h-11'));
    }
    assert.deepEqual(calls, ['import', 'sync', 'download', 'restore']);
    const withDiagnostics = items(
      DataMenu({ ...props, onStartupDetails: () => calls.push('startup') }),
    );
    assert.equal(withDiagnostics.length, 5);
    withDiagnostics[4].onClick();
    assert.equal(calls.at(-1), 'startup');
    assert.equal(items(DataMenu({ ...props, activePhase: 2 })).length, 2);
    assert.ok(
      items(DataMenu({ ...props, loading: true })).every(
        (item) => item.disabled,
      ),
    );
    assert.deepEqual(
      items(DataMenu({ ...props, loadingImport: true })).map(
        (item) => item.disabled,
      ),
      [true, false, false, false],
    );
    assert.deepEqual(
      items(DataMenu({ ...props, importingSheet: true })).map(
        (item) => item.disabled,
      ),
      [true, false, false, false],
    );
    assert.deepEqual(
      items(DataMenu({ ...props, syncingSheet: true })).map(
        (item) => item.disabled,
      ),
      [false, true, false, false],
    );
    assert.deepEqual(
      items(DataMenu({ ...props, backupBusy: true })).map(
        (item) => item.disabled,
      ),
      [false, false, true, true],
    );
    const busyHtml = renderToString(
      createElement(DataMenu, { ...props, syncingSheet: true }),
    );
    assert.ok(busyHtml.includes('role="status"'));
    assert.ok(busyHtml.includes('Sending to Google Sheet'));
    assert.ok(busyHtml.includes('aria-haspopup="menu"'));
  } finally {
    fixture.close();
  }
});

test('numeric placeholder gray remains distinct and readable on the light input surface', () => {
  const css = readFileSync(
    new URL('../app/globals.css', import.meta.url),
    'utf8',
  );
  const placeholder = css.match(/--placeholder: (#[\da-f]{6});/i)?.[1];
  assert.ok(placeholder);
  const luminance = (hex) => {
    const rgb = hex
      .match(/[\da-f]{2}/gi)
      .map((part) => parseInt(part, 16) / 255);
    const linear = rgb.map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const fg = luminance(placeholder.slice(1));
  for (const surface of ['ffffff', 'f5f8ff', 'ecf2ff']) {
    const bg = luminance(surface);
    assert.ok(
      (bg + 0.05) / (fg + 0.05) >= 4.5,
      `Placeholder contrast on #${surface}`,
    );
  }
  assert.notEqual(placeholder, '#101b49');
});

test('drafts recover all fields and stay isolated by week, day and exercise', () => {
  const storage = memoryStorage();
  assert.equal(writeExerciseDraft('workout:5:C:1:squat', draft, storage), true);
  assert.deepEqual(
    readExerciseDraft('workout:5:C:1:squat', draft, storage),
    draft,
  );
  assert.equal(readExerciseDraft('workout:6:C:1:squat', draft, storage), null);
  assert.equal(
    readExerciseDraft('workout:5:C:1:leg press', draft, storage),
    null,
  );
  assert.equal(latestDraftKey('workout:5:C:', storage), 'workout:5:C:1:squat');
  assert.equal(latestDraftKey('workout:5:A:', storage), null);
  const holiday = {
    ...draft,
    sets: draft.sets.map((set) => ({ weight: set.weight, value: set.reps })),
  };
  assert.equal(
    readExerciseDraft('workout:5:C:1:squat', holiday, storage),
    null,
  );
  writeExerciseDraft('workout:5:C:1:squat', null, storage);
  assert.equal(readExerciseDraft('workout:5:C:1:squat', draft, storage), null);
});

test('acknowledging an in-flight workout preserves other workouts and newer revisions', () => {
  const storage = memoryStorage();
  const item = (key, revision) => ({
    key,
    revision,
    payload: { revision },
    record: { key, revision },
  });
  enqueueOutbox('workout', item('a', 'old'), storage);
  const inFlight = readOutbox('workout', storage)[0];
  enqueueOutbox('workout', item('b', 'new'), storage);
  enqueueOutbox('workout', item('a', 'newer'), storage);
  acknowledgeOutbox('workout', inFlight, storage);
  assert.deepEqual(
    readOutbox('workout', storage)
      .map((item) => item.revision)
      .sort(),
    ['new', 'newer'],
  );
  assert.equal(
    overlayOutbox(
      [{ key: 'a', revision: 'server' }],
      readOutbox('workout', storage),
      (entry) => entry.key,
    ).find((entry) => entry.key === 'a').revision,
    'newer',
  );
  const next = readOutbox('workout', storage).find((item) => item.key === 'a');
  acknowledgeOutbox('workout', next, storage);
  assert.equal(readOutbox('workout', storage).length, 1);
});

test('legacy queue migration is repeatable, isolated, and does not remove failed migrations', () => {
  const storage = memoryStorage();
  storage.setItem(
    'liftline.pending-workouts.v1',
    JSON.stringify([{ key: '5|A|1', payload: { week: 5 } }]),
  );
  migrateWorkoutOutbox(storage, (payload) => payload);
  migrateWorkoutOutbox(storage, (payload) => payload);
  assert.equal(readOutbox('workout', storage).length, 1);
  assert.equal(readOutbox('holiday', storage).length, 0);
  assert.equal(
    enqueueOutbox(
      'workout',
      { key: 'b', revision: 'r', payload: {}, record: {} },
      {
        getItem: () => null,
        length: 0,
        setItem: () => {
          throw Error('quota');
        },
      },
    ),
    false,
  );
});

test('redirect HTML and invalid confirmation never acknowledge queued workouts', async () => {
  const item = {
    key: '5|A|1',
    revision: 'test',
    payload: { week: 5, day: 'A', exerciseOrder: 1 },
    record: {},
  };
  await assert.rejects(
    confirmOutboxResponse(
      new Response('<html>Sign in</html>'),
      'workout',
      item,
    ),
  );
  await assert.rejects(
    confirmOutboxResponse(
      Response.json({
        entry: { week: 6, day: 'A', exerciseOrder: 1, updatedAt: '2026-09-01' },
      }),
      'workout',
      item,
    ),
  );
  const storage = memoryStorage();
  storage.setItem('liftline.outbox.v2.workout.broken.r', 'broken');
  assert.equal(hasPendingOutbox(storage), true);
  assert.ok(outboxStorageIssue(storage));
});

test('queue runners are single-flight and only temporary HTTP errors are retryable', async () => {
  let release;
  let calls = 0;
  const run = () => {
    calls++;
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const first = singleFlight('test', run);
  const second = singleFlight('test', run);
  await Promise.resolve();
  assert.equal(first, second);
  assert.equal(calls, 1);
  release();
  await first;
  assert.equal(retryableStatus(503), true);
  assert.equal(retryableStatus(429), true);
  assert.equal(retryableStatus(400), false);
  assert.equal(retryableStatus(409), false);
});

test('server revisions include late offline uploads, sync status changes, and preserve old rows', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE workout_entries (id INTEGER PRIMARY KEY, updated_at TEXT, sync_status TEXT, server_revision INTEGER NOT NULL DEFAULT 0); CREATE TABLE holiday_workout_entries (id INTEGER PRIMARY KEY, server_revision INTEGER NOT NULL DEFAULT 0); CREATE TABLE sync_clock (key TEXT PRIMARY KEY, value INTEGER NOT NULL);',
  );
  db.exec(
    "INSERT INTO workout_entries (id, updated_at) VALUES (1, '2026-10-01T10:00:00Z')",
  );
  const migration = readFileSync(
    new URL('../drizzle/0007_unusual_rhodey.sql', import.meta.url),
    'utf8',
  );
  for (const trigger of migration.match(/CREATE TRIGGER[\s\S]*?END;/g) ?? [])
    db.exec(trigger);
  db.exec(
    "INSERT INTO workout_entries (id, updated_at) VALUES (2, '2026-09-01T10:00:00Z')",
  );
  const revision = db.prepare('SELECT value FROM sync_clock').get().value;
  assert.equal(
    db
      .prepare(
        'SELECT COUNT(*) AS count FROM workout_entries WHERE server_revision > 0',
      )
      .get().count,
    1,
  );
  db.exec("UPDATE workout_entries SET sync_status = 'synced' WHERE id = 1");
  assert.equal(
    db
      .prepare(
        'SELECT COUNT(*) AS count FROM workout_entries WHERE server_revision > ?',
      )
      .get(revision).count,
    1,
  );
  assert.equal(
    db.prepare('SELECT updated_at FROM workout_entries WHERE id = 1').get()
      .updated_at,
    '2026-10-01T10:00:00Z',
  );
  assert.equal(parseSyncCursor('0'), 0);
  assert.equal(parseSyncCursor('2026-10-01T10:00:00Z'), null);
  assert.equal(parseSyncCursor('-1'), null);
  db.close();
});

test('new workouts reject invalid loads, reps, set counts and RIR; recalled sets are not completed', () => {
  const valid = {
    weights: [0, '51.25'],
    values: [10, 12],
    setCount: 2,
    rir: 0,
  };
  assert.equal(validateWorkoutNumbers(valid), null);
  for (const bad of [0, -1, 2.5, Infinity, '', true])
    assert.ok(validateWorkoutNumbers({ ...valid, values: [bad, 12] }));
  assert.ok(validateWorkoutNumbers({ ...valid, weights: [-1, 20] }));
  assert.ok(validateWorkoutNumbers({ ...valid, rir: 11 }));
  assert.ok(validateWorkoutNumbers({ ...valid, setCount: 2.5 }));
  assert.equal(
    validateWorkoutNumbers({
      weights: [],
      values: [],
      setCount: 1,
      rir: null,
      completed: false,
    }),
    null,
  );
  assert.deepEqual(recallSets([{ weight: '40', reps: '12', done: true }]), [
    { weight: '40', reps: '12', done: false },
  ]);
});

test('Holiday backup normalization preserves session identity, loads, timed sets and notes', () => {
  const entry = {
    sessionId: 'holiday-test',
    sessionDate: '2026-10-05',
    sessionType: 'B',
    exerciseOrder: 1,
    exercise: 'Plank',
    target: '3 × 30 sec',
    metric: 'seconds',
    setCount: 1,
    set1Value: 30,
    set1Weight: 0,
    notes: 'Travel equipment',
    rir: 2,
    completed: 1,
  };
  const normalized = normalizeHolidayBackup(entry);
  assert.equal(normalized.metric, 'seconds');
  assert.equal(normalized.notes, entry.notes);
  assert.equal(normalized.completed, true);
  assert.equal(normalizeHolidayBackup({ ...entry, sessionId: 'bad' }), null);
});

test('timer deadline survives navigation/reload and pause without accumulating tick drift', () => {
  const state = {
    id: 'timer',
    exerciseName: 'Squat',
    restLabel: '3 min',
    endsAt: 181000,
    remaining: 180,
    updatedAt: 1000,
  };
  assert.equal(
    remainingSeconds(readTimerState(JSON.stringify(state), 61000), 61000),
    120,
  );
  assert.equal(remainingSeconds(state, 190000), 0);
  assert.equal(
    remainingSeconds({ ...state, endsAt: null, remaining: 120 }, 190000),
    120,
  );
  assert.equal(readTimerState('invalid'), null);
});

test('workout API validates new input and delta sync sees late uploads and status changes', async () => {
  const fixture = routeFixture();
  try {
    const route = fixture.load('app/api/workouts/route.ts');
    const payload = {
      week: 5,
      day: 'A',
      exerciseOrder: 1,
      setCount: 1,
      set1Weight: 51.25,
      set1Reps: 12,
      rir: 2,
      notes: 'Test',
      completed: true,
      clientUpdatedAt: '2026-09-01T09:00:00Z',
    };
    const post = (body) =>
      route.POST(
        new Request('https://liftline.test/api/workouts', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      );
    assert.equal((await post({ ...payload, set1Reps: -1 })).status, 400);
    const initial = await (
      await route.GET(new Request('https://liftline.test/api/workouts'))
    ).json();
    assert.equal((await post(payload)).status, 200);
    await fixture.settled();
    const delta = await (
      await route.GET(
        new Request(
          'https://liftline.test/api/workouts?cursor=' + initial.cursor,
        ),
      )
    ).json();
    assert.equal(delta.entries.length, 1);
    assert.equal(delta.entries[0].syncStatus, 'synced');
    assert.equal(delta.entries[0].set1Weight, 51.25);
    assert.ok(Number(delta.cursor) > Number(initial.cursor));
    const duplicate = await post(payload);
    assert.equal(duplicate.status, 200);
    assert.equal(
      (await post({ ...payload, clientUpdatedAt: '2026-08-01T09:00:00Z' }))
        .status,
      409,
    );
  } finally {
    fixture.close();
  }
});

test('undo clears a new save through delta sync, restores prior values, and rejects concurrent saves', async () => {
  const fixture = routeFixture();
  try {
    const route = fixture.load('app/api/workouts/route.ts');
    const post = (payload) =>
      route.POST(
        new Request('https://liftline.test/api/workouts', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
    const payload = {
      week: 5,
      day: 'A',
      exerciseOrder: 1,
      setCount: 1,
      set1Weight: 40,
      set1Reps: 10,
      rir: 2,
      notes: 'Original',
      completed: true,
    };
    const saved = (await (await post(payload)).json()).entry;
    await fixture.settled();
    const cursor = (
      await (
        await route.GET(new Request('https://liftline.test/api/workouts'))
      ).json()
    ).cursor;
    const undone = await post(undoWorkoutPayload(saved));
    assert.equal(undone.status, 200);
    assert.equal((await undone.json()).entry.completed, 0);
    const delta = await (
      await route.GET(
        new Request('https://liftline.test/api/workouts?cursor=' + cursor),
      )
    ).json();
    assert.equal(delta.entries[0].set1Reps, null);
    const newerPayload = {
      ...payload,
      set1Weight: 50,
      clientUpdatedAt: new Date(Date.now() + 100).toISOString(),
    };
    const newer = (await (await post(newerPayload)).json()).entry;
    assert.equal((await post(undoWorkoutPayload(saved))).status, 409);
    assert.equal((await post(undoWorkoutPayload(newer, saved))).status, 200);
    const restored = (
      await (
        await route.GET(new Request('https://liftline.test/api/workouts'))
      ).json()
    ).entries[0];
    assert.equal(restored.set1Weight, 40);
    assert.equal(restored.notes, 'Original');
    assert.equal((await post({ ...payload, setCount: 6 })).status, 400);
  } finally {
    fixture.close();
  }
});

test('editing a draft writes only its own payload and legacy migration retains every valid draft', () => {
  const storage = memoryStorage();
  storage.setItem(
    exerciseDraftStorageKey,
    JSON.stringify({ legacy: { value: draft, updatedAt: Date.now() } }),
  );
  assert.equal(writeExerciseDraft('other', draft, storage), true);
  assert.deepEqual(readExerciseDraft('legacy', draft, storage), draft);
  const writes = [];
  const spy = {
    get length() {
      return storage.length;
    },
    key: storage.key,
    getItem: storage.getItem,
    removeItem: storage.removeItem,
    setItem: (key, value) => {
      writes.push(key);
      storage.setItem(key, value);
    },
  };
  assert.equal(
    writeExerciseDraft('other', { ...draft, notes: 'Edited' }, spy),
    true,
  );
  assert.deepEqual(writes, [exerciseDraftPrefix + 'other']);
});

test('Holiday API, complete backup and old-format restore preserve separate records', async () => {
  const fixture = routeFixture();
  try {
    const holiday = fixture.load('app/api/holiday-workouts/route.ts');
    const backup = fixture.load('app/api/workouts/backup/route.ts');
    const payload = {
      sessionId: 'holiday-api-test',
      sessionDate: '2026-10-05',
      sessionType: 'B',
      exerciseOrder: 1,
      exercise: 'Plank',
      target: '3 × 30 sec',
      metric: 'seconds',
      setCount: 1,
      set1Weight: 0,
      set1Value: 30,
      rir: 2,
      notes: 'Trip note',
      completed: true,
    };
    const saved = await holiday.POST(
      new Request('https://liftline.test/api/holiday-workouts', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );
    assert.equal(saved.status, 200, JSON.stringify(await saved.json()));
    await fixture.settled();
    const exported = await (await backup.GET()).json();
    assert.equal(exported.version, 3);
    assert.equal(exported.holidayEntries.length, 1);
    assert.equal(exported.holidayEntries[0].notes, 'Trip note');
    const preview = await backup.POST(
      new Request('https://liftline.test/api/workouts/backup', {
        method: 'POST',
        body: JSON.stringify({ mode: 'preview', backup: exported }),
      }),
    );
    assert.equal(preview.status, 200);
    assert.equal((await preview.json()).summary.holidayRecords, 1);
    const old = await backup.POST(
      new Request('https://liftline.test/api/workouts/backup', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'restore',
          backup: { version: 2, entries: [], sessionExercises: [] },
        }),
      }),
    );
    assert.equal(old.status, 200);
    const snapshot = await (
      await holiday.GET(
        new Request('https://liftline.test/api/holiday-workouts'),
      )
    ).json();
    assert.equal(snapshot.entries.length, 1);
  } finally {
    fixture.close();
  }
});

test('Holiday history pagination is bounded and includes an older active session', async () => {
  const fixture = routeFixture();
  try {
    const holiday = fixture.load('app/api/holiday-workouts/route.ts');
    const post = (body) =>
      holiday.POST(
        new Request('https://liftline.test/api/holiday-workouts', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      );
    const payload = {
      sessionDate: '2026-09-30',
      sessionType: 'A',
      exerciseOrder: 1,
      exercise: 'Squat',
      target: '3 x 10',
      metric: 'reps',
      setCount: 1,
      set1Value: 10,
      completed: true,
    };
    for (let index = 0; index < 23; index++)
      assert.equal(
        (
          await post({
            ...payload,
            sessionId: 'session-' + String(index).padStart(3, '0'),
          })
        ).status,
        200,
      );
    assert.equal(
      (
        await post({
          ...payload,
          sessionId: 'invalid-date',
          sessionDate: '2026-02-31',
        })
      ).status,
      400,
    );
    assert.equal(
      (await post({ ...payload, sessionId: 'invalid-count', setCount: 6 }))
        .status,
      400,
    );
    await fixture.settled();
    const first = await (
      await holiday.GET(
        new Request(
          'https://liftline.test/api/holiday-workouts?session=session-000',
        ),
      )
    ).json();
    assert.equal(first.entries.length, 21);
    assert.ok(first.entries.some((entry) => entry.sessionId === 'session-000'));
    assert.ok(first.nextPage);
    const second = await (
      await holiday.GET(
        new Request(
          'https://liftline.test/api/holiday-workouts?before=' +
            encodeURIComponent(first.nextPage),
        ),
      )
    ).json();
    assert.equal(second.entries.length, 3);
    assert.equal(second.nextPage, null);
  } finally {
    fixture.close();
  }
});

test('corrupted, expired and blocked storage do not break input editing', () => {
  const storage = memoryStorage();
  storage.setItem(exerciseDraftStorageKey, 'not json');
  assert.equal(readExerciseDraft('a', draft, storage), null);
  storage.setItem(
    exerciseDraftStorageKey,
    JSON.stringify({
      a: { value: draft, updatedAt: Date.now() - 31 * 24 * 60 * 60 * 1000 },
      b: { value: { ...draft, sets: [null] }, updatedAt: Date.now() },
    }),
  );
  assert.equal(readExerciseDraft('a', draft, storage), null);
  assert.equal(readExerciseDraft('b', draft, storage), null);
  assert.equal(
    writeExerciseDraft('a', draft, {
      getItem() {
        throw Error('disabled');
      },
      setItem() {
        throw Error('quota');
      },
    }),
    false,
  );
  for (let index = 0; index < 40; index++)
    writeExerciseDraft(`draft:${index}`, draft, storage);
  assert.equal(
    Array.from({ length: storage.length }, (_, index) =>
      storage.key(index),
    ).filter((key) => key.startsWith(exerciseDraftPrefix)).length,
    32,
  );
  assert.equal(latestDraftKey('draft:', storage), 'draft:39');
  assert.deepEqual(readExerciseDraft('draft:39', draft, storage), draft);
});

test('completion requires every non-skipped exercise and never skips an untouched week', () => {
  const plan = [
    { order: 1, skipped: false },
    { order: 2, skipped: false },
    { order: 3, skipped: true },
  ];
  assert.deepEqual(
    sessionProgress(plan, [{ exerciseOrder: 1, completed: true }]),
    { count: 1, total: 2, complete: false },
  );
  assert.deepEqual(
    sessionProgress(plan, [
      { exerciseOrder: 1, completed: true },
      { exerciseOrder: 1, completed: true },
      { exerciseOrder: 2, completed: 1 },
    ]),
    { count: 2, total: 2, complete: true },
  );
  assert.equal(
    sessionProgress(plan, [{ exerciseOrder: 2, completed: false }]).count,
    0,
  );
  assert.equal(
    sessionProgress([{ order: 1, skipped: true }], []).complete,
    false,
  );
  assert.equal(
    findStartupWeek(6, (week) => week < 5),
    5,
  );
});

const workerSource = readFileSync(
  new URL('../public/sw.js', import.meta.url),
  'utf8',
);
function workerFixture({
  cached = true,
  url = '/?source=pwa',
  mode = 'navigate',
} = {}) {
  const listeners = new Map();
  const waits = [];
  const timers = [];
  const writes = [];
  let finishFetch;
  let response;
  const fetchPromise = new Promise((resolve) => {
    finishFetch = resolve;
  });
  const cache = {
    match: async (url) =>
      cached && url === '/' ? { label: 'cached' } : undefined,
    put: async (...args) => writes.push(args),
  };
  vm.runInNewContext(workerSource, {
    self: {
      addEventListener: (type, handler) => listeners.set(type, handler),
      location: { origin: 'https://liftline.test' },
    },
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
    },
    fetch: (url) => {
      if (url === '/startup-assets.json')
        return Promise.resolve(
          networkResponse('manifest', {
            json: async () => ({
              version: appVersion,
              assets: ['/_next/static/main.js', '/_next/static/main.css'],
            }),
          }),
        );
      if (typeof url === 'string' && url.startsWith('/_next/static/'))
        return Promise.resolve(
          networkResponse('asset', {
            headers: {
              get: () =>
                url.endsWith('.css') ? 'text/css' : 'application/javascript',
            },
          }),
        );
      return fetchPromise;
    },
    URL,
    Response,
    AbortSignal,
    setTimeout: (handler) => {
      timers.push(handler);
      return timers.length;
    },
    clearTimeout: () => {},
  });
  listeners.get('fetch')({
    request: { url: `https://liftline.test${url}`, method: 'GET', mode },
    preloadResponse: Promise.resolve(undefined),
    respondWith: (promise) => {
      response = promise;
    },
    waitUntil: (promise) => waits.push(promise),
  });
  const networkResponse = (label, options = {}) => ({
    label,
    ok: true,
    type: 'basic',
    redirected: false,
    headers: { get: () => 'text/html' },
    text: async () =>
      `<meta name="liftline-build" content="${appVersion}"><script src="/_next/static/main.js"></script><link href="/_next/static/main.css">`,
    clone() {
      return this;
    },
    ...options,
  });
  return {
    get response() {
      return response;
    },
    timers,
    waits,
    writes,
    finishFetch,
    networkResponse,
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('installed startup returns cached UI immediately while a slow refresh continues in the background', async () => {
  const fixture = workerFixture();
  await tick();
  assert.equal(fixture.timers.length, 0);
  assert.equal((await fixture.response).label, 'cached');
  fixture.finishFetch(fixture.networkResponse('fresh'));
  await Promise.all(fixture.waits);
  assert.ok(fixture.writes.some(([url]) => url === '/'));
});

test('background auth redirects never replace the cached shell, and sign-in/API routes bypass it', async () => {
  const fixture = workerFixture();
  fixture.finishFetch(fixture.networkResponse('signin', { redirected: true }));
  assert.equal((await fixture.response).label, 'cached');
  await Promise.all(fixture.waits);
  assert.equal(fixture.writes.length, 0);
  assert.equal(
    workerFixture({ url: '/signin-with-chatgpt?return_to=%2F' }).response,
    undefined,
  );
  assert.equal(
    workerFixture({ url: '/api/workouts', mode: 'cors' }).response,
    undefined,
  );
});

test('uncached and explicitly refreshed launches return auth redirects without caching them', async () => {
  for (const options of [
    { cached: false },
    { url: '/?source=pwa&v=current' },
  ]) {
    const fixture = workerFixture(options);
    fixture.finishFetch(
      fixture.networkResponse('signin', { redirected: true }),
    );
    assert.equal((await fixture.response).label, 'signin');
    assert.equal(fixture.writes.length, 0);
  }
});

test('first install and explicit version URLs await fresh content rather than racing a nonexistent or stale shell', async () => {
  for (const options of [{ cached: false }, { url: '/?source=pwa&v=3.10.0' }]) {
    const fixture = workerFixture(options);
    await tick();
    assert.equal(fixture.timers.length, 0);
    fixture.finishFetch(fixture.networkResponse('fresh'));
    assert.equal((await fixture.response).label, 'fresh');
  }
});
