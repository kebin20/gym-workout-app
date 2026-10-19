type RefreshTarget = Pick<
  Window,
  'addEventListener' | 'removeEventListener' | 'setTimeout' | 'clearTimeout'
>;

type RefreshReason = 'resume' | 'storage' | 'online';

type WorkoutRefreshOptions = {
  windowTarget: RefreshTarget;
  documentTarget: Pick<Document, 'addEventListener' | 'removeEventListener'>;
  refresh: () => Promise<unknown>;
  isOnline: () => boolean;
  isVisible: () => boolean;
  isBlocked?: () => boolean;
  storageKeys: readonly string[];
  onError?: (error: unknown) => void;
  now?: () => number;
  debounceMs?: number;
  minIntervalMs?: number;
};

function storageContents(value: string | null) {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Each successful GET rewrites cachedAt. Do not let two open tabs
      // endlessly refresh one another when the underlying snapshot is equal.
      const { cachedAt: _cachedAt, ...snapshot } = parsed as Record<
        string,
        unknown
      >;
      return JSON.stringify(snapshot);
    }
  } catch {
    // A changed, unreadable cache should still trigger an authoritative read.
  }
  return value;
}

/**
 * Coalesces browser lifecycle events without taking over the startup fetch.
 * Callers keep their own drafts, selection and timer state; this only requests
 * server reads. A blocked/offline/hidden request waits for the next trigger,
 * rather than polling or repeatedly retrying a failed connection.
 */
export function createWorkoutRefreshCoordinator({
  windowTarget,
  documentTarget,
  refresh,
  isOnline,
  isVisible,
  isBlocked = () => false,
  storageKeys,
  onError,
  now = Date.now,
  debounceMs = 250,
  minIntervalMs = 15_000,
}: WorkoutRefreshOptions) {
  const relevantKeys = new Set(storageKeys);
  let disposed = false;
  let pending = false;
  let inFlight = false;
  let timer: number | undefined;
  let lastStarted: number | undefined;
  const canRefresh = () => isVisible() && isOnline() && !isBlocked();

  const schedule = () => {
    if (
      disposed ||
      !pending ||
      inFlight ||
      timer !== undefined ||
      !canRefresh()
    )
      return;
    const intervalRemaining =
      lastStarted === undefined
        ? 0
        : Math.max(0, minIntervalMs - (now() - lastStarted));
    timer = windowTarget.setTimeout(
      () => {
        timer = undefined;
        void run();
      },
      Math.max(0, debounceMs, intervalRemaining),
    );
  };

  const run = async () => {
    if (disposed || !pending || inFlight || !canRefresh()) return;
    pending = false;
    inFlight = true;
    lastStarted = now();
    try {
      await refresh();
    } catch (error) {
      if (!disposed) onError?.(error);
    } finally {
      inFlight = false;
      // An event received during a request deserves one later read, not a
      // concurrent request. Nothing is rescheduled after disposal or failure
      // unless a new event actually arrived.
      schedule();
    }
  };

  const trigger = (_reason: RefreshReason = 'resume') => {
    if (disposed) return;
    pending = true;
    schedule();
  };
  const resume = () => trigger('resume');
  const pageshow = (event: PageTransitionEvent) => {
    // The normal initial pageshow belongs to the startup read. Only a page
    // restored from the back/forward cache is a lifecycle resume here.
    if (event.persisted) trigger('resume');
  };
  const online = () => trigger('online');
  const storage = (event: StorageEvent) => {
    if (event.key === null) {
      trigger('storage');
      return;
    }
    if (!relevantKeys.has(event.key)) return;
    if (event.oldValue === event.newValue) return;
    if (storageContents(event.oldValue) === storageContents(event.newValue))
      return;
    trigger('storage');
  };

  windowTarget.addEventListener('focus', resume);
  windowTarget.addEventListener('pageshow', pageshow);
  windowTarget.addEventListener('online', online);
  windowTarget.addEventListener('storage', storage);
  documentTarget.addEventListener('visibilitychange', resume);

  return {
    trigger,
    // Finishing a save/startup read may unblock an event already received.
    // Unlike trigger(), this cannot create a second startup request on its own.
    resumePending: schedule,
    dispose() {
      if (disposed) return;
      disposed = true;
      pending = false;
      if (timer !== undefined) windowTarget.clearTimeout(timer);
      timer = undefined;
      windowTarget.removeEventListener('focus', resume);
      windowTarget.removeEventListener('pageshow', pageshow);
      windowTarget.removeEventListener('online', online);
      windowTarget.removeEventListener('storage', storage);
      documentTarget.removeEventListener('visibilitychange', resume);
    },
  };
}
