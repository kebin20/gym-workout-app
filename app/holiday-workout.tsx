'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Backpack,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Dumbbell,
  History,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TreePalm,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  HolidayMetric,
  HolidaySessionType,
  HolidayWorkoutEntry,
} from '@/lib/holiday-workout-types';

type HolidayExercise = {
  order: number;
  name: string;
  target: string;
  metric: HolidayMetric;
  muscles: string;
  cue: string;
  targetSets: number;
};

type HolidayDraft = {
  sets: { weight: string; value: string }[];
  setCount: number;
  rir: string;
  notes: string;
};

const activeSessionKey = 'liftline.holiday-active-session.v1';

const holidayPlans: Record<HolidaySessionType, HolidayExercise[]> = {
  A: [
    {
      order: 1,
      name: 'Bulgarian Split Squat',
      target: '3 × 8–15 / leg',
      metric: 'reps',
      muscles: 'Quads / glutes',
      cue: 'Use a loaded backpack, a 3-second lowering phase, or a pause to progress.',
      targetSets: 3,
    },
    {
      order: 2,
      name: 'Push-Ups',
      target: '3 × 8–20',
      metric: 'reps',
      muscles: 'Chest / triceps / front delts',
      cue: 'Elevate your feet or add a backpack; elevate your hands if you need a regression.',
      targetSets: 3,
    },
    {
      order: 3,
      name: 'Backpack or Resistance-Band Row',
      target: '3 × 10–20',
      metric: 'reps',
      muscles: 'Upper back / lats / biceps',
      cue: 'Anchor only to something designed to hold your load—never unstable doors or furniture.',
      targetSets: 3,
    },
    {
      order: 4,
      name: 'Single-Leg Romanian Deadlift',
      target: '3 × 10–15 / leg',
      metric: 'reps',
      muscles: 'Hamstrings / glutes / trunk',
      cue: 'Use a backpack or suitcase and keep the lowering phase controlled.',
      targetSets: 3,
    },
    {
      order: 5,
      name: 'Pike Push-Up',
      target: '2–3 × 6–15',
      metric: 'reps',
      muscles: 'Shoulders / triceps',
      cue: 'Keep your hips high and lower your head forward between your hands.',
      targetSets: 3,
    },
    {
      order: 6,
      name: 'Single-Leg Hip Thrust or Glute Bridge',
      target: '2 × 10–20 / leg',
      metric: 'reps',
      muscles: 'Glutes / hamstrings',
      cue: 'Pause briefly at the top without overextending your lower back.',
      targetSets: 2,
    },
    {
      order: 7,
      name: 'Reverse Snow Angel or Prone Y-T-W',
      target: '2 × 12–20',
      metric: 'reps',
      muscles: 'Rear delts / upper back',
      cue: 'Move slowly and keep your shoulders away from your ears.',
      targetSets: 2,
    },
    {
      order: 8,
      name: 'Plank or Side Plank',
      target: '2 × 30–60 sec',
      metric: 'seconds',
      muscles: 'Core',
      cue: 'Keep ribs down and finish the set before your position changes.',
      targetSets: 2,
    },
  ],
  B: [
    {
      order: 1,
      name: 'Reverse Lunge',
      target: '3 × 10–15 / leg',
      metric: 'reps',
      muscles: 'Quads / glutes',
      cue: 'Add a backpack or slow the lowering phase when bodyweight feels easy.',
      targetSets: 3,
    },
    {
      order: 2,
      name: 'Feet-Elevated or Standard Push-Up',
      target: '3 × 8–20',
      metric: 'reps',
      muscles: 'Chest / triceps / front delts',
      cue: 'Choose the version that leaves about 1–3 good reps in reserve.',
      targetSets: 3,
    },
    {
      order: 3,
      name: 'Backpack or Resistance-Band Row',
      target: '3 × 10–20',
      metric: 'reps',
      muscles: 'Upper back / lats / biceps',
      cue: 'Anchor only to something designed to hold your load—never unstable doors or furniture.',
      targetSets: 3,
    },
    {
      order: 4,
      name: 'Single-Leg Romanian Deadlift',
      target: '3 × 10–15 / leg',
      metric: 'reps',
      muscles: 'Hamstrings / glutes / trunk',
      cue: 'Reach your free leg back and keep your hips square to the floor.',
      targetSets: 3,
    },
    {
      order: 5,
      name: 'Pike Push-Up',
      target: '2–3 × 6–15',
      metric: 'reps',
      muscles: 'Shoulders / triceps',
      cue: 'Use a controlled range you can repeat without losing your shoulder position.',
      targetSets: 3,
    },
    {
      order: 6,
      name: 'Single-Leg Glute Bridge',
      target: '2 × 12–20 / leg',
      metric: 'reps',
      muscles: 'Glutes / hamstrings',
      cue: 'Drive through the planted foot and pause at full hip extension.',
      targetSets: 2,
    },
    {
      order: 7,
      name: 'Reverse Snow Angel or Prone Y-T-W',
      target: '2 × 12–20',
      metric: 'reps',
      muscles: 'Rear delts / upper back',
      cue: 'Use a smooth tempo and stop before your neck starts taking over.',
      targetSets: 2,
    },
    {
      order: 8,
      name: 'Side Plank',
      target: '2 × 30–60 sec / side',
      metric: 'seconds',
      muscles: 'Core',
      cue: 'Stack your shoulders and hips, and keep a straight line from head to heels.',
      targetSets: 2,
    },
  ],
};

