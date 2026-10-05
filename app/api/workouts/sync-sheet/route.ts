import { env } from 'cloudflare:workers';

import {
  syncWorkoutEntries,
  type WorkoutSheetEntry,
} from '@/lib/google-sheet-sync';
import { workoutSelectColumns } from '@/lib/workout-types';

export async function POST() {
  try {
    if (!env.DB) throw new Error('Workout database is unavailable.');
    const results = await env.DB.prepare(
      `SELECT ${workoutSelectColumns} FROM workout_entries WHERE completed = 1 AND exercise_order < 100 AND week <= 12 ORDER BY week, day, exercise_order`,
    ).all<WorkoutSheetEntry>();
    const sync = await syncWorkoutEntries(results.results);

    const now = new Date().toISOString();
    if (results.results.length)
      await env.DB.batch(
        results.results.map((entry) =>
          env
            .DB!.prepare(`UPDATE workout_entries SET sync_status = ?, sheet_synced_at = ?, sync_error = ?
      WHERE week = ? AND day = ? AND exercise_order = ? AND updated_at = ?`)
            .bind(
              sync.ok ? 'synced' : 'failed',
              sync.ok ? now : null,
              sync.ok
                ? null
                : String(sync.message ?? 'Google Sheet sync failed.').slice(
                    0,
                    500,
                  ),
              entry.week,
              entry.day,
              entry.exerciseOrder,
              entry.updatedAt,
            ),
        ),
      );

    return Response.json(
      { ...sync, syncedAt: sync.ok ? now : null },
      { status: sync.ok ? 200 : sync.configured ? 502 : 503 },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        configured: false,
        synced: 0,
        message:
          error instanceof Error
            ? error.message
            : 'Unable to sync the Google Sheet.',
      },
      { status: 500 },
    );
  }
}
