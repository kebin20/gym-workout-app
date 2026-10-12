import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { routeFixture } from './route-test-harness.mjs';
import { deviceRecoverySnapshot } from '../lib/device-recovery.ts';

const request = (path, body) =>
  new Request('https://liftline.test' + path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
const payload = {
  week: 1,
  day: 'A',
  exerciseOrder: 1,
  setCount: 1,
  set1Weight: 50,
  set1Reps: 8,
  set1Rir: 0,
  rir: 2,
  notes: 'Preserve notes',
  completed: true,
};
async function seed(f) {
  const route = f.load('app/api/workouts/route.ts');
  const r = await route.POST(request('/api/workouts', payload));
  assert.equal(r.status, 200, await r.clone().text());
  await f.settled();
  return (await r.json()).entry;
}
async function start(f, id = 'initial') {
  return f.load('app/api/programmes/route.ts').POST(
    request('/api/programmes', {
      programmeId: id,
      startDate: '2027-01-04',
      confirm: 'ARCHIVE',
    }),
  );
}

test('grown backup round-trips >1000 health rows atomically, and Phase2 stays not_applicable', async () => {
  const f = routeFixture();
  try {
    await seed(f);
    const metric = f.sqlite.prepare(
      "INSERT INTO body_metrics(date,weight,source,notes,updated_at) VALUES (?,70,'manual','retained',?)",
    );
    const check = f.sqlite.prepare(
      "INSERT INTO readiness_checks(checked_at,week,day,sleep,energy,soreness,joint_comfort,recommendation) VALUES (?,1,'A',3,3,3,3,'normal')",
    );
    for (let i = 0; i < 1001; i++) {
      const d = new Date(Date.UTC(2022, 0, 1 + i)).toISOString();
      metric.run(d.slice(0, 10), d);
      check.run(d);
    }
    const route = f.load('app/api/workouts/route.ts');
    assert.equal(
      (await route.POST(request('/api/workouts', { ...payload, week: 13 })))
        .status,
      200,
    );
    const backup = f.load('app/api/workouts/backup/route.ts');
    const data = await (await backup.GET()).json();
    assert.equal(data.bodyMetrics.length, 1001);
    assert.equal(
      (
        await backup.POST(
          request('/api/workouts/backup', { mode: 'preview', backup: data }),
        )
      ).status,
      200,
    );
    const restored = await backup.POST(
      request('/api/workouts/backup', { mode: 'restore', backup: data }),
    );
    assert.equal(restored.status, 200, await restored.text());
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) AS n FROM body_metrics').get().n,
      1001,
    );
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) AS n FROM readiness_checks').get().n,
      1001,
    );
    assert.equal(
      f.sqlite
        .prepare('SELECT sync_status FROM workout_entries WHERE week=13')
        .get().sync_status,
      'not_applicable',
    );
  } finally {
    f.close();
  }
});

test('archive/start preserves every old value and global data, repeats safely, and scopes stale saves', async () => {
  const f = routeFixture();
  try {
    await seed(f);
    f.sqlite
      .prepare(
        "INSERT INTO body_metrics(date,weight,source,notes,updated_at) VALUES ('2026-10-12',70,'manual','global','2026-10-12T00:00:00Z')",
      )
      .run();
    const before = f.sqlite.prepare('SELECT * FROM workout_entries').all();
    const r = await start(f);
    assert.equal(r.status, 200, await r.clone().text());
    const { programmeId } = await r.json();
    assert.notEqual(programmeId, 'initial');
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) AS n FROM workout_entries').get().n,
      0,
    );
    const arch = f.sqlite
      .prepare("SELECT snapshot FROM programme_archives WHERE id='initial'")
      .get();
    const snapshot = JSON.parse(arch.snapshot);
    assert.equal(snapshot.entries[0].set1Weight, before[0].set1_weight);
    assert.equal(snapshot.entries[0].set1Rir, 0);
    assert.equal(snapshot.entries[0].set5Rir, null);
    assert.ok(Object.hasOwn(snapshot.entries[0], 'set5Rir'));
    assert.equal(snapshot.entries[0].notes, 'Preserve notes');
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) AS n FROM body_metrics').get().n,
      1,
    );
    assert.equal((await start(f)).status, 409);
    const route = f.load('app/api/workouts/route.ts');
    assert.equal(
      (await route.POST(request('/api/workouts', payload))).status,
      409,
    );
    const save = await route.POST(
      request('/api/workouts', { ...payload, programmeId }),
    );
    assert.equal(save.status, 200, await save.clone().text());
    assert.equal((await save.json()).entry.syncStatus, 'not_applicable');
    assert.equal((await start(f, programmeId)).status, 200);
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) AS n FROM programme_archives').get().n,
      2,
    );
    assert.equal(
      JSON.parse(
        f.sqlite
          .prepare("SELECT snapshot FROM programme_archives WHERE id='initial'")
          .get().snapshot,
      ).entries[0].notes,
      'Preserve notes',
    );
    const list = await (
      await f
        .load('app/api/programmes/route.ts')
        .GET(new Request('https://liftline.test/api/programmes'))
    ).json();
    assert.equal(list.archives.length, 2);
    assert.ok(!('snapshot' in list.archives[0]));
  } finally {
    f.close();
  }
});

