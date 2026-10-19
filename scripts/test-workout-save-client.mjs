import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { routeFixture } from './route-test-harness.mjs';
import {
  readExerciseDraft,
  writeExerciseDraft,
} from '../lib/exercise-drafts.ts';
import { enqueueOutbox, readOutbox } from '../lib/workout-outbox.ts';

const oldTime = '2026-10-04T12:00:00.000Z';
const correctedTime = '2026-10-04T12:30:00.000Z';
const key = '5|A|1';
function memoryStorage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
function draft() {
  return {
    expectedUpdatedAt: oldTime,
    sets: Array.from({ length: 5 }, (_, index) => ({
      weight: index === 0 ? '50' : '',
      reps: index === 0 ? '10' : '',
      rir: index === 0 ? '0' : '',
      done: index === 0,
    })),
    setCount: 1,
    rir: '',
    notes: 'Keep my unfinished input',
  };
}
const serverEntry = {
  programmeId: 'initial',
  week: 5,
  day: 'A',
  exerciseOrder: 1,
  exercise: 'Back Squat or Hack Squat',
  target: '3 × 6–8',
  setCount: 1,
  set1Weight: 70,
  set1Reps: 10,
  set1Rir: 2,
  rir: null,
  notes: 'Corrected elsewhere',
  completed: 1,
  completedAt: oldTime,
  updatedAt: correctedTime,
  serverRevision: 20,
};

function extractFunctions(names) {
  const file = ts.createSourceFile(
    'app/workout-app.tsx',
    readFileSync('app/workout-app.tsx', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found = new Map();
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      names.includes(node.name.text)
    )
      found.set(node.name.text, node.getText(file));
    ts.forEachChild(node, visit);
  }
  visit(file);
  names.forEach((name) =>
    assert.ok(found.has(name), `Actual source function exists: ${name}`),
  );
  return (
    names.map((name) => found.get(name)).join('\n') +
    '\nexports.saveExercise = saveExercise;'
  );
}

