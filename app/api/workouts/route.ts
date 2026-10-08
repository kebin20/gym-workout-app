import { env, waitUntil } from 'cloudflare:workers';

import { syncWorkoutEntries } from '@/lib/google-sheet-sync';
import { parseSyncCursor } from '@/lib/sync-cursor';
import { validateWorkoutNumbers } from '@/lib/workout-validation';
import {
  routineForWeek,
  targetLabel,
  type RoutineExercise,
  type TrainingDay,
} from '@/lib/routine';
import {
  sessionExerciseSelectColumns,
  workoutSelectColumns,
  type SessionExercise,
  type WorkoutEntry,
  type SetRirValues,
} from '@/lib/workout-types';

type WorkoutPayload = SetRirValues & {
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
  expectedUpdatedAt?: string;
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

  const exercise = routineForWeek(week).find(
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

export async function GET(request: Request) {
  try {
    const db = workoutDatabase();
    // A D1 batch is one snapshot: never advance the cursor past rows absent
    // from this response. Legacy timestamp clients receive a full snapshot.
    const cursor = parseSyncCursor(
      new URL(request.url).searchParams.get('cursor'),
    );
    const [clock, entries, sessionExercises, settings] = await db.batch([
      db.prepare("SELECT value FROM sync_clock WHERE key = 'records'"),
      cursor !== null
        ? db
            .prepare(
              `SELECT ${workoutSelectColumns} FROM workout_entries WHERE server_revision > ? ORDER BY week, day, exercise_order`,
            )
            .bind(cursor)
        : db.prepare(
            `SELECT ${workoutSelectColumns} FROM workout_entries ORDER BY week, day, exercise_order`,
          ),
      db.prepare(
        `SELECT ${sessionExerciseSelectColumns} FROM session_exercises ORDER BY week, day, display_order`,
      ),
      db.prepare(
        "SELECT key, value FROM app_settings WHERE key IN ('phase1StartDate', 'phase2StartDate')",
      ),
    ]);
    const schedule = {
      phase1StartDate: '2026-08-26',
      phase2StartDate: '2026-11-18',
    };
    (settings.results as { key: string; value: string }[]).forEach(
      (setting) => {
        if (
          setting.key === 'phase1StartDate' ||
          setting.key === 'phase2StartDate'
        )
          schedule[setting.key] = setting.value;
      },
    );
    return Response.json(
      {
        entries: entries.results,
        sessionExercises: sessionExercises.results,
        schedule,
        partial: cursor !== null,
        cursor: String(
          (clock.results[0] as { value?: number } | undefined)?.value ?? 0,
        ),
      },
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
      week > 24 ||
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
    const setCount =
      body.setCount == null ? exercise.targetSets : Number(body.setCount);
    if (
      typeof body.completed !== 'boolean' ||
      (body.expectedUpdatedAt !== undefined &&
        (typeof body.expectedUpdatedAt !== 'string' ||
          !Number.isFinite(Date.parse(body.expectedUpdatedAt))))
    )
      return Response.json({ error: 'Invalid save request.' }, { status: 400 });
    const db = workoutDatabase();
    const serverNow = new Date().toISOString();
    const invalid = validateWorkoutNumbers({
      weights: [
        body.set1Weight,
        body.set2Weight,
        body.set3Weight,
        body.set4Weight,
        body.set5Weight,
      ],
      values: [
        body.set1Reps,
        body.set2Reps,
        body.set3Reps,
        body.set4Reps,
        body.set5Reps,
      ],
      setCount,
      rir: body.rir,
      setRirs: [
        body.set1Rir,
        body.set2Rir,
        body.set3Rir,
        body.set4Rir,
        body.set5Rir,
      ],
      completed: Boolean(body.completed),
    });
    if (invalid) return Response.json({ error: invalid }, { status: 400 });
    const updatedAt = safeIsoDate(body.clientUpdatedAt, serverNow);
    const completedAt = body.completed
      ? safeIsoDate(body.completedAt, serverNow)
      : null;
    const syncStatus =
      custom || exerciseOrder >= 100 || week > 12
        ? 'not_applicable'
        : 'pending';

    const writeResult = await db
      .prepare(`INSERT INTO workout_entries (
      week, day, exercise_order, exercise, target, set1_weight, set1_reps, set2_weight,
      set2_reps, set3_weight, set3_reps, set4_weight, set4_reps, set5_weight, set5_reps,
      set_count, rir, notes, completed, completed_at, sync_status, sheet_synced_at, sync_error, updated_at,
      set1_rir, set2_rir, set3_rir, set4_rir, set5_rir
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)
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
      ,set1_rir = CASE WHEN ? THEN excluded.set1_rir ELSE workout_entries.set1_rir END
      ,set2_rir = CASE WHEN ? THEN excluded.set2_rir ELSE workout_entries.set2_rir END
      ,set3_rir = CASE WHEN ? THEN excluded.set3_rir ELSE workout_entries.set3_rir END
      ,set4_rir = CASE WHEN ? THEN excluded.set4_rir ELSE workout_entries.set4_rir END
      ,set5_rir = CASE WHEN ? THEN excluded.set5_rir ELSE workout_entries.set5_rir END
    WHERE excluded.updated_at > workout_entries.updated_at
      AND (? IS NULL OR workout_entries.updated_at = ?)`)
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
        nullableNumber(body.set1Rir),
        nullableNumber(body.set2Rir),
        nullableNumber(body.set3Rir),
        nullableNumber(body.set4Rir),
        nullableNumber(body.set5Rir),
        Object.hasOwn(body, 'set1Rir') ? 1 : 0,
        Object.hasOwn(body, 'set2Rir') ? 1 : 0,
        Object.hasOwn(body, 'set3Rir') ? 1 : 0,
        Object.hasOwn(body, 'set4Rir') ? 1 : 0,
        Object.hasOwn(body, 'set5Rir') ? 1 : 0,
        body.expectedUpdatedAt ?? null,
        body.expectedUpdatedAt ?? null,
      )
      .run();

    const saved = await db
      .prepare(
        `SELECT ${workoutSelectColumns} FROM workout_entries WHERE week = ? AND day = ? AND exercise_order = ?`,
      )
      .bind(week, day, exerciseOrder)
      .first<WorkoutEntry>();
    if (saved && saved.updatedAt !== updatedAt)
      return Response.json(
        {
          error:
            'A newer version of this workout is already saved. Reload and review before saving again.',
          entry: saved,
        },
        { status: 409 },
      );
    if (saved && syncStatus === 'pending' && writeResult.meta.changes > 0) {
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
