import { env } from 'cloudflare:workers';

import { routine, targetLabel, type TrainingDay } from '@/lib/routine';

type WorkoutPayload = {
  week: number; day: TrainingDay; exerciseOrder: number;
  set1Weight: number | null; set1Reps: number | null;
  set2Weight: number | null; set2Reps: number | null;
  set3Weight: number | null; set3Reps: number | null;
  rir: number | null; notes: string; completed: boolean;
};

function requireOwner(request: Request) {
  const authenticatedUserId = request.headers.get('oai-authenticated-user-id');
  const ownerUserId = env.LIFTLINE_OWNER_USER_ID;
  if (!authenticatedUserId) {
    return Response.json({ error: 'Sign in is required.' }, { status: 401 });
  }
  if (!ownerUserId || authenticatedUserId !== ownerUserId) {
    return Response.json({ error: 'This workout space is private.' }, { status: 403 });
  }
  return null;
}

const seedRows = [
  [1, 'A', 1, 75, 9, 86, 9, 97, 7, 1, '2026-08-26'], [1, 'A', 2, 29, 10, 36, 10, 43, 8, 1, '2026-08-26'],
  [1, 'A', 3, 32, 10, 39, 7, 32, 10, 1, '2026-08-26'], [1, 'A', 4, 29, 10, 28, 13, null, null, 1, '2026-08-26'],
  [1, 'A', 5, 10, 15, 10, 14, null, null, 1, '2026-08-26'], [1, 'A', 6, null, 15, null, 14, null, null, 1, '2026-08-26'],
  [1, 'B', 1, 21.3, 7, 21.3, 7, 21.3, 7, 1, '2026-08-31'], [1, 'B', 2, 29, 8, 29, 7, 28, 6, 1, '2026-09-01'],
  [1, 'B', 3, 23, 10, 28, 8, 23, 8, 1, '2026-09-02'], [1, 'B', 4, 80, 10, 90, 10, 90, 10, 1, '2026-09-03'],
  [1, 'B', 5, 30, 12, 35, 9, null, null, 1, '2026-09-04'], [1, 'B', 6, 8, 10, 8, 8, null, null, 1, '2026-09-05'],
] as const;

async function ensureDatabase() {
  const db = env.DB;
  if (!db) throw new Error('Workout database is unavailable.');
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS workout_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, week INTEGER NOT NULL, day TEXT NOT NULL,
      exercise_order INTEGER NOT NULL, exercise TEXT NOT NULL, target TEXT NOT NULL,
      set1_weight REAL, set1_reps REAL, set2_weight REAL, set2_reps REAL,
      set3_weight REAL, set3_reps REAL, rir INTEGER, notes TEXT,
      completed INTEGER NOT NULL DEFAULT 0, completed_at TEXT, updated_at TEXT NOT NULL,
      UNIQUE (week, day, exercise_order)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS workout_entries_week_day_idx ON workout_entries (week, day)'),
  ]);
  const count = await db.prepare('SELECT COUNT(*) AS count FROM workout_entries').first<{ count: number }>();
  if ((count?.count ?? 0) === 0) {
    const inserts = seedRows.map((row) => {
      const [week, day, order, w1, r1, w2, r2, w3, r3, rir, completedAt] = row;
      const exercise = routine.find((item) => item.day === day && item.order === order)!;
      return db.prepare(`INSERT INTO workout_entries (
        week, day, exercise_order, exercise, target,
        set1_weight, set1_reps, set2_weight, set2_reps, set3_weight, set3_reps,
        rir, notes, completed, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 1, ?, ?)`)
        .bind(week, day, order, exercise.name, targetLabel(exercise), w1, r1, w2, r2, w3, r3, rir, completedAt, completedAt);
    });
    await db.batch(inserts);
  }
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

export async function GET(request: Request) {
  const denied = requireOwner(request);
  if (denied) return denied;
  try {
    const db = await ensureDatabase();
    const results = await db.prepare(`SELECT ${selectColumns} FROM workout_entries ORDER BY week, day, exercise_order`).all();
    return Response.json({ entries: results.results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to load workouts.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = requireOwner(request);
  if (denied) return denied;
  try {
    const body = (await request.json()) as Partial<WorkoutPayload>;
    const week = Number(body.week); const exerciseOrder = Number(body.exerciseOrder); const day = body.day;
    if (!Number.isInteger(week) || week < 1 || week > 12 || !['A', 'B', 'C'].includes(String(day)) || !Number.isInteger(exerciseOrder)) {
      return Response.json({ error: 'Invalid workout selection.' }, { status: 400 });
    }
    const exercise = routine.find((item) => item.day === day && item.order === exerciseOrder);
    if (!exercise) return Response.json({ error: 'Exercise not found.' }, { status: 404 });
    const db = await ensureDatabase(); const now = new Date().toISOString(); const completedAt = body.completed ? now : null;
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
    const saved = await db.prepare(`SELECT ${selectColumns} FROM workout_entries WHERE week = ? AND day = ? AND exercise_order = ?`).bind(week, day, exerciseOrder).first();
    return Response.json({ entry: saved });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to save workout.' }, { status: 500 });
  }
}
