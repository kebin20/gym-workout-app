import { env } from 'cloudflare:workers';
import {
  activeProgrammeId,
  programmeGuardSql,
  programmeMatches,
  validateArchive,
  type ProgrammeArchive,
} from '@/lib/programme-storage';
import {
  backupFileLimit,
  backupRequestLimit,
  jsonRestoreStatements,
  jsonBackupChunks,
} from '@/lib/backup-storage';

import {
  sessionExerciseSelectColumns,
  workoutSelectColumns,
  type SessionExercise,
  type WorkoutEntry,
} from '@/lib/workout-types';
import type { TrainingDay } from '@/lib/routine';
import { validateWorkoutNumbers } from '@/lib/workout-validation';
import {
  holidayWorkoutSelectColumns,
  type HolidayWorkoutEntry,
} from '@/lib/holiday-workout-types';
import { normalizeHolidayBackup } from '@/lib/holiday-backup';

type BackupEnvelope = {
  version?: unknown;
  entries?: unknown;
  sessionExercises?: unknown;
  bodyMetrics?: unknown;
  readinessChecks?: unknown;
  settings?: unknown;
  holidayEntries?: unknown;
  archives?: unknown;
};

type BodyMetricBackup = {
  date: string;
  weight: number | null;
  waist: number | null;
  bodyFat: number | null;
  leanMass: number | null;
  source: string;
  notes: string;
};

type ReadinessBackup = {
  checkedAt: string;
  week: number;
  day: TrainingDay;
  sleep: number;
  energy: number;
  soreness: number;
  jointComfort: number;
  recommendation: string;
};

function validDay(value: unknown): value is TrainingDay {
  return value === 'A' || value === 'B' || value === 'C';
}

function nullableNumber(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value: unknown, maxLength: number, fallback = '') {
  const text = (
    typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  )
    .trim()
    .slice(0, maxLength);
  return text || fallback;
}

function isoDateOrNull(value: unknown) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function calendarDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

function normalizeBodyMetric(value: unknown): BodyMetricBackup | null {
  if (!value || typeof value !== 'object') return null;
  const metric = value as Record<string, unknown>;
  const date = calendarDate(metric.date);
  const source = cleanText(metric.source, 30, 'manual').toLowerCase();
  const numbers = {
    weight: nullableNumber(metric.weight),
    waist: nullableNumber(metric.waist),
    bodyFat: nullableNumber(metric.bodyFat),
    leanMass: nullableNumber(metric.leanMass),
  };
  if (
    !date ||
    !['manual', 'withings', 'inbody', 'csv'].includes(source) ||
    Object.values(numbers).every((number) => number == null)
  )
    return null;
  return { date, source, notes: cleanText(metric.notes, 500), ...numbers };
}

function normalizeReadiness(value: unknown): ReadinessBackup | null {
  if (!value || typeof value !== 'object') return null;
  const check = value as Record<string, unknown>;
  const checkedAt = isoDateOrNull(check.checkedAt);
  const week = Number(check.week);
  const scores = [
    check.sleep,
    check.energy,
    check.soreness,
    check.jointComfort,
  ].map(Number);
  if (
    !checkedAt ||
    !Number.isInteger(week) ||
    week < 1 ||
    week > 24 ||
    !validDay(check.day) ||
    scores.some((score) => !Number.isInteger(score) || score < 1 || score > 5)
  )
    return null;
  return {
    checkedAt,
    week,
    day: check.day,
    sleep: scores[0],
    energy: scores[1],
    soreness: scores[2],
    jointComfort: scores[3],
    recommendation: cleanText(
      check.recommendation,
      500,
      'Readiness check saved.',
    ),
  };
}

