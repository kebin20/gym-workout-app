import type { WorkoutEntry } from '@/lib/workout-types';
import { validateWorkoutNumbers } from '@/lib/workout-validation';

export const historySetNumbers = [1, 2, 3, 4, 5] as const;
export type HistoryValues = {
  sets: { weight: string; reps: string; rir: string }[];
  rir: string;
  notes: string;
};
const text = (value: number | null | undefined) =>
  value == null ? '' : String(value);
export function historyValues(entry: WorkoutEntry): HistoryValues {
  return {
    sets: historySetNumbers.map((set) => ({
      weight: text(entry[`set${set}Weight`]),
      reps: text(entry[`set${set}Reps`]),
      rir: text(entry[`set${set}Rir`]),
    })),
    rir: text(entry.rir),
    notes: entry.notes ?? '',
  };
}
export function historyFields(values: HistoryValues) {
  const number = (value: string) =>
    value.trim() === '' ? null : Number(value);
  return {
    ...Object.fromEntries(
      historySetNumbers.flatMap((set, index) => [
        [`set${set}Weight`, number(values.sets[index].weight)],
        [`set${set}Reps`, number(values.sets[index].reps)],
        [`set${set}Rir`, number(values.sets[index].rir)],
      ]),
    ),
    rir: number(values.rir),
    notes: values.notes,
  };
}
// Old imported logs can contain zero/empty sets marked complete. Permit an
// unchanged legacy zero, without silently repairing history or weakening Today.
export function validateHistoryFields(
  fields: Record<string, unknown>,
  entry: WorkoutEntry,
) {
  for (const set of historySetNumbers) {
    for (const suffix of ['Weight', 'Reps', 'Rir']) {
      const value = fields[`set${set}${suffix}`];
      if (
        value !== null &&
        (typeof value !== 'number' || !Number.isFinite(value))
      )
        return `Set ${set}: enter a valid number or leave the field empty.`;
    }
  }
  if (
    (fields.rir !== null && typeof fields.rir !== 'number') ||
    typeof fields.notes !== 'string' ||
    fields.notes.length > 1000
  )
    return 'Use a numeric RIR and notes of at most 1,000 characters.';
  return validateWorkoutNumbers({
    weights: historySetNumbers.map((set) => fields[`set${set}Weight`]),
    values: historySetNumbers.map((set) => {
      const value = fields[`set${set}Reps`];
      return value === 0 && entry[`set${set}Reps`] === 0 ? null : value;
    }),
    setRirs: historySetNumbers.map((set) => fields[`set${set}Rir`]),
    setCount: 5,
    rir: fields.rir,
    completed: false,
  });
}
