type SetValue = { weight: string; reps: string; rir: string; done: boolean };
type DraftLike = {
  sets: Array<{
    weight: string;
    reps?: string;
    value?: string;
    done?: boolean;
    rir?: string;
  }>;
  setCount: number;
  rir: string;
  notes: string;
};

function setInputNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return NaN;
  return Number(value);
}

export function workoutSetFieldErrors(
  set: { weight: unknown; reps: unknown; rir: unknown },
  { requireReps = false, timed = false } = {},
): Partial<Record<'weight' | 'reps' | 'rir', string>> {
  const errors: Partial<Record<'weight' | 'reps' | 'rir', string>> = {};
  const weight = setInputNumber(set.weight);
  const reps = setInputNumber(set.reps);
  const rir = setInputNumber(set.rir);
  if (weight !== null && (!Number.isFinite(weight) || weight < 0))
    errors.weight = 'Enter zero or a positive weight.';
  if (
    (requireReps && reps === null) ||
    (reps !== null && (!Number.isSafeInteger(reps) || reps < 1))
  )
    errors.reps = `Enter whole-number ${timed ? 'seconds' : 'reps'} of at least 1.`;
  if (rir !== null && (!Number.isInteger(rir) || rir < 0 || rir > 10))
    errors.rir = 'Enter a whole number from 0 to 10, or leave blank.';
  return errors;
}

export function updateWorkoutSet(
  set: SetValue,
  field: 'weight' | 'reps' | 'rir',
  value: string,
): SetValue {
  const next = { ...set, [field]: value };
  // Correcting a valid completed set should not restart rest or require another
  // completion tap. An invalid edit, however, must not keep a misleading tick.
  if (Object.keys(workoutSetFieldErrors(next, { requireReps: true })).length)
    next.done = false;
  return next;
}

export function stepWorkoutSetValue(
  value: string,
  field: 'weight' | 'reps',
  amount: number,
): string {
  const parsed = Number(value);
  const current = Number.isFinite(parsed) ? parsed : 0;
  return String(
    Math.max(
      field === 'weight' ? 0 : 1,
      Math.round((current + amount) * 1000) / 1000,
    ),
  );
}

export type RemovedDraftSet<T extends DraftLike> = {
  index: number;
  set: T['sets'][number];
};

export function removeLastDraftSet<T extends DraftLike>(
  draft: T,
): {
  draft: T;
  removed: RemovedDraftSet<T> | null;
} {
  if (draft.setCount <= 1) return { draft, removed: null };
  const index = draft.setCount - 1;
  const removed = { index, set: { ...draft.sets[index] } };
  return {
    removed,
    draft: {
      ...draft,
      setCount: index,
      sets: draft.sets.map((set, i) =>
        i === index
          ? { ...set, weight: '', reps: '', rir: '', done: false }
          : set,
      ),
    },
  };
}

export function restoreRemovedDraftSet<T extends DraftLike>(
  draft: T,
  removed: RemovedDraftSet<T>,
): T {
  const hidden = draft.sets[removed.index];
  // Do not overwrite a newly added set or cross an exercise/count boundary.
  if (
    draft.setCount !== removed.index ||
    !hidden ||
    hidden.weight ||
    hidden.reps ||
    hidden.rir ||
    hidden.done
  )
    return draft;
  return {
    ...draft,
    setCount: draft.setCount + 1,
    sets: draft.sets.map((set, i) =>
      i === removed.index ? { ...removed.set } : set,
    ),
  };
}
