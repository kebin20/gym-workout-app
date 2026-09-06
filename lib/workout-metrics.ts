import type { WorkoutEntry } from '@/lib/workout-types';

const setNumbers = [1, 2, 3, 4, 5] as const;

export function workoutMetrics(entry: WorkoutEntry) {
  let maxWeight = 0;
  let maxReps = 0;
  let volume = 0;
  let estimatedMax = 0;
  let sets = 0;

  for (const set of setNumbers) {
    const weight = Number(entry[`set${set}Weight`] ?? 0);
    const reps = Number(entry[`set${set}Reps`] ?? 0);
    if (reps <= 0) continue;
    sets += 1;
    maxWeight = Math.max(maxWeight, weight);
    maxReps = Math.max(maxReps, reps);
    volume += weight * reps;
    if (weight > 0)
      estimatedMax = Math.max(estimatedMax, weight * (1 + reps / 30));
  }

  return {
    sets,
    maxWeight: Math.round(maxWeight * 10) / 10,
    maxReps,
    volume: Math.round(volume * 10) / 10,
    estimatedMax: Math.round(estimatedMax * 10) / 10,
  };
}

export function personalRecordsFor(
  entry: WorkoutEntry,
  history: WorkoutEntry[],
) {
  const current = workoutMetrics(entry);
  const previous = history
    .filter(
      (candidate) =>
        candidate.completed &&
        candidate.day === entry.day &&
        candidate.exerciseOrder === entry.exerciseOrder &&
        candidate.week !== entry.week,
    )
    .map(workoutMetrics);
  if (previous.length === 0 || current.sets === 0) return [];

  const records: string[] = [];
  if (
    current.maxWeight > Math.max(...previous.map((metric) => metric.maxWeight))
  )
    records.push('Heaviest weight');
  if (current.maxReps > Math.max(...previous.map((metric) => metric.maxReps)))
    records.push('Most reps');
  if (current.volume > Math.max(...previous.map((metric) => metric.volume)))
    records.push('Exercise volume');
  if (
    current.estimatedMax >
    Math.max(...previous.map((metric) => metric.estimatedMax))
  )
    records.push('Estimated strength');
  return records;
}

export function totalPersonalRecords(entries: WorkoutEntry[]) {
  const sorted = [...entries]
    .filter((entry) => entry.completed)
    .sort(
      (left, right) =>
        left.week - right.week ||
        Date.parse(left.completedAt ?? '') -
          Date.parse(right.completedAt ?? ''),
    );
  return sorted.reduce(
    (count, entry, index) =>
      count + personalRecordsFor(entry, sorted.slice(0, index)).length,
    0,
  );
}
