import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import {
  exerciseDraftStorageKey,
  readExerciseDraft,
  writeExerciseDraft,
  latestDraftKey,
} from '../lib/exercise-drafts.ts';
import { sessionProgress } from '../lib/session-progress.ts';
import { findStartupWeek } from '../lib/startup-week.ts';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
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
    Object.keys(JSON.parse(storage.getItem(exerciseDraftStorageKey))).length,
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
    match: async () => (cached ? { label: 'cached' } : undefined),
    put: async (...args) => writes.push(args),
  };
  vm.runInNewContext(workerSource, {
    self: {
      addEventListener: (type, handler) => listeners.set(type, handler),
      location: { origin: 'https://liftline.test' },
    },
    caches: { open: async () => cache },
    fetch: () => fetchPromise,
    URL,
    Response,
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

test('slow installed startup returns cached UI after the bound and refreshes it in the background', async () => {
  const fixture = workerFixture();
  await tick();
  assert.equal(fixture.timers.length, 1);
  fixture.timers[0]();
  assert.equal((await fixture.response).label, 'cached');
  fixture.finishFetch(fixture.networkResponse('fresh'));
  await Promise.all(fixture.waits);
  assert.equal(fixture.writes[0][0], '/');
});

test('fast auth redirects are returned but never cached, and platform sign-in/API routes bypass the shell', async () => {
  const fixture = workerFixture();
  fixture.finishFetch(fixture.networkResponse('signin', { redirected: true }));
  assert.equal((await fixture.response).label, 'signin');
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

test('first install and explicit version URLs await fresh content rather than racing a nonexistent or stale shell', async () => {
  for (const options of [{ cached: false }, { url: '/?source=pwa&v=3.10.0' }]) {
    const fixture = workerFixture(options);
    await tick();
    assert.equal(fixture.timers.length, 0);
    fixture.finishFetch(fixture.networkResponse('fresh'));
    assert.equal((await fixture.response).label, 'fresh');
  }
});
