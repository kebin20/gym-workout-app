// One storage entry per workout: acknowledging an old request must never erase
// a newer revision (or a different workout) queued while that request was busy.
export type OutboxItem<T = Record<string, unknown>> = {
  key: string;
  revision: string;
  queuedAt?: number;
  payload: Record<string, unknown>;
  record: T;
  blocked?: string;
};
export type OutboxKind = 'workout' | 'holiday';

export async function confirmOutboxResponse(
  response: Response,
  kind: OutboxKind,
  item: OutboxItem<unknown>,
) {
  const body = (await response.json()) as { entry?: Record<string, unknown> };
  const entry = body.entry;
  if (
    !entry ||
    typeof entry.updatedAt !== 'string' ||
    entry.exerciseOrder !== item.payload.exerciseOrder ||
    (kind === 'holiday'
      ? entry.sessionId !== item.payload.sessionId
      : entry.week !== item.payload.week || entry.day !== item.payload.day)
  )
    throw Error(
      'The server did not confirm this workout. It remains saved on this device.',
    );
  return entry;
}
const prefix = 'liftline.outbox.v2.';
const legacyKey = 'liftline.pending-workouts.v1';
const itemKey = (kind: OutboxKind, key: string, revision: string) =>
  `${prefix}${kind}.${encodeURIComponent(key)}.${encodeURIComponent(revision)}`;

export function hasPendingOutbox(storage: Storage) {
  if (storage.getItem(legacyKey)) return true;
  for (let index = 0; index < storage.length; index++)
    if (storage.key(index)?.startsWith(prefix)) return true;
  return false;
}
export function outboxStorageIssue(storage: Storage): string | null {
  try {
    const legacy = storage.getItem(legacyKey);
    if (legacy && !Array.isArray(JSON.parse(legacy)))
      return 'An older offline queue needs recovery. Its contents have been preserved.';
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const value = JSON.parse(storage.getItem(key) ?? 'null');
      if (
        !value ||
        typeof value.key !== 'string' ||
        typeof value.revision !== 'string' ||
        !value.payload ||
        !value.record
      )
        return 'An offline record cannot be read. Its contents have been preserved; do not clear browser storage.';
    }
    return null;
  } catch {
    return 'Device storage or an offline record is unreadable. Keep this device’s data until it can be recovered.';
  }
}

export function readOutbox<T>(
  kind: OutboxKind,
  storage: Storage,
): OutboxItem<T>[] {
  const items: OutboxItem<T>[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(`${prefix}${kind}.`)) continue;
    try {
      const value = JSON.parse(storage.getItem(key) ?? 'null');
      if (
        value &&
        typeof value.key === 'string' &&
        typeof value.revision === 'string' &&
        value.payload &&
        typeof value.payload === 'object' &&
        value.record &&
        typeof value.record === 'object'
      )
        items.push(value);
    } catch {
      /* Preserve an unreadable item rather than silently deleting it. */
    }
  }
  const latest = new Map<string, OutboxItem<T>>();
  items.forEach((item) => {
    const previous = latest.get(item.key);
    if (!previous || (item.queuedAt ?? 0) >= (previous.queuedAt ?? 0))
      latest.set(item.key, item);
  });
  return [...latest.values()];
}

export function enqueueOutbox<T>(
  kind: OutboxKind,
  item: OutboxItem<T>,
  storage: Storage,
): boolean {
  try {
    const previous = readOutbox(kind, storage).find(
      (entry) => entry.key === item.key,
    );
    const queuedAt = Math.max(Date.now(), (previous?.queuedAt ?? 0) + 1);
    storage.setItem(
      itemKey(kind, item.key, item.revision),
      JSON.stringify({ ...item, queuedAt }),
    );
    return true;
  } catch {
    return false;
  }
}

export function acknowledgeOutbox(
  kind: OutboxKind,
  item: OutboxItem<unknown>,
  storage: Storage,
) {
  const key = itemKey(kind, item.key, item.revision);
  const current = storage.getItem(key);
  if (!current) return;
  const acknowledgedAt = JSON.parse(current).queuedAt ?? 0;
  const keys = Array.from({ length: storage.length }, (_, index) =>
    storage.key(index),
  );
  for (const candidate of keys) {
    if (!candidate?.startsWith(`${prefix}${kind}.`)) continue;
    try {
      const record = JSON.parse(storage.getItem(candidate) ?? 'null');
      if (record?.key === item.key && (record.queuedAt ?? 0) <= acknowledgedAt)
        storage.removeItem(candidate);
    } catch {
      /* Leave unreadable records available for recovery. */
    }
  }
}

export function blockOutbox(
  kind: OutboxKind,
  item: OutboxItem<unknown>,
  message: string,
  storage: Storage,
) {
  const key = itemKey(kind, item.key, item.revision);
  const current = storage.getItem(key);
  if (current && JSON.parse(current).revision === item.revision)
    storage.setItem(key, JSON.stringify({ ...item, blocked: message }));
}

export function migrateWorkoutOutbox<T>(
  storage: Storage,
  toRecord: (payload: Record<string, unknown>) => T,
) {
  const raw = storage.getItem(legacyKey);
  if (!raw) return;
  const legacy = JSON.parse(raw);
  if (!Array.isArray(legacy))
    throw new Error(
      'The older offline queue cannot be read. Export a backup before retrying.',
    );
  for (const item of legacy) {
    if (!item || typeof item.key !== 'string' || !item.payload)
      throw new Error('An older offline workout needs recovery.');
    if (readOutbox('workout', storage).some((entry) => entry.key === item.key))
      continue;
    if (
      !enqueueOutbox(
        'workout',
        {
          key: item.key,
          revision: `legacy-${item.payload.clientUpdatedAt ?? item.key}`,
          payload: item.payload,
          record: toRecord(item.payload),
        },
        storage,
      )
    )
      throw new Error(
        'Device storage is unavailable. Older offline workouts have been preserved.',
      );
  }
  storage.removeItem(legacyKey);
}

export function overlayOutbox<T>(
  entries: T[],
  pending: OutboxItem<T>[],
  keyOf: (entry: T) => string,
): T[] {
  const indexed = new Map(entries.map((entry) => [keyOf(entry), entry]));
  pending.forEach((item) => indexed.set(item.key, item.record));
  return [...indexed.values()];
}

// Module-level single flight covers main/Holiday remounts. Web Locks adds
// cross-tab serialization where supported. Acknowledgement is synchronous.
const running = new Map<string, Promise<void>>();
export function singleFlight(
  name: string,
  run: () => Promise<void>,
): Promise<void> {
  const existing = running.get(name);
  if (existing) return existing;
  const task = Promise.resolve()
    .then(async () => {
      if (typeof navigator !== 'undefined' && navigator.locks)
        await navigator.locks.request(`liftline:${name}`, run);
      else await run();
    })
    .finally(() => {
      if (running.get(name) === task) running.delete(name);
    });
  running.set(name, task);
  return task;
}

export const retryableStatus = (status: number) =>
  status === 408 || status === 429 || status >= 500;
