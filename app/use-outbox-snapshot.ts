'use client';

import { useCallback, useState } from 'react';

// Render from memory. Explicit refreshes still read durable storage at sync,
// save and storage-event boundaries so concurrent revisions stay authoritative.
export function useOutboxSnapshot<T>(read: () => T[]) {
  const [pending, setPending] = useState<T[]>([]);
  const refresh = useCallback(() => {
    const latest = read();
    setPending(latest);
    return latest;
  }, [read]);
  return { pending, refresh };
}
