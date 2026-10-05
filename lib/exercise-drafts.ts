export const exerciseDraftStorageKey = 'liftline.exercise-drafts.v1';
export const exerciseDraftPrefix = 'liftline.exercise-draft.v2.';
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

function parseStored(raw: string | null): StoredDraft | null {
  try {
    const item = JSON.parse(raw ?? 'null');
    return item &&
      typeof item.updatedAt === 'number' &&
      item.updatedAt <= Date.now() &&
      Date.now() - item.updatedAt < maxAge &&
      validDraft(item.value)
      ? item
      : null;
  } catch {
    return null;
  }
}
function storageKey(key: string) {
  return exerciseDraftPrefix + encodeURIComponent(key);
}
function legacyDrafts(storage: Storage): Drafts {
  try {
    const parsed = JSON.parse(storage.getItem(exerciseDraftStorageKey) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, item]) => {
        const saved = parseStored(JSON.stringify(item));
        return saved ? [[key, saved]] : [];
      }),
    );
  } catch {
    return {};
  }
}
function readDrafts(storage: Storage): Drafts {
  const drafts = legacyDrafts(storage);
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(exerciseDraftPrefix)) continue;
    const item = parseStored(storage.getItem(key));
    if (item)
      drafts[decodeURIComponent(key.slice(exerciseDraftPrefix.length))] = item;
  }
  return drafts;
}
// Migrate once, retaining the original if any write fails. No draft is discarded
// merely because the storage format changed.
function migrate(storage: Storage) {
  const raw = storage.getItem(exerciseDraftStorageKey);
  if (!raw) return;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw Error('Unreadable legacy drafts');
  for (const [key, item] of Object.entries(legacyDrafts(storage))) {
    if (!storage.getItem(storageKey(key)))
      storage.setItem(storageKey(key), JSON.stringify(item));
  }
  storage.removeItem(exerciseDraftStorageKey);
}

export function readExerciseDraft<T extends ExerciseDraft>(
  key: string,
  fallback: T,
  storage: Storage,
): T | null {
  const saved = (
    parseStored(storage.getItem(storageKey(key))) ?? legacyDrafts(storage)[key]
  )?.value;
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
    migrate(storage);
    const physicalKey = storageKey(key);
    const isNew = storage.getItem(physicalKey) === null;
    if (!value) {
      storage.removeItem(physicalKey);
      return true;
    }
    storage.setItem(
      physicalKey,
      JSON.stringify({ value, updatedAt: Date.now() }),
    );
    // Editing an existing key writes only that key. Enumerate/prune only when
    // adding a new exercise, outside the repeated keystroke path.
    if (isNew) {
      const keep = new Set(
        Object.entries(readDrafts(storage))
          .sort(
            ([leftKey, left], [rightKey, right]) =>
              right.updatedAt - left.updatedAt ||
              Number(rightKey === key) - Number(leftKey === key),
          )
          .slice(0, maxDrafts)
          .map(([name]) => storageKey(name)),
      );
      const obsolete: string[] = [];
      for (let index = 0; index < storage.length; index++) {
        const name = storage.key(index);
        if (name?.startsWith(exerciseDraftPrefix) && !keep.has(name))
          obsolete.push(name);
      }
      obsolete.forEach((name) => storage.removeItem(name));
    }
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
      .reverse()
      .filter(([key]) => key.startsWith(prefix))
      .sort(
        ([, left], [, right]) => right.updatedAt - left.updatedAt,
      )[0]?.[0] ?? null
  );
}
