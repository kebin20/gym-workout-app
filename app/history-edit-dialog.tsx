'use client';

import { useRef, useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/liftline-form-controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { displayWeekNumber } from '@/lib/routine';
import {
  historyFields,
  historySetNumbers,
  historyValues,
  validateHistoryFields,
  type HistoryValues,
} from '@/lib/workout-history-edit';
import type { WorkoutEntry } from '@/lib/workout-types';

export type SaveHistoryEdit = (
  entry: WorkoutEntry,
  fields: ReturnType<typeof historyFields>,
) => Promise<void>;

export default function HistoryEditDialog({
  entry,
  sheetAvailable,
  onClose,
  onSave,
}: {
  entry: WorkoutEntry;
  sheetAvailable: boolean;
  onClose: () => void;
  onSave: SaveHistoryEdit;
}) {
  const [values, setValues] = useState(() => historyValues(entry));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [discarding, setDiscarding] = useState(false);
  const busy = useRef(false);
  const hasOriginalDate = Boolean(
    entry.completedAt && Number.isFinite(Date.parse(entry.completedAt)),
  );
  const dirty = JSON.stringify(values) !== JSON.stringify(historyValues(entry));
  const visibleSets = Math.max(
    entry.setCount ?? 3,
    ...historySetNumbers.filter((set) =>
      [
        entry[`set${set}Weight`],
        entry[`set${set}Reps`],
        entry[`set${set}Rir`],
      ].some((value) => value != null),
    ),
  );
  const close = () => {
    if (busy.current) return;
    if (dirty && !discarding) setDiscarding(true);
    else onClose();
  };
  const editSet = (
    index: number,
    field: keyof HistoryValues['sets'][number],
    value: string,
  ) => {
    setDiscarding(false);
    setValues((current) => ({
      ...current,
      sets: current.sets.map((set, i) =>
        i === index ? { ...set, [field]: value } : set,
      ),
    }));
  };
  const save = async () => {
    if (busy.current || !dirty) return;
    const fields = historyFields(values);
    const invalid = validateHistoryFields(fields, entry);
    if (invalid) {
      setError(invalid);
      return;
    }
    busy.current = true;
    setSaving(true);
    setError('');
    setDiscarding(false);
    try {
      await onSave(entry, fields);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to confirm this correction. Your edits remain here.',
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2 font-sans text-lg">
            <Pencil className="size-4 text-primary" /> Edit saved exercise
          </DialogTitle>
          <DialogDescription className="font-sans">
            Phase {entry.week > 12 ? 2 : 1} · Week{' '}
            {displayWeekNumber(entry.week)} · Day {entry.day}
            <br />
            {entry.exercise}. The original date and completion status stay
            unchanged.
          </DialogDescription>
          <p className="font-sans text-xs text-muted-foreground">
            Recorded date:{' '}
            {hasOriginalDate
              ? new Intl.DateTimeFormat('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'Asia/Tokyo',
                }).format(new Date(entry.completedAt!))
              : 'Unavailable (not replaced with today)'}
          </p>
        </DialogHeader>
        <form
          id="history-edit-form"
          className="min-h-0 space-y-4 overflow-y-auto px-5 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={saving} className="min-w-0 space-y-3">
            <legend className="sr-only">Saved sets</legend>
            {historySetNumbers.slice(0, visibleSets).map((set, index) => (
              <div key={set} className="rounded-xl border bg-muted/20 p-3">
                <p className="mb-2 font-sans text-sm font-semibold">
                  Set {set}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(['weight', 'reps', 'rir'] as const).map((field) => (
                    <label
                      key={field}
                      className="min-w-0 font-sans text-sm text-muted-foreground"
                    >
                      {field === 'weight'
                        ? 'Weight (kg)'
                        : field === 'rir'
                          ? 'RIR'
                          : /plank/i.test(entry.exercise)
                            ? 'Seconds'
                            : 'Reps'}
                      <Input
                        className="mt-1 h-11 text-center placeholder:text-placeholder"
                        type="number"
                        inputMode={field === 'weight' ? 'decimal' : 'numeric'}
                        min="0"
                        max={field === 'rir' ? 10 : undefined}
                        step={field === 'weight' ? 'any' : 1}
                        value={values.sets[index][field]}
                        placeholder="–"
                        aria-label={`Set ${set} ${field}`}
                        onChange={(event) =>
                          editSet(index, field, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {entry.rir != null && (
              <label className="flex items-center justify-between gap-3 font-sans text-sm">
                Exercise RIR (older log)
                <Input
                  className="h-11 w-20 text-center"
                  aria-label="Exercise RIR"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="10"
                  step="1"
                  value={values.rir}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      rir: event.target.value,
                    }))
                  }
                />
              </label>
            )}
            <label className="block font-sans text-sm">
              Notes
              <Textarea
                className="mt-1"
                aria-label="Saved exercise notes"
                value={values.notes}
                maxLength={1000}
                rows={3}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </label>
          </fieldset>
          <p className="font-sans text-xs leading-relaxed text-muted-foreground">
            {sheetAvailable &&
            entry.syncStatus !== 'not_applicable' &&
            entry.week <= 12 &&
            entry.exerciseOrder < 100
              ? 'The original Google Sheet mirrors the first three sets, exercise RIR and notes. Extra sets and per-set RIR are kept in Liftline.'
              : 'This exercise is saved in Liftline only; it is outside the original Google Sheet layout.'}
          </p>
          {!hasOriginalDate && sheetAvailable && (
            <p className="font-sans text-xs text-muted-foreground">
              This record has no original date, so its correction stays in
              Liftline rather than changing the Sheet date.
            </p>
          )}
          {error && (
            <p role="alert" className="font-sans text-sm text-destructive">
              {error}
            </p>
          )}
          {discarding && (
            <p role="alert" className="font-sans text-sm">
              Discard these unsaved corrections?
            </p>
          )}
        </form>
        <DialogFooter className="mx-0 mb-0 border-t px-5 py-4">
          {discarding ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDiscarding(false)}
              >
                Keep editing
              </Button>
              <Button type="button" variant="destructive" onClick={close}>
                Discard changes
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={close}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="history-edit-form"
                disabled={saving || !dirty}
              >
                {saving && <Loader2 className="size-4 animate-spin" />}{' '}
                {saving ? 'Saving…' : 'Save corrections'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
