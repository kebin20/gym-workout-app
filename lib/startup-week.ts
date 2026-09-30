export function findStartupWeek(
  scheduledWeek: number,
  isWeekComplete: (week: number) => boolean,
) {
  const phaseStartWeek = scheduledWeek > 12 ? 13 : 1;

  for (let week = phaseStartWeek; week <= scheduledWeek; week += 1) {
    if (!isWeekComplete(week)) return week;
  }

  return scheduledWeek;
}
