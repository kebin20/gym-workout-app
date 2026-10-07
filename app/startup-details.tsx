'use client';

import { useEffect, useState } from 'react';
import { appVersion } from './app-release';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// Loaded only from Progress > Data. No telemetry or workout data is collected.
export default function StartupDetails({ onClose }: { onClose: () => void }) {
  const [offline, setOffline] = useState('Checking…');
  const [storage, setStorage] = useState('Checking…');
  const ready = performance.getEntriesByName('liftline:ready')[0];
  const installed =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!('caches' in window)) throw Error('Unavailable');
        const names = (await caches.keys()).filter(
          (name) => name.startsWith('liftline-') && name.endsWith('-shell'),
        );
        let previous = false;
        let verified = false;
        for (const name of names) {
          const cache = await caches.open(name);
          if (await cache.match('/')) previous = true;
          if (
            name.startsWith(`liftline-${appVersion}-`) &&
            (await cache.match('/__liftline_startup_ready__'))
          )
            verified = true;
        }
        if (!cancelled)
          setOffline(
            verified
              ? 'Current interface verified'
              : previous
                ? 'Previous interface retained'
                : 'Not ready yet—keep Liftline open online',
          );
      } catch {
        if (!cancelled) setOffline('Unavailable in this browser');
      }
    })();
    void (async () => {
      try {
        if (!navigator.storage?.persisted) throw Error('Unavailable');
        const persistent = await navigator.storage.persisted();
        if (!cancelled)
          setStorage(
            persistent ? 'Persistent storage granted' : 'Best-effort storage',
          );
      } catch {
        if (!cancelled) setStorage('Unavailable in this browser');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto font-sans sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Startup details</DialogTitle>
          <DialogDescription>
            Measurements stay on this device. No workout data is sent.
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-4 text-sm">
          {[
            ['Version', `Liftline ${appVersion}`],
            [
              'Page to usable logger',
              ready
                ? `${Math.round(ready.startTime)} ms`
                : 'Return to Today to measure',
            ],
            ['Home Screen mode', installed ? 'Yes' : 'No'],
            ['Offline interface', offline],
            ['Device storage', storage],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">
          This measures page navigation to the ready logger, not the iOS launch
          animation or time before the web process starts. First installs,
          updates and sign-in can take longer.
        </p>
      </DialogContent>
    </Dialog>
  );
}
