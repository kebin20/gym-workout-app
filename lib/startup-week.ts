import {
  displayTrainingWeek,
  nextTrainingWeek,
  phaseForWeek,
  storageWeekForPhase,
} from './training-weeks';

export function findStartupWeek(
  scheduledWeek: number,
  isWeekComplete: (week: number) => boolean,
) {
  const phase = phaseForWeek(scheduledWeek);
  for (
    let display = 1;
    display <= displayTrainingWeek(scheduledWeek);
    display++
  ) {
    const week = storageWeekForPhase(phase, display);
    if (!isWeekComplete(week)) return week;
  }

  return nextTrainingWeek(scheduledWeek) ?? scheduledWeek;
}