// Invoke the real AST-extracted save handler, not a reimplementation. Imported
// validation, outbox and identity helpers are the production implementations;
// fetch and UI setters are synthetic. This is client integration, not browser E2E.
function saveClient({ response, online = true, pending = [] } = {}) {
  const f = routeFixture(),
    storage = memoryStorage();
  const sent = [],
    cached = [],
    timers = [];
  const state = {
    Entries: [{ ...serverEntry }],
    Saving: false,
    Error: '',
    Notice: '',
    SaveConflicts: {},
    LastSave: null,
    ActiveIndex: 0,
  };
  let clears = 0,
    enqueues = 0;
  const ctx = {
    exports: {},
    Object,
    JSON,
    Date,
    Boolean,
    Number,
    Math,
    Error,
    AbortSignal,
    crypto: webcrypto,
    navigator: { onLine: online },
    window: {
      localStorage: storage,
      setTimeout: (callback, delay) => {
        timers.push({ callback, delay });
      },
    },
    programmeId: 'initial',
    programmeIdRef: { current: 'initial' },
    activeWeek: 5,
    activeDay: 'A',
    activeIndex: 0,
    exercise: {
      day: 'A',
      order: 1,
      name: 'Back Squat or Hack Squat',
      targetSets: 3,
      repRange: '6–8',
      custom: false,
    },
    existingEntry: { ...serverEntry },
    entries: [{ ...serverEntry }],
    phaseEntries: [{ ...serverEntry }],
    dayExercises: [{ order: 1 }, { order: 2 }],
    currentSessionComplete: false,
    currentSelection: { current: '5|A|1' },
    mutationSequence: { current: 0 },
    personalRecordsFor: () => [],
    cacheWorkoutEntries: (entries) => cached.push(entries),
    refreshWorkoutData: async () => state.Entries,
    refreshPendingWorkouts: () => readOutbox('workout', storage),
    readPendingWorkouts: () => readOutbox('workout', storage),
    enqueueOutbox(...args) {
      enqueues++;
      return f.load('lib/workout-outbox.ts').enqueueOutbox(...args);
    },
    fetch: async (url, options) => {
      sent.push({ url, payload: JSON.parse(options.body) });
      return typeof response === 'function' ? response(sent.at(-1)) : response;
    },
    ...f.load('lib/workout-validation.ts'),
    ...f.load('lib/workout-draft-base.ts'),
    ...f.load('lib/programme-client.ts'),
    targetLabel: f.load('lib/routine.ts').targetLabel,
    correctedExerciseName: f.load('lib/routine.ts').correctedExerciseName,
    acknowledgeOutbox: f.load('lib/workout-outbox.ts').acknowledgeOutbox,
    retryableStatus: f.load('lib/workout-outbox.ts').retryableStatus,
  };
  for (const name of [
    'Entries',
    'Saving',
    'Error',
    'Notice',
    'SaveConflicts',
    'LastSave',
    'ActiveIndex',
    'SessionCelebrationPending',
    'PersonalRecordOpen',
    'PersonalRecords',
    'SessionSummaryOpen',
    'IsOnline',
  ]) {
    ctx['set' + name] = (update) => {
      state[name] = typeof update === 'function' ? update(state[name]) : update;
    };
  }
  pending.forEach((item) => enqueueOutbox('workout', item, storage));
  vm.runInNewContext(
    ts.transpileModule(
      extractFunctions([
        'saveExercise',
        'numberOrNull',
        'optimisticEntry',
        'workoutKey',
        'replaceWorkoutEntry',
        'normaliseWorkoutEntries',
      ]),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    ctx,
  );
  return {
    state,
    storage,
    sent,
    cached,
    timers,
    get clears() {
      return clears;
    },
    get enqueues() {
      return enqueues;
    },
    close: f.close,
    async save(input = draft()) {
      writeExerciseDraft(key, input, storage);
      await ctx.exports.saveExercise(input, input.setCount, () => {
        clears++;
        writeExerciseDraft(key, null, storage);
      });
    },
  };
}

test('actual save handler sends the original draft base and a 409 preserves inputs without clearing, advancing or queueing', async () => {
  const h = saveClient({
    response: Response.json(
      { error: 'Another copy corrected this workout.', entry: serverEntry },
      { status: 409 },
    ),
  });
  try {
    const input = draft();
    await h.save(input);
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].payload.expectedUpdatedAt, oldTime);
    assert.notEqual(h.sent[0].payload.expectedUpdatedAt, correctedTime);
    assert.equal(h.sent[0].payload.set1Weight, 50);
    assert.equal(h.sent[0].payload.set1Rir, 0);
    assert.equal(h.clears, 0);
    assert.equal(h.enqueues, 0);
    assert.equal(h.state.ActiveIndex, 0);
    assert.equal(h.state.Saving, false);
    assert.equal(h.state.LastSave, null);
    assert.equal(h.state.SaveConflicts[key].set1Weight, 70);
    assert.equal(h.state.Entries[0].set1Weight, 70);
    assert.match(h.state.Error, /Another copy corrected/);
    const retained = readExerciseDraft(key, draft(), h.storage);
    assert.equal(retained.sets[0].weight, '50');
    assert.equal(retained.expectedUpdatedAt, oldTime);
    assert.equal(h.timers.length, 0);
  } finally {
    h.close();
  }
});

test('actual save handler does not guess a legacy draft revision from the newly refreshed server entry', async () => {
  const h = saveClient({
    response: Response.json(
      { error: 'Legacy input needs review.', entry: serverEntry },
      { status: 409 },
    ),
  });
  try {
    const input = draft();
    delete input.expectedUpdatedAt;
    await h.save(input);
    assert.equal(Object.hasOwn(h.sent[0].payload, 'expectedUpdatedAt'), false);
    assert.equal(h.clears, 0);
    assert.equal(
      Object.hasOwn(
        readExerciseDraft(key, draft(), h.storage),
        'expectedUpdatedAt',
      ),
      false,
    );
    assert.equal(h.state.ActiveIndex, 0);
  } finally {
    h.close();
  }
});

