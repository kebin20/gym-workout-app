import { correctedExerciseName } from './routine';
import type { WorkoutEntry } from './workout-types';

export function exerciseIdentity(entry: WorkoutEntry) {
  const name = correctedExerciseName(
    entry.week,
    entry.day,
    entry.exerciseOrder,
    entry.exercise,
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return `${entry.week > 12 ? 2 : 1}|${entry.day}|${entry.exerciseOrder}|${name}`;
}

export function exerciseNameMatches(entry: WorkoutEntry, name: string) {
  return (
    correctedExerciseName(
      entry.week,
      entry.day,
      entry.exerciseOrder,
      entry.exercise,
    )
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ') === name.trim().toLowerCase().replace(/\s+/g, ' ')
  );
}

// Per-set effort is authoritative when present. Preserve zero and never copy
// legacy aggregate effort into individual sets. Only recorded working sets count.
export function effortValues(entry: WorkoutEntry): number[] {
  const values = ([1, 2, 3, 4, 5] as const).flatMap((set) => {
    const rir = entry[`set${set}Rir`];
    return (entry[`set${set}Reps`] ?? 0) > 0 &&
      rir != null &&
      Number.isFinite(rir) &&
      rir >= 0 &&
      rir <= 10
      ? [rir]
      : [];
  });
  return values.length
    ? values
    : entry.rir != null && entry.rir >= 0 && entry.rir <= 10
      ? [entry.rir]
      : [];
}