test('archive transaction failure rolls back both archive and active programme', async () => {
  const f = routeFixture({ failBatchAt: 1 });
  try {
    await seed(f);
    const r = await start(f);
    assert.equal(r.status, 500);
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) AS n FROM workout_entries').get().n,
      1,
    );
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) AS n FROM programme_archives').get().n,
      0,
    );
    assert.equal(
      f.sqlite
        .prepare("SELECT value FROM app_settings WHERE key='programmeId'")
        .get(),
      undefined,
    );
  } finally {
    f.close();
  }
});

test('identity guards run in SQL and cannot write into a programme changed after request validation', async () => {
  let change = false;
  const f = routeFixture({
    beforeRun: (sql, db) => {
      if (change && sql.startsWith('INSERT INTO workout_entries')) {
        change = false;
        db.prepare(
          "INSERT INTO app_settings(key,value,updated_at) VALUES ('programmeId','changed','now')",
        ).run();
      }
    },
  });
  try {
    const route = f.load('app/api/workouts/route.ts');
    change = true;
    const r = await route.POST(request('/api/workouts', payload));
    assert.equal(r.status, 409);
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) AS n FROM workout_entries').get().n,
      0,
    );
  } finally {
    f.close();
  }
});

test('full backup restores programme identity and immutable archives into a new installation', async () => {
  const source = routeFixture(),
    target = routeFixture();
  try {
    await seed(source);
    const result = await start(source);
    const { programmeId } = await result.json();
    const saved = await source
      .load('app/api/workouts/route.ts')
      .POST(
        request('/api/workouts', { ...payload, programmeId, set1Weight: 60 }),
      );
    assert.equal(saved.status, 200);
    const data = await (
      await source.load('app/api/workouts/backup/route.ts').GET()
    ).json();
    const restore = await target
      .load('app/api/workouts/backup/route.ts')
      .POST(request('/api/workouts/backup', { mode: 'restore', backup: data }));
    assert.equal(restore.status, 200, await restore.text());
    assert.equal(
      target.sqlite
        .prepare("SELECT value FROM app_settings WHERE key='programmeId'")
        .get().value,
      programmeId,
    );
    assert.equal(
      target.sqlite
        .prepare('SELECT COUNT(*) AS n FROM programme_archives')
        .get().n,
      1,
    );
    assert.equal(
      target.sqlite.prepare('SELECT set1_weight FROM workout_entries').get()
        .set1_weight,
      60,
    );
    assert.equal(
      target.sqlite.prepare('SELECT sync_status FROM workout_entries').get()
        .sync_status,
      'not_applicable',
    );
    const current = await (
      await target
        .load('app/api/workouts/route.ts')
        .GET(
          new Request(
            'https://liftline.test/api/workouts?cursor=99999&programmeId=initial',
          ),
        )
    ).json();
    assert.equal(current.partial, false);
    assert.equal(current.entries.length, 1);
  } finally {
    source.close();
    target.close();
  }
});