function normalizeWorkout(value: unknown): WorkoutEntry | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<WorkoutEntry>;
  const week = Number(entry.week);
  const exerciseOrder = Number(entry.exerciseOrder);
  if (
    !Number.isInteger(week) ||
    week < 1 ||
    week > 24 ||
    !validDay(entry.day) ||
    !Number.isInteger(exerciseOrder) ||
    exerciseOrder < 1 ||
    exerciseOrder > 199
  )
    return null;
  const setCount = Math.min(5, Math.max(1, Number(entry.setCount) || 1));
  if (
    validateWorkoutNumbers({
      weights: [],
      values: [],
      setCount,
      rir: null,
      completed: false,
      setRirs: [
        entry.set1Rir,
        entry.set2Rir,
        entry.set3Rir,
        entry.set4Rir,
        entry.set5Rir,
      ],
    })
  )
    return null;
  const completed = Boolean(entry.completed);
  return {
    week,
    day: entry.day,
    exerciseOrder,
    exercise: cleanText(entry.exercise, 140, 'Exercise'),
    target: cleanText(entry.target, 60, `${setCount} sets`),
    set1Weight: nullableNumber(entry.set1Weight),
    set1Reps: nullableNumber(entry.set1Reps),
    set2Weight: nullableNumber(entry.set2Weight),
    set2Reps: nullableNumber(entry.set2Reps),
    set3Weight: nullableNumber(entry.set3Weight),
    set3Reps: nullableNumber(entry.set3Reps),
    set4Weight: nullableNumber(entry.set4Weight),
    set4Reps: nullableNumber(entry.set4Reps),
    set5Weight: nullableNumber(entry.set5Weight),
    set5Reps: nullableNumber(entry.set5Reps),
    setCount,
    rir: nullableNumber(entry.rir),
    set1Rir: nullableNumber(entry.set1Rir),
    set2Rir: nullableNumber(entry.set2Rir),
    set3Rir: nullableNumber(entry.set3Rir),
    set4Rir: nullableNumber(entry.set4Rir),
    set5Rir: nullableNumber(entry.set5Rir),
    notes: cleanText(entry.notes, 1000),
    completed,
    completedAt: completed ? isoDateOrNull(entry.completedAt) : null,
    syncStatus:
      completed && exerciseOrder < 100 && week <= 12
        ? 'pending'
        : 'not_applicable',
    sheetSyncedAt: null,
    syncError: null,
  };
}

function normalizeSessionExercise(value: unknown): SessionExercise | null {
  if (!value || typeof value !== 'object') return null;
  const exercise = value as Partial<SessionExercise>;
  const week = Number(exercise.week);
  const exerciseOrder = Number(exercise.exerciseOrder);
  const displayOrder = Number(exercise.displayOrder);
  const targetSets = Number(exercise.targetSets);
  if (
    !Number.isInteger(week) ||
    week < 1 ||
    week > 24 ||
    !validDay(exercise.day) ||
    !Number.isInteger(exerciseOrder) ||
    exerciseOrder < 1 ||
    exerciseOrder > 199 ||
    !Number.isInteger(displayOrder) ||
    displayOrder < 1 ||
    displayOrder > 10 ||
    !Number.isInteger(targetSets) ||
    targetSets < 1 ||
    targetSets > 5
  )
    return null;
  return {
    week,
    day: exercise.day,
    exerciseOrder,
    displayOrder,
    name: cleanText(exercise.name, 140, 'Exercise'),
    targetSets,
    repRange: cleanText(exercise.repRange, 40, '8–12'),
    rest: cleanText(exercise.rest, 40, '90 sec'),
    muscles: cleanText(exercise.muscles, 120, 'Custom exercise'),
    alternative: cleanText(exercise.alternative, 120, 'None'),
    skipped: Boolean(exercise.skipped),
    custom: Boolean(exercise.custom) || exerciseOrder >= 100,
  };
}

