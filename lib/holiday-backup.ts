import type { HolidayWorkoutEntry } from './holiday-workout-types';

export function normalizeHolidayBackup(
  value: unknown,
): HolidayWorkoutEntry | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as HolidayWorkoutEntry;
  if (
    !/^[a-zA-Z0-9_-]{8,80}$/.test(entry.sessionId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.sessionDate) ||
    !['A', 'B'].includes(entry.sessionType) ||
    !['reps', 'seconds'].includes(entry.metric) ||
    !Number.isInteger(entry.exerciseOrder) ||
    entry.exerciseOrder < 1 ||
    entry.exerciseOrder > 20 ||
    !Number.isInteger(entry.setCount) ||
    entry.setCount < 1 ||
    entry.setCount > 5 ||
    typeof entry.exercise !== 'string' ||
    typeof entry.target !== 'string'
  )
    return null;
  const normalized = {
    ...entry,
    exercise: entry.exercise.slice(0, 160),
    target: entry.target.slice(0, 120),
    notes: String(entry.notes ?? '').slice(0, 1000),
    completed: Boolean(entry.completed),
    rir: entry.rir ?? null,
    completedAt: entry.completedAt ?? null,
  };
  for (let set = 1; set <= 5; set++) {
    for (const field of ['Weight', 'Value']) {
      const key = `set${set}${field}` as keyof HolidayWorkoutEntry;
      const number = entry[key];
      if (
        number != null &&
        (typeof number !== 'number' || !Number.isFinite(number))
      )
        return null;
      Object.assign(normalized, { [key]: number ?? null });
    }
  }
  if (
    entry.rir != null &&
    (typeof entry.rir !== 'number' || !Number.isFinite(entry.rir))
  )
    return null;
  return normalized;
}

export function holidayBackupStatement(
  db: D1Database,
  entry: HolidayWorkoutEntry,
  now: string,
) {
  return db
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
    sync_status = 'pending', sheet_synced_at = NULL, sync_error = NULL, updated_at = excluded.updated_at`)
    .bind(
      entry.sessionId,
      entry.sessionDate,
      entry.sessionType,
      entry.exerciseOrder,
      entry.exercise,
      entry.target,
      entry.metric,
      entry.set1Weight,
      entry.set1Value,
      entry.set2Weight,
      entry.set2Value,
      entry.set3Weight,
      entry.set3Value,
      entry.set4Weight,
      entry.set4Value,
      entry.set5Weight,
      entry.set5Value,
      entry.setCount,
      entry.rir,
      entry.notes,
      entry.completed ? 1 : 0,
      entry.completedAt ?? null,
      now,
    );
}