test('adopting a restored programme refuses records created after validation', async () => {
  const source = routeFixture();
  const target = routeFixture({
    beforeBatch: (_statements, sqlite) => {
      sqlite
        .prepare(
          "INSERT INTO workout_entries(week,day,exercise_order,exercise,target,updated_at) VALUES (1,'A',1,'Concurrent record','3 sets','now')",
        )
        .run();
    },
  });
  try {
    await seed(source);
    const { programmeId } = await (await start(source)).json();
    await source
      .load('app/api/workouts/route.ts')
      .POST(request('/api/workouts', { ...payload, programmeId }));
    const backup = await (
      await source.load('app/api/workouts/backup/route.ts').GET()
    ).json();
    const result = await target
      .load('app/api/workouts/backup/route.ts')
      .POST(request('/api/workouts/backup', { mode: 'restore', backup }));
    assert.equal(result.status, 409, await result.clone().text());
    assert.equal(
      target.sqlite.prepare('SELECT exercise FROM workout_entries').get()
        .exercise,
      'Concurrent record',
    );
    assert.equal(
      target.sqlite
        .prepare('SELECT COUNT(*) AS n FROM programme_archives')
        .get().n,
      0,
    );
    assert.equal(
      target.sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM app_settings WHERE key='programmeId'",
        )
        .get().n,
      0,
    );
  } finally {
    source.close();
    target.close();
  }
});

test('large Holiday histories restore without the old 5000-row cap and roll back on failure', async () => {
  const entries = Array.from({ length: 5001 }, (_, i) => ({
    sessionId: `holiday_${String(i).padStart(5, '0')}`,
    sessionDate: '2026-10-01',
    sessionType: 'A',
    exerciseOrder: 1,
    exercise: 'Squat',
    target: '3 x 12',
    metric: 'reps',
    setCount: 1,
    set1Weight: 10,
    set1Value: 12,
    rir: 0,
    notes: 'Retained',
    completed: true,
  }));
  const f = routeFixture();
  try {
    const result = await f.load('app/api/workouts/backup/route.ts').POST(
      request('/api/workouts/backup', {
        mode: 'restore',
        backup: { entries: [], sessionExercises: [], holidayEntries: entries },
      }),
    );
    assert.equal(result.status, 200, await result.clone().text());
    assert.equal(
      f.sqlite
        .prepare('SELECT COUNT(*) AS n FROM holiday_workout_entries')
        .get().n,
      entries.length,
    );
    const exported = await (
      await f.load('app/api/workouts/backup/route.ts').GET()
    ).json();
    assert.equal(exported.holidayEntries.length, entries.length);
    assert.equal(exported.holidayEntries[0].rir, 0);
  } finally {
    f.close();
  }
  let statementsRun = 0;
  const failing = routeFixture({
    failBatchAt: 1,
    beforeRun: () => {
      statementsRun++;
    },
  });
  try {
    const result = await failing.load('app/api/workouts/backup/route.ts').POST(
      request('/api/workouts/backup', {
        mode: 'restore',
        backup: {
          entries: [payload],
          sessionExercises: [],
          holidayEntries: entries.slice(0, 1),
        },
      }),
    );
    assert.equal(result.status, 400);
    assert.match(
      (await result.json()).error,
      /Unable to restore|Synthetic transaction failure/,
    );
    assert.equal(
      statementsRun,
      1,
      'failure must happen after a real first insert, not during validation',
    );
    assert.equal(
      failing.sqlite
        .prepare('SELECT COUNT(*) AS n FROM holiday_workout_entries')
        .get().n,
      0,
    );
    assert.equal(
      failing.sqlite.prepare('SELECT COUNT(*) AS n FROM workout_entries').get()
        .n,
      0,
    );
  } finally {
    failing.close();
  }
});

