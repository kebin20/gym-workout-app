import { env, waitUntil } from 'cloudflare:workers';

import { syncHolidayWorkoutEntries } from '@/lib/google-sheet-sync';
import {
  holidayWorkoutSelectColumns,
  type HolidayMetric,
  type HolidaySessionType,
  type HolidayWorkoutEntry,
} from '@/lib/holiday-workout-types';

type HolidayPayload = Omit<HolidayWorkoutEntry, 'id' | 'updatedAt'> & {
  clientUpdatedAt?: string | null;
};

function workoutDatabase() {
  if (!env.DB) throw new Error('Workout database is unavailable.');
  return env.DB;
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

function validCalendarDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function finishSheetSync(saved: HolidayWorkoutEntry) {
  const result = await syncHolidayWorkoutEntries([saved]);
  await workoutDatabase()
    .prepare(`UPDATE holiday_workout_entries
      SET sync_status = ?, sheet_synced_at = ?, sync_error = ?
      WHERE session_id = ? AND exercise_order = ? AND updated_at = ?`)
    .bind(
      result.ok ? 'synced' : 'failed',
      result.ok ? new Date().toISOString() : null,
      result.ok
        ? null
        : String(result.message ?? 'Holiday Log sync failed.').slice(0, 500),
      saved.sessionId,
      saved.exerciseOrder,
      saved.updatedAt,
    )
    .run();
}

export async function GET() {
  try {
    const entries = await workoutDatabase()
      .prepare(
        `SELECT ${holidayWorkoutSelectColumns} FROM holiday_workout_entries
         ORDER BY session_date DESC, session_id DESC, exercise_order`,
      )
      .all<HolidayWorkoutEntry>();
    return Response.json(
      { entries: entries.results },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to load holiday workouts.',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<HolidayPayload>;
    const sessionId = String(body.sessionId ?? '').trim();
    const sessionType = String(body.sessionType ?? '') as HolidaySessionType;
    const metric = String(body.metric ?? '') as HolidayMetric;
    const exerciseOrder = Number(body.exerciseOrder);
    const setCount = Math.min(5, Math.max(1, Number(body.setCount) || 1));

    if (
      !/^[a-zA-Z0-9_-]{8,80}$/.test(sessionId) ||
      !validCalendarDate(body.sessionDate) ||
      !['A', 'B'].includes(sessionType) ||
      !['reps', 'seconds'].includes(metric) ||
      !Number.isInteger(exerciseOrder) ||
      exerciseOrder < 1 ||
      exerciseOrder > 20
    ) {
      return Response.json(
        { error: 'Invalid holiday workout selection.' },
        { status: 400 },
      );
    }

    const serverNow = new Date().toISOString();
    const updatedAt = safeIsoDate(body.clientUpdatedAt, serverNow);
    const completedAt = body.completed
      ? safeIsoDate(body.completedAt, serverNow)
      : null;
    const values = [
      nullableNumber(body.set1Value),
      nullableNumber(body.set2Value),
      nullableNumber(body.set3Value),
      nullableNumber(body.set4Value),
      nullableNumber(body.set5Value),
    ];
    if (
      body.completed &&
      values.slice(0, setCount).some((value) => !value || value <= 0)
    ) {
      return Response.json(
        {
          error: `Enter ${metric === 'seconds' ? 'seconds' : 'reps'} for every active set.`,
        },
        { status: 400 },
      );
    }

    const db = workoutDatabase();
    await db
      .prepare(`INSERT INTO holiday_workout_entries (
        session_id, session_date, session_type, exercise_order, exercise, target, metric,
        set1_weight, set1_value, set2_weight, set2_value, set3_weight, set3_value,
        set4_weight, set4_value, set5_weight, set5_value, set_count, rir, notes,
        completed, completed_at, sync_status, sheet_synced_at, sync_error, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?)
      ON CONFLICT(session_id, exercise_order) DO UPDATE SET
        session_date = excluded.session_date, session_type = excluded.session_type,
        exercise = excluded.exercise, target = excluded.target, metric = excluded.metric,
        set1_weight = excluded.set1_weight, set1_value = excluded.set1_value,
        set2_weight = excluded.set2_weight, set2_value = excluded.set2_value,
        set3_weight = excluded.set3_weight, set3_value = excluded.set3_value,
        set4_weight = excluded.set4_weight, set4_value = excluded.set4_value,
        set5_weight = excluded.set5_weight, set5_value = excluded.set5_value,
        set_count = excluded.set_count, rir = excluded.rir, notes = excluded.notes,
        completed = excluded.completed, completed_at = excluded.completed_at,
        sync_status = 'pending', sheet_synced_at = NULL, sync_error = NULL,
        updated_at = excluded.updated_at
      WHERE excluded.updated_at >= holiday_workout_entries.updated_at`)
      .bind(
        sessionId,
        body.sessionDate,
        sessionType,
        exerciseOrder,
        String(body.exercise ?? '').slice(0, 160),
        String(body.target ?? '').slice(0, 120),
        metric,
        nullableNumber(body.set1Weight),
        values[0],
        nullableNumber(body.set2Weight),
        values[1],
        nullableNumber(body.set3Weight),
        values[2],
        nullableNumber(body.set4Weight),
        values[3],
        nullableNumber(body.set5Weight),
        values[4],
        setCount,
        nullableNumber(body.rir),
        String(body.notes ?? '').slice(0, 1000),
        body.completed ? 1 : 0,
        completedAt,
        updatedAt,
      )
      .run();

    const saved = await db
      .prepare(
        `SELECT ${holidayWorkoutSelectColumns} FROM holiday_workout_entries
         WHERE session_id = ? AND exercise_order = ?`,
      )
      .bind(sessionId, exerciseOrder)
      .first<HolidayWorkoutEntry>();

    if (saved && saved.updatedAt === updatedAt) {
      waitUntil(finishSheetSync(saved).then(() => undefined));
    }

    return Response.json({ entry: saved, sheetSyncQueued: Boolean(saved) });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to save holiday workout.',
      },
      { status: 500 },
    );
  }
}
