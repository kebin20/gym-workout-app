import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {
  workoutDraftBase,
  workoutSaveTimestamp,
} from '../lib/workout-draft-base.ts';
import {
  exerciseDraftStorageKey,
  readExerciseDraft,
  writeExerciseDraft,
} from '../lib/exercise-drafts.ts';
import { routeFixture } from './route-test-harness.mjs';

const originalTime = '2026-10-04T12:00:00.000Z';
const correctedTime = '2026-10-04T12:30:00.000Z';
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
function draft(base = originalTime, weight = '50') {
  return {
    expectedUpdatedAt: base,
    sets: Array.from({ length: 5 }, (_, index) => ({
      weight: index === 0 ? weight : '',
      reps: index === 0 ? '10' : '',
      rir: '',
      done: false,
    })),
    setCount: 1,
    rir: '',
    notes: '',
  };
}
const changeWeight = (value, weight) => ({
  ...value,
  sets: value.sets.map((set, index) =>
    index === 0 ? { ...set, weight } : set,
  ),
});

// Exercise the actual hook with a tiny synchronous React hook scheduler. It
// models render-phase state updates and layout-effect hydration, without a DOM,
// a network, or any real browser/user storage.
function draftHook(storage = memoryStorage()) {
  const f = routeFixture();
  const slots = [];
  let cursor = 0,
    changed = false,
    effects = [];
  const sameDeps = (left, right) =>
    left &&
    right &&
    left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots))
        slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[index],
        (update) => {
          const value =
            typeof update === 'function' ? update(slots[index]) : update;
          if (!Object.is(value, slots[index])) {
            slots[index] = value;
            changed = true;
          }
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps))
        slots[index] = { callback, deps };
      return slots[index].callback;
    },
    useLayoutEffect(effect, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) {
        slots[index] = { deps };
        effects.push(effect);
      }
    },
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync('app/use-exercise-draft.ts', 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require(name) {
        if (name === 'react') return react;
        if (name === '@/lib/exercise-drafts')
          return f.load('lib/exercise-drafts.ts');
        throw Error('Unexpected draft-hook dependency: ' + name);
      },
      window: { localStorage: storage },
    },
  );
  return {
    storage,
    close: f.close,
    render(key, baseline, ready = true) {
      let output;
      for (let iteration = 0; iteration < 20; iteration++) {
        cursor = 0;
        changed = false;
        effects = [];
        output = exports.useExerciseDraft(key, baseline, ready);
        effects.forEach((effect) => effect());
        if (!changed) return output;
      }
      throw Error('Draft hook did not settle');
    },
  };
}

test('draft bases distinguish new records, loaded server versions, pending original bases and unknown legacy copies', () => {
  const existing = { updatedAt: correctedTime };
  assert.deepEqual(workoutDraftBase(), { expectedUpdatedAt: null });
  assert.deepEqual(workoutDraftBase(existing), {
    expectedUpdatedAt: correctedTime,
  });
  assert.deepEqual(workoutDraftBase({ ...existing, offlinePending: true }), {});
  assert.deepEqual(workoutDraftBase({}), {});
  assert.deepEqual(
    workoutDraftBase(existing, { expectedUpdatedAt: originalTime }),
    { expectedUpdatedAt: originalTime },
  );
  assert.deepEqual(workoutDraftBase(existing, { expectedUpdatedAt: null }), {
    expectedUpdatedAt: null,
  });
  for (const unknown of [undefined, '', 'not-a-date', 1, false]) {
    assert.deepEqual(
      workoutDraftBase(existing, { expectedUpdatedAt: unknown }),
      {},
    );
  }
  assert.deepEqual(
    workoutDraftBase(existing, { clientUpdatedAt: correctedTime }),
    {},
  );
});

test('save timestamps advance beyond the loaded base despite a backward or same-millisecond device clock', () => {
  const base = Date.parse(originalTime);
  assert.equal(
    Date.parse(workoutSaveTimestamp(originalTime, base - 1000)),
    base + 1,
  );
  assert.equal(Date.parse(workoutSaveTimestamp(originalTime, base)), base + 1);
  assert.equal(
    Date.parse(workoutSaveTimestamp(originalTime, base + 1000)),
    base + 1000,
  );
  assert.equal(Date.parse(workoutSaveTimestamp(null, base)), base);
  assert.equal(Date.parse(workoutSaveTimestamp(undefined, base)), base);
});

test('draft storage round-trips string/null bases without grafting a new revision onto legacy recovered input', () => {
  const storage = memoryStorage();
  for (const base of [null, originalTime]) {
    const key = `initial|5|A|${base}`;
    assert.equal(writeExerciseDraft(key, draft(base), storage), true);
    const recovered = readExerciseDraft(key, draft(correctedTime), storage);
    assert.equal(recovered.expectedUpdatedAt, base);
    assert.equal(recovered.sets[0].weight, '50');
  }
  const oldDraft = draft();
  delete oldDraft.expectedUpdatedAt;
  for (const legacyFormat of [false, true]) {
    const legacyStorage = memoryStorage();
    if (legacyFormat)
      legacyStorage.setItem(
        exerciseDraftStorageKey,
        JSON.stringify({
          legacy: { value: oldDraft, updatedAt: Date.now() },
        }),
      );
    else
      assert.equal(writeExerciseDraft('legacy', oldDraft, legacyStorage), true);
    const recovered = readExerciseDraft(
      'legacy',
      draft(correctedTime),
      legacyStorage,
    );
    assert.equal(Object.hasOwn(recovered, 'expectedUpdatedAt'), false);
    assert.equal(recovered.sets[0].weight, '50');
  }
});