test('archive JSON functions stay within D1 argument limits', () => {
  const f = routeFixture();
  try {
    const { programmeSnapshotSql: sql } = f.load('lib/programme-storage.ts');
    for (const match of sql.matchAll(/\b(?:json_object|json_set)\(/g)) {
      let depth = 1,
        quoted = false,
        count = 1;
      for (
        let i = match.index + match[0].length;
        i < sql.length && depth;
        i++
      ) {
        const c = sql[i];
        if (c === "'") quoted = !quoted;
        if (quoted) continue;
        if (c === '(') depth++;
        if (c === ')') depth--;
        if (c === ',' && depth === 1) count++;
      }
      assert.ok(count <= 32, `${match[0]} uses ${count} arguments`);
    }
  } finally {
    f.close();
  }
});

test('delayed Sheet acknowledgements cannot update a different programme', async () => {
  const f = routeFixture({
    beforeRun: (sql, sqlite) => {
      if (sql.startsWith('UPDATE workout_entries SET sync_status'))
        sqlite
          .prepare(
            "INSERT INTO app_settings(key,value,updated_at) VALUES ('programmeId','next','now') ON CONFLICT(key) DO UPDATE SET value='next'",
          )
          .run();
    },
  });
  try {
    await seed(f);
    assert.equal(
      f.sqlite.prepare('SELECT sync_status FROM workout_entries').get()
        .sync_status,
      'pending',
    );
  } finally {
    f.close();
  }
  let changed = false;
  const full = routeFixture({
    beforeBatch: (_statements, sqlite) => {
      if (changed)
        sqlite
          .prepare(
            "INSERT INTO app_settings(key,value,updated_at) VALUES ('programmeId','next','now') ON CONFLICT(key) DO UPDATE SET value='next'",
          )
          .run();
    },
  });
  try {
    await seed(full);
    full.sqlite
      .prepare("UPDATE workout_entries SET sync_status='pending'")
      .run();
    changed = true;
    const result = await full
      .load('app/api/workouts/sync-sheet/route.ts')
      .POST();
    assert.equal(result.status, 200);
    assert.equal(
      full.sqlite.prepare('SELECT sync_status FROM workout_entries').get()
        .sync_status,
      'pending',
    );
  } finally {
    full.close();
  }
});

test('restoring a separate archive adds history without touching active records', async () => {
  const source = routeFixture(),
    target = routeFixture();
  try {
    await seed(source);
    await start(source);
    await seed(target);
    const archive = source.sqlite
      .prepare(
        'SELECT id,label,created_at AS createdAt,snapshot FROM programme_archives',
      )
      .get();
    const before = JSON.stringify(
      target.sqlite.prepare('SELECT * FROM workout_entries').all(),
    );
    const r = await target.load('app/api/workouts/backup/route.ts').POST(
      request('/api/workouts/backup', {
        mode: 'restore',
        backup: {
          version: 4,
          entries: [],
          sessionExercises: [],
          archives: [archive],
        },
      }),
    );
    assert.equal(r.status, 200, await r.text());
    assert.equal(
      JSON.stringify(
        target.sqlite.prepare('SELECT * FROM workout_entries').all(),
      ),
      before,
    );
    assert.equal(
      target.sqlite
        .prepare('SELECT COUNT(*) AS n FROM programme_archives')
        .get().n,
      1,
    );
    const restarted = await start(target);
    assert.equal(restarted.status, 200, await restarted.clone().text());
    assert.notEqual((await restarted.json()).archivedId, archive.id);
    assert.equal(
      target.sqlite
        .prepare('SELECT COUNT(*) AS n FROM programme_archives')
        .get().n,
      2,
    );
    assert.equal(
      target.sqlite
        .prepare('SELECT snapshot FROM programme_archives WHERE id=?')
        .get(archive.id).snapshot,
      archive.snapshot,
    );
  } finally {
    source.close();
    target.close();
  }
});

test('programme overlays isolate queued records without changing durable keys', () => {
  const f = routeFixture();
  const { programmeOutboxKey, overlayProgrammeRecords } = f.load(
    'lib/programme-client.ts',
  );
  const record = { week: 1, day: 'A', exerciseOrder: 1, set1Weight: 40 };
  const legacy = {
    key: '1|A|1',
    payload: { ...record },
    record: { ...record, set1Weight: 45 },
  };
  const current = {
    key: 'next:1|A|1',
    payload: { ...record, programmeId: 'next' },
    record: { ...record, set1Weight: 60 },
  };
  const queue = [legacy, current];
  assert.equal(programmeOutboxKey(record), legacy.key);
  assert.equal(programmeOutboxKey(record, 'next'), current.key);
  assert.equal(
    overlayProgrammeRecords([record], queue, 'initial')[0].set1Weight,
    45,
  );
  assert.equal(
    overlayProgrammeRecords([record], queue, 'next')[0].set1Weight,
    60,
  );
  assert.deepEqual(
    queue.map((item) => item.key),
    ['1|A|1', 'next:1|A|1'],
  );
  f.close();
});

test('schedule edits cannot cross programme identities, including a transition during the write', async () => {
  const f = routeFixture();
  try {
    await seed(f);
    const next = await (await start(f)).json();
    const route = f.load('app/api/settings/route.ts');
    const dates = {
      phase1StartDate: '2027-02-01',
      phase2StartDate: '2027-04-26',
    };
    assert.equal(
      (await route.POST(request('/api/settings', dates))).status,
      409,
    );
    assert.equal(
      (
        await route.POST(
          request('/api/settings', { ...dates, programmeId: next.programmeId }),
        )
      ).status,
      200,
    );
    assert.equal(
      f.sqlite
        .prepare("SELECT value FROM app_settings WHERE key='phase1StartDate'")
        .get().value,
      dates.phase1StartDate,
    );
  } finally {
    f.close();
  }
  const racing = routeFixture({
    beforeBatch: (_statements, sqlite) => {
      sqlite
        .prepare(
          "INSERT INTO app_settings(key,value,updated_at) VALUES ('programmeId','changed','now') ON CONFLICT(key) DO UPDATE SET value='changed'",
        )
        .run();
    },
  });
  try {
    const route = racing.load('app/api/settings/route.ts');
    assert.equal(
      (
        await route.POST(
          request('/api/settings', {
            phase1StartDate: '2027-02-01',
            phase2StartDate: '2027-04-26',
          }),
        )
      ).status,
      409,
    );
    assert.equal(
      racing.sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM app_settings WHERE key='phase1StartDate'",
        )
        .get().n,
      0,
    );
  } finally {
    racing.close();
  }
});