function parseBackup(value: unknown): {
  entries: WorkoutEntry[];
  holidayEntries: HolidayWorkoutEntry[];
  sessionExercises: SessionExercise[];
  bodyMetrics: BodyMetricBackup[];
  readinessChecks: ReadinessBackup[];
  settings: Record<string, unknown>;
  archives: ProgrammeArchive[];
} {
  if (!value || typeof value !== 'object')
    throw new Error('This is not a valid Liftline backup.');
  const backup = value as BackupEnvelope;
  if (
    !Array.isArray(backup.entries) ||
    !Array.isArray(backup.sessionExercises)
  ) {
    throw new Error('This backup is missing Liftline workout data.');
  }
  const entries = backup.entries.map(normalizeWorkout);
  if (
    backup.holidayEntries !== undefined &&
    !Array.isArray(backup.holidayEntries)
  )
    throw new Error('Holiday backup records are invalid.');
  const rawHolidayEntries = Array.isArray(backup.holidayEntries)
    ? backup.holidayEntries
    : [];
  const holidayEntries = rawHolidayEntries.map(normalizeHolidayBackup);
  if (backup.archives !== undefined && !Array.isArray(backup.archives))
    throw new Error('Invalid archive list.');
  const archives = (Array.isArray(backup.archives) ? backup.archives : []).map(
    validateArchive,
  );
  for (const archive of archives) parseBackup(JSON.parse(archive.snapshot));
  if (new Set(archives.map((archive) => archive.id)).size !== archives.length)
    throw new Error('Duplicate programme archives.');
  const sessionExercises = backup.sessionExercises.map(
    normalizeSessionExercise,
  );
  const rawBodyMetrics = Array.isArray(backup.bodyMetrics)
    ? backup.bodyMetrics
    : [];
  const rawReadinessChecks = Array.isArray(backup.readinessChecks)
    ? backup.readinessChecks
    : [];
  const bodyMetrics = rawBodyMetrics.map(normalizeBodyMetric);
  const readinessChecks = rawReadinessChecks.map(normalizeReadiness);
  if (
    entries.some((entry) => !entry) ||
    holidayEntries.some((entry) => !entry) ||
    sessionExercises.some((exercise) => !exercise) ||
    bodyMetrics.some((metric) => !metric) ||
    readinessChecks.some((check) => !check)
  ) {
    throw new Error('One or more backup records are invalid.');
  }
  return {
    entries: entries as WorkoutEntry[],
    holidayEntries: holidayEntries as HolidayWorkoutEntry[],
    archives,
    sessionExercises: sessionExercises as SessionExercise[],
    bodyMetrics: bodyMetrics as BodyMetricBackup[],
    readinessChecks: readinessChecks as ReadinessBackup[],
    settings:
      backup.settings && typeof backup.settings === 'object'
        ? (backup.settings as Record<string, unknown>)
        : {},
  };
}

function keyOf(value: {
  week: number;
  day: TrainingDay;
  exerciseOrder: number;
}) {
  return `${value.week}|${value.day}|${value.exerciseOrder}`;
}

