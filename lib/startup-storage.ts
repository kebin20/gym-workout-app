// Optional device-cache retention, never the source of truth for workouts.
export async function retainInstalledStorage(
  storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined,
): Promise<'persistent' | 'best-effort' | 'unavailable'> {
  if (!storage?.persist || !storage?.persisted) return 'unavailable';
  try {
    if (await storage.persisted()) return 'persistent';
    return (await storage.persist()) ? 'persistent' : 'best-effort';
  } catch {
    return 'unavailable';
  }
}
