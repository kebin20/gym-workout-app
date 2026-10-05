import type { WorkoutEntry } from './workout-types';
// Conditional save rather than deletion: delta clients observe the cleared
// record, while the server rejects undoing over a newer device's save.
export function undoWorkoutPayload(saved: WorkoutEntry, before?: WorkoutEntry) {
  if (!saved.updatedAt)
    throw Error('This save has no revision to undo safely.');
  const payload: Record<string, unknown> = {
    week: saved.week,
    day: saved.day,
    exerciseOrder: saved.exerciseOrder,
    setCount: before?.setCount ?? saved.setCount ?? 3,
    completed: Boolean(before?.completed),
    completedAt: before?.completedAt ?? null,
    rir: before?.rir ?? null,
    notes: before?.notes ?? '',
    expectedUpdatedAt: saved.updatedAt,
    clientUpdatedAt: new Date(
      Math.max(Date.now(), Date.parse(saved.updatedAt) + 1),
    ).toISOString(),
  };
  for (let set = 1; set <= 5; set++) {
    payload[`set${set}Weight`] =
      before?.[`set${set}Weight` as keyof WorkoutEntry] ?? null;
    payload[`set${set}Reps`] =
      before?.[`set${set}Reps` as keyof WorkoutEntry] ?? null;
  }
  return payload;
}
