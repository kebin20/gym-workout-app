export function inputNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return NaN;
  return Number(value);
}

export function validateWorkoutNumbers({
  weights,
  values,
  setCount,
  rir,
  setRirs = [],
  completed = true,
}: {
  weights: unknown[];
  values: unknown[];
  setCount: number;
  rir: unknown;
  setRirs?: unknown[];
  completed?: boolean;
}): string | null {
  if (!Number.isInteger(setCount) || setCount < 1 || setCount > 5)
    return 'Choose between one and five sets.';
  for (let index = 0; index < setRirs.length; index++) {
    const setEffort = inputNumber(setRirs[index]);
    if (
      setEffort !== null &&
      (!Number.isInteger(setEffort) || setEffort < 0 || setEffort > 10)
    )
      return `Set ${index + 1}: RIR must be a whole number from 0 to 10.`;
  }
  for (let index = 0; index < setCount; index++) {
    const weight = inputNumber(weights[index]);
    const value = inputNumber(values[index]);
    if (weight !== null && (!Number.isFinite(weight) || weight < 0))
      return `Set ${index + 1}: load must be zero or a positive number.`;
    if (
      (completed && value === null) ||
      (value !== null && (!Number.isSafeInteger(value) || value <= 0))
    )
      return `Set ${index + 1}: enter positive whole-number reps or seconds.`;
  }
  const effort = inputNumber(rir);
  if (
    effort !== null &&
    (!Number.isInteger(effort) || effort < 0 || effort > 10)
  )
    return 'RIR must be a whole number from 0 to 10.';
  return null;
}

export function recallSets<T extends { done?: boolean }>(sets: T[]): T[] {
  return sets.map((set) => ({ ...set, done: false }));
}
