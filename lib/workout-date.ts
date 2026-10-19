// Workout calendar dates follow the same timezone as the personal training
// programme and Google Sheet, regardless of the device's current timezone.
export const WORKOUT_TIME_ZONE = 'Asia/Tokyo';

// Keep formatting reusable but lazy so importing the logger adds no Intl work
// to the cold startup path before any saved date is actually displayed.
let calendarFormatter: Intl.DateTimeFormat | undefined;
let labelFormatter: Intl.DateTimeFormat | undefined;

function workoutDate(value?: string | Date | null): Date | null {
  if (value == null) return null;
  if (value instanceof Date)
    return Number.isFinite(value.getTime()) ? value : null;
  const text = value.trim();
  if (!text) return null;

  const calendarKey = /^(\d{4}-\d{2}-\d{2})(?:[T ]|$)/.exec(text)?.[1];
  if (calendarKey) {
    // A stored calendar key is already a date, not an instant in the viewer's
    // timezone. Validate it explicitly because Date can roll 30 February over.
    const date = new Date(`${calendarKey}T00:00:00.000Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== calendarKey
    )
      return null;
    if (text === calendarKey) return date;
  }

  // Legacy ISO/SQLite timestamps without an offset were stored as UTC. Adding
  // the offset explicitly avoids interpreting them in the viewer's timezone.
  const normalized =
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)
      ? `${text.replace(' ', 'T')}Z`
      : text;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function workoutCalendarDate(value?: string | Date | null): string | null {
  const date = workoutDate(value);
  if (!date) return null;
  const parts = Object.fromEntries(
    (calendarFormatter ??= new Intl.DateTimeFormat('en-US', {
      timeZone: WORKOUT_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }))
      .formatToParts(date)
      .filter((part) => ['year', 'month', 'day'].includes(part.type))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatWorkoutDate(value?: string | Date | null): string {
  const date = workoutDate(value);
  return date
    ? (labelFormatter ??= new Intl.DateTimeFormat('en-GB', {
        timeZone: WORKOUT_TIME_ZONE,
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })).format(date)
    : 'Date unavailable';
}
