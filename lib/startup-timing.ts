type Clock = Pick<Performance, 'getEntriesByName' | 'mark'>;
export type StartupStage =
  | 'app-module'
  | 'cache-start'
  | 'cache-read'
  | 'session-recovered'
  | 'refresh-start'
  | 'refresh-received';

// In-memory marks only: no telemetry, storage writes or workout values.
export function markStartup(stage: StartupStage, clock?: Clock) {
  try {
    const target =
      clock ?? (typeof window !== 'undefined' ? window.performance : undefined);
    const name = `liftline:${stage}`;
    if (target && !target.getEntriesByName(name).length) target.mark(name);
  } catch {
    /* Instrumentation must never hold up logging. */
  }
}

export function startupTimingRows(
  clock: Pick<Performance, 'getEntriesByName' | 'getEntriesByType'>,
) {
  const time = (name: string) =>
    clock.getEntriesByName(`liftline:${name}`)[0]?.startTime;
  const interval = (start: number | undefined, end: number | undefined) =>
    start != null && end != null && end >= start
      ? `${Math.round(end - start)} ms`
      : 'Not measured';
  const navigation = clock.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;
  return [
    [
      'Navigation to document response',
      navigation
        ? `${Math.round(navigation.responseStart)} ms`
        : 'Not measured',
    ],
    ['Shell script to app module', interval(time('shell'), time('app-module'))],
    [
      'Cached records and queue recovery',
      interval(time('cache-start'), time('cache-read')),
    ],
    [
      'Session and saved-draft selection',
      interval(time('cache-read'), time('session-recovered')),
    ],
    [
      'Selection to usable logger',
      interval(time('session-recovered'), time('ready')),
    ],
    [
      'First server refresh',
      interval(time('refresh-start'), time('refresh-received')),
    ],
  ];
}
