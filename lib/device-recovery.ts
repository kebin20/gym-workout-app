const prefixes = ['liftline.outbox.v2.', 'liftline.exercise-draft.v2.'];
const keys = new Set([
  'liftline.pending-workouts.v1',
  'liftline.exercise-drafts.v1',
]);

export function deviceRecoverySnapshot(storage: Storage) {
  const records: Record<string, string> = {};
  // Keep raw strings, including malformed records: this file is a recovery
  // artifact, not an automatically restorable server backup. No secrets/cookies.
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (
      !key ||
      (!keys.has(key) && !prefixes.some((prefix) => key.startsWith(prefix)))
    )
      continue;
    const value = storage.getItem(key);
    if (value !== null) records[key] = value;
  }
  return {
    source: 'Liftline device recovery',
    version: 1,
    createdAt: new Date().toISOString(),
    warning:
      'Contains unsynced workouts and unfinished drafts from this device, not a complete server backup. Keep private. Review before recovery; do not upload to Restore backup.',
    records,
  };
}
