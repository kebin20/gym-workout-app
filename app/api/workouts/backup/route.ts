import { env } from 'cloudflare:workers';

import {
  sessionExerciseSelectColumns,
  workoutSelectColumns,
  type SessionExercise,
  type WorkoutEntry,
} from '@/lib/workout-types';
import type { TrainingDay } from '@/lib/routine';

type BackupEnvelope = {
  version?: unknown;
  entries?: unknown;
  sessionExercises?: unknown;
};

function validDay(value: unknown): value is TrainingDay {
  return value === 'A' || value === 'B' || value === 'C';
}

function nullableNumber(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value: unknown, maxLength: number, fallback = '') {
  const text = (
    typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  )
    .trim()
    .slice(0, maxLength);
  return text || fallback;
}

function isoDateOrNull(value: unknown) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeWorkout(value: unknown): WorkoutEntry | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<WorkoutEntry>;
  const week = Number(entry.week);
  const exerciseOrder = Number(entry.exerciseOrder);
  if (
    !Number.isInteger(week) ||
    week < 1 ||
    week > 24 ||
    !validDay(entry.day) ||
    !Number.isInteger(exerciseOrder) ||
    exerciseOrder < 1 ||
    exerciseOrder > 199
  )
    return null;
  const setCount = Math.min(5, Math.max(1, Number(entry.setCount) || 1));
  const completed = Boolean(entry.completed);
  return {
    week,
    day: entry.day,
    exerciseOrder,
    exercise: cleanText(entry.exercise, 140, 'Exercise'),
    target: cleanText(entry.target, 60, `${setCount} sets`),
    set1Weight: nullableNumber(entry.set1Weight),
    set1Reps: nullableNumber(entry.set1Reps),
    set2Weight: nullableNumber(entry.set2Weight),
    set2Reps: nullableNumber(entry.set2Reps),
    set3Weight: nullableNumber(entry.set3Weight),
    set3Reps: nullableNumber(entry.set3Reps),
    set4Weight: nullableNumber(entry.set4Weight),
    set4Reps: nullableNumber(entry.set4Reps),
    set5Weight: nullableNumber(entry.set5Weight),
    set5Reps: nullableNumber(entry.set5Reps),
    setCount,
    rir: nullableNumber(entry.rir),
    notes: cleanText(entry.notes, 1000),
    completed,
    completedAt: completed ? isoDateOrNull(entry.completedAt) : null,
    syncStatus: completed && exerciseOrder < 100 ? 'pending' : 'not_applicable',
    sheetSyncedAt: null,
    syncError: null,
  };
}

function normalizeSessionExercise(value: unknown): SessionExercise | null {
  if (!value || typeof value !== 'object') return null;
  const exercise = value as Partial<SessionExercise>;
  const week = Number(exercise.week);
  const exerciseOrder = Number(exercise.exerciseOrder);
  const displayOrder = Number(exercise.displayOrder);
  const targetSets = Number(exercise.targetSets);
  if (
    !Number.isInteger(week) ||
    week < 1 ||
    week > 24 ||
    !validDay(exercise.day) ||
    !Number.isInteger(exerciseOrder) ||
    exerciseOrder < 1 ||
    exerciseOrder > 199 ||
    !Number.isInteger(displayOrder) ||
    displayOrder < 1 ||
    displayOrder > 10 ||
    !Number.isInteger(targetSets) ||
    targetSets < 1 ||
    targetSets > 5
  )
    return null;
  return {
    week,
    day: exercise.day,
    exerciseOrder,
    displayOrder,
    name: cleanText(exercise.name, 140, 'Exercise'),
    targetSets,
    repRange: cleanText(exercise.repRange, 40, '8–12'),
    rest: cleanText(exercise.rest, 40, '90 sec'),
    muscles: cleanText(exercise.muscles, 120, 'Custom exercise'),
    alternative: cleanText(exercise.alternative, 120, 'None'),
    skipped: Boolean(exercise.skipped),
    custom: Boolean(exercise.custom) || exerciseOrder >= 100,
  };
}

function parseBackup(value: unknown) {
  if (!value || typeof value !== 'object')
    throw new Error('This is not a valid Liftline backup.');
  const backup = value as BackupEnvelope;
  if (
    !Array.isArray(backup.entries) ||
    !Array.isArray(backup.sessionExercises)
  ) {
    throw new Error('This backup is missing Liftline workout data.');
  }
  if (backup.entries.length > 1000 || backup.sessionExercises.length > 720) {
    throw new Error(
      'This backup contains more records than Liftline supports.',
    );
  }
  const entries = backup.entries.map(normalizeWorkout);
  const sessionExercises = backup.sessionExercises.map(
    normalizeSessionExercise,
  );
  if (
    entries.some((entry) => !entry) ||
    sessionExercises.some((exercise) => !exercise)
  ) {
    throw new Error('One or more backup records are invalid.');
  }
  return {
    entries: entries as WorkoutEntry[],
    sessionExercises: sessionExercises as SessionExercise[],
  };
}

function keyOf(value: {
  week: number;
  day: TrainingDay;
  exerciseOrder: number;
}) {
  return `${value.week}|${value.day}|${value.exerciseOrder}`;
}

