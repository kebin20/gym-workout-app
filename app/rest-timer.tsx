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
import {
  prepareTimerSound,
  playRestTimerSound,
  showRestNotification,
  shouldAlertForTimer,
} from '@/lib/rest-timer-alerts';

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
let engineStarted = false;
let engineInterval: ReturnType<typeof setInterval> | null = null;
let alertsEnabled = false;
let soundEnabled = true;
let keepAwake = true;
let notificationIcon = '/liftline-icon-192-v9.png';
let alertStatus = '';
const alertSnapshot = () => alertStatus;
let wakeLock: WakeLockSentinel | null = null;
let requestingWakeLock = false;
function status(message: string) {
  alertStatus = message;
  listeners.forEach((listener) => listener());
}
async function updateWakeLock() {
  const needed = keepAwake && timerState?.endsAt != null && !document.hidden;
  if (!needed) {
    void wakeLock?.release().catch(() => undefined);
    wakeLock = null;
    return;
  }
  if (
    (wakeLock && !wakeLock.released) ||
    requestingWakeLock ||
    !('wakeLock' in navigator)
  )
    return;
  requestingWakeLock = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!keepAwake || !timerState?.endsAt || document.hidden)
      await lock.release();
    else wakeLock = lock;
  } catch {
    /* Unsupported/power-saving restrictions are controlled by the device. */
  } finally {
    requestingWakeLock = false;
  }
}
async function notifyComplete(state: TimerState) {
  const isCurrent = () =>
    timerState?.id === state.id &&
    timerState.endsAt === null &&
    timerState.remaining === 0;
  const requestedSound = soundEnabled;
  const soundAttempt = requestedSound
    ? playRestTimerSound(
        800,
        () => isCurrent() && shouldAlertForTimer(state.endsAt!, Date.now()),
      )
    : Promise.resolve(false);
  try {
    navigator.vibrate?.([160, 80, 160]);
  } catch {
    /* Not available on iOS. */
  }
  let notificationResult = 'Notifications are off.';
  if (alertsEnabled) {
    if (
      !('Notification' in window) ||
      Notification.permission !== 'granted' ||
      !('serviceWorker' in navigator)
    )
      notificationResult =
        'Notifications are blocked or unavailable. Check Alerts and device settings.';
    else
      try {
        await showRestNotification(
          () => navigator.serviceWorker.getRegistration(),
          {
            body: state.exerciseName + ': ready for your next set.',
            icon: notificationIcon,
            tag: state.id,
            silent: !soundEnabled,
            data: { url: '/' },
          },
          4000,
          () =>
            isCurrent() &&
            alertsEnabled &&
            Notification.permission === 'granted' &&
            shouldAlertForTimer(state.endsAt!, Date.now()),
        );
        notificationResult =
          'Notification request accepted by the device; banner and sound depend on device settings and Focus.';
      } catch (error) {
        notificationResult =
          error instanceof Error
            ? error.message
            : 'The notification failed. Open Alerts and test again.';
      }
  }
  const played = await soundAttempt;
  if (!isCurrent()) return;
  status(
    [
      'Rest complete.',
      requestedSound
        ? played
          ? 'In-app sound started.'
          : 'In-app sound was unavailable. Tap Start or Test alert to enable it.'
        : 'In-app sound is off.',
      notificationResult,
    ].join(' '),
  );
}
function tickEngine() {
  const state = timerState;
  const timestamp = Date.now();
  if (!state?.endsAt || remainingSeconds(state, timestamp) !== 0) return;
  const onTime = shouldAlertForTimer(state.endsAt, timestamp);
  publish({ ...state, endsAt: null, remaining: 0, updatedAt: timestamp });
  if (onTime) void notifyComplete(state);
  else
    status(
      'Rest finished while Liftline was suspended. Keep the app open for timely alerts; use an iPhone or Watch timer when the screen is locked.',
    );
}
function updateEngine() {
  if (timerState?.endsAt && !engineInterval)
    engineInterval = setInterval(tickEngine, 500);
  if (!timerState?.endsAt && engineInterval) {
    clearInterval(engineInterval);
    engineInterval = null;
  }
  void updateWakeLock();
}
function refreshPreferences() {
  try {
    const enabled = localStorage.getItem('liftline.timer-alerts.v1');
    alertsEnabled =
      enabled === 'on' ||
      (enabled === null &&
        'Notification' in window &&
        Notification.permission === 'granted');
    soundEnabled = localStorage.getItem('liftline.timer-sound.v1') !== 'off';
    keepAwake = localStorage.getItem('liftline.timer-awake.v1') !== 'off';
  } catch {
    /* Storage disabled: retain session-only preferences. */
  }
}
function startEngine() {
  if (engineStarted) return;
  engineStarted = true;
  refreshPreferences();
  try {
    timerState = readTimerState(localStorage.getItem(storageKey));
  } catch {
    /* Retain the in-memory timer if storage is blocked. */
  }
  const reconcile = () => {
    refreshPreferences();
    tickEngine();
    void updateWakeLock();
    listeners.forEach((listener) => listener());
  };
  // One engine survives navigation away from Today, not one interval per mounted timer.
  document.addEventListener('visibilitychange', reconcile);
  window.addEventListener('pageshow', reconcile);
  window.addEventListener('focus', reconcile);
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey) {
      timerState = readTimerState(event.newValue);
      updateEngine();
      listeners.forEach((listener) => listener());
    } else if (event.key?.startsWith('liftline.timer-')) {
      reconcile();
    }
  });
  updateEngine();
  tickEngine();
}
function publish(state: TimerState | null) {
  if (!state || state.id !== timerState?.id) alertStatus = '';
  timerState = state;
  try {
    if (state) localStorage.setItem(storageKey, JSON.stringify(state));
    else localStorage.removeItem(storageKey);
  } catch {
    /* Timer still works for this session. */
  }
  listeners.forEach((listener) => listener());
  if (engineStarted) updateEngine();
}
const formatTimer = (seconds: number) =>
  Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');

