import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.createSourceFile(
  'app/workout-app.tsx',
  readFileSync(new URL('../app/workout-app.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function extract(name) {
  let found;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name)
      found = node.getText(source);
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name)
      found = `const ${node.getText(source)};`;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(found, `Actual production function exists: ${name}`);
  return found;
}

function entry(order, weight) {
  return {
    week: 5,
    day: 'A',
    exerciseOrder: order,
    exercise: `Exercise ${order}`,
    set1Weight: weight,
    completed: true,
  };
}

// Exercise the real cache writer and refresh callback. Storage, responses and
// React setters are synthetic; no browser data or hosted records are accessed.
function fixture(snapshot) {
  let cached = JSON.stringify(snapshot);
  const calls = [];
  const state = {};
  let responseData;
  const ctx = {
    Date,
    JSON,
    encodeURIComponent,
    AbortSignal,
    window: {
      localStorage: {
        getItem: () => cached,
        setItem: (_key, value) => (cached = value),
      },
    },
    workoutCacheKey: 'liftline.workout-entries.v1',
    useCallback: (callback) => callback,
    refreshSequence: { current: 0 },
    mutationSequence: { current: 0 },
    programmeIdRef: { current: 'initial' },
    markStartup: () => {},
    fetch: async (url) => {
      calls.push(url);
      return Response.json(responseData);
    },
    normaliseWorkoutEntries: (entries) => entries,
    normaliseSessionExercises: (entries) => entries,
    refreshPendingWorkouts: () => [],
    programmeOverlay: (entries) => entries,
    mergeWorkoutEntries: (existing, incoming) => {
      const records = new Map(
        existing.map((value) => [value.exerciseOrder, value]),
      );
      incoming.forEach((value) => records.set(value.exerciseOrder, value));
      return [...records.values()];
    },
    cacheSessionExercises: () => {},
    cacheSchedule: () => {},
    weeklySummariesForPhase: () => [],
    startupSessionForWeek: () => ({ week: 1, day: 'A' }),
    scheduledWeekForToday: () => 1,
    resumeDraftIndex: () => 0,
    planForSession: () => [],
    defaultSchedule: {},
  };
  for (const name of [
    'ProgrammeId',
    'LastSave',
    'SessionSummaryOpen',
    'PersonalRecordOpen',
    'ActiveWeek',
    'ActiveDay',
    'ActiveIndex',
    'Entries',
    'SessionExercises',
    'Schedule',
    'RefreshIssue',
    'LastRefreshedAt',
  ])
    ctx[`set${name}`] = (value) => (state[name] = value);
  vm.runInNewContext(
    ts.transpileModule(
      `${extract('cacheWorkoutEntries')}\n${extract('refreshWorkoutData')}\nthis.cacheWorkoutEntries = cacheWorkoutEntries; this.refreshWorkoutData = refreshWorkoutData;`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText,
    ctx,
  );
  return {
    state,
    calls,
    get cache() {
      return JSON.parse(cached);
    },
    cacheWorkoutEntries: ctx.cacheWorkoutEntries,
    async refresh(entries, cursor, programmeId, data) {
      responseData = data;
      await ctx.refreshWorkoutData(entries, cursor, programmeId);
    },
  };
}

test('a local write invalidates another tab’s cursor instead of grafting it onto stale entries', () => {
  const stale = [entry(1, 50), entry(2, 30)];
  const f = fixture({
    programmeId: 'initial',
    syncedAt: '22',
    entries: [entry(1, 70), entry(2, 30)],
  });
  f.cacheWorkoutEntries(stale, undefined, 'initial');
  assert.equal(f.cache.syncedAt, null);
  assert.equal(f.cache.programmeId, 'initial');
  assert.deepEqual(f.cache.entries, stale);
});

test('an old tab cannot label its old programme records as the newly shared programme', () => {
  const f = fixture({
    programmeId: 'new-programme',
    syncedAt: '40',
    entries: [],
  });
  f.cacheWorkoutEntries([entry(1, 50)], undefined, 'initial');
  assert.equal(f.cache.programmeId, 'initial');
  assert.equal(f.cache.syncedAt, null);
});

test('only a completed authoritative snapshot write keeps its supplied cursor and programme', () => {
  const f = fixture({ programmeId: 'other', syncedAt: '99', entries: [] });
  f.cacheWorkoutEntries([entry(1, 70)], '23', 'initial');
  assert.equal(f.cache.syncedAt, '23');
  assert.equal(f.cache.programmeId, 'initial');
});

test('refresh rejects a cache from another programme and requests a full authoritative snapshot', async () => {
  const stale = [entry(1, 50)];
  const fresh = [entry(2, 70)];
  const f = fixture({ programmeId: 'old-programme', syncedAt: '22', entries: stale });
  await f.refresh(stale, '22', 'old-programme', {
    programmeId: 'initial',
    partial: false,
    cursor: '24',
    entries: fresh,
    sessionExercises: [],
  });
  assert.deepEqual(f.calls, ['/api/workouts']);
  assert.deepEqual(f.cache.entries, fresh);
  assert.equal(f.cache.syncedAt, '24');
  assert.equal(f.cache.programmeId, 'initial');
});

test('matching programme cache permits a delta and preserves its unchanged records', async () => {
  const existing = [entry(1, 70), entry(2, 30)];
  const f = fixture({ programmeId: 'initial', syncedAt: '22', entries: existing });
  await f.refresh(existing, '22', 'initial', {
    programmeId: 'initial',
    partial: true,
    cursor: '24',
    entries: [entry(2, 40)],
    sessionExercises: [],
  });
  assert.deepEqual(f.calls, ['/api/workouts?cursor=22&programmeId=initial']);
  assert.deepEqual(f.cache.entries, [entry(1, 70), entry(2, 40)]);
  assert.equal(f.cache.syncedAt, '24');
});

test('an invalidated local snapshot cannot strand a different tab’s correction behind an advanced cursor', async () => {
  const stale = [entry(1, 50), entry(2, 40)];
  const authoritative = [entry(1, 70), entry(2, 40)];
  const f = fixture({
    programmeId: 'initial',
    syncedAt: '22',
    entries: authoritative,
  });
  f.cacheWorkoutEntries(stale, undefined, 'initial');
  const snapshot = f.cache;
  await f.refresh(snapshot.entries, snapshot.syncedAt, snapshot.programmeId, {
    programmeId: 'initial',
    partial: false,
    cursor: '24',
    entries: authoritative,
    sessionExercises: [],
  });
  assert.deepEqual(f.calls, ['/api/workouts']);
  assert.deepEqual(f.cache.entries, authoritative);
});
