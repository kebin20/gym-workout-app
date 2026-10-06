'use client';
import { useEffect } from 'react';

export function useOutboxRetry(run: () => Promise<void>, pending: number) {
  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const retry = async () => {
      if (cancelled) return;
      try {
        if (navigator.onLine && !document.hidden) await run();
      } catch {
        /* Keep queued records. */
      }
      if (!cancelled)
        timer = setTimeout(
          retry,
          Math.min(60_000, 2000 * 2 ** Math.min(attempts++, 5)) +
            Math.random() * 1000,
        );
    };
    const wake = () => {
      clearTimeout(timer);
      void retry();
    };
    const foreground = () => {
      if (!document.hidden) wake();
    };
    timer = setTimeout(retry, 2000);
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', foreground);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [run, pending]);
}
