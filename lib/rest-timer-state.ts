export type TimerState = {
  id: string;
  exerciseName: string;
  restLabel: string;
  endsAt: number | null;
  remaining: number;
  updatedAt: number;
};
export const remainingSeconds = (state: TimerState, now = Date.now()) =>
  state.endsAt === null
    ? state.remaining
    : Math.max(0, Math.ceil((state.endsAt - now) / 1000));
export function readTimerState(
  value: string | null,
  now = Date.now(),
): TimerState | null {
  try {
    const state = JSON.parse(value ?? 'null');
    return state &&
      typeof state.id === 'string' &&
      typeof state.exerciseName === 'string' &&
      typeof state.restLabel === 'string' &&
      (state.endsAt === null || Number.isFinite(state.endsAt)) &&
      Number.isFinite(state.remaining) &&
      state.remaining >= 0 &&
      Number.isFinite(state.updatedAt) &&
      Math.abs(now - state.updatedAt) < 86_400_000
      ? state
      : null;
  } catch {
    return null;
  }
}
