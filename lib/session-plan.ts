import { routine, type RoutineExercise, type TrainingDay } from '@/lib/routine';
import type { SessionExercise } from '@/lib/workout-types';

export type PlannedExercise = RoutineExercise & {
  displayOrder: number;
  skipped: boolean;
  custom: boolean;
};

export function defaultSessionPlan(
  week: number,
  day: TrainingDay,
): SessionExercise[] {
  return routine
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
