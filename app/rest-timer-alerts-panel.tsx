'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type {
  prepareTimerSound,
  playRestTimerSound,
  showRestNotification,
} from '@/lib/rest-timer-alerts';
export type TimerPreferences = {
  sound: boolean;
  awake: boolean;
  notifications: boolean;
};
export type TimerPreferenceKey = keyof TimerPreferences;
export type TimerAlertsProps = {
  services: {
    prepareTimerSound: typeof prepareTimerSound;
    playRestTimerSound: typeof playRestTimerSound;
    showRestNotification: typeof showRestNotification;
  };
  notificationIconHref: string;
  readPreferences: () => TimerPreferences;
  setPreference: (key: TimerPreferenceKey, value: boolean) => void;
  subscribe: (listener: () => void) => () => void;
  reportStatus: (message: string) => void;
};
export default function RestTimerAlerts({
  services,
  notificationIconHref,
  readPreferences,
  setPreference,
  subscribe,
  reportStatus: status,
}: TimerAlertsProps) {
  const { prepareTimerSound, playRestTimerSound, showRestNotification } =
    services;
  const [preferences, setPreferences] = useState(readPreferences);
  const { sound, awake, notifications: systemAlerts } = preferences;
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    const refresh = () => {
      const next = readPreferences();
      setPreferences((current) =>
        current.sound === next.sound &&
        current.awake === next.awake &&
        current.notifications === next.notifications
          ? current
          : next,
      );
      if ('Notification' in window && 'serviceWorker' in navigator)
        setPermission(Notification.permission);
    };
    refresh();
    return subscribe(refresh);
  }, [readPreferences, subscribe]);
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
      setPreference('notifications', result === 'granted');
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
      if (sound) {
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
            : sound
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
          silent: !sound,
          data: { url: '/' },
        },
      );
      status(
        (played
          ? 'In-app sound started. '
          : sound
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
    <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-pressed={sound}
          onClick={() => setPreference('sound', !sound)}
        >
          Sound {sound ? 'on' : 'off'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-pressed={awake}
          onClick={() => setPreference('awake', !awake)}
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
            setPreference('notifications', !systemAlerts);
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
        Keep Liftline open for timely alerts. Screen wake is supported where the
        device permits it. On iPhone, system alerts require the Home Screen app
        and notification permission. When the phone is locked, use an iPhone or
        Watch timer: Liftline does not yet have server-scheduled push alerts.
      </p>
    </div>
  );
}