export async function GET() {
  try {
    if (!env.DB) throw new Error('Workout database is unavailable.');
    const [entries, sessionExercises] = await Promise.all([
      env.DB.prepare(
        `SELECT ${workoutSelectColumns} FROM workout_entries ORDER BY week, day, exercise_order`,
      ).all<WorkoutEntry>(),
      env.DB.prepare(
        `SELECT ${sessionExerciseSelectColumns} FROM session_exercises ORDER BY week, day, display_order`,
      ).all<SessionExercise>(),
    ]);
    const createdAt = new Date().toISOString();
    const date = createdAt.slice(0, 10);
    return new Response(
      JSON.stringify(
        {
          source: 'Liftline',
          version: 1,
          createdAt,
          timeZone: 'Asia/Tokyo',
          entries: entries.results,
          sessionExercises: sessionExercises.results,
        },
        null,
        2,
      ),
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="liftline-backup-${date}.json"`,
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to create a backup.',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!env.DB) throw new Error('Workout database is unavailable.');
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 1_000_000)
      return Response.json(
        { error: 'The backup file is too large.' },
        { status: 413 },
      );
    const body = (await request.json()) as { mode?: unknown; backup?: unknown };
    const { entries, sessionExercises } = parseBackup(body.backup);

    const [existingEntries, existingSessionExercises] = await Promise.all([
      env.DB.prepare(
        'SELECT week, day, exercise_order AS exerciseOrder FROM workout_entries',
      ).all<WorkoutEntry>(),
      env.DB.prepare(
        'SELECT week, day, exercise_order AS exerciseOrder FROM session_exercises',
      ).all<SessionExercise>(),
    ]);
    const existingEntryKeys = new Set(existingEntries.results.map(keyOf));
    const existingSessionKeys = new Set(
      existingSessionExercises.results.map(keyOf),
    );
    const summary = {
      workoutRecords: entries.length,
      newWorkoutRecords: entries.filter(
        (entry) => !existingEntryKeys.has(keyOf(entry)),
      ).length,
      replacedWorkoutRecords: entries.filter((entry) =>
        existingEntryKeys.has(keyOf(entry)),
      ).length,
      sessionChanges: sessionExercises.length,
      newSessionChanges: sessionExercises.filter(
        (exercise) => !existingSessionKeys.has(keyOf(exercise)),
      ).length,
    };
    if (body.mode !== 'restore') return Response.json({ ok: true, summary });

    const now = new Date().toISOString();
    const statements = [
      ...sessionExercises.map((exercise) =>
        env
          .DB!.prepare(`INSERT INTO session_exercises (
        week, day, exercise_order, display_order, name, target_sets, rep_range, rest,
        muscles, alternative, skipped, custom, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(week, day, exercise_order) DO UPDATE SET
        display_order = excluded.display_order, name = excluded.name, target_sets = excluded.target_sets,
        rep_range = excluded.rep_range, rest = excluded.rest, muscles = excluded.muscles,
        alternative = excluded.alternative, skipped = excluded.skipped, custom = excluded.custom,
        updated_at = excluded.updated_at`)
          .bind(
            exercise.week,
            exercise.day,
            exercise.exerciseOrder,
            exercise.displayOrder,
            exercise.name,
            exercise.targetSets,
            exercise.repRange,
            exercise.rest,
            exercise.muscles,
            exercise.alternative,
            exercise.skipped ? 1 : 0,
            exercise.custom ? 1 : 0,
            now,
          ),
      ),
      ...entries.map((entry) =>
        env
          .DB!.prepare(`INSERT INTO workout_entries (
        week, day, exercise_order, exercise, target, set1_weight, set1_reps, set2_weight,
        set2_reps, set3_weight, set3_reps, set4_weight, set4_reps, set5_weight, set5_reps,
        set_count, rir, notes, completed, completed_at, sync_status, sheet_synced_at, sync_error, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)
      ON CONFLICT(week, day, exercise_order) DO UPDATE SET
        exercise = excluded.exercise, target = excluded.target,
        set1_weight = excluded.set1_weight, set1_reps = excluded.set1_reps,
        set2_weight = excluded.set2_weight, set2_reps = excluded.set2_reps,
        set3_weight = excluded.set3_weight, set3_reps = excluded.set3_reps,
        set4_weight = excluded.set4_weight, set4_reps = excluded.set4_reps,
        set5_weight = excluded.set5_weight, set5_reps = excluded.set5_reps,
        set_count = excluded.set_count, rir = excluded.rir, notes = excluded.notes,
        completed = excluded.completed, completed_at = excluded.completed_at,
        sync_status = excluded.sync_status, sheet_synced_at = NULL, sync_error = NULL,
        updated_at = excluded.updated_at`)
          .bind(
            entry.week,
            entry.day,
            entry.exerciseOrder,
            entry.exercise,
            entry.target,
            entry.set1Weight,
            entry.set1Reps,
            entry.set2Weight,
            entry.set2Reps,
            entry.set3Weight,
            entry.set3Reps,
            entry.set4Weight ?? null,
            entry.set4Reps ?? null,
            entry.set5Weight ?? null,
            entry.set5Reps ?? null,
            entry.setCount ?? 1,
            entry.rir,
            entry.notes,
            entry.completed ? 1 : 0,
            entry.completedAt ?? null,
            entry.syncStatus,
            now,
          ),
      ),
    ];
    if (statements.length > 0) await env.DB.batch(statements);
    return Response.json({ ok: true, restored: true, summary });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to restore this backup.',
      },
      { status: 400 },
    );
  }
}
