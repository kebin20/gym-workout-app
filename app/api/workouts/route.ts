import { env } from 'cloudflare:workers';

import { syncWorkoutEntries, type WorkoutSheetEntry } from '@/lib/google-sheet-sync';
import { routine, targetLabel, type TrainingDay } from '@/lib/routine';

type WorkoutPayload = {
  week: number; day: TrainingDay; exerciseOrder: number;
  set1Weight: number | null; set1Reps: number | null;
  set2Weight: number | null; set2Reps: number | null;
  set3Weight: number | null; set3Reps: number | null;
  rir: number | null; notes: string; completed: boolean;
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

const selectColumns = `id, week, day, exercise_order AS exerciseOrder, exercise, target,
  set1_weight AS set1Weight, set1_reps AS set1Reps, set2_weight AS set2Weight,
  set2_reps AS set2Reps, set3_weight AS set3Weight, set3_reps AS set3Reps,
  rir, notes, completed, completed_at AS completedAt, updated_at AS updatedAt`;

export async function GET() {
  try {
    const db = workoutDatabase();
    const results = await db.prepare(`SELECT ${selectColumns} FROM workout_entries ORDER BY week, day, exercise_order`).all();
    return Response.json({ entries: results.results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to load workouts.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<WorkoutPayload>;
    const week = Number(body.week); const exerciseOrder = Number(body.exerciseOrder); const day = body.day;
    if (!Number.isInteger(week) || week < 1 || week > 12 || !['A', 'B', 'C'].includes(String(day)) || !Number.isInteger(exerciseOrder)) {
      return Response.json({ error: 'Invalid workout selection.' }, { status: 400 });
    }
    const exercise = routine.find((item) => item.day === day && item.order === exerciseOrder);
    if (!exercise) return Response.json({ error: 'Exercise not found.' }, { status: 404 });
    const db = workoutDatabase(); const now = new Date().toISOString(); const completedAt = body.completed ? now : null;
    await db.prepare(`INSERT INTO workout_entries (
      week, day, exercise_order, exercise, target, set1_weight, set1_reps, set2_weight,
      set2_reps, set3_weight, set3_reps, rir, notes, completed, completed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(week, day, exercise_order) DO UPDATE SET
      set1_weight = excluded.set1_weight, set1_reps = excluded.set1_reps,
      set2_weight = excluded.set2_weight, set2_reps = excluded.set2_reps,
      set3_weight = excluded.set3_weight, set3_reps = excluded.set3_reps,
      rir = excluded.rir, notes = excluded.notes, completed = excluded.completed,
      completed_at = excluded.completed_at, updated_at = excluded.updated_at`)
      .bind(
        week, day, exerciseOrder, exercise.name, targetLabel(exercise),
        nullableNumber(body.set1Weight), nullableNumber(body.set1Reps), nullableNumber(body.set2Weight), nullableNumber(body.set2Reps),
        nullableNumber(body.set3Weight), nullableNumber(body.set3Reps), nullableNumber(body.rir), String(body.notes ?? '').slice(0, 1000),
        body.completed ? 1 : 0, completedAt, now,
      ).run();
    const saved = await db.prepare(`SELECT ${selectColumns} FROM workout_entries WHERE week = ? AND day = ? AND exercise_order = ?`).bind(week, day, exerciseOrder).first<WorkoutSheetEntry>();
    const sheetSync = saved ? await syncWorkoutEntries([saved]) : { ok: false, configured: false, synced: 0 };
    return Response.json({ entry: saved, sheetSync });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to save workout.' }, { status: 500 });
  }
}
