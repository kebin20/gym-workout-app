import { env, waitUntil } from 'cloudflare:workers';
import {
  activeProgrammeId,
  programmeGuardSql,
  programmeMatches,
} from '@/lib/programme-storage';

import { syncWorkoutEntries } from '@/lib/google-sheet-sync';
import { correctedSessionExercise } from '@/lib/session-plan';
import { parseSyncCursor } from '@/lib/sync-cursor';
import { validateWorkoutNumbers } from '@/lib/workout-validation';
import {
  historySetNumbers,
  validateHistoryFields,
} from '@/lib/workout-history-edit';
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
  programmeId?: string;
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
      exercise: routineFromSessionExercise(
        correctedSessionExercise(sessionExercise),
      ),
      custom: Boolean(sessionExercise.custom),
    };

  const exercise = routineForWeek(week).find(
    (item) => item.day === day && item.order === exerciseOrder,
  );
  return exercise ? { exercise, custom: false } : null;
}

async function finishSheetSync(saved: WorkoutEntry, programmeId: string) {
  const db = workoutDatabase();
  if (!programmeMatches(programmeId, await activeProgrammeId(db))) return;
  const latest = await db
    .prepare('SELECT updated_at AS updatedAt FROM workout_entries WHERE id = ?')
    .bind(saved.id)
    .first<{ updatedAt: string }>();
  if (latest?.updatedAt !== saved.updatedAt) return;
  const result = await syncWorkoutEntries([saved]);
  await db
    .prepare(`UPDATE workout_entries SET sync_status = ?, sheet_synced_at = ?, sync_error = ?
      WHERE week = ? AND day = ? AND exercise_order = ? AND updated_at = ? AND ${programmeGuardSql}`)
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
      programmeId,
    )
    .run();
}

