import type { WorkoutEntry } from './workout-types';

export type WorkoutDraftBase = { expectedUpdatedAt?: string | null };

// A queued optimistic timestamp is not a server revision. A later edit of the
// same pending workout must retain the first payload's original base.
export function workoutDraftBase(
  entry?: WorkoutEntry,
  pendingPayload?: Record<string, unknown>,
): WorkoutDraftBase {
  if (pendingPayload) {
    const base = pendingPayload.expectedUpdatedAt;
    return base === null ||
      (typeof base === 'string' && Number.isFinite(Date.parse(base)))
      ? { expectedUpdatedAt: base }
      : {};
  }
  if (!entry) return { expectedUpdatedAt: null };
  return !entry.offlinePending &&
    entry.updatedAt &&
    Number.isFinite(Date.parse(entry.updatedAt))
    ? { expectedUpdatedAt: entry.updatedAt }
    : {};
}

export function workoutSaveTimestamp(base?: string | null, now = Date.now()) {
  return new Date(
    Math.max(now, base ? Date.parse(base) + 1 : now),
  ).toISOString();
}
