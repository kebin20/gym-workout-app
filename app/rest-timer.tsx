'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
  useSyncExternalStore,
} from 'react';
import { Bell, Clock3, Pause, Play, TimerReset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  readTimerState,
  remainingSeconds,
  type TimerState,
} from '@/lib/rest-timer-state';

export type RestTimerHandle = { start: () => void };
const storageKey = 'liftline.rest-timer.v2';
let timerState: TimerState | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => timerState;
const serverSnapshot = () => null;
function publish(state: TimerState | null) {
  timerState = state;
  try {
    if (state) localStorage.setItem(storageKey, JSON.stringify(state));
    else localStorage.removeItem(storageKey);
  } catch {
    /* Timer still works for this session. */
  }
  listeners.forEach((listener) => listener());
}
const formatTimer = (seconds: number) =>
  Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');

const RestTimer = forwardRef<
  RestTimerHandle,
  {
    exerciseName: string;
    restLabel: string;
    suggestedSeconds: number;
    notificationIconHref: string;
  }
>(function RestTimer(
  { exerciseName, restLabel, suggestedSeconds, notificationIconHref },
  ref,
) {
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [now, setNow] = useState(0);
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const [alertMessage, setAlertMessage] = useState('');
  const active =
    state && (state.endsAt !== null || state.exerciseName === exerciseName)
      ? state
      : null;
  const seconds = active
    ? remainingSeconds(active, now || Date.now())
    : suggestedSeconds;
  const running = active?.endsAt !== null && active?.endsAt !== undefined;

  useEffect(() => {
    try {
      if (!timerState)
        publish(readTimerState(localStorage.getItem(storageKey)));
    } catch {
      /* Storage disabled. */
    }
    setNow(Date.now());
    if ('Notification' in window && 'serviceWorker' in navigator)
      setPermission(Notification.permission);
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      timerState = readTimerState(event.newValue);
      listeners.forEach((listener) => listener());
    };
    window.addEventListener('storage', storageChanged);
    return () => window.removeEventListener('storage', storageChanged);
  }, []);

  useEffect(() => {
    if (!state?.endsAt) return;
    const tick = () => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (
        timerState?.id !== state.id ||
        remainingSeconds(state, timestamp) !== 0
      )
        return;
      publish({ ...state, endsAt: null, remaining: 0, updatedAt: timestamp });
      navigator.vibrate?.([160, 80, 160]);
      if (
        document.hidden &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        timestamp - (state.endsAt ?? timestamp) < 30_000
      ) {
        // No Notification constructor on mobile, and never wait indefinitely for
        // a service worker. Background execution remains browser-controlled.
        void navigator.serviceWorker
          ?.getRegistration()
          .then((registration) =>
            registration?.showNotification('Liftline rest complete', {
              body: state.exerciseName + ': ready for your next set.',
              icon: notificationIconHref,
              tag: state.id,
            }),
          )
          .catch(() => undefined);
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('pageshow', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('pageshow', tick);
    };
  }, [state, notificationIconHref]);

  const start = useCallback(() => {
    const timestamp = Date.now();
    setNow(timestamp);
    publish({
      id: crypto.randomUUID(),
      exerciseName,
      restLabel,
      endsAt: timestamp + suggestedSeconds * 1000,
      remaining: suggestedSeconds,
      updatedAt: timestamp,
    });
  }, [exerciseName, restLabel, suggestedSeconds]);
  useImperativeHandle(ref, () => ({ start }), [start]);
  const toggle = () => {
    if (active && running)
      publish({
        ...active,
        endsAt: null,
        remaining: remainingSeconds(active),
        updatedAt: Date.now(),
      });
    else if (active && seconds > 0) {
      setNow(Date.now());
      publish({
        ...active,
        endsAt: Date.now() + seconds * 1000,
        updatedAt: Date.now(),
      });
    } else start();
  };
  const enableAlerts = async () => {
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      setAlertMessage(
        result === 'granted'
          ? 'Background alerts are best-effort. Keep Liftline open for reliable timing.'
          : 'Alerts are unavailable; the visible timer still works.',
      );
    } catch {
      setAlertMessage('Alerts are unavailable; the visible timer still works.');
    }
  };
  return (
    <div className="mt-3 rounded-xl border border-primary/15 bg-background/90 p-3 shadow-sm shadow-slate-900/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={
              'grid size-9 shrink-0 place-items-center rounded-lg ' +
              (seconds === 0
                ? 'bg-success-soft text-success'
                : 'bg-accent text-primary')
            }
          >
            <Clock3 className="size-4" />
          </span>
          <div>
            <p className="font-sans text-xs font-medium text-muted-foreground">
              {seconds === 0
                ? 'Rest complete'
                : active && active.exerciseName !== exerciseName
                  ? 'Rest · ' + active.exerciseName
                  : 'Rest timer · ' + restLabel}
            </p>
            <time className="font-sans text-xl font-bold tabular-nums">
              {formatTimer(seconds)}
            </time>
            <span className="sr-only" role="status">
              {running
                ? 'Rest timer running'
                : seconds === 0
                  ? 'Rest complete'
                  : 'Rest timer paused'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {permission === 'default' && (
            <Button type="button" variant="ghost" onClick={enableAlerts}>
              <Bell /> Alerts
            </Button>
          )}
          <Button
            type="button"
            variant={running ? 'secondary' : 'default'}
            onClick={toggle}
          >
            {running ? <Pause /> : <Play />}
            {running ? 'Pause' : seconds === 0 ? 'Again' : 'Start'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Reset rest timer"
            onClick={() => publish(null)}
          >
            <TimerReset />
          </Button>
        </div>
      </div>
      {alertMessage && (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {alertMessage}
        </p>
      )}
    </div>
  );
});
export default RestTimer;