test('an ambiguous client timeout keeps the exact payload and original base durable for a later safe retry', async () => {
  const h = saveClient({
    response: () => {
      throw Error('Synthetic response timeout');
    },
  });
  try {
    await h.save();
    const queue = readOutbox('workout', h.storage);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].payload.expectedUpdatedAt, oldTime);
    assert.equal(
      queue[0].payload.clientUpdatedAt,
      h.sent[0].payload.clientUpdatedAt,
    );
    assert.equal(queue[0].payload.set1Weight, 50);
    assert.equal(h.clears, 1);
    assert.equal(h.state.ActiveIndex, 1);
    assert.match(h.state.Notice, /safe on this device/);
  } finally {
    h.close();
  }
});

test('a foreground conflict leaves an existing blocked queue recoverable rather than acknowledging it', async () => {
  const queued = {
    key,
    revision: 'preserve-this-revision',
    payload: {
      week: 5,
      day: 'A',
      exerciseOrder: 1,
      expectedUpdatedAt: oldTime,
    },
    record: {
      ...serverEntry,
      set1Weight: 50,
      updatedAt: oldTime,
      offlinePending: true,
    },
    blocked: 'Needs review',
  };
  const h = saveClient({
    pending: [queued],
    response: Response.json(
      { error: 'Still changed.', entry: serverEntry },
      { status: 409 },
    ),
  });
  try {
    await h.save();
    const retained = readOutbox('workout', h.storage);
    assert.equal(retained.length, 1);
    assert.equal(retained[0].revision, queued.revision);
    assert.equal(retained[0].blocked, queued.blocked);
    assert.equal(h.clears, 0);
    assert.equal(h.state.ActiveIndex, 0);
  } finally {
    h.close();
  }
});

test('conflict rollback preserves a different workout confirmed while the request was in flight', async () => {
  const other = { ...serverEntry, exerciseOrder: 2, set1Weight: 80 };
  const h = saveClient({
    response: () => {
      h.state.Entries = [...h.state.Entries, other];
      return Response.json(
        { error: 'Changed elsewhere.', entry: serverEntry },
        { status: 409 },
      );
    },
  });
  try {
    await h.save();
    assert.equal(h.state.Entries.length, 2);
    assert.equal(
      h.state.Entries.find((entry) => entry.exerciseOrder === 2).set1Weight,
      80,
    );
    assert.equal(
      h.state.Entries.find((entry) => entry.exerciseOrder === 1).set1Weight,
      70,
    );
    assert.equal(h.clears, 0);
  } finally {
    h.close();
  }
});

test('a successful explicitly reviewed save acknowledges an older blocked queue only after confirmation', async () => {
  const queued = {
    key,
    revision: 'original-blocked-revision',
    payload: {
      week: 5,
      day: 'A',
      exerciseOrder: 1,
      expectedUpdatedAt: oldTime,
    },
    record: {
      ...serverEntry,
      set1Weight: 50,
      updatedAt: oldTime,
      offlinePending: true,
    },
    blocked: 'Needs review',
  };
  const h = saveClient({
    pending: [queued],
    response: ({ payload }) =>
      Response.json({
        entry: {
          ...serverEntry,
          ...payload,
          updatedAt: payload.clientUpdatedAt,
          completed: 1,
        },
        sheetSyncQueued: true,
      }),
  });
  try {
    const reviewed = { ...draft(), expectedUpdatedAt: correctedTime };
    await h.save(reviewed);
    assert.equal(h.sent[0].payload.expectedUpdatedAt, correctedTime);
    assert.equal(readOutbox('workout', h.storage).length, 0);
    assert.equal(h.clears, 1);
    assert.equal(h.state.ActiveIndex, 1);
    assert.equal(h.state.Entries[0].set1Weight, 50);
    assert.equal(h.state.Entries[0].offlinePending, false);
    assert.equal(h.state.LastSave.before.set1Weight, 70);
    assert.equal(h.state.Saving, false);
    assert.match(h.state.Notice, /saved to Liftline/);
  } finally {
    h.close();
  }
});
