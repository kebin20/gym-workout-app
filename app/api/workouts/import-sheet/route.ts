import { env } from 'cloudflare:workers';

import {
  readWorkoutEntriesFromSheet,
  type WorkoutSheetEntry,
} from '@/lib/google-sheet-sync';
import { routine, targetLabel, type TrainingDay } from '@/lib/routine';

type ImportRequest = {
  keys?: unknown;
  overwriteKeys?: unknown;
};

const selectColumns = `id, week, day, exercise_order AS exerciseOrder, exercise, target,
  set1_weight AS set1Weight, set1_reps AS set1Reps, set2_weight AS set2Weight,
  set2_reps AS set2Reps, set3_weight AS set3Weight, set3_reps AS set3Reps,
  set4_weight AS set4Weight, set4_reps AS set4Reps, set5_weight AS set5Weight,
  set5_reps AS set5Reps, set_count AS setCount,
  rir, notes, completed, completed_at AS completedAt, updated_at AS updatedAt`;

function entryKey(
  entry: Pick<WorkoutSheetEntry, 'week' | 'day' | 'exerciseOrder'>,
) {
  return `${Number(entry.week)}|${String(entry.day).toUpperCase()}|${Number(entry.exerciseOrder)}`;
}

function nullableNumber(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedEntry(entry: WorkoutSheetEntry): WorkoutSheetEntry | null {
  const week = Number(entry.week);
  const day = String(entry.day).trim().toUpperCase() as TrainingDay;
  const exerciseOrder = Number(entry.exerciseOrder);
  const exercise = routine.find(
    (item) => item.day === day && item.order === exerciseOrder,
  );
  if (!Number.isInteger(week) || week < 1 || week > 12 || !exercise)
    return null;

  return {
    ...entry,
    week,
    day,
    exerciseOrder,
    exercise: exercise.name,
    target: targetLabel(exercise),
    set1Weight: nullableNumber(entry.set1Weight),
    set1Reps: nullableNumber(entry.set1Reps),
    set2Weight: nullableNumber(entry.set2Weight),
    set2Reps: nullableNumber(entry.set2Reps),
    set3Weight: nullableNumber(entry.set3Weight),
    set3Reps: nullableNumber(entry.set3Reps),
    set4Weight: null,
    set4Reps: null,
    set5Weight: null,
    set5Reps: null,
    setCount: Math.max(
      exercise.targetSets,
      entry.set3Reps != null ? 3 : entry.set2Reps != null ? 2 : 1,
    ),
    rir: nullableNumber(entry.rir),
    notes: String(entry.notes ?? '').slice(0, 1000),
    completed: Boolean(entry.completed),
    completedAt: entry.completedAt || null,
  };
}

function workoutValuesMatch(left: WorkoutSheetEntry, right: WorkoutSheetEntry) {
  return (
    left.set1Weight === right.set1Weight &&
    left.set1Reps === right.set1Reps &&
    left.set2Weight === right.set2Weight &&
    left.set2Reps === right.set2Reps &&
    left.set3Weight === right.set3Weight &&
    left.set3Reps === right.set3Reps &&
    (left.set4Weight ?? null) === (right.set4Weight ?? null) &&
    (left.set4Reps ?? null) === (right.set4Reps ?? null) &&
    (left.set5Weight ?? null) === (right.set5Weight ?? null) &&
    (left.set5Reps ?? null) === (right.set5Reps ?? null) &&
    left.rir === right.rir &&
    String(left.notes ?? '') === String(right.notes ?? '') &&
    Boolean(left.completed) === Boolean(right.completed)
  );
}

function validKeys(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (key): key is string =>
          typeof key === 'string' && /^([1-9]|1[0-2])\|[ABC]\|[1-7]$/.test(key),
      ),
    ),
  ];
}