test('dirty input and its original revision survive a server refresh, navigation/back, and hook remount', () => {
  const h = draftHook();
  try {
    const original = draft();
    const corrected = draft(correctedTime, '70');
    let state = h.render('A', original);
    assert.equal(state.dirty, false);
    state.setValue((value) => changeWeight(value, '60'));
    state = h.render('A', corrected);
    assert.equal(state.value.sets[0].weight, '60');
    assert.equal(state.value.expectedUpdatedAt, originalTime);
    assert.equal(state.dirty, true);
    assert.equal(state.persisted, true);
    const other = h.render('B', draft(null, '20'));
    assert.equal(other.value.sets[0].weight, '20');
    assert.equal(other.value.expectedUpdatedAt, null);
    state = h.render('A', corrected);
    assert.equal(state.value.sets[0].weight, '60');
    assert.equal(state.value.expectedUpdatedAt, originalTime);
    assert.equal(state.recovered, true);
    const remounted = draftHook(h.storage);
    try {
      const recovered = remounted.render('A', corrected);
      assert.equal(recovered.value.sets[0].weight, '60');
      assert.equal(recovered.value.expectedUpdatedAt, originalTime);
      assert.equal(recovered.dirty, true);
    } finally {
      remounted.close();
    }
  } finally {
    h.close();
  }
});

test('acknowledging a submitted draft clears only that snapshot and adopts the confirmed server base', () => {
  const h = draftHook();
  try {
    let state = h.render('A', draft());
    state.setValue((value) => changeWeight(value, '60'));
    state = h.render('A', draft());
    const acknowledge = state.clear;
    acknowledge();
    const confirmed = draft(correctedTime, '60');
    state = h.render('A', confirmed);
    assert.equal(state.dirty, false);
    assert.equal(state.recovered, false);
    assert.equal(state.value.expectedUpdatedAt, correctedTime);
    assert.equal(state.value.sets[0].weight, '60');
    assert.equal(readExerciseDraft('A', confirmed, h.storage), null);
  } finally {
    h.close();
  }
});

test('a delayed save acknowledgement preserves edits made afterward, including their original revision', () => {
  const h = draftHook();
  try {
    let state = h.render('A', draft());
    state.setValue((value) => changeWeight(value, '60'));
    state = h.render('A', draft());
    const acknowledgeOldSubmission = state.clear;
    state.setValue((value) => changeWeight(value, '65'));
    state = h.render('A', draft());
    acknowledgeOldSubmission();
    state = h.render('A', draft(correctedTime, '60'));
    assert.equal(state.value.sets[0].weight, '65');
    assert.equal(state.value.expectedUpdatedAt, originalTime);
    assert.equal(state.dirty, true);
    const stored = readExerciseDraft('A', draft(correctedTime), h.storage);
    assert.equal(stored.sets[0].weight, '65');
    assert.equal(stored.expectedUpdatedAt, originalTime);
  } finally {
    h.close();
  }
});

test('a save completing after navigation clears its own draft without touching the newly selected exercise', () => {
  const h = draftHook();
  try {
    let state = h.render('A', draft());
    state.setValue((value) => changeWeight(value, '60'));
    state = h.render('A', draft());
    const acknowledgeA = state.clear;
    state = h.render('B', draft(null, '20'));
    state.setValue((value) => changeWeight(value, '25'));
    state = h.render('B', draft(null, '20'));
    acknowledgeA();
    state = h.render('B', draft(null, '20'));
    assert.equal(state.value.sets[0].weight, '25');
    assert.equal(state.value.expectedUpdatedAt, null);
    assert.equal(state.dirty, true);
    assert.equal(readExerciseDraft('A', draft(), h.storage), null);
    assert.equal(
      readExerciseDraft('B', draft(), h.storage).sets[0].weight,
      '25',
    );
    state = h.render('A', draft(correctedTime, '60'));
    assert.equal(state.dirty, false);
    assert.equal(state.value.expectedUpdatedAt, correctedTime);
  } finally {
    h.close();
  }
});

test('restoring legacy hook input leaves its revision unknown instead of blessing it with a refreshed server base', () => {
  const storage = memoryStorage();
  const legacy = changeWeight(draft(), '55');
  delete legacy.expectedUpdatedAt;
  writeExerciseDraft('A', legacy, storage);
  const h = draftHook(storage);
  try {
    let state = h.render('A', draft(correctedTime, '70'));
    assert.equal(state.value.sets[0].weight, '55');
    assert.equal(Object.hasOwn(state.value, 'expectedUpdatedAt'), false);
    state.setValue((value) => changeWeight(value, '56'));
    state = h.render('A', draft(correctedTime, '70'));
    assert.equal(state.value.sets[0].weight, '56');
    assert.equal(Object.hasOwn(state.value, 'expectedUpdatedAt'), false);
    assert.equal(state.dirty, true);
  } finally {
    h.close();
  }
});
