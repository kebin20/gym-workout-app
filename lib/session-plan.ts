import {
  routineForWeek,
  correctedExerciseName,
  type RoutineExercise,
  type TrainingDay,
} from '@/lib/routine';
import type { SessionExercise } from '@/lib/workout-types';

export type PlannedExercise = RoutineExercise & {
  displayOrder: number;
  skipped: boolean;
  custom: boolean;
};

export function workoutDraftKey(
  week: number,
  day: TrainingDay,
  exercise: Pick<PlannedExercise, 'order' | 'name' | 'custom'>,
  programmeId = 'initial',
) {
  // Keep the existing storage identity for this label correction. No draft
  // migration, pruning, or cross-exercise copying is needed.
  const name =
    week >= 1 &&
    week <= 12 &&
    day === 'A' &&
    exercise.order === 4 &&
    !exercise.custom &&
    exercise.name === 'Leg Extension'
      ? 'Seated Leg Curl'
      : exercise.name;
  return `workout:${programmeId === 'initial' ? '' : programmeId + ':'}${week}:${day}:${exercise.order}:${name}`;
}

export function correctedSessionExercise<T extends SessionExercise>(
  exercise: T,
): T {
  const name = exercise.custom
    ? exercise.name
    : correctedExerciseName(
        exercise.week,
        exercise.day,
        exercise.exerciseOrder,
        exercise.name,
      );
  if (name === exercise.name) return exercise;
  return {
    ...exercise,
    name,
    muscles: 'Quads',
    alternative: 'Single-leg leg extension',
  };
}

export function defaultSessionPlan(
  week: number,
  day: TrainingDay,
): SessionExercise[] {
  return routineForWeek(week)
    .filter((exercise) => exercise.day === day)
    .map((exercise, index) => ({
      week,
      day,
      exerciseOrder: exercise.order,
      displayOrder: index + 1,
      name: exercise.name,
      targetSets: exercise.targetSets,
      repRange: exercise.repRange,
      rest: exercise.rest,
      muscles: exercise.muscles,
      alternative: exercise.alternative,
      skipped: false,
      custom: false,
    }));
}

export function planForSession(
  sessionExercises: SessionExercise[],
  week: number,
  day: TrainingDay,
): PlannedExercise[] {
  const saved = sessionExercises
    .filter((exercise) => exercise.week === week && exercise.day === day)
    .map(correctedSessionExercise)
    .sort((left, right) => left.displayOrder - right.displayOrder);
  const source = saved.length > 0 ? saved : defaultSessionPlan(week, day);
  return source.map((exercise) => ({
    day: exercise.day,
    order: exercise.exerciseOrder,
    name: exercise.name,
    targetSets: exercise.targetSets,
    repRange: exercise.repRange,
    rest: exercise.rest,
    muscles: exercise.muscles,
    alternative: exercise.alternative,
    displayOrder: exercise.displayOrder,
    skipped: Boolean(exercise.skipped),
    custom: Boolean(exercise.custom),
  }));
}
