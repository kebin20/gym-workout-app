export const exerciseDraftStorageKey = 'liftline.exercise-drafts.v1';
const maxDrafts = 32;
const maxAge = 30 * 24 * 60 * 60 * 1000;

export type ExerciseDraft = {
  sets: { weight: string; reps?: string; value?: string; done?: boolean }[];
  setCount: number;
  rir: string;
  notes: string;
};

type StoredDraft = { value: ExerciseDraft; updatedAt: number };
type Drafts = Record<string, StoredDraft>;

function validDraft(value: unknown): value is ExerciseDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as ExerciseDraft;
  return (
    Number.isInteger(draft.setCount) &&
    draft.setCount >= 1 &&
    draft.setCount <= 5 &&
    typeof draft.rir === 'string' &&
    typeof draft.notes === 'string' &&
    Array.isArray(draft.sets) &&
    draft.sets.length === 5 &&
    draft.sets.every(
      (set) =>
        set &&
        typeof set.weight === 'string' &&
        (typeof set.reps === 'string' || typeof set.value === 'string') &&
        (set.done === undefined || typeof set.done === 'boolean'),
    )
  );
}

function readDrafts(storage: Storage): Drafts {
  try {
    const parsed: unknown = JSON.parse(
      storage.getItem(exerciseDraftStorageKey) ?? '{}',
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, item]) =>
          item &&
          typeof item.updatedAt === 'number' &&
          item.updatedAt <= Date.now() &&
          Date.now() - item.updatedAt < maxAge &&
          validDraft(item.value),
      ),
    );
  } catch {
    return {};
  }
}

export function readExerciseDraft<T extends ExerciseDraft>(
  key: string,
  fallback: T,
  storage: Storage,
): T | null {
  const saved = readDrafts(storage)[key]?.value;
  // Do not restore a main-plan record into a Holiday input, or vice versa.
  if (
    !saved ||
    !fallback.sets.every((set, index) =>
      Object.keys(set).every(
        (field) =>
          typeof saved.sets[index][field as keyof typeof set] ===
          typeof set[field as keyof typeof set],
      ),
    )
  )
    return null;
  return saved as T;
}

export function writeExerciseDraft(
  key: string,
  value: ExerciseDraft | null,
  storage: Storage,
): boolean {
  try {
    const drafts = readDrafts(storage);
    if (value) drafts[key] = { value, updatedAt: Date.now() };
    else delete drafts[key];
    const bounded = Object.fromEntries(
      Object.entries(drafts)
        .sort(
          ([leftKey, left], [rightKey, right]) =>
            right.updatedAt - left.updatedAt ||
            Number(rightKey === key) - Number(leftKey === key),
        )
        .slice(0, maxDrafts),
    );
    storage.setItem(exerciseDraftStorageKey, JSON.stringify(bounded));
    return true;
  } catch {
    return false;
  }
}

export function latestDraftKey(
  prefix: string,
  storage: Storage,
): string | null {
  return (
    Object.entries(readDrafts(storage))
      .filter(([key]) => key.startsWith(prefix))
      .sort(
        ([, left], [, right]) => right.updatedAt - left.updatedAt,
      )[0]?.[0] ?? null
  );
}