function blankDraft(exercise: HolidayExercise): HolidayDraft {
  return {
    sets: Array.from({ length: 5 }, () => ({ weight: '', value: '' })),
    setCount: exercise.targetSets,
    rir: '',
    notes: '',
  };
}

function tokyoDate() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .filter((part) => ['year', 'month', 'day'].includes(part.type))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function newSessionId() {
  const random = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  return `holiday-${Date.now().toString(36)}-${random}`;
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function draftFromEntry(entry: HolidayWorkoutEntry, exercise: HolidayExercise) {
  const draft = blankDraft(exercise);
  for (let index = 0; index < 5; index += 1) {
    const set = index + 1;
    const weight = entry[`set${set}Weight` as keyof HolidayWorkoutEntry];
    const value = entry[`set${set}Value` as keyof HolidayWorkoutEntry];
    draft.sets[index] = {
      weight: typeof weight === 'number' ? String(weight) : '',
      value: typeof value === 'number' ? String(value) : '',
    };
  }
  draft.setCount = entry.setCount;
  draft.rir = entry.rir === null ? '' : String(entry.rir);
  draft.notes = entry.notes ?? '';
  return draft;
}

export default function HolidayWorkout({
  appVersion,
  isOnline,
  onExit,
}: {
  appVersion: string;
  isOnline: boolean;
  onExit: () => void;
}) {
  const [entries, setEntries] = useState<HolidayWorkoutEntry[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [sessionDate, setSessionDate] = useState(tokyoDate);
  const [sessionType, setSessionType] = useState<HolidaySessionType>('A');
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [draft, setDraft] = useState(() => blankDraft(holidayPlans.A[0]));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [completeOpen, setCompleteOpen] = useState(false);

  const plan = holidayPlans[sessionType];
  const exercise = plan[exerciseIndex] ?? plan[0];
  const sessionEntries = entries.filter(
    (entry) => entry.sessionId === sessionId,
  );
  const completedCount = sessionEntries.filter(
    (entry) => entry.completed,
  ).length;
  const currentEntry = sessionEntries.find(
    (entry) => entry.exerciseOrder === exercise.order,
  );
  const hasSessionData = sessionEntries.length > 0;

  const previousEntry = useMemo(
    () =>
      entries.find(
        (entry) =>
          entry.sessionId !== sessionId &&
          entry.completed &&
          entry.exercise === exercise.name,
      ),
    [entries, exercise.name, sessionId],
  );

  const recentSessions = useMemo(() => {
    const grouped = new Map<
      string,
      { id: string; date: string; type: HolidaySessionType; completed: number }
    >();
    entries.forEach((entry) => {
      const current = grouped.get(entry.sessionId) ?? {
        id: entry.sessionId,
        date: entry.sessionDate,
        type: entry.sessionType,
        completed: 0,
      };
      if (entry.completed) current.completed += 1;
      grouped.set(entry.sessionId, current);
    });
    return [...grouped.values()]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, 4);
  }, [entries]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/holiday-workouts', { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as {
          entries?: HolidayWorkoutEntry[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(data.error ?? 'Unable to load holiday workouts.');
        if (cancelled) return;
        const loaded = (data.entries ?? []).map((entry) => ({
          ...entry,
          completed: Boolean(entry.completed),
        }));
        setEntries(loaded);

        const cached = window.localStorage.getItem(activeSessionKey);
        if (cached) {
          try {
            const saved = JSON.parse(cached) as {
              sessionId?: string;
              sessionDate?: string;
              sessionType?: HolidaySessionType;
            };
            if (saved.sessionId && saved.sessionDate && saved.sessionType) {
              setSessionId(saved.sessionId);
              setSessionDate(saved.sessionDate);
              setSessionType(saved.sessionType);
              return;
            }
          } catch {
            // A malformed local preference is replaced below.
          }
        }

        const partial = loaded.find((candidate) => {
          const sameSession = loaded.filter(
            (entry) => entry.sessionId === candidate.sessionId,
          );
          return sameSession.filter((entry) => entry.completed).length < 8;
        });
        const latestType = loaded[0]?.sessionType;
        const nextType: HolidaySessionType = latestType === 'A' ? 'B' : 'A';
        const next = partial
          ? {
              sessionId: partial.sessionId,
              sessionDate: partial.sessionDate,
              sessionType: partial.sessionType,
            }
          : {
              sessionId: newSessionId(),
              sessionDate: tokyoDate(),
              sessionType: nextType,
            };
        setSessionId(next.sessionId);
        setSessionDate(next.sessionDate);
        setSessionType(next.sessionType);
        window.localStorage.setItem(activeSessionKey, JSON.stringify(next));
      })
      .catch((loadError: Error) => setError(loadError.message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    window.localStorage.setItem(
      activeSessionKey,
      JSON.stringify({ sessionId, sessionDate, sessionType }),
    );
  }, [sessionDate, sessionId, sessionType]);

  useEffect(() => {
    const entry = entries.find(
      (candidate) =>
        candidate.sessionId === sessionId &&
        candidate.exerciseOrder === exercise.order,
    );
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled)
        setDraft(
          entry ? draftFromEntry(entry, exercise) : blankDraft(exercise),
        );
    });
    return () => {
      cancelled = true;
    };
  }, [entries, exercise, sessionId]);

  function startNewSession(type: HolidaySessionType) {
    const next = {
      sessionId: newSessionId(),
      sessionDate: tokyoDate(),
      sessionType: type,
    };
    setSessionId(next.sessionId);
    setSessionDate(next.sessionDate);
    setSessionType(next.sessionType);
    setExerciseIndex(0);
    setDraft(blankDraft(holidayPlans[type][0]));
    setError('');
    setNotice(`Holiday Session ${type} is ready.`);
  }

  function switchSessionType(type: HolidaySessionType) {
    if (type === sessionType) return;
    if (hasSessionData) {
      setNotice('Start a new session to switch between Holiday A and B.');
      return;
    }
    setSessionType(type);
    setExerciseIndex(0);
  }

  function updateSet(index: number, field: 'weight' | 'value', value: string) {
    setDraft((current) => ({
      ...current,
      sets: current.sets.map((set, setIndex) =>
        setIndex === index ? { ...set, [field]: value } : set,
      ),
    }));
  }

  async function saveExercise() {
    const activeSets = draft.sets.slice(0, draft.setCount);
    if (activeSets.some((set) => !numberOrNull(set.value))) {
      setError(
        `Enter ${exercise.metric === 'seconds' ? 'seconds' : 'reps'} for each active set.`,
      );
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    const now = new Date().toISOString();
    const payload = {
      sessionId,
      sessionDate,
      sessionType,
      exerciseOrder: exercise.order,
      exercise: exercise.name,
      target: exercise.target,
      metric: exercise.metric,
      set1Weight: numberOrNull(draft.sets[0].weight),
      set1Value: numberOrNull(draft.sets[0].value),
      set2Weight: numberOrNull(draft.sets[1].weight),
      set2Value: numberOrNull(draft.sets[1].value),
      set3Weight: numberOrNull(draft.sets[2].weight),
      set3Value: numberOrNull(draft.sets[2].value),
      set4Weight: numberOrNull(draft.sets[3].weight),
      set4Value: numberOrNull(draft.sets[3].value),
      set5Weight: numberOrNull(draft.sets[4].weight),
      set5Value: numberOrNull(draft.sets[4].value),
      setCount: draft.setCount,
      rir: numberOrNull(draft.rir),
      notes: draft.notes,
      completed: true,
      completedAt: now,
      clientUpdatedAt: now,
    };

    try {
      const response = await fetch('/api/holiday-workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        entry?: HolidayWorkoutEntry;
        sheetSyncQueued?: boolean;
        error?: string;
      };
      if (!response.ok || !data.entry)
        throw new Error(data.error ?? 'Unable to save this exercise.');
      const saved = { ...data.entry, completed: Boolean(data.entry.completed) };
      setEntries((current) => [
        saved,
        ...current.filter(
          (entry) =>
            !(
              entry.sessionId === saved.sessionId &&
              entry.exerciseOrder === saved.exerciseOrder
            ),
        ),
      ]);

      const willComplete =
        completedCount + (currentEntry?.completed ? 0 : 1) >= plan.length;
      if (willComplete) {
        setCompleteOpen(true);
      } else {
        setExerciseIndex((index) => (index + 1) % plan.length);
        setNotice(
          `${exercise.name} saved${data.sheetSyncQueued ? ' · Holiday Log sync queued' : ''}.`,
        );
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to save this exercise.',
      );
    } finally {
      setSaving(false);
    }
  }

  function moveExercise(direction: -1 | 1) {
    setExerciseIndex(
      (index) => (index + direction + plan.length) % plan.length,
    );
    setError('');
    setNotice('');
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ecfdf8_0%,#f8faf7_44%,#fff8eb_100%)] pb-16 font-sans text-[#153b39]">
      <header className="sticky top-0 z-30 border-b border-teal-900/10 bg-white/92 backdrop-blur">
        <div className="mx-auto flex min-h-18 max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onExit}
            className="flex min-w-0 items-center gap-3 text-left"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(145deg,#0f766e_0%,#0d9488_62%,#f59e0b_140%)] text-white shadow-sm shadow-teal-900/20">
              <TreePalm className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold tracking-tight">
                Liftline Holiday
              </span>
              <span className="flex items-center gap-1.5 truncate text-xs text-teal-700">
                <span
                  className={`size-1.5 rounded-full ${isOnline ? 'bg-emerald-600' : 'bg-amber-500'}`}
                />
                {isOnline ? 'Holiday records saved' : 'Offline'}
              </span>
            </span>
          </button>
          <Button
            type="button"
            variant="outline"
            onClick={onExit}
            className="shrink-0 border-teal-800/20 bg-white text-teal-900 hover:bg-teal-50"
          >
            <ArrowLeft /> <span className="hidden sm:inline">Main plan</span>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6 md:py-8">
        {(error || notice) && (
          <Alert
            className={
              error
                ? 'border-red-300 bg-red-50 text-red-800'
                : 'border-teal-200 bg-teal-50 text-teal-800'
            }
          >
            {error ? <CircleAlert /> : <CheckCircle2 />}
            <AlertTitle>{error ? 'Check this exercise' : 'All set'}</AlertTitle>
            <AlertDescription>{error || notice}</AlertDescription>
          </Alert>
        )}

        <section className="overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#064e3b_0%,#0f766e_52%,#0d9488_100%)] p-5 text-white shadow-lg shadow-teal-900/15 sm:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <Badge className="border-white/15 bg-white/12 text-white">
                <TreePalm /> Holiday mode
              </Badge>
              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Keep the habit. Enjoy the trip.
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-teal-50/90 sm:text-base">
                A compact 25–35 minute maintenance session. Stay around 1–3 reps
                in reserve and make each movement harder before adding endless
                reps.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-black/12 p-2 md:w-72">
              {(['A', 'B'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => switchSessionType(type)}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    sessionType === type
                      ? 'bg-white text-teal-900 shadow-sm'
                      : 'text-white hover:bg-white/10'
                  }`}
                >
                  Session {type}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <section className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">
                  {displayDate(sessionDate)} · Session {sessionType}
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight">
                  {exercise.name}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Previous holiday exercise"
                  onClick={() => moveExercise(-1)}
                  className="border-teal-900/15 bg-white"
                >
                  <ChevronLeft />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Next holiday exercise"
                  onClick={() => moveExercise(1)}
                  className="border-teal-900/15 bg-white"
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>

            <Card className="overflow-hidden border-teal-900/15 bg-white/95 shadow-sm">
              <CardHeader className="border-b border-teal-900/10 bg-teal-50/60">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-teal-100 text-teal-800">
                    {exerciseIndex + 1} of {plan.length}
                  </Badge>
                  <Badge variant="outline" className="border-teal-800/20">
                    {exercise.target}
                  </Badge>
                  {currentEntry?.completed && (
                    <Badge className="bg-emerald-100 text-emerald-800">
                      <Check /> Logged
                    </Badge>
                  )}
                </div>
                <CardDescription className="mt-2 text-[#52706e]">
                  {exercise.muscles} · {exercise.cue}
                </CardDescription>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-teal-100">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e,#14b8a6)] transition-[width]"
                    style={{
                      width: `${(completedCount / plan.length) * 100}%`,
                    }}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-5 p-4 sm:p-6">
                {previousEntry && (
                  <div className="rounded-2xl border border-teal-900/10 bg-[#f0faf7] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-2 font-semibold">
                        <History className="size-4 text-teal-700" /> Previous
                        holiday session
                      </p>
                      <span className="text-xs text-[#52706e]">
                        {displayDate(previousEntry.sessionDate)} ·{' '}
                        {previousEntry.sessionType}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Array.from(
                        { length: previousEntry.setCount },
                        (_, index) => {
                          const set = index + 1;
                          const weight =
                            previousEntry[
                              `set${set}Weight` as keyof HolidayWorkoutEntry
                            ];
                          const value =
                            previousEntry[
                              `set${set}Value` as keyof HolidayWorkoutEntry
                            ];
                          return (
                            <span
                              key={set}
                              className="rounded-full bg-white px-3 py-1 text-xs ring-1 ring-teal-900/10"
                            >
                              Set {set}:{' '}
                              {typeof weight === 'number' && weight > 0
                                ? `${weight} kg · `
                                : ''}
                              {String(value)}{' '}
                              {previousEntry.metric === 'seconds'
                                ? 'sec'
                                : 'reps'}
                            </span>
                          );
                        },
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-1 text-xs font-bold uppercase tracking-wide text-[#627977]">
                    <span>Set</span>
                    <span>Load kg (optional)</span>
                    <span>
                      {exercise.metric === 'seconds' ? 'Seconds' : 'Reps'}
                    </span>
                  </div>
                  {draft.sets.slice(0, draft.setCount).map((set, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2"
                    >
                      <span className="grid size-9 place-items-center rounded-full bg-teal-50 text-sm font-bold text-teal-900">
                        {index + 1}
                      </span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.5"
                        value={set.weight}
                        aria-label={`Set ${index + 1} optional load in kilograms`}
                        onChange={(event) =>
                          updateSet(index, 'weight', event.target.value)
                        }
                        className="h-12 border-teal-900/15 bg-white text-center text-base font-semibold"
                      />
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={set.value}
                        aria-label={`Set ${index + 1} ${exercise.metric}`}
                        onChange={(event) =>
                          updateSet(index, 'value', event.target.value)
                        }
                        className="h-12 border-teal-900/15 bg-white text-center text-base font-semibold"
                      />
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={draft.setCount <= 1}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          setCount: Math.max(1, current.setCount - 1),
                        }))
                      }
                      className="border-teal-900/15 bg-white"
                    >
                      <Minus /> Remove set
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={draft.setCount >= 5}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          setCount: Math.min(5, current.setCount + 1),
                        }))
                      }
                      className="border-teal-900/15 bg-white"
                    >
                      <Plus /> Add set
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
                  <label
                    htmlFor="holiday-rir"
                    className="space-y-2 text-sm font-semibold"
                  >
                    Reps in reserve
                    <Input
                      id="holiday-rir"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="10"
                      value={draft.rir}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          rir: event.target.value,
                        }))
                      }
                      className="h-12 border-teal-900/15 bg-white text-center text-base"
                    />
                  </label>
                  <label
                    htmlFor="holiday-notes"
                    className="space-y-2 text-sm font-semibold"
                  >
                    Notes
                    <Textarea
                      id="holiday-notes"
                      value={draft.notes}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      placeholder="Equipment, variation, or how the set felt"
                      className="min-h-24 border-teal-900/15 bg-white"
                    />
                  </label>
                </div>

                <Button
                  type="button"
                  disabled={saving || loading || !sessionId}
                  onClick={saveExercise}
                  className="h-12 w-full bg-teal-700 text-white shadow-md shadow-teal-900/15 hover:bg-teal-800"
                >
                  {saving ? <Loader2 className="animate-spin" /> : <Check />}
                  {currentEntry?.completed
                    ? 'Update & continue'
                    : 'Save & continue'}
                </Button>
              </CardContent>
            </Card>
          </section>

          <aside className="space-y-4">
            <Card className="border-amber-800/15 bg-[#fff8e8]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-[#63440d]">
                  <Backpack className="size-5" /> Travel rhythm
                </CardTitle>
                <CardDescription className="text-[#7c6335]">
                  Maintenance and continuity—not exhaustion.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-relaxed text-[#6f562d]">
                <p>
                  <strong>3–7 days:</strong> zero to two sessions. Do not make
                  up missed workouts.
                </p>
                <p>
                  <strong>1–2 weeks:</strong> aim for about two sessions each
                  week.
                </p>
                <p>
                  <strong>2+ weeks:</strong> two to three sessions per week,
                  with recovery days.
                </p>
              </CardContent>
            </Card>

            <Card className="border-teal-900/15 bg-white/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="size-5 text-teal-700" /> Count the
                  trip
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm leading-relaxed text-[#52706e]">
                <p>Walking, hiking, running, swimming, and sport all count.</p>
                <p>Reduce or skip leg work before demanding outdoor days.</p>
                <p>
                  A resistance band is the most useful optional item to pack.
                </p>
              </CardContent>
            </Card>

            <Card className="border-teal-900/15 bg-white/90">
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Holiday history</CardTitle>
                  <CardDescription>Recent sessions</CardDescription>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Start a new holiday session"
                  onClick={() =>
                    startNewSession(sessionType === 'A' ? 'B' : 'A')
                  }
                  className="border-teal-900/15"
                >
                  <RotateCcw />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {loading ? (
                  <p className="flex items-center gap-2 text-sm text-[#52706e]">
                    <Loader2 className="size-4 animate-spin" /> Loading history
                  </p>
                ) : recentSessions.length === 0 ? (
                  <p className="text-sm text-[#52706e]">
                    Your first holiday session will appear here.
                  </p>
                ) : (
                  recentSessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => {
                        setSessionId(session.id);
                        setSessionDate(session.date);
                        setSessionType(session.type);
                        setExerciseIndex(0);
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-teal-900/10 bg-teal-50/50 px-3 py-2 text-left text-sm hover:bg-teal-50"
                    >
                      <span>
                        <strong>Session {session.type}</strong>
                        <span className="block text-xs text-[#52706e]">
                          {displayDate(session.date)}
                        </span>
                      </span>
                      <span className="font-semibold text-teal-700">
                        {session.completed}/8
                      </span>
                    </button>
                  ))
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    startNewSession(sessionType === 'A' ? 'B' : 'A')
                  }
                  className="mt-2 w-full border-teal-900/15 bg-white"
                >
                  <Plus /> New Session {sessionType === 'A' ? 'B' : 'A'}
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      <footer className="mx-auto max-w-6xl px-4 text-center text-xs text-[#6c8582] sm:px-6">
        Liftline v{appVersion} · Holiday mode
      </footer>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="border-teal-900/15 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl">
              <span className="grid size-10 place-items-center rounded-xl bg-teal-100 text-teal-800">
                <Sparkles className="size-5" />
              </span>
              Holiday workout complete
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              Session {sessionType} is logged. You kept the training habit
              moving without letting it take over the trip.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl bg-teal-50 p-4 text-sm text-teal-900">
            <p className="font-semibold">A good next step</p>
            <p className="mt-1 text-[#52706e]">
              Take a recovery day, count your walking and activities, then use
              Session {sessionType === 'A' ? 'B' : 'A'} next.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onExit}>
              <Dumbbell /> Main plan
            </Button>
            <Button
              type="button"
              onClick={() => {
                setCompleteOpen(false);
                startNewSession(sessionType === 'A' ? 'B' : 'A');
              }}
              className="bg-teal-700 text-white hover:bg-teal-800"
            >
              New Session {sessionType === 'A' ? 'B' : 'A'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