export async function GET() {
  try {
    if (!env.DB) throw new Error('Workout database is unavailable.');
    const [
      entries,
      sessionExercises,
      bodyMetrics,
      readinessChecks,
      settings,
      holidayEntries,
      archives,
    ] = await env.DB.batch([
      env.DB.prepare(
        `SELECT ${workoutSelectColumns} FROM workout_entries ORDER BY week, day, exercise_order`,
      ),
      env.DB.prepare(
        `SELECT ${sessionExerciseSelectColumns} FROM session_exercises ORDER BY week, day, display_order`,
      ),
      env.DB.prepare(
        'SELECT date, weight, waist, body_fat AS bodyFat, lean_mass AS leanMass, source, notes FROM body_metrics ORDER BY date',
      ),
      env.DB.prepare(
        'SELECT checked_at AS checkedAt, week, day, sleep, energy, soreness, joint_comfort AS jointComfort, recommendation FROM readiness_checks ORDER BY checked_at',
      ),
      env.DB.prepare('SELECT key, value FROM app_settings'),
      env.DB.prepare(
        `SELECT ${holidayWorkoutSelectColumns} FROM holiday_workout_entries ORDER BY session_date, session_id, exercise_order`,
      ),
      env.DB.prepare(
        'SELECT id,label,created_at AS createdAt,snapshot FROM programme_archives ORDER BY created_at',
      ),
    ]);
    const createdAt = new Date().toISOString();
    const date = createdAt.slice(0, 10);
    const content = JSON.stringify(
      {
        source: 'Liftline',
        version: 4,
        createdAt,
        timeZone: 'Asia/Tokyo',
        entries: entries.results,
        holidayEntries: holidayEntries.results,
        archives: archives.results,
        sessionExercises: sessionExercises.results,
        bodyMetrics: bodyMetrics.results,
        readinessChecks: readinessChecks.results,
        settings: Object.fromEntries(
          (settings.results as { key: string; value: string }[]).map(
            (setting) => [setting.key, setting.value],
          ),
        ),
      },
      null,
      2,
    );
    if (new TextEncoder().encode(content).length > backupFileLimit)
      throw new Error(
        'The complete backup exceeds 8 MB. Export archived programmes individually; no records have been removed.',
      );
    // Preflight the same per-record/chunk budgets used by restore, including
    // escaped archive JSON strings, before representing a download as usable.
    const chunks = [
      entries,
      sessionExercises,
      bodyMetrics,
      readinessChecks,
      holidayEntries,
      archives,
    ].reduce(
      (count, result) =>
        count + jsonBackupChunks(result.results as object[]).length,
      0,
    );
    if (chunks + 3 > 45)
      throw new Error(
        'This backup exceeds the atomic restore budget. Export programmes individually.',
      );
    return new Response(content, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="liftline-backup-${date}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to create a backup.',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!env.DB) throw new Error('Workout database is unavailable.');
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > backupRequestLimit)
      return Response.json(
        { error: 'The backup file is too large.' },
        { status: 413 },
      );
    const content = await request.text();
    if (new TextEncoder().encode(content).length > backupRequestLimit)
      return Response.json(
        { error: 'The backup file is too large.' },
        { status: 413 },
      );
    const body = JSON.parse(content) as {
      mode?: unknown;
      backup?: unknown;
      programmeId?: string;
    };
    const programmeId = await activeProgrammeId(env.DB);
    if (!programmeMatches(body.programmeId, programmeId))
      return Response.json(
        { error: 'The programme changed. Reload before restoring a backup.' },
        { status: 409 },
      );
    const {
      entries,
      holidayEntries,
      sessionExercises,
      bodyMetrics,
      readinessChecks,
      settings,
      archives,
    } = parseBackup(body.backup);

    const [existingEntries, existingSessionExercises] = await Promise.all([
      env.DB.prepare(
        'SELECT week, day, exercise_order AS exerciseOrder FROM workout_entries',
      ).all<WorkoutEntry>(),
      env.DB.prepare(
        'SELECT week, day, exercise_order AS exerciseOrder FROM session_exercises',
      ).all<SessionExercise>(),
    ]);
    const existingEntryKeys = new Set(existingEntries.results.map(keyOf));
    let backupProgrammeId =
      typeof settings.programmeId === 'string'
        ? settings.programmeId
        : 'initial';
    if (!entries.length && !sessionExercises.length && archives.length)
      backupProgrammeId = programmeId;
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(backupProgrammeId))
      throw new Error('Invalid backup programme identity.');
    if (
      backupProgrammeId !== programmeId &&
      (existingEntries.results.length ||
        existingSessionExercises.results.length)
    )
      return Response.json(
        {
          error:
            'This backup belongs to a different programme. Review archived history instead of merging different cycles.',
        },
        { status: 409 },
      );
    const existingArchives = await env.DB.prepare(
      'SELECT id,snapshot FROM programme_archives',
    ).all<{ id: string; snapshot: string }>();
    if (
      archives.some((archive) =>
        existingArchives.results.some(
          (existing) =>
            existing.id === archive.id &&
            existing.snapshot !== archive.snapshot,
        ),
      )
    )
      throw new Error(
        'An archive with this identity already contains different data. Nothing has been replaced.',
      );
    const existingSessionKeys = new Set(
      existingSessionExercises.results.map(keyOf),
    );
    const summary = {
      workoutRecords: entries.length,
      holidayRecords: holidayEntries.length,
      archivedProgrammes: archives.length,
      newWorkoutRecords: entries.filter(
        (entry) => !existingEntryKeys.has(keyOf(entry)),
      ).length,
      replacedWorkoutRecords: entries.filter((entry) =>
        existingEntryKeys.has(keyOf(entry)),
      ).length,
      sessionChanges: sessionExercises.length,
      newSessionChanges: sessionExercises.filter(
        (exercise) => !existingSessionKeys.has(keyOf(exercise)),
      ).length,
      bodyMeasurements: bodyMetrics.length,
      readinessChecks: readinessChecks.length,
    };
    if (body.mode !== 'restore') return Response.json({ ok: true, summary });

    const now = new Date().toISOString();
    // Adopting a different cycle is only safe on an empty active programme.
    // Repeat that condition inside the transaction in case another device
    // creates a record or session override after the preview/read above.
    const adoptsProgramme = backupProgrammeId !== programmeId;
    const restoreToken = crypto.randomUUID();
    const restoreGuardSql = adoptsProgramme
      ? `${programmeGuardSql} AND (SELECT value FROM app_settings WHERE key='programmeRestoreToken') = ?`
      : programmeGuardSql;
    const guard = {
      sql: restoreGuardSql,
      args: adoptsProgramme ? [programmeId, restoreToken] : [programmeId],
    };
    // A later programme deliberately does not write into the original Sheet.
    if (backupProgrammeId !== 'initial')
      entries.forEach((entry) => (entry.syncStatus = 'not_applicable'));
    const workoutFields = {
      week: 'week',
      day: 'day',
      exercise_order: 'exerciseOrder',
      exercise: 'exercise',
      target: 'target',
      set1_weight: 'set1Weight',
      set1_reps: 'set1Reps',
      set2_weight: 'set2Weight',
      set2_reps: 'set2Reps',
      set3_weight: 'set3Weight',
      set3_reps: 'set3Reps',
      set4_weight: 'set4Weight',
      set4_reps: 'set4Reps',
      set5_weight: 'set5Weight',
      set5_reps: 'set5Reps',
      set_count: 'setCount',
      rir: 'rir',
      notes: 'notes',
      completed: 'completed',
      completed_at: 'completedAt',
      sync_status: 'syncStatus',
      sheet_synced_at: 'sheetSyncedAt',
      sync_error: 'syncError',
      updated_at: 'updatedAt',
      set1_rir: 'set1Rir',
      set2_rir: 'set2Rir',
      set3_rir: 'set3Rir',
      set4_rir: 'set4Rir',
      set5_rir: 'set5Rir',
    };
    const holidayFields = {
      session_id: 'sessionId',
      session_date: 'sessionDate',
      session_type: 'sessionType',
      exercise_order: 'exerciseOrder',
      exercise: 'exercise',
      target: 'target',
      metric: 'metric',
      set1_weight: 'set1Weight',
      set1_value: 'set1Value',
      set2_weight: 'set2Weight',
      set2_value: 'set2Value',
      set3_weight: 'set3Weight',
      set3_value: 'set3Value',
      set4_weight: 'set4Weight',
      set4_value: 'set4Value',
      set5_weight: 'set5Weight',
      set5_value: 'set5Value',
      set_count: 'setCount',
      rir: 'rir',
      notes: 'notes',
      completed: 'completed',
      completed_at: 'completedAt',
      sync_status: 'syncStatus',
      sheet_synced_at: 'sheetSyncedAt',
      sync_error: 'syncError',
      updated_at: 'updatedAt',
    };
    const statements = [
      ...(adoptsProgramme
        ? [
            env.DB.prepare(
              `INSERT INTO app_settings(key,value,updated_at) SELECT 'programmeRestoreToken',?,? WHERE ${programmeGuardSql} AND NOT EXISTS(SELECT 1 FROM workout_entries) AND NOT EXISTS(SELECT 1 FROM session_exercises) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
            ).bind(restoreToken, now, programmeId),
          ]
        : []),
      ...jsonRestoreStatements(
        env.DB,
        'holiday_workout_entries',
        holidayFields,
        holidayEntries.map((entry) => ({
          ...entry,
          syncStatus: 'pending',
          updatedAt: now,
          sheetSyncedAt: null,
          syncError: null,
        })),
        ['session_id', 'exercise_order'],
        false,
        guard,
      ),
      ...jsonRestoreStatements(
        env.DB,
        'session_exercises',
        {
          week: 'week',
          day: 'day',
          exercise_order: 'exerciseOrder',
          display_order: 'displayOrder',
          name: 'name',
          target_sets: 'targetSets',
          rep_range: 'repRange',
          rest: 'rest',
          muscles: 'muscles',
          alternative: 'alternative',
          skipped: 'skipped',
          custom: 'custom',
          updated_at: 'updatedAt',
        },
        sessionExercises.map((exercise) => ({ ...exercise, updatedAt: now })),
        ['week', 'day', 'exercise_order'],
        false,
        guard,
      ),
      ...jsonRestoreStatements(
        env.DB,
        'workout_entries',
        workoutFields,
        entries.map((entry) => ({
          ...entry,
          updatedAt: now,
          sheetSyncedAt: null,
          syncError: null,
        })),
        ['week', 'day', 'exercise_order'],
        false,
        guard,
      ),
      ...jsonRestoreStatements(
        env.DB,
        'body_metrics',
        {
          date: 'date',
          weight: 'weight',
          waist: 'waist',
          body_fat: 'bodyFat',
          lean_mass: 'leanMass',
          source: 'source',
          notes: 'notes',
          updated_at: 'updatedAt',
        },
        bodyMetrics.map((metric) => ({ ...metric, updatedAt: now })),
        ['date', 'source'],
        false,
        guard,
      ),
      ...jsonRestoreStatements(
        env.DB,
        'readiness_checks',
        {
          checked_at: 'checkedAt',
          week: 'week',
          day: 'day',
          sleep: 'sleep',
          energy: 'energy',
          soreness: 'soreness',
          joint_comfort: 'jointComfort',
          recommendation: 'recommendation',
        },
        readinessChecks,
        ['checked_at'],
        true,
        guard,
      ),
      ...(['phase1StartDate', 'phase2StartDate'] as const).flatMap((key) => {
        const value = calendarDate(settings[key]);
        return value
          ? [
              env
                .DB!.prepare(
                  `INSERT INTO app_settings (key,value,updated_at) SELECT ?,?,? WHERE ${restoreGuardSql} ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
                )
                .bind(key, value, now, ...guard.args),
            ]
          : [];
      }),
      ...jsonRestoreStatements(
        env.DB,
        'programme_archives',
        {
          id: 'id',
          label: 'label',
          created_at: 'createdAt',
          snapshot: 'snapshot',
        },
        archives,
        ['id'],
        true,
        guard,
      ),
      ...(backupProgrammeId !== programmeId
        ? [
            env.DB.prepare(
              `INSERT INTO app_settings(key,value,updated_at) SELECT 'programmeId',?,? WHERE ${restoreGuardSql} ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
            ).bind(backupProgrammeId, now, ...guard.args),
          ]
        : []),
    ];
    if (statements.length > 45)
      throw new Error(
        'This backup exceeds the safe atomic restore budget. Export programmes individually.',
      );
    if (statements.length > 0) await env.DB.batch(statements);
    if ((await activeProgrammeId(env.DB)) !== backupProgrammeId)
      return Response.json(
        {
          error:
            'The programme changed during restore. Reload and review before retrying.',
        },
        { status: 409 },
      );
    return Response.json({ ok: true, restored: true, summary });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to restore this backup.',
      },
      { status: 400 },
    );
  }
}