test('device recovery preserves malformed queue strings and drafts without exporting secrets or deleting anything', () => {
  const values = new Map([
    ['liftline.outbox.v2.workout.bad', 'not json'],
    ['liftline.exercise-draft.v2.a', 'draft'],
    ['liftline.pending-workouts.v1', 'malformed'],
    ['secret-token', 'never-export'],
  ]);
  const storage = {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i] ?? null,
    getItem: (k) => values.get(k) ?? null,
  };
  const snapshot = deviceRecoverySnapshot(storage);
  assert.equal(Object.keys(snapshot.records).length, 3);
  assert.equal(snapshot.records['liftline.outbox.v2.workout.bad'], 'not json');
  assert.equal(snapshot.records['secret-token'], undefined);
  assert.equal(values.size, 4);
});

test('PRs use only earlier records of the same exercise; effort uses per-set zero with legacy fallback', () => {
  const f = routeFixture();
  try {
    const { personalRecordsFor } = f.load('lib/workout-metrics.ts'),
      { effortValues } = f.load('lib/exercise-identity.ts');
    const row = (week, weight, name = 'Bench') => ({
      ...payload,
      week,
      exercise: name,
      set1Weight: weight,
    });
    assert.equal(
      personalRecordsFor(row(5, 80), [
        row(4, 20),
        row(6, 120),
        row(3, 140, 'Squat'),
      ]).length,
      3,
    );
    assert.deepEqual(
      Array.from(effortValues({ ...row(5, 80), rir: 5, set1Rir: 0 })),
      [0],
    );
    assert.deepEqual(
      Array.from(effortValues({ ...row(5, 80), set1Rir: null, rir: 2 })),
      [2],
    );
    assert.equal(
      personalRecordsFor(row(5, 80), [row(4, 20, 'Squat')]).length,
      0,
    );
    const plan = f.load('lib/session-plan.ts');
    const exercise = plan.planForSession([], 1, 'A')[0];
    assert.notEqual(
      plan.workoutDraftKey(1, 'A', exercise),
      plan.workoutDraftKey(1, 'A', exercise, 'cycle-two'),
    );
  } finally {
    f.close();
  }
});

test('recovery and restart UI are explicit, restore guards queue/draft changes, and insights stay closed', () => {
  const app = readFileSync(
      new URL('../app/workout-app.tsx', import.meta.url),
      'utf8',
    ),
    progress = readFileSync(
      new URL('../app/progress-view.tsx', import.meta.url),
      'utf8',
    );
  assert.match(
    app,
    /async function restoreBackup[\s\S]*?hasPendingOutbox\(window.localStorage\)/,
  );
  assert.match(app, /Export device recovery|export device recovery/i);
  assert.match(progress, /insightsOpen &&/);
  assert.match(
    readFileSync(
      new URL('../app/programme-manager.tsx', import.meta.url),
      'utf8',
    ),
    /I have backed up and synced/,
  );
});
