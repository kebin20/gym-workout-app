'use client';

import type { Dispatch, SetStateAction } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Medal,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/liftline-form-controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { defaultSessionPlan } from '@/lib/session-plan';
import type { TrainingDay } from '@/lib/routine';
import type { SessionExercise, WorkoutEntry } from '@/lib/workout-types';

const setNumbers = [1, 2, 3, 4, 5] as const;
function loggedSets(entry: WorkoutEntry) {
  return setNumbers.flatMap((set) => {
    const weight = entry[`set${set}Weight`];
    const reps = entry[`set${set}Reps`];
    if (reps == null) return [];
    return [{ set, weight, reps }];
  });
}

type ProgramEditorDialogProps = {
  programOpen: boolean;
  programSaving: boolean;
  setProgramOpen: (open: boolean) => void;
  activeDisplayWeek: number;
  activeDay: TrainingDay;
  activeWeek: number;
  programDraft: SessionExercise[];
  entries: WorkoutEntry[];
  setProgramDraft: Dispatch<SetStateAction<SessionExercise[]>>;
  moveProgramExercise: (index: number, direction: -1 | 1) => void;
  addProgramExercise: () => void;
  saveProgram: () => void;
};

export function ProgramEditorDialog({
  programOpen,
  programSaving,
  setProgramOpen,
  activeDisplayWeek,
  activeDay,
  activeWeek,
  programDraft,
  entries,
  setProgramDraft,
  moveProgramExercise,
  addProgramExercise,
  saveProgram,
}: ProgramEditorDialogProps) {
  return (
    <Dialog
      open={programOpen}
      onOpenChange={(open) => {
        if (!programSaving) setProgramOpen(open);
      }}
    >
      <DialogContent className="h-[calc(100dvh-1.5rem)] max-h-[820px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2 font-sans text-lg font-semibold">
            <Settings2 className="size-5 text-primary" /> Edit Week{' '}
            {activeDisplayWeek} · Day {activeDay}
          </DialogTitle>
          <DialogDescription className="font-sans">
            Reorder, substitute, skip, or add exercises for this session only.
            Your base programme stays unchanged.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto px-5 pb-3">
          {programDraft.map((item, index) => {
            const hasCompletedRecord = entries.some(
              (entry) =>
                entry.completed &&
                entry.week === activeWeek &&
                entry.day === activeDay &&
                entry.exerciseOrder === item.exerciseOrder,
            );
            return (
              <div
                key={item.exerciseOrder}
                className={`rounded-xl border p-3 ${item.skipped ? 'bg-muted/45 opacity-70' : 'bg-card'}`}
              >
                <div className="flex items-start gap-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary font-sans text-xs font-bold">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      value={item.name}
                      aria-label={`Exercise ${index + 1} name`}
                      onChange={(event) =>
                        setProgramDraft((current) =>
                          current.map((exercise) =>
                            exercise.exerciseOrder === item.exerciseOrder
                              ? { ...exercise, name: event.target.value }
                              : exercise,
                          ),
                        )
                      }
                      className="h-9 font-sans font-semibold"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <label
                        htmlFor={`program-sets-${item.exerciseOrder}`}
                        className="font-sans text-[11px] text-muted-foreground"
                      >
                        Sets
                        <Input
                          id={`program-sets-${item.exerciseOrder}`}
                          type="number"
                          min="1"
                          max="5"
                          value={item.targetSets}
                          onChange={(event) =>
                            setProgramDraft((current) =>
                              current.map((exercise) =>
                                exercise.exerciseOrder === item.exerciseOrder
                                  ? {
                                      ...exercise,
                                      targetSets: Math.min(
                                        5,
                                        Math.max(
                                          1,
                                          Number(event.target.value) || 1,
                                        ),
                                      ),
                                    }
                                  : exercise,
                              ),
                            )
                          }
                          className="mt-1 h-8"
                        />
                      </label>
                      <label
                        htmlFor={`program-reps-${item.exerciseOrder}`}
                        className="font-sans text-[11px] text-muted-foreground"
                      >
                        Rep range
                        <Input
                          id={`program-reps-${item.exerciseOrder}`}
                          value={item.repRange}
                          onChange={(event) =>
                            setProgramDraft((current) =>
                              current.map((exercise) =>
                                exercise.exerciseOrder === item.exerciseOrder
                                  ? {
                                      ...exercise,
                                      repRange: event.target.value,
                                    }
                                  : exercise,
                              ),
                            )
                          }
                          className="mt-1 h-8"
                        />
                      </label>
                      <label
                        htmlFor={`program-rest-${item.exerciseOrder}`}
                        className="font-sans text-[11px] text-muted-foreground"
                      >
                        Rest
                        <Input
                          id={`program-rest-${item.exerciseOrder}`}
                          value={item.rest}
                          onChange={(event) =>
                            setProgramDraft((current) =>
                              current.map((exercise) =>
                                exercise.exerciseOrder === item.exerciseOrder
                                  ? {
                                      ...exercise,
                                      rest: event.target.value,
                                    }
                                  : exercise,
                              ),
                            )
                          }
                          className="mt-1 h-8"
                        />
                      </label>
                    </div>
                    <label className="flex items-center gap-2 font-sans text-xs font-medium">
                      <Checkbox
                        checked={Boolean(item.skipped)}
                        onCheckedChange={(checked) =>
                          setProgramDraft((current) =>
                            current.map((exercise) =>
                              exercise.exerciseOrder === item.exerciseOrder
                                ? {
                                    ...exercise,
                                    skipped: checked === true,
                                  }
                                : exercise,
                            ),
                          )
                        }
                      />{' '}
                      Skip this session
                    </label>
                  </div>
                  <div className="grid shrink-0 gap-1">
                    <Button
                      variant="outline"
                      size="icon-xs"
                      aria-label={`Move ${item.name} up`}
                      disabled={index === 0}
                      onClick={() => moveProgramExercise(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-xs"
                      aria-label={`Move ${item.name} down`}
                      disabled={index === programDraft.length - 1}
                      onClick={() => moveProgramExercise(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    {Boolean(item.custom) && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove ${item.name}`}
                        disabled={hasCompletedRecord}
                        onClick={() =>
                          setProgramDraft((current) =>
                            current
                              .filter(
                                (exercise) =>
                                  exercise.exerciseOrder !== item.exerciseOrder,
                              )
                              .map((exercise, exerciseIndex) => ({
                                ...exercise,
                                displayOrder: exerciseIndex + 1,
                              })),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <Button
            variant="outline"
            className="w-full"
            disabled={programDraft.length >= 10}
            onClick={addProgramExercise}
          >
            <Plus /> Add exercise
          </Button>
        </div>
        <DialogFooter className="m-0 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            variant="ghost"
            onClick={() =>
              setProgramDraft(defaultSessionPlan(activeWeek, activeDay))
            }
            disabled={programSaving}
          >
            <RotateCcw /> Reset Day {activeDay}
          </Button>
          <Button
            variant="outline"
            onClick={() => setProgramOpen(false)}
            disabled={programSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={saveProgram}
            disabled={programSaving || programDraft.length === 0}
          >
            {programSaving ? <Loader2 className="animate-spin" /> : <Check />}{' '}
            Save session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SessionSummaryDialogProps = {
  sessionSummaryOpen: boolean;
  setSessionSummaryOpen: (open: boolean) => void;
  closeSessionSummary: () => void;
  sessionCelebrationPending: boolean;
  activeDay: TrainingDay;
  activePhase: number;
  activeDisplayWeek: number;
  activeWeek: number;
  phaseTwoUnlocked: boolean;
  currentSessionEntries: WorkoutEntry[];
  currentSessionSets: number;
  currentSessionVolume: number;
  currentSessionRecords: number;
  sessionDurationMinutes: number | null;
  previousSessionVolume: number;
};

export function SessionSummaryDialog({
  sessionSummaryOpen,
  setSessionSummaryOpen,
  closeSessionSummary,
  sessionCelebrationPending,
  activeDay,
  activePhase,
  activeDisplayWeek,
  activeWeek,
  phaseTwoUnlocked,
  currentSessionEntries,
  currentSessionSets,
  currentSessionVolume,
  currentSessionRecords,
  sessionDurationMinutes,
  previousSessionVolume,
}: SessionSummaryDialogProps) {
  return (
    <Dialog
      open={sessionSummaryOpen}
      onOpenChange={(open) => {
        if (open) setSessionSummaryOpen(true);
        else closeSessionSummary();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          {sessionCelebrationPending && (
            <div className="mx-auto mb-2 grid size-16 place-items-center rounded-2xl bg-success-soft text-success ring-8 ring-success-soft/45">
              <CheckCircle2 className="size-8" />
            </div>
          )}
          <DialogTitle
            className={`flex items-center gap-2 font-sans text-xl ${sessionCelebrationPending ? 'justify-center text-center' : ''}`}
          >
            {sessionCelebrationPending ? (
              `Day ${activeDay} complete!`
            ) : (
              <>
                <Sparkles className="size-5 text-primary" /> Phase {activePhase}{' '}
                · Week {activeDisplayWeek} · Day {activeDay}
              </>
            )}
          </DialogTitle>
          <DialogDescription
            className={`font-sans ${sessionCelebrationPending ? 'text-center' : ''}`}
          >
            {sessionCelebrationPending
              ? `Day ${activeDay} is done. Great work—here is your session at a glance.`
              : 'Your current session at a glance.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['Exercises', String(currentSessionEntries.length)],
            ['Working sets', String(currentSessionSets)],
            [
              'Total volume',
              `${Math.round(currentSessionVolume).toLocaleString()} kg`,
            ],
            ['Personal records', String(currentSessionRecords)],
            [
              'Duration',
              sessionDurationMinutes
                ? `${sessionDurationMinutes} min`
                : 'Not available',
            ],
            [
              'Vs previous Day',
              previousSessionVolume > 0
                ? `${currentSessionVolume >= previousSessionVolume ? '+' : ''}${Math.round(((currentSessionVolume - previousSessionVolume) / previousSessionVolume) * 100)}% volume`
                : 'First comparison',
            ],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-secondary/65 p-3">
              <p className="font-sans text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 font-sans text-lg font-bold tabular-nums">
                {value}
              </p>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {[...currentSessionEntries]
            .sort((left, right) => left.exerciseOrder - right.exerciseOrder)
            .map((entry) => (
              <div
                key={entry.exerciseOrder}
                className="rounded-xl border border-border/75 p-3"
              >
                <p className="font-sans text-sm font-semibold">
                  {entry.exercise}
                </p>
                <p className="mt-1 font-sans text-xs text-muted-foreground">
                  {loggedSets(entry)
                    .map((set) =>
                      set.weight == null
                        ? `${set.reps} reps`
                        : `${set.weight} kg × ${set.reps}`,
                    )
                    .join(' · ')}
                </p>
              </div>
            ))}
        </div>
        <DialogFooter>
          <Button onClick={closeSessionSummary}>
            {sessionCelebrationPending
              ? activeDay === 'A'
                ? 'Continue to Day B'
                : activeDay === 'B'
                  ? 'Continue to Day C'
                  : activeWeek === 12 && phaseTwoUnlocked
                    ? 'Start Phase 2'
                    : activeWeek < 24 && activeWeek !== 12
                      ? 'Continue to next week'
                      : activeWeek === 24
                        ? 'Finish programme'
                        : 'Done'
              : 'Done'}
            {sessionCelebrationPending &&
              activeWeek < 24 &&
              (activeWeek !== 12 || phaseTwoUnlocked) && (
                <ChevronRight data-icon="inline-end" />
              )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PersonalRecordDialogProps = {
  personalRecordOpen: boolean;
  setPersonalRecordOpen: (open: boolean) => void;
  closePersonalRecord: () => void;
  exerciseName: string;
  personalRecords: string[];
};

export function PersonalRecordDialog({
  personalRecordOpen,
  setPersonalRecordOpen,
  closePersonalRecord,
  exerciseName,
  personalRecords,
}: PersonalRecordDialogProps) {
  return (
    <Dialog
      open={personalRecordOpen}
      onOpenChange={(open) => {
        if (open) setPersonalRecordOpen(true);
        else closePersonalRecord();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 grid size-14 place-items-center rounded-2xl bg-warning-soft text-warning-foreground">
            <Medal className="size-7" />
          </div>
          <DialogTitle className="text-center font-sans text-xl">
            New personal record
          </DialogTitle>
          <DialogDescription className="text-center font-sans">
            A stronger entry for {exerciseName}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap justify-center gap-2">
          {personalRecords.map((record) => (
            <Badge
              key={record}
              className="bg-warning-soft font-sans text-warning-foreground"
            >
              {record}
            </Badge>
          ))}
        </div>
        <DialogFooter>
          <Button className="w-full" onClick={closePersonalRecord}>
            Keep going
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
