import {
  displayWeekNumber,
  correctedExerciseName,
  type TrainingDay,
} from './routine';
import type { WorkoutEntry } from './workout-types';

export type ReportSet = {
  set: number;
  weight: number | null;
  reps: number | null;
  rir: number | null;
};
export function reportSets(entry: WorkoutEntry): ReportSet[] {
  return ([1, 2, 3, 4, 5] as const).flatMap((set) => {
    const weight = entry[`set${set}Weight`] ?? null;
    const reps = entry[`set${set}Reps`] ?? null;
    const rir = entry[`set${set}Rir`] ?? null;
    return weight === null && reps === null ? [] : [{ set, weight, reps, rir }];
  });
}
export const reportPhase = (week: number) => (week > 12 ? 2 : 1);
export const reportWeek = (week: number) =>
  `P${reportPhase(week)} W${displayWeekNumber(week)}`;
export const reportWeekLabel = (week: number) =>
  `Phase ${reportPhase(week)} - Week ${displayWeekNumber(week)}`;
export type DayReportScope =
  | { kind: 'all' }
  | { kind: 'recent'; currentWeek: number };
export const isTimedEntry = (entry: WorkoutEntry) =>
  /plank/i.test(entry.exercise) || /\bsec(?:onds?)?\b/i.test(entry.target);
export function reportMetrics(entry: WorkoutEntry) {
  const sets = reportSets(entry).filter(
    (set) =>
      set.reps !== null &&
      Number.isFinite(set.reps) &&
      set.reps > 0 &&
      (set.weight === null || (Number.isFinite(set.weight) && set.weight >= 0)),
  );
  const timed = isTimedEntry(entry);
  return {
    volume: timed
      ? 0
      : sets.reduce((sum, set) => sum + (set.weight ?? 0) * set.reps!, 0),
    topWeight: timed
      ? null
      : sets.reduce<number | null>(
          (top, set) =>
            set.weight === null ? top : Math.max(top ?? 0, set.weight),
          null,
        ),
    reps: timed ? 0 : sets.reduce((sum, set) => sum + set.reps!, 0),
    seconds: timed ? sets.reduce((sum, set) => sum + set.reps!, 0) : 0,
    workingSets: sets.length,
  };
}
export function buildDayReport(
  day: TrainingDay,
  entries: WorkoutEntry[],
  scope: DayReportScope = { kind: 'all' },
) {
  if (
    scope.kind === 'recent' &&
    (!Number.isInteger(scope.currentWeek) ||
      scope.currentWeek < 1 ||
      scope.currentWeek > 24)
  )
    throw new Error('Choose a valid programme week for this report.');
  const selectedWeeks =
    scope.kind === 'recent'
      ? [scope.currentWeek - 1, scope.currentWeek].filter((week) => week >= 1)
      : null;
  // Include partial saved logs and device-local queued saves, but not undo tombstones.
  const byKey = new Map<string, WorkoutEntry>();
  for (const stored of entries) {
    const name = correctedExerciseName(
      stored.week,
      stored.day,
      stored.exerciseOrder,
      stored.exercise,
    );
    const entry =
      name === stored.exercise ? stored : { ...stored, exercise: name };
    if (entry.day !== day) continue;
    if (selectedWeeks && !selectedWeeks.includes(entry.week)) continue;
    const key = `${entry.week}|${entry.exerciseOrder}`;
    const previous = byKey.get(key);
    if (!previous || (entry.updatedAt ?? '') >= (previous.updatedAt ?? ''))
      byKey.set(key, entry);
  }
  const records = [...byKey.values()]
    .filter(
      (entry) =>
        Boolean(entry.completed) ||
        entry.notes?.trim() ||
        reportMetrics(entry).workingSets > 0,
    )
    .sort((a, b) => a.week - b.week || a.exerciseOrder - b.exerciseOrder);
  const byWeek = new Map<number, WorkoutEntry[]>();
  const byExercise = new Map<string, WorkoutEntry[]>();
  for (const entry of records) {
    byWeek.set(entry.week, [...(byWeek.get(entry.week) ?? []), entry]);
    // Do not compare unrelated substitutions or phases as one strength trend.
    const key = `${reportPhase(entry.week)}|${entry.exerciseOrder}|${entry.exercise.trim().toLowerCase()}`;
    byExercise.set(key, [...(byExercise.get(key) ?? []), entry]);
  }
  const sessions = (selectedWeeks ?? [...byWeek.keys()]).map((week) => {
    const records = byWeek.get(week) ?? [];
    return {
      week,
      records,
      date:
        records.find((entry) => entry.completedAt)?.completedAt ??
        records.find((entry) => entry.updatedAt)?.updatedAt ??
        null,
      volume: records.reduce(
        (sum, entry) => sum + reportMetrics(entry).volume,
        0,
      ),
      seconds: records.reduce(
        (sum, entry) => sum + reportMetrics(entry).seconds,
        0,
      ),
      reps: records.reduce((sum, entry) => sum + reportMetrics(entry).reps, 0),
    };
  });
  const exercises = [...byExercise].map(([key, records]) => ({
    key,
    name: records[0].exercise,
    phase: reportPhase(records[0].week),
    records,
  }));
  return {
    day,
    scope,
    scopeLabel: selectedWeeks
      ? selectedWeeks.map(reportWeekLabel).join(' and ')
      : 'All recorded phases and weeks',
    recordedSessions: sessions.filter((session) => session.records.length > 0)
      .length,
    records,
    sessions,
    exercises,
    volume: sessions.reduce((sum, session) => sum + session.volume, 0),
    pending: records.filter((entry) => entry.offlinePending).length,
  };
}
export type DayReport = ReturnType<typeof buildDayReport>;
