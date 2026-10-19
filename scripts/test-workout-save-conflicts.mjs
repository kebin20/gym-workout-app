import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routeFixture } from './route-test-harness.mjs';

const originalTime = new Date(Date.now() - 120_000).toISOString();
const nextTime = new Date(Date.parse(originalTime) + 1).toISOString();
function payload(overrides = {}) {
  return {
    programmeId: 'initial',
    week: 13,
    day: 'A',
    exerciseOrder: 1,
    setCount: 1,
    set1Weight: 50,
    set1Reps: 10,
    set1Rir: 2,
    set2Weight: null,
    set2Reps: null,
    set2Rir: null,
    set3Weight: null,
    set3Reps: null,
    set3Rir: null,
    set4Weight: null,
    set4Reps: null,
    set4Rir: null,
    set5Weight: null,
    set5Reps: null,
    set5Rir: null,
    rir: null,
    notes: 'Original workout',
    completed: true,
    completedAt: originalTime,
    clientUpdatedAt: originalTime,
    expectedUpdatedAt: null,
    ...overrides,
  };
}
function post(f, input) {
  return f.load('app/api/workouts/route.ts').POST(
    new Request('https://liftline.test/api/workouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}
function read(f, week = 13) {
  return f.sqlite
    .prepare(
      `SELECT ${f.load('lib/workout-types.ts').workoutSelectColumns}
       FROM workout_entries WHERE week = ? AND day = 'A' AND exercise_order = 1`,
    )
    .get(week);
}
function concurrentInsert(sqlite, weight = 70) {
  sqlite
    .prepare(`INSERT INTO workout_entries
      (week, day, exercise_order, exercise, target, set_count, set1_weight,
       set1_reps, completed, updated_at)
      VALUES (13, 'A', 1, 'Another device', 'Keep', 1, ?, 10, 1, ?)`)
    .run(weight, originalTime);
}

test('normal save rejects a stale logger after a history correction, preserving the corrected values', async () => {
  const f = routeFixture();
  try {
    const first = await post(f, payload());
    assert.equal(first.status, 200);
    const original = (await first.json()).entry;
    const { historyFields, historyValues } = f.load(
      'lib/workout-history-edit.ts',
    );
    const corrected = await f.load('app/api/workouts/route.ts').PATCH(
      new Request('https://liftline.test/api/workouts', {
        method: 'PATCH',
        body: JSON.stringify({
          ...historyFields(historyValues(original)),
          id: original.id,
          programmeId: 'initial',
          expectedUpdatedAt: original.updatedAt,
          expectedServerRevision: original.serverRevision,
          set1Weight: 70,
        }),
      }),
    );
    assert.equal(corrected.status, 200);
    const attempt = await post(
      f,
      payload({
        expectedUpdatedAt: original.updatedAt,
        clientUpdatedAt: new Date(Date.now() + 1000).toISOString(),
      }),
    );
    assert.equal(attempt.status, 409);
    const conflict = await attempt.json();
    assert.equal(conflict.code, 'WORKOUT_SAVE_CONFLICT');
    assert.equal(conflict.entry.set1Weight, 70);
    assert.equal(read(f).set1Weight, 70);
  } finally {
    f.close();
  }
});

test('normal updates require their loaded data timestamp but ignore Sheet bookkeeping revisions', async () => {
  const f = routeFixture();
  try {
    const first = (await (await post(f, payload())).json()).entry;
    f.sqlite.exec(
      "UPDATE workout_entries SET sync_status = 'synced', sync_error = NULL",
    );
    assert.ok(read(f).serverRevision > first.serverRevision);
    const update = await post(
      f,
      payload({
        expectedUpdatedAt: first.updatedAt,
        clientUpdatedAt: nextTime,
        set1Weight: 60,
      }),
    );
    assert.equal(update.status, 200);
    assert.equal(read(f).set1Weight, 60);
    const repeatedBase = await post(
      f,
      payload({
        expectedUpdatedAt: first.updatedAt,
        clientUpdatedAt: new Date(Date.parse(nextTime) + 1).toISOString(),
        set1Weight: 65,
      }),
    );
    assert.equal(repeatedBase.status, 409);
    assert.equal(read(f).set1Weight, 60);
  } finally {
    f.close();
  }
});

test('an ambiguous successful response can be retried exactly, even after Sheet sync finishes', async () => {
  let syncs = 0;
  const f = routeFixture({
    syncWorkoutEntries: async () => {
      syncs++;
      return { ok: true, configured: true, synced: 1 };
    },
  });
  try {
    const request = payload({ week: 5 });
    // The caller loses the first response after the server has committed it.
    assert.equal((await post(f, request)).status, 200);
    await f.settled();
    const saved = read(f, 5);
    assert.equal(saved.syncStatus, 'synced');
    const retry = await post(f, request);
    assert.equal(retry.status, 200);
    const confirmed = await retry.json();
    assert.equal(confirmed.entry.updatedAt, saved.updatedAt);
    assert.equal(confirmed.sheetSyncQueued, false);
    assert.equal(read(f, 5).serverRevision, saved.serverRevision);
    await f.settled();
    assert.equal(syncs, 1);
  } finally {
    f.close();
  }
});

test('same-millisecond requests with different data are conflicts, never false acknowledgements', async () => {
  const f = routeFixture();
  try {
    assert.equal((await post(f, payload())).status, 200);
    for (const change of [
      { set1Weight: 70 },
      { set1Reps: 12 },
      { set1Rir: 0 },
      { rir: 4 },
      { notes: 'Different input' },
      { completedAt: nextTime },
      { completed: false },
      { setCount: 2, set2Weight: 50, set2Reps: 8 },
    ]) {
      assert.equal(
        (await post(f, payload(change))).status,
        409,
        JSON.stringify(change),
      );
    }
    assert.equal(read(f).set1Weight, 50);
    assert.equal(read(f).notes, 'Original workout');
  } finally {
    f.close();
  }
});

test('legacy queued payloads can create and replay, but differing updates stay blocked for recovery', async () => {
  const f = routeFixture();
  try {
    const old = payload();
    delete old.expectedUpdatedAt;
    delete old.completedAt;
    delete old.set1Rir;
    assert.equal((await post(f, old)).status, 200);
    const first = read(f);
    assert.equal((await post(f, old)).status, 200);
    assert.equal(read(f).completedAt, first.completedAt);
    const blocked = await post(f, {
      ...old,
      set1Weight: 70,
      clientUpdatedAt: nextTime,
    });
    assert.equal(blocked.status, 409);
    assert.match(
      (await blocked.json()).error,
      /queued input remains on this device/,
    );
    assert.equal(read(f).set1Weight, 50);
    // A legacy caller may never clear effort values it did not send.
    f.sqlite.exec('UPDATE workout_entries SET set1_rir = 3');
    assert.equal((await post(f, old)).status, 200);
    assert.equal(read(f).set1Rir, 3);
  } finally {
    f.close();
  }
});

test('explicit create-only saves cannot replace an existing record despite a later client clock', async () => {
  const f = routeFixture();
  try {
    assert.equal((await post(f, payload())).status, 200);
    const conflict = await post(
      f,
      payload({ clientUpdatedAt: nextTime, set1Weight: 70 }),
    );
    assert.equal(conflict.status, 409);
    assert.equal(read(f).set1Weight, 50);
  } finally {
    f.close();
  }
});

test('a concurrent insert cannot be overwritten by a create-only request', async () => {
  let armed = true;
  const f = routeFixture({
    beforeRun(sql, sqlite) {
      if (armed && sql.includes('INSERT INTO workout_entries')) {
        armed = false;
        concurrentInsert(sqlite);
      }
    },
  });
  try {
    assert.equal(
      (await post(f, payload({ clientUpdatedAt: nextTime }))).status,
      409,
    );
    assert.equal(read(f).set1Weight, 70);
    assert.equal(read(f).exercise, 'Another device');
  } finally {
    f.close();
  }
});

test('the update condition is atomic when another edit arrives immediately before writing', async () => {
  let armed = false;
  const f = routeFixture({
    beforeRun(sql, sqlite) {
      if (armed && sql.includes('INSERT INTO workout_entries')) {
        armed = false;
        sqlite
          .prepare(
            'UPDATE workout_entries SET set1_weight = 70, updated_at = ?',
          )
          .run(nextTime);
      }
    },
  });
  try {
    const original = (await (await post(f, payload())).json()).entry;
    armed = true;
    const attempt = await post(
      f,
      payload({
        expectedUpdatedAt: original.updatedAt,
        clientUpdatedAt: new Date(Date.parse(nextTime) + 1).toISOString(),
        set1Weight: 60,
      }),
    );
    assert.equal(attempt.status, 409);
    assert.equal(read(f).set1Weight, 70);
  } finally {
    f.close();
  }
});

test('a versioned update cannot recreate a record deleted before or during its write', async () => {
  for (const duringWrite of [false, true]) {
    let armed = false;
    const f = routeFixture({
      beforeRun(sql, sqlite) {
        if (armed && sql.includes('INSERT INTO workout_entries')) {
          armed = false;
          sqlite.exec('DELETE FROM workout_entries');
        }
      },
    });
    try {
      assert.equal((await post(f, payload())).status, 200);
      if (duringWrite) armed = true;
      else f.sqlite.exec('DELETE FROM workout_entries');
      const response = await post(
        f,
        payload({
          expectedUpdatedAt: originalTime,
          clientUpdatedAt: nextTime,
        }),
      );
      assert.equal(response.status, 409);
      assert.equal((await response.json()).code, 'WORKOUT_SAVE_CONFLICT');
      assert.equal(read(f), undefined);
    } finally {
      f.close();
    }
  }
});

test('malformed base timestamps are rejected without writing any workout', async () => {
  const f = routeFixture();
  try {
    for (const base of ['', 'invalid', 0, false, {}]) {
      assert.equal(
        (await post(f, payload({ expectedUpdatedAt: base }))).status,
        400,
      );
    }
    assert.equal(read(f), undefined);
  } finally {
    f.close();
  }
});
