export function parseSyncCursor(value: string | null): number | null {
  if (value == null || !/^\d+$/.test(value)) return null;
  const cursor = Number(value);
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : null;
}
