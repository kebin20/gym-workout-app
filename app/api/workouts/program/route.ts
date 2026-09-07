import { env } from 'cloudflare:workers';

import { routineForWeek, type TrainingDay } from '@/lib/routine';
import {
  sessionExerciseSelectColumns,
  type SessionExercise,
} from '@/lib/workout-types';

type ProgramPayload = {
  week?: unknown;
  day?: unknown;
  exercises?: unknown;
};

function cleanText(value: unknown, fallback: string, maxLength = 120) {
  const text = (
    typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  )
    .trim()
    .slice(0, maxLength);
  return text || fallback;
}

function normalizedExercise(
  value: unknown,
  week: number,
  day: TrainingDay,
  index: number,
): SessionExercise | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SessionExercise>;
  const exerciseOrder = Number(candidate.exerciseOrder);
  const targetSets = Number(candidate.targetSets);
  const base = routineForWeek(week).find(
    (item) => item.day === day && item.order === exerciseOrder,
  );
  const custom = Boolean(candidate.custom) || exerciseOrder >= 100;
  if (
    !Number.isInteger(exerciseOrder) ||
    exerciseOrder < 1 ||
    exerciseOrder > 199 ||
    (!custom && !base) ||
    !Number.isInteger(targetSets) ||
    targetSets < 1 ||
    targetSets > 5
  )
    return null;

  return {
    week,
    day,
    exerciseOrder,
    displayOrder: index + 1,
    name: cleanText(candidate.name, base?.name ?? 'Custom exercise'),
    targetSets,
    repRange: cleanText(candidate.repRange, base?.repRange ?? '8–12', 40),
    rest: cleanText(candidate.rest, base?.rest ?? '90 sec', 40),
    muscles: cleanText(candidate.muscles, base?.muscles ?? 'Custom exercise'),
    alternative: cleanText(candidate.alternative, base?.alternative ?? 'None'),
    skipped: Boolean(candidate.skipped),
    custom,
    updatedAt: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  try {
    if (!env.DB) throw new Error('Workout database is unavailable.');
    const body = (await request.json()) as ProgramPayload;
    const week = Number(body.week);
    const day = (
      typeof body.day === 'string' ? body.day : ''
    ).toUpperCase() as TrainingDay;
    if (
      !Number.isInteger(week) ||
      week < 1 ||
      week > 24 ||
      !['A', 'B', 'C'].includes(day)
    ) {
      return Response.json(
        { error: 'Invalid workout session.' },
        { status: 400 },
      );
    }
    if (
      !Array.isArray(body.exercises) ||
      body.exercises.length < 1 ||
      body.exercises.length > 10
    ) {
      return Response.json(
        { error: 'A session must contain between 1 and 10 exercises.' },
        { status: 400 },
      );
    }

    const exercises = body.exercises.map((value, index) =>
      normalizedExercise(value, week, day, index),
    );
    if (exercises.some((exercise) => !exercise)) {
      return Response.json(
        { error: 'One or more session exercises are invalid.' },
        { status: 400 },
      );
    }
    const validExercises = exercises as SessionExercise[];
    if (
      new Set(validExercises.map((exercise) => exercise.exerciseOrder)).size !==
      validExercises.length
    ) {
      return Response.json(
        { error: 'Exercise identifiers must be unique.' },
        { status: 400 },
      );
    }

    const completedCustom = await env.DB.prepare(
      `SELECT exercise_order AS exerciseOrder FROM workout_entries
       WHERE week = ? AND day = ? AND exercise_order >= 100 AND completed = 1`,
    )
      .bind(week, day)
      .all<{ exerciseOrder: number }>();
    const keptOrders = new Set(
      validExercises.map((exercise) => exercise.exerciseOrder),
    );
    if (
      completedCustom.results.some(
        (entry) => !keptOrders.has(entry.exerciseOrder),
      )
    ) {
      return Response.json(
        {
          error:
            'A completed custom exercise cannot be removed. Mark it skipped instead.',
        },
        { status: 409 },
      );
    }

    const statements = [
      env.DB.prepare(
        'DELETE FROM session_exercises WHERE week = ? AND day = ?',
      ).bind(week, day),
      ...validExercises.map((exercise) =>
        env
          .DB!.prepare(`INSERT INTO session_exercises (
        week, day, exercise_order, display_order, name, target_sets, rep_range, rest,
        muscles, alternative, skipped, custom, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            exercise.week,
            exercise.day,
            exercise.exerciseOrder,
            exercise.displayOrder,
            exercise.name,
            exercise.targetSets,
            exercise.repRange,
            exercise.rest,
            exercise.muscles,
            exercise.alternative,
            exercise.skipped ? 1 : 0,
            exercise.custom ? 1 : 0,
            exercise.updatedAt,
          ),
      ),
    ];
    await env.DB.batch(statements);

    const saved = await env.DB.prepare(
      `SELECT ${sessionExerciseSelectColumns} FROM session_exercises WHERE week = ? AND day = ? ORDER BY display_order`,
    )
      .bind(week, day)
      .all<SessionExercise>();
    return Response.json({ ok: true, sessionExercises: saved.results });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to update this session.',
      },
      { status: 500 },
    );
  }
}
