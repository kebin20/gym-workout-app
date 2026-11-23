export type TrainingPhase = 1 | 2;

// Storage weeks 13–24 already identify Phase 2 in saved workouts, drafts and
// backups. Reserve those IDs permanently; Phase 1 Week 13 starts at ID 25.
// Display weeks remain consecutive without rewriting any historical record.
export function phaseForWeek(week: number): TrainingPhase {
  return week >= 13 && week <= 24 ? 2 : 1;
}

export function validTrainingWeek(week: unknown): week is number {
  return typeof week === 'number' && Number.isSafeInteger(week) && week >= 1;
}

export function displayTrainingWeek(week: number) {
  return week > 12 ? week - 12 : week;
}

export function storageWeekForPhase(phase: TrainingPhase, week: number) {
  if (!validTrainingWeek(week) || (phase === 2 && week > 12))
    throw new Error('Invalid training week.');
  const stored = phase === 2 || week > 12 ? week + 12 : week;
  if (!validTrainingWeek(stored)) throw new Error('Invalid training week.');
  return stored;
}

export function previousTrainingWeek(week: number) {
  return week === 1 ? null : week === 25 ? 12 : week - 1;
}

export function nextTrainingWeek(week: number) {
  if (week === 24 || week === Number.MAX_SAFE_INTEGER) return null;
  return week === 12 ? 25 : week + 1;
}

// Recorded weeks stay available. Unused future weeks are added as needed,
// rather than allocating an array up to an arbitrary imported week number.
export function phaseWeekOptions(
  phase: TrainingPhase,
  recordedWeeks: number[],
  activeWeek?: number,
) {
  const weeks = new Set(
    Array.from({ length: 12 }, (_, i) => storageWeekForPhase(phase, i + 1)),
  );
  for (const week of recordedWeeks)
    if (validTrainingWeek(week) && phaseForWeek(week) === phase)
      weeks.add(week);
  if (activeWeek && phaseForWeek(activeWeek) === phase) {
    weeks.add(activeWeek);
    const previous = previousTrainingWeek(activeWeek);
    if (previous && phaseForWeek(previous) === phase) weeks.add(previous);
  }
  if (phase === 1) {
    const latest = [...weeks].reduce(
      (latest, week) => Math.max(latest, week),
      1,
    );
    const next = nextTrainingWeek(latest);
    if (next) weeks.add(next);
  }
  return [...weeks].sort((a, b) => a - b);
}

export function prefersPhaseTwo(
  entries: { week: number }[],
  programmeId: string,
) {
  try {
    const saved = window.localStorage.getItem(
      `liftline.selected-phase.v1:${programmeId}`,
    );
    if (saved === '1' || saved === '2') return saved === '2';
  } catch {
    /* Server rendering or unavailable device storage. */
  }
  // Preserve an existing Phase 2 user's choice on first upgrade.
  const latest = entries.reduce((week, entry) => Math.max(week, entry.week), 1);
  return phaseForWeek(latest) === 2;
}
