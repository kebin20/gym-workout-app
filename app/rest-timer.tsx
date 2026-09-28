'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Bell, Clock3, Pause, Play, TimerReset } from 'lucide-react';

import { Button } from '@/components/ui/button';

export type RestTimerHandle = {
  start: () => void;
};

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

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
  const [seconds, setSeconds] = useState(suggestedSeconds);
  const [running, setRunning] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertsAvailable, setAlertsAvailable] = useState(false);
  const endsAt = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const available = 'Notification' in window;
      setAlertsAvailable(available);
      setAlertsEnabled(available && Notification.permission === 'granted');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil(((endsAt.current ?? Date.now()) - Date.now()) / 1000),
      );
      setSeconds(remaining);
      if (remaining !== 0) return;

      endsAt.current = null;
      setRunning(false);
      navigator.vibrate?.([160, 80, 160]);
      if (
        'Notification' in window &&
        Notification.permission === 'granted' &&
        document.hidden
      ) {
        new Notification('Liftline rest complete', {
          body: `${exerciseName}: ready for your next set.`,
          icon: notificationIconHref,
        });
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [exerciseName, notificationIconHref, running]);

  const start = useCallback(() => {
    setSeconds(suggestedSeconds);
    endsAt.current = Date.now() + suggestedSeconds * 1000;
    setRunning(true);
  }, [suggestedSeconds]);

  useImperativeHandle(ref, () => ({ start }), [start]);

  const toggle = () => {
    if (running) {
      const remaining = Math.max(
        0,
        Math.ceil(((endsAt.current ?? Date.now()) - Date.now()) / 1000),
      );
      endsAt.current = null;
      setSeconds(remaining);
      setRunning(false);
      return;
    }
    const startingSeconds = seconds === 0 ? suggestedSeconds : seconds;
    setSeconds(startingSeconds);
    endsAt.current = Date.now() + startingSeconds * 1000;
    setRunning(true);
  };

  const reset = () => {
    endsAt.current = null;
    setRunning(false);
    setSeconds(suggestedSeconds);
  };

  const enableAlerts = async () => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setAlertsEnabled(permission === 'granted');
  };

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/15 bg-background/90 p-3 shadow-sm shadow-slate-900/5">
      <div className="flex items-center gap-3">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-lg ${seconds === 0 ? 'bg-success-soft text-success' : 'bg-accent text-primary'}`}
        >
          <Clock3 className="size-4" />
        </span>
        <div>
          <p className="font-sans text-xs font-medium text-muted-foreground">
            {seconds === 0 ? 'Rest complete' : `Rest timer · ${restLabel}`}
          </p>
          <time
            className="font-sans text-xl font-bold tabular-nums"
            aria-live="polite"
          >
            {formatTimer(seconds)}
          </time>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!alertsEnabled && alertsAvailable && (
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
          onClick={reset}
        >
          <TimerReset />
        </Button>
      </div>
    </div>
  );
});

export default RestTimer;
