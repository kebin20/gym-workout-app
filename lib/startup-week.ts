export function findStartupWeek(
  scheduledWeek: number,
  isWeekStarted: (week: number) => boolean,
  isWeekComplete: (week: number) => boolean,
) {
  const phaseStartWeek = scheduledWeek > 12 ? 13 : 1;

  for (let week = scheduledWeek; week >= phaseStartWeek; week -= 1) {
    if (isWeekStarted(week) && !isWeekComplete(week)) return week;
  }

  return scheduledWeek;
}
