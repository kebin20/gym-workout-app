// No browser globals are accessed during import/SSR.
let audio: AudioContext | null = null;
export function prepareTimerSound() {
  try {
    if (!audio) audio = new AudioContext();
    void audio.resume().catch(() => undefined);
  } catch {
    /* Sound is optional; notifications and the visible timer remain usable. */
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
  registration: Promise<ServiceWorkerRegistration | undefined>,
  options: NotificationOptions,
  timeoutMs = 4000,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      registration.then(async (worker) => {
        if (!worker?.active)
          throw new Error(
            'Alerts are not ready. Reload Liftline, then test again.',
          );
        await worker.showNotification('Liftline rest complete', options);
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                'The alert could not be confirmed. Check notification settings, then test again.',
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export const shouldAlertForTimer = (endsAt: number, now: number) =>
  now >= endsAt && now - endsAt < 30_000;
