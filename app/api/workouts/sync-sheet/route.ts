import { env } from 'cloudflare:workers';
import { activeProgrammeId, programmeGuardSql } from '@/lib/programme-storage';

import {
  syncWorkoutEntries,
  type WorkoutSheetEntry,
} from '@/lib/google-sheet-sync';
import { workoutCalendarDate } from '@/lib/workout-date';
import { workoutSelectColumns } from '@/lib/workout-types';

export async function POST() {
  try {
    if (!env.DB) throw new Error('Workout database is unavailable.');
    if ((await activeProgrammeId(env.DB)) !== 'initial')
      return Response.json(
        {
          error:
            'The existing Google Sheet belongs to the original programme. Use JSON backups and PDF reports for later programmes.',
        },
        { status: 409 },
      );
    const results = await env.DB.prepare(
      `SELECT ${workoutSelectColumns} FROM workout_entries WHERE completed = 1 AND exercise_order < 100 AND week <= 12 AND ${programmeGuardSql} ORDER BY week, day, exercise_order`,
    )
      .bind('initial')
      .all<WorkoutSheetEntry>();
    const dated = results.results.filter((entry) =>
      workoutCalendarDate(entry.completedAt),
    );
    const skipped = results.results
      .filter((entry) => !workoutCalendarDate(entry.completedAt))
      .map(
        (entry) => `Week ${entry.week} Day ${entry.day} · ${entry.exercise}`,
      );
    const sync = await syncWorkoutEntries(dated);

    const now = new Date().toISOString();
    if (dated.length)
      await env.DB.batch(
        dated.map((entry) =>
          env
            .DB!.prepare(`UPDATE workout_entries SET sync_status = ?, sheet_synced_at = ?, sync_error = ?
      WHERE week = ? AND day = ? AND exercise_order = ? AND updated_at = ? AND ${programmeGuardSql}`)
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
              'initial',
            ),
        ),
      );

    return Response.json(
      { ...sync, skipped, syncedAt: sync.ok ? now : null },
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