export async function GET(request: Request) {
  try {
    const db = workoutDatabase();
    // A D1 batch is one snapshot: never advance the cursor past rows absent
    // from this response. Legacy timestamp clients receive a full snapshot.
    const requestProgramme = new URL(request.url).searchParams.get(
      'programmeId',
    );
    const cursor = parseSyncCursor(
      new URL(request.url).searchParams.get('cursor'),
    );
    const [clock, entries, sessionExercises, settings] = await db.batch([
      db.prepare("SELECT value FROM sync_clock WHERE key = 'records'"),
      cursor !== null
        ? db
            .prepare(
              `SELECT ${workoutSelectColumns} FROM workout_entries WHERE server_revision > ? OR NOT (${programmeGuardSql}) ORDER BY week, day, exercise_order`,
            )
            .bind(cursor, requestProgramme ?? 'initial')
        : db.prepare(
            `SELECT ${workoutSelectColumns} FROM workout_entries ORDER BY week, day, exercise_order`,
          ),
      db.prepare(
        `SELECT ${sessionExerciseSelectColumns} FROM session_exercises ORDER BY week, day, display_order`,
      ),
      db.prepare(
        "SELECT key, value FROM app_settings WHERE key IN ('phase1StartDate', 'phase2StartDate','programmeId')",
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
        programmeId:
          (settings.results as { key: string; value: string }[]).find(
            (setting) => setting.key === 'programmeId',
          )?.value ?? 'initial',
        sessionExercises: sessionExercises.results,
        schedule,
        partial:
          cursor !== null &&
          programmeMatches(
            requestProgramme ?? undefined,
            (settings.results as { key: string; value: string }[]).find(
              (setting) => setting.key === 'programmeId',
            )?.value ?? 'initial',
          ),
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
    const programmeId = await activeProgrammeId(workoutDatabase());
    if (!programmeMatches(body.programmeId, programmeId))
      return Response.json(
        {
          error:
            'This save belongs to an archived programme. Export device recovery and reload; it has not overwritten the new programme.',
        },
        { status: 409 },
      );
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
      custom || exerciseOrder >= 100 || week > 12 || programmeId !== 'initial'
        ? 'not_applicable'
        : 'pending';

    const writeResult = await db
      .prepare(`INSERT INTO workout_entries (
      week, day, exercise_order, exercise, target, set1_weight, set1_reps, set2_weight,
      set2_reps, set3_weight, set3_reps, set4_weight, set4_reps, set5_weight, set5_reps,
      set_count, rir, notes, completed, completed_at, sync_status, sheet_synced_at, sync_error, updated_at,
      set1_rir, set2_rir, set3_rir, set4_rir, set5_rir
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ? WHERE ${programmeGuardSql}
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
        programmeId,
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
    if (!saved || !programmeMatches(programmeId, await activeProgrammeId(db)))
      return Response.json(
        {
          error:
            'The programme changed while saving. This record has not been applied to the new programme.',
        },
        { status: 409 },
      );
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
      waitUntil(finishSheetSync(saved, programmeId).then(() => undefined));
    }
    return Response.json({
      entry: { ...saved, programmeId },
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

// Corrections must update an existing version, never use the logger's upsert.
// Preserve its identity, actual exercise, target, set count and completion date.
export async function PATCH(request: Request) {
  try {
    const input = await request.json();
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return Response.json(
        { error: 'Invalid history correction.' },
        { status: 400 },
      );
    const body = input as Record<string, unknown>;
    const db = workoutDatabase();
    const programmeId = await activeProgrammeId(db);
    if (
      typeof body.programmeId !== 'string' ||
      !programmeMatches(body.programmeId, programmeId)
    )
      return Response.json(
        {
          error:
            'The programme changed. Close the editor and refresh before editing history.',
        },
        { status: 409 },
      );
    if (
      !Number.isSafeInteger(body.id) ||
      Number(body.id) < 1 ||
      !Number.isSafeInteger(body.expectedServerRevision) ||
      Number(body.expectedServerRevision) < 0 ||
      typeof body.expectedUpdatedAt !== 'string' ||
      !Number.isFinite(Date.parse(body.expectedUpdatedAt))
    )
      return Response.json(
        { error: 'Reload the saved record before editing history.' },
        { status: 400 },
      );
    const existing = await db
      .prepare(
        `SELECT ${workoutSelectColumns} FROM workout_entries WHERE id = ?`,
      )
      .bind(body.id)
      .first<WorkoutEntry>();
    if (
      !existing ||
      existing.updatedAt !== body.expectedUpdatedAt ||
      existing.serverRevision !== body.expectedServerRevision
    )
      return Response.json(
        {
          error:
            'This record changed or was removed. Close the editor and refresh before editing again.',
        },
        { status: 409 },
      );
    const invalid = validateHistoryFields(body, existing);
    if (invalid) return Response.json({ error: invalid }, { status: 400 });
    const updatedAt = new Date(
      Math.max(Date.now(), Date.parse(existing.updatedAt!) + 1),
    ).toISOString();
    const sheetEligible =
      programmeId === 'initial' &&
      existing.week <= 12 &&
      existing.exerciseOrder < 100 &&
      existing.syncStatus !== 'not_applicable';
    const missingDate =
      !existing.completedAt ||
      !Number.isFinite(Date.parse(existing.completedAt));
    const syncStatus = sheetEligible
      ? missingDate
        ? 'failed'
        : 'pending'
      : 'not_applicable';
    const syncError =
      sheetEligible && missingDate
        ? 'Original workout date is missing. Saved in Liftline; Sheet sync was not sent to avoid changing the date.'
        : null;
    const columns = historySetNumbers.flatMap((set) => [
      `set${set}_weight`,
      `set${set}_reps`,
      `set${set}_rir`,
    ]);
    const values = historySetNumbers.flatMap((set) => [
      body[`set${set}Weight`],
      body[`set${set}Reps`],
      body[`set${set}Rir`],
    ]);
    const write = await db
      .prepare(`UPDATE workout_entries SET ${columns.map((column) => `${column} = ?`).join(', ')},
      rir = ?, notes = ?, updated_at = ?, sync_status = ?, sheet_synced_at = NULL, sync_error = ?
      WHERE id = ? AND updated_at = ? AND server_revision = ? AND ${programmeGuardSql}`)
      .bind(
        ...values,
        body.rir,
        body.notes,
        updatedAt,
        syncStatus,
        syncError,
        existing.id,
        body.expectedUpdatedAt,
        body.expectedServerRevision,
        programmeId,
      )
      .run();
    if (
      !write.meta.changes ||
      !programmeMatches(programmeId, await activeProgrammeId(db))
    )
      return Response.json(
        {
          error:
            'The record or programme changed while saving. Close the editor and refresh; no newer record was overwritten.',
        },
        { status: 409 },
      );
    const saved = await db
      .prepare(
        `SELECT ${workoutSelectColumns} FROM workout_entries WHERE id = ?`,
      )
      .bind(existing.id)
      .first<WorkoutEntry>();
    if (!saved || saved.updatedAt !== updatedAt)
      return Response.json(
        {
          error:
            'A newer edit arrived while saving. Close the editor and refresh to review it.',
        },
        { status: 409 },
      );
    if (syncStatus === 'pending')
      waitUntil(finishSheetSync(saved, programmeId));
    return Response.json({
      entry: { ...saved, programmeId },
      sheetSyncQueued: syncStatus === 'pending',
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to correct history.',
      },
      { status: 500 },
    );
  }
}
