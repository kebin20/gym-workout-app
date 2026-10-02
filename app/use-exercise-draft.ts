'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type SetStateAction,
} from 'react';
import {
  readExerciseDraft,
  writeExerciseDraft,
  type ExerciseDraft,
} from '@/lib/exercise-drafts';

// A keyed snapshot prevents the previous exercise's inputs being written to a
// newly selected exercise. Persist each edit immediately, including partial text.
export function useExerciseDraft<T extends ExerciseDraft>(
  key: string,
  baseline: T,
  ready: boolean,
) {
  const revision = JSON.stringify(baseline);
  const [hydrated, setHydrated] = useState(false);
  const selection = ready && hydrated ? key : '';
  const createSnapshot = () => {
    let recovered: T | null = null;
    if (selection) {
      try {
        recovered = readExerciseDraft(selection, baseline, window.localStorage);
      } catch {
        /* Storage may be disabled. */
      }
    }
    return {
      key: selection,
      revision,
      value: recovered ?? baseline,
      dirty: recovered !== null && JSON.stringify(recovered) !== revision,
      recovered: recovered !== null && JSON.stringify(recovered) !== revision,
      persisted: recovered !== null,
    };
  };
  const [state, setState] = useState(createSnapshot);
  let snapshot = state;
  if (
    state.key !== selection ||
    (!state.dirty && state.revision !== revision)
  ) {
    snapshot = createSnapshot();
    setState(snapshot);
  }
  const current = useRef(snapshot);
  current.current = snapshot;
  useLayoutEffect(() => {
    setHydrated(true);
  }, []);

  const setValue = useCallback((update: SetStateAction<T>) => {
    const previous = current.current;
    const value =
      typeof update === 'function'
        ? (update as (value: T) => T)(previous.value)
        : update;
    const dirty = JSON.stringify(value) !== previous.revision;
    let persisted = false;
    if (previous.key) {
      try {
        persisted = writeExerciseDraft(
          previous.key,
          dirty ? value : null,
          window.localStorage,
        );
      } catch {
        /* Keep editing without storage. */
      }
    }
    const next = { ...previous, value, dirty, persisted };
    current.current = next;
    setState(next);
  }, []);

  const submittedRevision = JSON.stringify(snapshot.value);
  const clear = useCallback(() => {
    const previous = current.current;
    try {
      const stored = key
        ? readExerciseDraft(key, baseline, window.localStorage)
        : null;
      // A save may finish after the user edits again or navigates away. Never
      // remove a newer draft while acknowledging the submitted snapshot.
      if (key && (!stored || JSON.stringify(stored) === submittedRevision))
        writeExerciseDraft(key, null, window.localStorage);
    } catch {
      /* The saved record is already safe. */
    }
    if (
      previous.key !== key ||
      JSON.stringify(previous.value) !== submittedRevision
    )
      return;
    const next = { ...previous, dirty: false, recovered: false };
    current.current = next;
    setState(next);
  }, [key, submittedRevision]);

  return {
    value: snapshot.value,
    setValue,
    clear,
    dirty: snapshot.dirty,
    recovered: snapshot.recovered,
    persisted: snapshot.persisted,
  };
}
