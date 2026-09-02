import { env } from 'cloudflare:workers';

import { syncWorkoutEntries, type WorkoutSheetEntry } from '@/lib/google-sheet-sync';

const selectColumns = `id, week, day, exercise_order AS exerciseOrder, exercise, target,
  set1_weight AS set1Weight, set1_reps AS set1Reps, set2_weight AS set2Weight,
  set2_reps AS set2Reps, set3_weight AS set3Weight, set3_reps AS set3Reps,
  rir, notes, completed, completed_at AS completedAt, updated_at AS updatedAt`;

export async function POST() {
  try {
    if (!env.DB) throw new Error('Workout database is unavailable.');
    const results = await env.DB
      .prepare(`SELECT ${selectColumns} FROM workout_entries WHERE completed = 1 ORDER BY week, day, exercise_order`)
      .all<WorkoutSheetEntry>();
    const sync = await syncWorkoutEntries(results.results);

    return Response.json(sync, { status: sync.ok ? 200 : sync.configured ? 502 : 503 });
  } catch (error) {
    return Response.json(
      { ok: false, configured: false, synced: 0, message: error instanceof Error ? error.message : 'Unable to sync the Google Sheet.' },
      { status: 500 },
    );
  }
}
