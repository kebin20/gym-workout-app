import { overlayOutbox, type OutboxItem } from './workout-outbox';
type Selection = { week: number; day: string; exerciseOrder: number };
const workoutKey = (value: Selection) =>
  `${value.week}|${value.day}|${value.exerciseOrder}`;
export function programmeOutboxKey(value: Selection, programmeId = 'initial') {
  return programmeId === 'initial'
    ? workoutKey(value)
    : `${programmeId}:${workoutKey(value)}`;
}
export function overlayProgrammeRecords<T extends Selection>(
  entries: T[],
  pending: OutboxItem<T>[],
  programmeId: string,
) {
  return overlayOutbox(
    entries,
    pending
      .filter((item) => (item.payload.programmeId ?? 'initial') === programmeId)
      .map((item) => ({ ...item, key: workoutKey(item.record) })),
    workoutKey,
  );
}
