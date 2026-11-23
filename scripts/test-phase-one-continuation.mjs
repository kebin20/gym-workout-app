import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { routeFixture } from './route-test-harness.mjs';

function client(f) {
  const file = ts.createSourceFile(
    'app/workout-app.tsx',
    readFileSync('app/workout-app.tsx', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const names = [
    'scheduledWeekForToday',
    'weeklySummariesForPhase',
    'firstIncompleteDayForWeek',
    'startupSessionForWeek',
    'advanceToNextSession',
  ];
  const found = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
      found.set(node.name.text, node.getText(file));
    ts.forEachChild(node, visit);
  }
  visit(file);
  for (const name of names) assert.ok(found.has(name));
  const state = {};
  const ctx = vm.createContext({
    exports: {},
    Date,
    Intl,
    Number,
    Math,
    ...f.load('lib/routine.ts'),
    ...f.load('lib/training-weeks.ts'),
    ...f.load('lib/session-plan.ts'),
    ...f.load('lib/startup-week.ts'),
    entryVolume: (entry) => (entry.set1Weight ?? 0) * (entry.set1Reps ?? 0),
    activeWeek: 12,
    activeDay: 'C',
    setActiveWeek: (week) => {
      state.week = week;
    },
    setActiveDay: (day) => {
      state.day = day;
    },
    setActiveIndex() {},
    setActiveTipIndex() {},
    setView() {},
    setNotice: (notice) => {
      state.notice = notice;
    },
  });
  vm.runInContext(
    ts.transpileModule(
      [...found.values()].join('\n') +
        '\nexports.api = {' +
        names.join(',') +
        '};',
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
        },
      },
    ).outputText,
    ctx,
  );
  return { ...ctx.exports.api, ctx, state };
}