async function loadComparison() {
  if (!env.DB) throw new Error('Workout database is unavailable.');
  const sheetResult = await readWorkoutEntriesFromSheet();
  if (!sheetResult.ok)
    throw new Error(sheetResult.message ?? 'Unable to read the Google Sheet.');

  const localResults = await env.DB.prepare(
    `SELECT ${selectColumns} FROM workout_entries ORDER BY week, day, exercise_order`,
  ).all<WorkoutSheetEntry>();
  const localByKey = new Map(
    localResults.results.map((entry) => [entryKey(entry), entry]),
  );
  const sourceEntries = sheetResult.entries
    .map(normalizedEntry)
    .filter((entry): entry is WorkoutSheetEntry => Boolean(entry?.completed))
    .sort(
      (left, right) =>
        left.week - right.week ||
        left.day.localeCompare(right.day) ||
        left.exerciseOrder - right.exerciseOrder,
    );

  const items = sourceEntries.map((source) => {
    const key = entryKey(source);
    const existing = localByKey.get(key);
    const status = !existing
      ? 'new'
      : workoutValuesMatch(source, existing)
        ? 'unchanged'
        : 'protected';
    return {
      key,
      status,
      source,
      liftlineUpdatedAt: existing?.updatedAt ?? null,
      sheetCompletedAt: source.completedAt ?? null,
    };
  });

  return {
    items,
    localByKey,
    sourceByKey: new Map(
      sourceEntries.map((entry) => [entryKey(entry), entry]),
    ),
  };
}

export async function GET() {
  try {
    const { items } = await loadComparison();
    return Response.json({
      ok: true,
      items,
      summary: {
        new: items.filter((item) => item.status === 'new').length,
        unchanged: items.filter((item) => item.status === 'unchanged').length,
        protected: items.filter((item) => item.status === 'protected').length,
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        items: [],
        message:
          error instanceof Error
            ? error.message
            : 'Unable to preview the Google Sheet.',
      },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!env.DB) throw new Error('Workout database is unavailable.');
    const body = (await request.json()) as ImportRequest;
    const keys = validKeys(body.keys);
    const overwriteKeys = new Set(validKeys(body.overwriteKeys));
    if (keys.length === 0)
      return Response.json({
        ok: true,
        imported: 0,
        protected: 0,
        unchanged: 0,
      });

    const { localByKey, sourceByKey } = await loadComparison();
    const now = new Date().toISOString();
    const statements = [];
    let protectedCount = 0;
    let unchanged = 0;

    for (const key of keys) {
      const source = sourceByKey.get(key);
      if (!source) continue;
      const existing = localByKey.get(key);
      if (existing && workoutValuesMatch(source, existing)) {
        unchanged += 1;
        continue;
      }
      if (existing && !overwriteKeys.has(key)) {
        protectedCount += 1;
        continue;
      }

      statements.push(
        env.DB.prepare(`INSERT INTO workout_entries (
        week, day, exercise_order, exercise, target, set1_weight, set1_reps, set2_weight,
        set2_reps, set3_weight, set3_reps, set4_weight, set4_reps, set5_weight, set5_reps,
        set_count, rir, notes, completed, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(week, day, exercise_order) DO UPDATE SET
        exercise = excluded.exercise, target = excluded.target,
        set1_weight = excluded.set1_weight, set1_reps = excluded.set1_reps,
        set2_weight = excluded.set2_weight, set2_reps = excluded.set2_reps,
        set3_weight = excluded.set3_weight, set3_reps = excluded.set3_reps,
        set4_weight = excluded.set4_weight, set4_reps = excluded.set4_reps,
        set5_weight = excluded.set5_weight, set5_reps = excluded.set5_reps,
        set_count = excluded.set_count,
        rir = excluded.rir, notes = excluded.notes, completed = 1,
        completed_at = excluded.completed_at, updated_at = excluded.updated_at`).bind(
          source.week,
          source.day,
          source.exerciseOrder,
          source.exercise,
          source.target,
          source.set1Weight,
          source.set1Reps,
          source.set2Weight,
          source.set2Reps,
          source.set3Weight,
          source.set3Reps,
          source.set4Weight ?? null,
          source.set4Reps ?? null,
          source.set5Weight ?? null,
          source.set5Reps ?? null,
          source.setCount ?? null,
          source.rir,
          source.notes ?? '',
          source.completedAt ?? null,
          now,
        ),
      );
    }

    if (statements.length > 0) await env.DB.batch(statements);
    return Response.json({
      ok: true,
      imported: statements.length,
      protected: protectedCount,
      unchanged,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        imported: 0,
        message:
          error instanceof Error
            ? error.message
            : 'Unable to import the Google Sheet.',
      },
      { status: 502 },
    );
  }
}
