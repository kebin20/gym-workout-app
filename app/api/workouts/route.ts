import { env, waitUntil } from 'cloudflare:workers';

import { syncWorkoutEntries } from '@/lib/google-sheet-sync';
import {
  routine,
  targetLabel,
  type RoutineExercise,
  type TrainingDay,
} from '@/lib/routine';
import {
  sessionExerciseSelectColumns,
  workoutSelectColumns,
  type SessionExercise,
  type WorkoutEntry,
} from '@/lib/workout-types';

type WorkoutPayload = {
  week: number;
  day: TrainingDay;
  exerciseOrder: number;
  set1Weight: number | null;
  set1Reps: number | null;
  set2Weight: number | null;
  set2Reps: number | null;
  set3Weight: number | null;
  set3Reps: number | null;
  set4Weight: number | null;
  set4Reps: number | null;
  set5Weight: number | null;
  set5Reps: number | null;
  setCount: number;
  rir: number | null;
  notes: string;
  completed: boolean;
  completedAt?: string | null;
  clientUpdatedAt?: string | null;
};

function workoutDatabase() {
  const db = env.DB;
  if (!db) throw new Error('Workout database is unavailable.');
  return db;
}

function nullableNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeIsoDate(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  if (date.getTime() > Date.now() + 5 * 60_000) return fallback;
  return date.toISOString();
}

function routineFromSessionExercise(
  exercise: SessionExercise,
): RoutineExercise {
  return {
    day: exercise.day,
    order: exercise.exerciseOrder,
    name: exercise.name,
    targetSets: exercise.targetSets,
    repRange: exercise.repRange,
    rest: exercise.rest,
    muscles: exercise.muscles,
    alternative: exercise.alternative,
  };
}

async function resolveExercise(
  week: number,
  day: TrainingDay,
  exerciseOrder: number,
) {
  const db = workoutDatabase();
  const sessionExercise = await db
    .prepare(
      `SELECT ${sessionExerciseSelectColumns} FROM session_exercises WHERE week = ? AND day = ? AND exercise_order = ?`,
    )
    .bind(week, day, exerciseOrder)
    .first<SessionExercise>();
  if (sessionExercise)
    return {
      exercise: routineFromSessionExercise(sessionExercise),
      custom: Boolean(sessionExercise.custom),
    };

  const exercise = routine.find(
    (item) => item.day === day && item.order === exerciseOrder,
  );
  return exercise ? { exercise, custom: false } : null;
}

async function finishSheetSync(saved: WorkoutEntry) {
  const db = workoutDatabase();
  const result = await syncWorkoutEntries([saved]);
  await db
    .prepare(`UPDATE workout_entries SET sync_status = ?, sheet_synced_at = ?, sync_error = ?
      WHERE week = ? AND day = ? AND exercise_order = ? AND updated_at = ?`)
    .bind(
      result.ok ? 'synced' : 'failed',
      result.ok ? new Date().toISOString() : null,
      result.ok
        ? null
        : String(result.message ?? 'Google Sheet sync failed.').slice(0, 500),
      saved.week,
      saved.day,
      saved.exerciseOrder,
      saved.updatedAt,
    )
    .run();
}

export async function GET() {
  try {
    const db = workoutDatabase();
    const [entries, sessionExercises] = await Promise.all([
      db
        .prepare(
          `SELECT ${workoutSelectColumns} FROM workout_entries ORDER BY week, day, exercise_order`,
        )
        .all<WorkoutEntry>(),
      db
        .prepare(
          `SELECT ${sessionExerciseSelectColumns} FROM session_exercises ORDER BY week, day, display_order`,
        )
        .all<SessionExercise>(),
    ]);
    return Response.json(
      { entries: entries.results, sessionExercises: sessionExercises.results },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to load workouts.',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<WorkoutPayload>;
    const week = Number(body.week);
    const exerciseOrder = Number(body.exerciseOrder);
    const day = body.day;
    if (
      !Number.isInteger(week) ||
      week < 1 ||
      week > 12 ||
      !['A', 'B', 'C'].includes(String(day)) ||
      !Number.isInteger(exerciseOrder) ||
      exerciseOrder < 1 ||
      exerciseOrder > 199
    ) {
      return Response.json(
        { error: 'Invalid workout selection.' },
        { status: 400 },
      );
    }

    const resolved = await resolveExercise(
      week,
      day as TrainingDay,
      exerciseOrder,
    );
    if (!resolved)
      return Response.json({ error: 'Exercise not found.' }, { status: 404 });
    const { exercise, custom } = resolved;
    const setCount = Math.min(
      5,
      Math.max(
        1,
        Number.isInteger(Number(body.setCount))
          ? Number(body.setCount)
          : exercise.targetSets,
      ),
    );
    const db = workoutDatabase();
    const serverNow = new Date().toISOString();
    const updatedAt = safeIsoDate(body.clientUpdatedAt, serverNow);
    const completedAt = body.completed
      ? safeIsoDate(body.completedAt, serverNow)
      : null;
    const syncStatus =
      custom || exerciseOrder >= 100 ? 'not_applicable' : 'pending';

    await db
      .prepare(`INSERT INTO workout_entries (
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
      set_count = excluded.set_count,
      rir = excluded.rir, notes = excluded.notes, completed = excluded.completed,
      completed_at = excluded.completed_at, sync_status = excluded.sync_status,
      sheet_synced_at = NULL, sync_error = NULL, updated_at = excluded.updated_at
    WHERE excluded.updated_at >= workout_entries.updated_at`)
      .bind(
        week,
        day,
        exerciseOrder,
        exercise.name,
        targetLabel(exercise),
        nullableNumber(body.set1Weight),
        nullableNumber(body.set1Reps),
        nullableNumber(body.set2Weight),
        nullableNumber(body.set2Reps),
        nullableNumber(body.set3Weight),
        nullableNumber(body.set3Reps),
        nullableNumber(body.set4Weight),
        nullableNumber(body.set4Reps),
        nullableNumber(body.set5Weight),
        nullableNumber(body.set5Reps),
        setCount,
        nullableNumber(body.rir),
        String(body.notes ?? '').slice(0, 1000),
        body.completed ? 1 : 0,
        completedAt,
        syncStatus,
        updatedAt,
      )
      .run();

    const saved = await db
      .prepare(
        `SELECT ${workoutSelectColumns} FROM workout_entries WHERE week = ? AND day = ? AND exercise_order = ?`,
      )
      .bind(week, day, exerciseOrder)
      .first<WorkoutEntry>();
    if (saved && syncStatus === 'pending' && saved.updatedAt === updatedAt) {
      waitUntil(finishSheetSync(saved).then(() => undefined));
    }
    return Response.json({
      entry: saved,
      sheetSyncQueued: syncStatus === 'pending',
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to save workout.',
      },
      { status: 500 },
    );
  }
}
