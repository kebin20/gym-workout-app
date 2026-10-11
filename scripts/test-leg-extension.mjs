import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { routeFixture } from './route-test-harness.mjs';
import {
  readExerciseDraft,
  writeExerciseDraft,
} from '../lib/exercise-drafts.ts';

test('only Phase 1 Day A slot 4 changes labels; prescriptions and other routines stay identical', () => {
  const fixture = routeFixture();
  try {
    const { routine, phase2Routine, correctedExerciseName } =
      fixture.load('lib/routine.ts');
    const baseline = JSON.parse(
      readFileSync(
        new URL(
          './fixtures/routine-before-leg-extension.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const expected = structuredClone(baseline.routine);
    Object.assign(expected[3], {
      name: 'Leg Extension',
      muscles: 'Quads',
      alternative: 'Single-leg leg extension',
    });
    assert.equal(JSON.stringify(routine), JSON.stringify(expected));
    assert.equal(
      JSON.stringify(phase2Routine),
      JSON.stringify(baseline.phase2Routine),
    );
    assert.equal(
      correctedExerciseName(6, 'A', 4, 'Seated Leg Curl'),
      'Leg Extension',
    );
    for (const args of [
      [13, 'A', 4, 'Seated Leg Curl'],
      [6, 'B', 4, 'Seated Leg Curl'],
      [6, 'A', 104, 'Seated Leg Curl'],
      [6, 'A', 4, 'Lying leg curl'],
    ])
      assert.equal(correctedExerciseName(...args), args[3]);
  } finally {
    fixture.close();
  }
});

test('saved session substitutions and edited set counts are preserved, while legacy slot metadata is corrected', () => {
  const fixture = routeFixture();
  try {
    const { defaultSessionPlan, planForSession, workoutDraftKey } =
      fixture.load('lib/session-plan.ts');
    const saved = defaultSessionPlan(6, 'A');
    Object.assign(saved[3], {
      name: 'Seated Leg Curl',
      muscles: 'Hamstrings',
      alternative: 'Lying leg curl',
      targetSets: 5,
      skipped: true,
      displayOrder: 2,
    });
    const before = JSON.stringify(saved);
    const corrected = planForSession(saved, 6, 'A').find((x) => x.order === 4);
    assert.equal(corrected.name, 'Leg Extension');
    assert.equal(corrected.muscles, 'Quads');
    assert.equal(corrected.targetSets, 5);
    assert.equal(corrected.skipped, true);
    assert.equal(JSON.stringify(saved), before);
    assert.equal(
      workoutDraftKey(6, 'A', corrected),
      'workout:6:A:4:Seated Leg Curl',
    );
    const values = new Map();
    const storage = {
      get length() {
        return values.size;
      },
      key: (i) => [...values.keys()][i] ?? null,
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, v),
      removeItem: (k) => values.delete(k),
    };
    const draft = {
      sets: Array.from({ length: 5 }, () => ({
        weight: '36',
        reps: '15',
        rir: '0',
        done: true,
      })),
      setCount: 2,
      rir: '2',
      notes: 'Keep this note.',
    };
    writeExerciseDraft('workout:6:A:4:Seated Leg Curl', draft, storage);
    assert.deepEqual(
      readExerciseDraft(workoutDraftKey(6, 'A', corrected), draft, storage),
      draft,
    );
    saved[3].name = 'Leg Press';
    assert.equal(
      planForSession(saved, 6, 'A').find((x) => x.order === 4).name,
      'Leg Press',
    );
    saved[3].name = 'Seated Leg Curl';
    saved[3].custom = true;
    assert.equal(
      planForSession(saved, 6, 'A').find((x) => x.order === 4).name,
      'Seated Leg Curl',
    );
  } finally {
    fixture.close();
  }
});

test('the quad machine has a distinct GIF and source; true leg curls still use the curl guide', () => {
  const fixture = routeFixture();
  try {
    const { exerciseDemoFor } = fixture.load('lib/exercise-demos.ts');
    const guide = exerciseDemoFor('Leg Extension').variants[0];
    assert.match(guide.gif, /leg-extension-seated\.gif$/);
    assert.equal(guide.cues.length, 3);
    assert.match(guide.source.url, /strengthlog\.com\/leg-extension\//);
    assert.equal(
      exerciseDemoFor('Single-leg leg extension').variants[0].gif,
      guide.gif,
    );
    assert.notEqual(
      exerciseDemoFor('Seated or Lying Leg Curl').variants[0].gif,
      guide.gif,
    );
  } finally {
    fixture.close();
  }
});

test('reports relabel the corrected slot without changing any logged values or mutating records', () => {
  const fixture = routeFixture();
  try {
    const { buildDayReport } = fixture.load('lib/day-report.ts');
    const entry = {
      week: 6,
      day: 'A',
      exerciseOrder: 4,
      exercise: 'Seated Leg Curl',
      target: '2 × 10–15',
      set1Weight: 36,
      set1Reps: 15,
      set1Rir: 0,
      set2Weight: 36,
      set2Reps: 15,
      set2Rir: 1,
      rir: 2,
      notes: 'Keep this note.',
      completed: true,
      updatedAt: '2026-10-11T01:00:00Z',
      completedAt: '2026-10-11T01:00:00Z',
    };
    const before = JSON.stringify(entry);
    const report = buildDayReport('A', [entry]);
    assert.equal(report.exercises[0].name, 'Leg Extension');
    assert.equal(
      JSON.stringify({ ...report.records[0], exercise: 'Seated Leg Curl' }),
      before,
    );
    assert.equal(JSON.stringify(entry), before);
    assert.equal(report.volume, 1080);
  } finally {
    fixture.close();
  }
});

test('reading historical API data performs no relabel migration, while new saves use the corrected exercise', async () => {
  const fixture = routeFixture();
  try {
    const route = fixture.load('app/api/workouts/route.ts');
    const response = await route.POST(
      new Request('https://liftline.test/api/workouts', {
        method: 'POST',
        body: JSON.stringify({
          week: 6,
          day: 'A',
          exerciseOrder: 4,
          setCount: 2,
          set1Weight: 36,
          set1Reps: 15,
          set1Rir: 0,
          set2Weight: 36,
          set2Reps: 15,
          set2Rir: 1,
          rir: 2,
          notes: 'Keep this note.',
          completed: true,
        }),
      }),
    );
    assert.equal(response.status, 200);
    const { entry } = await response.json();
    assert.equal(entry.exercise, 'Leg Extension');
    assert.equal(entry.exerciseOrder, 4);
    assert.equal(entry.set1Rir, 0);
    await fixture.settled();
    fixture.sqlite
      .prepare(
        "UPDATE workout_entries SET exercise = 'Seated Leg Curl' WHERE week=6 AND day='A' AND exercise_order=4",
      )
      .run();
    const before = JSON.stringify(
      fixture.sqlite.prepare('SELECT * FROM workout_entries').all(),
    );
    const result = await route.GET(
      new Request('https://liftline.test/api/workouts'),
    );
    assert.equal(result.status, 200);
    assert.equal(
      JSON.stringify(
        fixture.sqlite.prepare('SELECT * FROM workout_entries').all(),
      ),
      before,
    );
  } finally {
    fixture.close();
  }
});
