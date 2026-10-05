'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useExerciseDraft } from './use-exercise-draft';
import type { ExerciseDraft } from '@/lib/exercise-drafts';

export type DraftStatus = { dirty: boolean; persisted: boolean };
// Own the hot input state here: typing must not re-render the dashboard/history.
export default function ExerciseDraftBoundary<T extends ExerciseDraft>({
  draftKey,
  baseline,
  ready,
  onStatus,
  onSnapshot,
  children,
}: {
  draftKey: string;
  baseline: T;
  ready: boolean;
  onStatus: (status: DraftStatus) => void;
  onSnapshot: (value: T) => void;
  children: (
    state: ReturnType<typeof useExerciseDraft<T>> & {
      showNotes: boolean;
      setShowNotes: (show: boolean) => void;
      weightIncrement: number;
      setWeightIncrement: (value: number) => void;
    },
  ) => ReactNode;
}) {
  const draft = useExerciseDraft(draftKey, baseline, ready);
  const [showNotes, setShowNotes] = useState(false);
  const preferenceKey = `liftline.weight-increment.v1:${draftKey.split(':').slice(3).join(':')}`;
  const [weightIncrement, setIncrement] = useState(2.5);
  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(preferenceKey));
      setIncrement([0.5, 1, 2.5, 5].includes(stored) ? stored : 2.5);
    } catch {
      /* Optional preference, never block logging. */
    }
  }, [preferenceKey]);
  function setWeightIncrement(value: number) {
    setIncrement(value);
    try {
      localStorage.setItem(preferenceKey, String(value));
    } catch {
      /* Optional. */
    }
  }
  useEffect(() => {
    onStatus({ dirty: draft.dirty, persisted: draft.persisted });
  }, [draft.dirty, draft.persisted, onStatus]);
  onSnapshot(draft.value);
  return children({
    ...draft,
    showNotes,
    setShowNotes,
    weightIncrement,
    setWeightIncrement,
  });
}