function matchesExercise(
  state: TimerState,
  contextKey: string,
  exerciseName: string,
) {
  // Older saved timers used the exercise name alone.
  return state.contextKey === undefined
    ? state.exerciseName === exerciseName
    : state.contextKey === contextKey;
}

const RestTimer = forwardRef<
  RestTimerHandle,
  {
    exerciseName: string;
    contextKey?: string;
    restLabel: string;
    suggestedSeconds: number;
    notificationIconHref: string;
  }
>(function RestTimer(
  {
    exerciseName,
    contextKey = exerciseName,
    restLabel,
    suggestedSeconds,
    notificationIconHref,
  },
  ref,
) {
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [now, setNow] = useState(0);
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const alertMessage = useSyncExternalStore(subscribe, alertSnapshot, () => '');
  const [showAlerts, setShowAlerts] = useState(false);
  const [sound, setSound] = useState(true);
  const [awake, setAwake] = useState(true);
  const [testing, setTesting] = useState(false);
  const [systemAlerts, setSystemAlerts] = useState(false);
  const active =
    state && matchesExercise(state, contextKey, exerciseName) ? state : null;
  const seconds = active
    ? remainingSeconds(active, now || Date.now())
    : suggestedSeconds;
  const running = active?.endsAt !== null && active?.endsAt !== undefined;

  useEffect(() => {
    notificationIcon = notificationIconHref;
    startEngine();
    const refresh = () => {
      setSound(soundEnabled);
      setAwake(keepAwake);
      setSystemAlerts(alertsEnabled);
      setNow(Date.now());
      if ('Notification' in window && 'serviceWorker' in navigator)
        setPermission(Notification.permission);
    };
    refresh();
    return subscribe(refresh);
  }, [notificationIconHref]);

  useEffect(() => {
    // Navigation is not a rest-start action. Cancel the previous exercise's
    // deadline and alerts, but preserve a timer when reopening the same one.
    // No unmount cleanup: leaving Today must not cancel an intentional rest.
    if (timerState && !matchesExercise(timerState, contextKey, exerciseName))
      publish(null);
  }, [contextKey, exerciseName]);

  useEffect(() => {
    if (!state?.endsAt) return;
    const tick = () => {
      setNow(Date.now());
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
    if (soundEnabled) prepareTimerSound();
    const timestamp = Date.now();
    setNow(timestamp);
    publish({
      id: crypto.randomUUID(),
      exerciseName,
      contextKey,
      restLabel,
      endsAt: timestamp + suggestedSeconds * 1000,
      remaining: suggestedSeconds,
      updatedAt: timestamp,
    });
  }, [exerciseName, contextKey, restLabel, suggestedSeconds]);
  useImperativeHandle(ref, () => ({ start }), [start]);
  const toggle = () => {
    if (soundEnabled) prepareTimerSound();
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
      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        status(
          'System notifications are unavailable here. On iPhone, add Liftline to the Home Screen and open it from its icon.',
        );
        return;
      }
      const result = await Notification.requestPermission();
      setPermission(result);
      alertsEnabled = result === 'granted';
      setSystemAlerts(alertsEnabled);
      try {
        localStorage.setItem(
          'liftline.timer-alerts.v1',
          alertsEnabled ? 'on' : 'off',
        );
      } catch {
        /* Session-only. */
      }
      status(
        result === 'granted'
          ? 'Notifications enabled. Use Test alert to check delivery. Locked-screen delivery is not guaranteed.'
          : 'Notifications are blocked. Enable Liftline notifications in device settings, then test again.',
      );
    } catch {
      status(
        'Notifications could not be enabled. On iPhone, open Liftline from the Home Screen; the visible timer still works.',
      );
    }
  };
  const testAlert = async () => {
    setTesting(true);
    try {
      prepareTimerSound();
      let played = false;
      if (soundEnabled) {
        // resume() is async; wait one event turn before testing the oscillator.
        await new Promise((resolve) => setTimeout(resolve, 80));
        played = await playRestTimerSound();
      }
      if (
        !('Notification' in window) ||
        Notification.permission !== 'granted'
      ) {
        status(
          (played
            ? 'Sound tested. '
            : soundEnabled
              ? 'Sound was unavailable; tap Start to enable it. '
              : 'Sound is off. ') +
            'System notifications need permission; on iPhone, open the Home Screen app first.',
        );
        return;
      }
      await showRestNotification(
        () => navigator.serviceWorker.getRegistration(),
        {
          body: 'Test alert: ready for your next set.',
          icon: notificationIconHref,
          tag: 'liftline-rest-test',
          silent: !soundEnabled,
          data: { url: '/' },
        },
      );
      status(
        (played
          ? 'In-app sound started. '
          : soundEnabled
            ? 'In-app sound was unavailable. '
            : 'In-app sound is off. ') +
          'Test notification request accepted by the device. Check notifications and Focus if no banner appears; Apple controls iPhone or Watch delivery.',
      );
    } catch (error) {
      status(
        error instanceof Error ? error.message : 'Test notification failed.',
      );
    } finally {
      setTesting(false);
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
            <p className="font-sans text-sm font-medium text-muted-foreground">
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
          <Button
            type="button"
            variant="ghost"
            aria-expanded={showAlerts}
            onClick={() => setShowAlerts(!showAlerts)}
          >
            <Bell /> Alerts
          </Button>
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
      {showAlerts && (
        <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={sound}
              onClick={() => {
                soundEnabled = !sound;
                setSound(soundEnabled);
                if (soundEnabled) prepareTimerSound();
                try {
                  localStorage.setItem(
                    'liftline.timer-sound.v1',
                    soundEnabled ? 'on' : 'off',
                  );
                } catch {
                  /* Session-only. */
                }
              }}
            >
              Sound {sound ? 'on' : 'off'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={awake}
              onClick={() => {
                keepAwake = !awake;
                setAwake(keepAwake);
                void updateWakeLock();
                try {
                  localStorage.setItem(
                    'liftline.timer-awake.v1',
                    keepAwake ? 'on' : 'off',
                  );
                } catch {
                  /* Session-only. */
                }
              }}
            >
              Keep screen awake {awake ? 'on' : 'off'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                if (permission !== 'granted') {
                  void enableAlerts();
                  return;
                }
                alertsEnabled = !systemAlerts;
                setSystemAlerts(alertsEnabled);
                try {
                  localStorage.setItem(
                    'liftline.timer-alerts.v1',
                    alertsEnabled ? 'on' : 'off',
                  );
                } catch {
                  /* Session-only. */
                }
              }}
              aria-pressed={systemAlerts}
            >
              {permission === 'granted'
                ? `Notifications ${systemAlerts ? 'on' : 'off'}`
                : 'Enable notifications'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={testing}
              onClick={testAlert}
            >
              {testing ? 'Testing…' : 'Test alert'}
            </Button>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Keep Liftline open for timely alerts. Screen wake is supported where
            the device permits it. On iPhone, system alerts require the Home
            Screen app and notification permission. When the phone is locked,
            use an iPhone or Watch timer: Liftline does not yet have
            server-scheduled push alerts.
          </p>
        </div>
      )}
      {alertMessage && (
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          {alertMessage}
        </p>
      )}
    </div>
  );
});
export default RestTimer;
