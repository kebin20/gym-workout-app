// No browser globals are accessed during import/SSR.
let audio: AudioContext | null = null;
export function prepareTimerSound() {
  try {
    if (!audio || audio.state === 'closed') audio = new AudioContext();
    void audio.resume().catch(() => undefined);
  } catch {
    /* Sound is optional; notifications and the visible timer remain usable. */
  }
}

// iOS may interrupt an existing audio context after switching apps. Resume it
// best-effort, but never let audio readiness delay the system notification.
export async function playRestTimerSound(
  timeoutMs = 800,
  isCurrent = () => true,
) {
  if (!audio) return false;
  const deadline = Date.now() + timeoutMs;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (audio.state !== 'running')
      await Promise.race([
        audio.resume(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(Error('Sound unavailable')),
            timeoutMs,
          );
        }),
      ]);
    return isCurrent() && Date.now() < deadline && playTimerSound();
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
export function playTimerSound() {
  if (!audio || audio.state !== 'running') return false;
  try {
    for (const delay of [0, 0.25, 0.5]) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + delay;
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }
    return true;
  } catch {
    return false;
  }
}

export async function showRestNotification(
  registration:
    | Promise<ServiceWorkerRegistration | undefined>
    | (() => Promise<ServiceWorkerRegistration | undefined>),
  options: NotificationOptions,
  timeoutMs = 4000,
  isCurrent = () => true,
) {
  const deadline = Date.now() + timeoutMs;
  const cancelled = () => {
    if (!isCurrent()) throw new Error('The alert was cancelled.');
  };
  const withinDeadline = async <T>(promise: Promise<T>): Promise<T> => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  'The alert could not be confirmed. Check notification settings, then test again.',
                ),
              ),
            Math.max(0, deadline - Date.now()),
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };
  const getWorker =
    typeof registration === 'function' ? registration : () => registration;
  let rejectedAttempts = 0;
  while (Date.now() < deadline) {
    cancelled();
    const worker = await withinDeadline(getWorker());
    cancelled();
    // Do not send after an unresolved readiness request exceeds its deadline.
    if (Date.now() >= deadline) break;
    if (worker?.active) {
      try {
        await withinDeadline(
          worker.showNotification('Liftline rest complete', options),
        );
        return;
      } catch (error) {
        // InvalidStateError means no active worker: the request was rejected,
        // not delivered. Reacquire registration after an update, at most twice.
        // Never retry permission errors or uncertain delivery timeouts.
        if (
          typeof registration !== 'function' ||
          !error ||
          typeof error !== 'object' ||
          !('name' in error) ||
          error.name !== 'InvalidStateError' ||
          ++rejectedAttempts > 2
        )
          throw error;
      }
    } else if (typeof registration !== 'function') {
      throw new Error(
        'Alerts are not ready. Reload Liftline, then test again.',
      );
    }
    await withinDeadline(
      new Promise<void>((resolve) => setTimeout(resolve, 100)),
    );
  }
  throw new Error('Alerts are not ready. Reload Liftline, then test again.');
}

export const shouldAlertForTimer = (endsAt: number, now: number) =>
  now >= endsAt && now - endsAt < 30_000;
