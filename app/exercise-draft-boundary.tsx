'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useExerciseDraft } from './use-exercise-draft';
import type { ExerciseDraft } from '@/lib/exercise-drafts';
import type { RemovedDraftSet } from '@/lib/workout-set-safeguards';

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
      showValidation: boolean;
      setShowValidation: (show: boolean) => void;
      removedSets: RemovedDraftSet<T>[];
      setRemovedSets: React.Dispatch<
        React.SetStateAction<RemovedDraftSet<T>[]>
      >;
    },
  ) => ReactNode;
}) {
  const draft = useExerciseDraft(draftKey, baseline, ready);
  const [showNotes, setShowNotes] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  // This boundary is keyed by exercise. Undo is intentionally local to the
  // current editing session and cannot leak into another workout.
  const [removedSets, setRemovedSets] = useState<RemovedDraftSet<T>[]>([]);
  useEffect(() => {
    onStatus({ dirty: draft.dirty, persisted: draft.persisted });
  }, [draft.dirty, draft.persisted, onStatus]);
  onSnapshot(draft.value);
  return children({
    ...draft,
    clear: () => {
      draft.clear();
      setRemovedSets([]);
      setShowValidation(false);
    },
    showNotes,
    setShowNotes,
    showValidation,
    setShowValidation,
    removedSets,
    setRemovedSets,
  });
}
