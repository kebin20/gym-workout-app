import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routeFixture } from './route-test-harness.mjs';
import { validateWorkoutNumbers } from '../lib/workout-validation.ts';
import {
  readExerciseDraft,
  writeExerciseDraft,
} from '../lib/exercise-drafts.ts';
import { undoWorkoutPayload } from '../lib/workout-undo.ts';
import { enqueueOutbox, readOutbox } from '../lib/workout-outbox.ts';

const efforts = (entry) => [1, 2, 3, 4, 5].map((set) => entry[`set${set}Rir`]);
const base = () => ({
  week: 1,
  day: 'A',
  exerciseOrder: 1,
  setCount: 5,
  completed: true,
  set1Weight: 40,
  set1Reps: 8,
  set1Rir: 0,
  set2Weight: 40,
  set2Reps: 8,
  set2Rir: 1,
  set3Weight: 40,
  set3Reps: 8,
  set3Rir: null,
  set4Weight: 40,
  set4Reps: 8,
  set4Rir: 3,
  set5Weight: 40,
  set5Reps: 8,
  set5Rir: 10,
  rir: 2,
  notes: 'Legacy effort kept separately.',
});
function request(payload) {
  return new Request('https://liftline.test/api/workouts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
async function save(route, payload) {
  const response = await route.POST(request(payload));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body.entry;
}
test('per-set RIR is optional, preserves zero and rejects invalid values, including hidden sets', () => {
  const valid = { weights: [40], values: [8], setCount: 1, rir: null };
  for (const value of [undefined, null, '', 0, '0', 2, 10])
    assert.equal(validateWorkoutNumbers({ ...valid, setRirs: [value] }), null);
  for (const value of [-1, 11, 1.5, 'invalid', true, Infinity]) {
    assert.match(
      validateWorkoutNumbers({ ...valid, setRirs: [value] }),
      /Set 1: RIR/,
    );
    assert.match(
      validateWorkoutNumbers({
        ...valid,
        setRirs: [null, null, null, null, value],
      }),
      /Set 5: RIR/,
    );
  }
});
test('API persists all five efforts, delta sync returns them, old clients preserve them and explicit null clears', async () => {
  const fixture = routeFixture();
  try {
    const route = fixture.load('app/api/workouts/route.ts');
    const saved = await save(route, base());
    assert.deepEqual(efforts(saved), [0, 1, null, 3, 10]);
    assert.equal(saved.rir, 2);
    const delta = await (
      await route.GET(new Request('https://liftline.test/api/workouts?since=0'))
    ).json();
    assert.deepEqual(efforts(delta.entries[0]), [0, 1, null, 3, 10]);
    const legacy = {
      ...base(),
      clientUpdatedAt: new Date(
        Date.parse(saved.updatedAt) + 1000,
      ).toISOString(),
    };
    for (let set = 1; set <= 5; set++) delete legacy[`set${set}Rir`];
    const preserved = await save(route, legacy);
    assert.deepEqual(efforts(preserved), [0, 1, null, 3, 10]);
    const cleared = await save(route, {
      ...base(),
      set1Rir: null,
      set4Rir: null,
      clientUpdatedAt: new Date(
        Date.parse(preserved.updatedAt) + 1000,
      ).toISOString(),
    });
    assert.deepEqual(efforts(cleared), [null, 1, null, null, 10]);
    for (const invalid of [-1, 11, 1.5, 'invalid']) {
      const response = await route.POST(
        request({ ...base(), set2Rir: invalid }),
      );
      assert.equal(response.status, 400);
    }
  } finally {
    fixture.close();
  }
});
test('backup/restore and undo round-trip per-set effort without inventing values in legacy logs', async () => {
  const fixture = routeFixture();
  try {
    const route = fixture.load('app/api/workouts/route.ts');
    const backup = fixture.load('app/api/workouts/backup/route.ts');
    const saved = await save(route, base());
    const exported = await (await backup.GET()).json();
    assert.deepEqual(efforts(exported.entries[0]), [0, 1, null, 3, 10]);
    const edited = await save(route, {
      ...base(),
      set1Rir: 4,
      clientUpdatedAt: new Date(
        Date.parse(saved.updatedAt) + 1000,
      ).toISOString(),
    });
    const undone = await save(route, undoWorkoutPayload(edited, saved));
    assert.deepEqual(efforts(undone), [0, 1, null, 3, 10]);
    const restore = await backup.POST(
      new Request('https://liftline.test/api/workouts/backup', {
        method: 'POST',
        body: JSON.stringify({ mode: 'restore', backup: exported }),
      }),
    );
    assert.equal(restore.status, 200, await restore.text());
    const restored = await (await backup.GET()).json();
    assert.deepEqual(efforts(restored.entries[0]), [0, 1, null, 3, 10]);
    const legacy = { ...base(), week: 2 };
    for (let set = 1; set <= 5; set++) delete legacy[`set${set}Rir`];
    const oldRestore = await backup.POST(
      new Request('https://liftline.test/api/workouts/backup', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'restore',
          backup: { version: 2, entries: [legacy], sessionExercises: [] },
        }),
      }),
    );
    assert.equal(oldRestore.status, 200, await oldRestore.text());
    const old = (await (await backup.GET()).json()).entries.find(
      (entry) => entry.week === 2,
    );
    assert.deepEqual(efforts(old), [null, null, null, null, null]);
    assert.equal(old.rir, 2);
  } finally {
    fixture.close();
  }
});
test('new and older drafts recover without copying exercise RIR into sets or crossing Holiday schemas', () => {
  const data = new Map();
  const storage = {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i],
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  const fallback = {
    sets: Array.from({ length: 5 }, () => ({
      weight: '',
      reps: '',
      rir: '',
      done: false,
    })),
    setCount: 3,
    rir: '',
    notes: '',
  };
  const old = {
    ...fallback,
    sets: fallback.sets.map(({ rir, ...set }) => ({
      ...set,
      weight: '40',
      reps: '8',
    })),
    rir: '2',
    notes: 'Unfinished legacy draft.',
  };
  assert.ok(writeExerciseDraft('1|A|1', old, storage));
  const recovered = readExerciseDraft('1|A|1', fallback, storage);
  assert.equal(recovered.notes, old.notes);
  assert.equal(recovered.rir, '2');
  assert.deepEqual(
    recovered.sets.map((set) => set.rir),
    ['', '', '', '', ''],
  );
  recovered.sets[0].rir = '0';
  assert.ok(writeExerciseDraft('1|A|1', recovered, storage));
  assert.equal(readExerciseDraft('1|A|1', fallback, storage).sets[0].rir, '0');
  const payload = base();
  assert.ok(
    enqueueOutbox(
      'workout',
      { key: '1|A|1', revision: 'new-rir', payload, record: payload },
      storage,
    ),
  );
  const queued = readOutbox('workout', storage)[0];
  assert.deepEqual(efforts(queued.payload), [0, 1, null, 3, 10]);
  assert.deepEqual(efforts(queued.record), [0, 1, null, 3, 10]);
  const holiday = {
    ...fallback,
    sets: fallback.sets.map(({ reps, ...set }) => ({ ...set, value: '' })),
  };
  assert.equal(readExerciseDraft('1|A|1', holiday, storage), null);
});
test('reports retain per-set RIR independently of volume and legacy exercise RIR', () => {
  const fixture = routeFixture();
  try {
    const { reportSets, reportMetrics } = fixture.load('lib/day-report.ts');
    const entry = { ...base(), exercise: 'Back Squat', target: '5 x 8' };
    assert.deepEqual(
      Array.from(reportSets(entry), (set) => set.rir),
      [0, 1, null, 3, 10],
    );
    assert.equal(reportMetrics(entry).volume, 1600);
    const legacy = { ...entry };
    for (let set = 1; set <= 5; set++) delete legacy[`set${set}Rir`];
    assert.deepEqual(
      Array.from(reportSets(legacy), (set) => set.rir),
      [null, null, null, null, null],
    );
  } finally {
    fixture.close();
  }
});
test('legacy spreadsheet import cannot erase per-set efforts; updated sheet fields import and clear explicitly', async () => {
  const sheetEntries = [
    {
      ...base(),
      setCount: 3,
      set4Weight: null,
      set4Reps: null,
      set5Weight: null,
      set5Reps: null,
      notes: 'From old sheet.',
    },
  ];
  for (let set = 1; set <= 5; set++) delete sheetEntries[0][`set${set}Rir`];
  const fixture = routeFixture({ sheetEntries });
  try {
    const route = fixture.load('app/api/workouts/route.ts');
    await save(route, {
      ...base(),
      setCount: 3,
      set4Weight: null,
      set4Reps: null,
      set5Weight: null,
      set5Reps: null,
    });
    const importer = fixture.load('app/api/workouts/import-sheet/route.ts');
    const importNow = () =>
      importer.POST(
        new Request('https://liftline.test/api/workouts/import-sheet', {
          method: 'POST',
          body: JSON.stringify({ keys: ['1|A|1'], overwriteKeys: ['1|A|1'] }),
        }),
      );
    const old = await importNow();
    assert.equal(old.status, 200, await old.text());
    let entry = (
      await (
        await route.GET(new Request('https://liftline.test/api/workouts'))
      ).json()
    ).entries[0];
    assert.deepEqual(efforts(entry), [0, 1, null, 3, 10]);
    Object.assign(sheetEntries[0], {
      set1Rir: null,
      set2Rir: 4,
      set3Rir: 2,
      notes: 'Updated sheet.',
    });
    const updated = await importNow();
    assert.equal(updated.status, 200, await updated.text());
    entry = (
      await (
        await route.GET(new Request('https://liftline.test/api/workouts'))
      ).json()
    ).entries[0];
    assert.deepEqual(efforts(entry), [null, 4, 2, 3, 10]);
  } finally {
    fixture.close();
  }
});