test('Phase 1 continues without colliding with legacy Phase 2 or allocating every unused future week', () => {
  const f = routeFixture();
  try {
    const w = f.load('lib/training-weeks.ts');
    const r = f.load('lib/routine.ts');
    assert.equal(w.nextTrainingWeek(12), 25);
    assert.equal(w.displayTrainingWeek(25), 13);
    assert.equal(w.phaseForWeek(25), 1);
    assert.equal(w.nextTrainingWeek(25), 26);
    assert.equal(w.phaseForWeek(13), 2);
    assert.equal(w.displayTrainingWeek(13), 1);
    assert.equal(w.nextTrainingWeek(24), null);
    assert.equal(r.routineForWeek(25)[0].name, r.routine[0].name);
    assert.equal(r.routineForWeek(13)[0].name, r.phase2Routine[0].name);
    const farWeek = w.storageWeekForPhase(1, 1000000);
    assert.equal(w.displayTrainingWeek(farWeek), 1000000);
    const options = w.phaseWeekOptions(1, [13, 24, 25, farWeek], farWeek);
    assert.ok(options.includes(25));
    assert.ok(options.includes(farWeek + 1));
    assert.ok(!options.includes(13) && !options.includes(24));
    assert.ok(options.length < 20);
    for (const invalid of [
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      assert.equal(w.validTrainingWeek(invalid), false);
  } finally {
    f.close();
  }
});

test('startup and session completion continue Phase 1, keep unfinished days and preserve optional Phase 2', () => {
  const f = routeFixture();
  try {
    const c = client(f);
    const { defaultSessionPlan } = f.load('lib/session-plan.ts');
    const { days } = f.load('lib/routine.ts');
    const entries = Array.from({ length: 12 }, (_, i) => i + 1).flatMap(
      (week) =>
        days.flatMap((day) =>
          defaultSessionPlan(week, day).map((item) => ({
            ...item,
            exercise: item.name,
            completed: true,
          })),
        ),
    );
    assert.equal(c.startupSessionForWeek(entries, [], 12).week, 25);
    assert.equal(c.startupSessionForWeek(entries, [], 25).week, 25);
    const unfinished = entries.filter(
      (entry) => !(entry.week === 12 && entry.day === 'C'),
    );
    const resume = c.startupSessionForWeek(unfinished, [], 26);
    assert.equal(resume.week, 12);
    assert.equal(resume.day, 'C');
    entries.push(
      ...days.flatMap((day) =>
        defaultSessionPlan(25, day).map((item) => ({
          ...item,
          completed: true,
        })),
      ),
    );
    assert.equal(c.startupSessionForWeek(entries, [], 25).week, 26);
    const weeks = f.load('lib/training-weeks.ts').phaseWeekOptions(
      1,
      entries.map((entry) => entry.week),
      25,
    );
    const summaries = c.weeklySummariesForPhase(entries, [], 1, weeks);
    assert.equal(summaries.find((week) => week.storageWeek === 25).sessions, 3);
    assert.equal(summaries.find((week) => week.storageWeek === 25).week, 13);
    assert.equal(
      summaries.reduce((sum, week) => sum + week.sessions, 0),
      39,
    );
    const schedule = {
      phase1StartDate: '2026-08-26',
      phase2StartDate: '2026-11-18',
    };
    const scheduled = c.scheduledWeekForToday(
      schedule,
      false,
      new Date('2030-01-01T00:00:00Z'),
    );
    assert.equal(c.ctx.phaseForWeek(scheduled), 1);
    assert.ok(c.ctx.displayWeekNumber(scheduled) > 12);
    assert.equal(
      c.ctx.phaseForWeek(
        c.scheduledWeekForToday(
          schedule,
          true,
          new Date('2030-01-01T00:00:00Z'),
        ),
      ),
      2,
    );
    c.advanceToNextSession();
    assert.equal(c.state.week, 25);
    assert.equal(c.state.day, 'A');
    c.ctx.activeWeek = 25;
    c.advanceToNextSession();
    assert.equal(c.state.week, 26);
    c.ctx.activeWeek = 24;
    c.advanceToNextSession();
    assert.match(c.state.notice, /Phase 2 is complete/);
  } finally {
    f.close();
  }
});

test('a manual Phase 1 choice overrides existing Phase 2 history on this device', () => {
  const module = { exports: {} };
  let preference = '1';
  vm.runInNewContext(
    ts.transpileModule(readFileSync('lib/training-weeks.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      module,
      exports: module.exports,
      window: { localStorage: { getItem: () => preference } },
    },
  );
  assert.equal(
    module.exports.prefersPhaseTwo([{ week: 13 }], 'initial'),
    false,
  );
  preference = '2';
  assert.equal(module.exports.prefersPhaseTwo([{ week: 25 }], 'initial'), true);
  preference = null;
  assert.equal(module.exports.prefersPhaseTwo([{ week: 13 }], 'initial'), true);
  assert.equal(
    module.exports.prefersPhaseTwo([{ week: 13 }, { week: 25 }], 'initial'),
    false,
  );
});

const request = (body) =>
  new Request('https://liftline.test/api/workouts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const payload = (week) => ({
  week,
  day: 'A',
  exerciseOrder: 1,
  setCount: 1,
  set1Weight: 80,
  set1Reps: 8,
  set1Rir: 2,
  rir: null,
  notes: 'Keep this record',
  completed: true,
});

test('continuation saves, corrections, session edits, readiness and backups retain separate Phase 1/2 records', async () => {
  const f = routeFixture(),
    target = routeFixture();
  try {
    const route = f.load('app/api/workouts/route.ts');
    const phase2Response = await route.POST(request(payload(13)));
    assert.equal(phase2Response.status, 200);
    const phase2 = (await phase2Response.json()).entry;
    const exercises = f.load('lib/session-plan.ts').defaultSessionPlan(25, 'A');
    assert.equal(
      (
        await f
          .load('app/api/workouts/program/route.ts')
          .POST(request({ week: 25, day: 'A', exercises }))
      ).status,
      200,
    );
    const response = await route.POST(request(payload(25)));
    assert.equal(response.status, 200, await response.clone().text());
    const entry = (await response.json()).entry;
    assert.equal(entry.exercise, 'Back Squat or Hack Squat');
    assert.equal(entry.syncStatus, 'not_applicable');
    assert.notEqual(entry.id, phase2.id);
    const fields = f.load('lib/workout-history-edit.ts');
    const correction = await route.PATCH(
      new Request('https://liftline.test/api/workouts', {
        method: 'PATCH',
        body: JSON.stringify({
          ...fields.historyFields(fields.historyValues(entry)),
          id: entry.id,
          programmeId: 'initial',
          expectedUpdatedAt: entry.updatedAt,
          expectedServerRevision: entry.serverRevision,
          set1Weight: 88.3,
        }),
      }),
    );
    assert.equal(correction.status, 200);
    const corrected = (await correction.json()).entry;
    assert.equal(corrected.set1Weight, 88.3);
    assert.equal(corrected.completedAt, entry.completedAt);
    assert.equal(
      (
        await f
          .load('app/api/readiness/route.ts')
          .POST(
            request({
              week: 25,
              day: 'A',
              sleep: 4,
              energy: 4,
              soreness: 2,
              jointComfort: 4,
            }),
          )
      ).status,
      200,
    );
    await f.settled();
    const backup = await (
      await f.load('app/api/workouts/backup/route.ts').GET()
    ).json();
    const restore = await target
      .load('app/api/workouts/backup/route.ts')
      .POST(request({ mode: 'restore', backup }));
    assert.equal(restore.status, 200, await restore.clone().text());
    const restored = await (
      await target.load('app/api/workouts/backup/route.ts').GET()
    ).json();
    assert.equal(
      restored.entries.find((entry) => entry.week === 25).set1Weight,
      88.3,
    );
    assert.equal(
      restored.entries.find((entry) => entry.week === 13).exercise,
      phase2.exercise,
    );
    assert.ok(restored.sessionExercises.some((entry) => entry.week === 25));
    assert.ok(restored.readinessChecks.some((entry) => entry.week === 25));
    for (const week of [0, 1.5, Number.MAX_SAFE_INTEGER + 1])
      assert.equal((await route.POST(request(payload(week)))).status, 400);
  } finally {
    f.close();
    target.close();
  }
});

test('continuation trends and recent PDF scope join Phase 1 Week 12 to Week 13 without Phase 2 leakage', () => {
  const f = routeFixture();
  try {
    const { buildDayReport } = f.load('lib/day-report.ts');
    const { exerciseIdentity } = f.load('lib/exercise-identity.ts');
    const rows = [12, 13, 24, 25, 26].map((week) => ({
      ...payload(week),
      exercise: 'Back Squat or Hack Squat',
      completedAt: '2026-11-23T01:00:00Z',
    }));
    const report = buildDayReport('A', rows, {
      kind: 'recent',
      currentWeek: 25,
    });
    assert.deepEqual(
      Array.from(report.sessions, (session) => session.week),
      [12, 25],
    );
    assert.match(report.scopeLabel, /Phase 1 - Week 12 and Phase 1 - Week 13/);
    assert.equal(report.exercises.length, 1);
    assert.equal(report.exercises[0].phase, 1);
    assert.equal(exerciseIdentity(rows[0]), exerciseIdentity(rows[3]));
    assert.notEqual(exerciseIdentity(rows[1]), exerciseIdentity(rows[3]));
  } finally {
    f.close();
  }
});
