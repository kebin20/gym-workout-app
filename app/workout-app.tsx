'use client';

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  Clock3,
  Cloud,
  CloudOff,
  Copy,
  Download,
  Dumbbell,
  FileSpreadsheet,
  History,
  Home,
  ImageOff,
  Loader2,
  Medal,
  Minus,
  NotebookPen,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  Trash2,
  TrendingUp,
  Upload,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Checkbox } from '@/components/ui/checkbox';
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
import { exerciseDemoFor, exerciseDemoSource } from '@/lib/exercise-demos';
import {
  days,
  routine,
  targetLabel,
  workingSetsForWeek,
  type RoutineExercise,
  type TrainingDay,
} from '@/lib/routine';
import {
  defaultSessionPlan,
  planForSession,
  type PlannedExercise,
} from '@/lib/session-plan';
import {
  personalRecordsFor,
  totalPersonalRecords,
  workoutMetrics,
} from '@/lib/workout-metrics';
import type { SessionExercise, WorkoutEntry } from '@/lib/workout-types';

type View = 'today' | 'plan' | 'progress' | 'guide';

type Draft = {
  sets: { weight: string; reps: string; done: boolean }[];
  rir: string;
  notes: string;
};

type SheetSyncResult = {
  ok: boolean;
  configured: boolean;
  synced: number;
  message?: string;
  syncedAt?: string | null;
};

type WorkoutPayload = {
  week: number;
  day: TrainingDay;
  exerciseOrder: number;
  set1Weight: number | null;
  set1Reps: number | null;
  set2Weight: number | null;
  set2Reps: number | null;
  set3Weight: number | null;
  set3Reps: number | null;
  set4Weight: number | null;
  set4Reps: number | null;
  set5Weight: number | null;
  set5Reps: number | null;
  setCount: number;
  rir: number | null;
  notes: string;
  completed: boolean;
  completedAt: string;
  clientUpdatedAt: string;
};

type PendingWorkout = { key: string; payload: WorkoutPayload };

type BackupSummary = {
  workoutRecords: number;
  newWorkoutRecords: number;
  replacedWorkoutRecords: number;
  sessionChanges: number;
  newSessionChanges: number;
};

type SheetImportItem = {
  key: string;
  status: 'new' | 'unchanged' | 'protected';
  source: WorkoutEntry;
  liftlineUpdatedAt: string | null;
  sheetCompletedAt: string | null;
};

type SheetImportPreview = {
  ok: boolean;
  items: SheetImportItem[];
  summary: { new: number; unchanged: number; protected: number };
  message?: string;
};

const workoutCacheKey = 'liftline.workout-entries.v1';
const sessionExerciseCacheKey = 'liftline.session-exercises.v1';
const pendingWorkoutKey = 'liftline.pending-workouts.v1';
const setNumbers = [1, 2, 3, 4, 5] as const;

const emptyDraft: Draft = {
  sets: Array.from({ length: 5 }, () => ({
    weight: '',
    reps: '',
    done: false,
  })),
  rir: '',
  notes: '',
};

function normaliseWorkoutEntries(entries: WorkoutEntry[]) {
  return entries.map((entry) => ({
    ...entry,
    completed: Boolean(entry.completed),
  }));
}

function normaliseSessionExercises(exercises: SessionExercise[]) {
  return exercises.map((exercise) => ({
    ...exercise,
    skipped: Boolean(exercise.skipped),
    custom: Boolean(exercise.custom),
  }));
}

function readCachedWorkoutEntries(): WorkoutEntry[] | null {
  try {
    const cached = window.localStorage.getItem(workoutCacheKey);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as { entries?: WorkoutEntry[] };
    return Array.isArray(parsed.entries)
      ? normaliseWorkoutEntries(parsed.entries)
      : null;
  } catch {
    return null;
  }
}

function cacheWorkoutEntries(entries: WorkoutEntry[]) {
  try {
    window.localStorage.setItem(
      workoutCacheKey,
      JSON.stringify({ entries, cachedAt: Date.now() }),
    );
  } catch {
    // Device storage can be unavailable in private browsing. The server remains authoritative.
  }
}

function readCachedSessionExercises(): SessionExercise[] {
  try {
    const value = window.localStorage.getItem(sessionExerciseCacheKey);
    return value
      ? normaliseSessionExercises(JSON.parse(value) as SessionExercise[])
      : [];
  } catch {
    return [];
  }
}

function cacheSessionExercises(exercises: SessionExercise[]) {
  try {
    window.localStorage.setItem(
      sessionExerciseCacheKey,
      JSON.stringify(exercises),
    );
  } catch {
    /* Server data remains authoritative. */
  }
}

function readPendingWorkouts(): PendingWorkout[] {
  try {
    const value = window.localStorage.getItem(pendingWorkoutKey);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cachePendingWorkouts(queue: PendingWorkout[]) {
  try {
    window.localStorage.setItem(pendingWorkoutKey, JSON.stringify(queue));
  } catch {
    /* Best-effort offline queue. */
  }
}

function workoutKey(value: {
  week: number;
  day: TrainingDay;
  exerciseOrder: number;
}) {
  return `${value.week}|${value.day}|${value.exerciseOrder}`;
}

function optimisticEntry(
  payload: WorkoutPayload,
  exercise: PlannedExercise,
): WorkoutEntry {
  return {
    week: payload.week,
    day: payload.day,
    exerciseOrder: payload.exerciseOrder,
    exercise: exercise.name,
    target: targetLabel(exercise),
    set1Weight: payload.set1Weight,
    set1Reps: payload.set1Reps,
    set2Weight: payload.set2Weight,
    set2Reps: payload.set2Reps,
    set3Weight: payload.set3Weight,
    set3Reps: payload.set3Reps,
    set4Weight: payload.set4Weight,
    set4Reps: payload.set4Reps,
    set5Weight: payload.set5Weight,
    set5Reps: payload.set5Reps,
    setCount: payload.setCount,
    rir: payload.rir,
    notes: payload.notes,
    completed: payload.completed,
    completedAt: payload.completedAt,
    updatedAt: payload.clientUpdatedAt,
    syncStatus: exercise.custom ? 'not_applicable' : 'pending',
    sheetSyncedAt: null,
    syncError: null,
    offlinePending: true,
  };
}

function replaceWorkoutEntry(entries: WorkoutEntry[], saved: WorkoutEntry) {
  return [
    ...entries.filter((entry) => workoutKey(entry) !== workoutKey(saved)),
    saved,
  ];
}

const ProgressChart = lazy(() => import('./progress-chart'));
const ExerciseProgressChart = lazy(() => import('./exercise-progress-chart'));

const weekDates = [
  'Aug 26–Sep 1',
  'Sep 2–8',
  'Sep 9–15',
  'Sep 16–22',
  'Sep 23–29',
  'Sep 30–Oct 6',
  'Oct 7–13',
  'Oct 14–20',
  'Oct 21–27',
  'Oct 28–Nov 3',
  'Nov 4–10',
  'Nov 11–17',
];

const trainingTips = [
  {
    title: 'Ramp in gradually',
    body: 'Weeks 1–2 use two working sets for most exercises at RIR ~3. Weeks 3–4 build toward the full routine.',
  },
  {
    title: 'Make every rep repeatable',
    body: 'Use the same setup and range of motion on each rep. Consistency makes your progress easier to judge.',
  },
  {
    title: 'Rest with purpose',
    body: 'Take 2–3 minutes after demanding compound lifts. Shorter rests are usually enough for smaller isolation exercises.',
  },
  {
    title: 'Technique comes first',
    body: 'If your form changes noticeably, reduce the load or end the set. Clean repetitions are more valuable than forced ones.',
  },
  {
    title: 'Control the lowering phase',
    body: 'Lower the weight under control instead of letting it drop. Stay smooth, then drive through the working muscles.',
  },
  {
    title: 'Progress in small steps',
    body: 'Once you reach the top of the rep range with clean form and 1–2 RIR, add the smallest practical amount of weight.',
  },
  {
    title: 'Warm up specifically',
    body: 'Before your first major lift, perform a few lighter sets that gradually approach your working weight without causing fatigue.',
  },
  {
    title: 'Brace before you move',
    body: 'Take a breath and gently tighten your trunk before each demanding rep to create a stable base for the lift.',
  },
  {
    title: 'Recovery drives progress',
    body: 'Training provides the stimulus; sleep, food, hydration, and easier days give your body the chance to adapt.',
  },
  {
    title: 'Track more than load',
    body: 'Reps, RIR, range of motion, and technique all show progress—even when the weight on the machine stays the same.',
  },
  {
    title: 'Use pain as a stop signal',
    body: 'Muscle effort is expected, but sharp or unusual joint pain is not. Stop the movement and reassess your setup.',
  },
] as const;

function numberOrNull(value: string) {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function entryVolume(entry: WorkoutEntry) {
  return setNumbers.reduce((sum, set) => {
    const weight = entry[`set${set}Weight`];
    const reps = entry[`set${set}Reps`];
    return sum + (weight ?? 0) * (reps ?? 0);
  }, 0);
}

function draftFromEntry(entry?: WorkoutEntry): Draft {
  if (!entry) return structuredClone(emptyDraft);
  return {
    sets: setNumbers.map((set) => {
      const weight = entry[`set${set}Weight`];
      const reps = entry[`set${set}Reps`];
      return {
        weight: weight == null ? '' : String(weight),
        reps: reps == null ? '' : String(reps),
        done: reps != null,
      };
    }),
    rir: entry.rir == null ? '' : String(entry.rir),
    notes: entry.notes ?? '',
  };
}

function progressionAdvice(
  exercise: RoutineExercise,
  draft: Draft,
  activeSets: number,
) {
  const reps = draft.sets
    .slice(0, activeSets)
    .map((set) => numberOrNull(set.reps));
  if (reps.some((value) => value == null))
    return 'Complete the working sets for guidance';
  const rir = numberOrNull(draft.rir);
  if (rir == null) return 'Log RIR for progression guidance';
  const numbers = exercise.repRange.match(/\d+/g)?.map(Number) ?? [];
  const top = numbers[1] ?? numbers[0] ?? 0;
  if (reps.every((value) => (value ?? 0) >= top) && rir <= 2) {
    return exercise.name === 'Plank'
      ? 'Increase difficulty next time'
      : 'Increase load next time';
  }
  return exercise.name === 'Plank' ? 'Keep building' : 'Keep this load';
}

function sheetEntrySummary(entry: WorkoutEntry) {
  const unit = entry.exercise === 'Plank' ? 'sec' : 'reps';
  return ([1, 2, 3] as const)
    .flatMap((set) => {
      const weight = entry[`set${set}Weight`];
      const reps = entry[`set${set}Reps`];
      if (reps == null) return [];
      return [weight == null ? `${reps} ${unit}` : `${weight} kg × ${reps}`];
    })
    .join(' · ');
}

function formatWorkoutDate(value?: string | null) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function loggedSets(entry: WorkoutEntry) {
  return setNumbers.flatMap((set) => {
    const weight = entry[`set${set}Weight`];
    const reps = entry[`set${set}Reps`];
    if (reps == null) return [];
    return [{ set, weight, reps }];
  });
}

function visibleSetsForEntry(
  entry: WorkoutEntry | undefined,
  fallback: number,
) {
  if (entry?.setCount != null && Number.isInteger(entry.setCount))
    return Math.min(5, Math.max(1, entry.setCount));
  const highestLoggedSet = entry
    ? setNumbers.reduce(
        (highest, set) => (entry[`set${set}Reps`] == null ? highest : set),
        0,
      )
    : 0;
  return Math.min(5, Math.max(1, fallback, highestLoggedSet));
}

function recommendedRestSeconds(rest: string) {
  const values = rest.match(/\d+/g)?.map(Number) ?? [60];
  const longest = values.at(-1) ?? 60;
  return rest.includes('min') ? longest * 60 : longest;
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function NavButton({
  view,
  active,
  icon: Icon,
  label,
  onChange,
  compact = false,
}: {
  view: View;
  active: boolean;
  icon: typeof Home;
  label: string;
  onChange: (view: View) => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onChange(view)}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl font-sans text-xs font-semibold transition-colors ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <Icon className="size-5" />
        {label}
      </button>
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onChange(view)}
      aria-current={active ? 'page' : undefined}
      className={`h-10 px-4 font-sans ${active ? 'bg-accent text-primary' : 'text-muted-foreground'}`}
    >
      <Icon data-icon="inline-start" />
      {label}
    </Button>
  );
}

export function WorkoutApp() {
  const [view, setView] = useState<View>('today');
  const [activeWeek, setActiveWeek] = useState(1);
  const [activeDay, setActiveDay] = useState<TrainingDay>('C');
  const [activeIndex, setActiveIndex] = useState(0);
  const [entries, setEntries] = useState<WorkoutEntry[]>([]);
  const [sessionExercises, setSessionExercises] = useState<SessionExercise[]>(
    [],
  );
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingSheet, setSyncingSheet] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [importingSheet, setImportingSheet] = useState(false);
  const [importPreview, setImportPreview] = useState<SheetImportPreview | null>(
    null,
  );
  const [selectedImportKeys, setSelectedImportKeys] = useState<string[]>([]);
  const [sheetImportError, setSheetImportError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [activeTipIndex, setActiveTipIndex] = useState(0);
  const [visibleSetCount, setVisibleSetCount] = useState(3);
  const [restTimerSeconds, setRestTimerSeconds] = useState(120);
  const [restTimerRunning, setRestTimerRunning] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingWorkoutCount, setPendingWorkoutCount] = useState(0);
  const [restAlertsEnabled, setRestAlertsEnabled] = useState(false);
  const [personalRecords, setPersonalRecords] = useState<string[]>([]);
  const [personalRecordOpen, setPersonalRecordOpen] = useState(false);
  const [sessionSummaryOpen, setSessionSummaryOpen] = useState(false);
  const [programOpen, setProgramOpen] = useState(false);
  const [programSaving, setProgramSaving] = useState(false);
  const [programDraft, setProgramDraft] = useState<SessionExercise[]>([]);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupData, setBackupData] = useState<unknown>(null);
  const [backupFileName, setBackupFileName] = useState('');
  const [backupSummary, setBackupSummary] = useState<BackupSummary | null>(
    null,
  );
  const [exerciseDemoOpen, setExerciseDemoOpen] = useState(false);
  const [exerciseDemoVariantIndex, setExerciseDemoVariantIndex] = useState(0);
  const [exerciseDemoImageFailed, setExerciseDemoImageFailed] = useState(false);
  const [progressExerciseKey, setProgressExerciseKey] = useState('A|1');
  const restTimerEndsAt = useRef<number | null>(null);

  const dayExercises = useMemo(
    () => planForSession(sessionExercises, activeWeek, activeDay),
    [activeDay, activeWeek, sessionExercises],
  );
  const exercise = (dayExercises[activeIndex] ?? dayExercises[0])!;
  const existingEntry = exercise
    ? entries.find(
        (entry) =>
          entry.week === activeWeek &&
          entry.day === activeDay &&
          entry.exerciseOrder === exercise.order,
      )
    : undefined;
  const previousEntry = [...entries]
    .filter(
      (entry) =>
        exercise &&
        entry.completed &&
        entry.week < activeWeek &&
        entry.day === activeDay &&
        entry.exerciseOrder === exercise.order,
    )
    .sort((a, b) => b.week - a.week)[0];
  const activeSets = exercise ? workingSetsForWeek(exercise, activeWeek) : 1;
  const suggestedRestSeconds = exercise
    ? recommendedRestSeconds(exercise.rest)
    : 60;
  const exerciseDemo = exercise ? exerciseDemoFor(exercise.name) : null;
  const exerciseDemoVariant = exerciseDemo
    ? exerciseDemo.variants[
        Math.min(exerciseDemoVariantIndex, exerciseDemo.variants.length - 1)
      ]
    : null;

  const refreshWorkoutData = useCallback(async () => {
    const response = await fetch('/api/workouts', { cache: 'no-store' });
    const data = (await response.json()) as {
      entries?: WorkoutEntry[];
      sessionExercises?: SessionExercise[];
      error?: string;
    };
    if (!response.ok) throw new Error(data.error ?? 'Unable to load workouts.');
    const freshEntries = normaliseWorkoutEntries(data.entries ?? []);
    const freshSessionExercises = normaliseSessionExercises(
      data.sessionExercises ?? [],
    );
    setEntries(freshEntries);
    setSessionExercises(freshSessionExercises);
    cacheWorkoutEntries(freshEntries);
    cacheSessionExercises(freshSessionExercises);
    return freshEntries;
  }, []);

  const flushPendingWorkouts = useCallback(async () => {
    const queue = readPendingWorkouts();
    if (queue.length === 0 || !navigator.onLine) {
      setPendingWorkoutCount(queue.length);
      return;
    }

    const remaining: PendingWorkout[] = [];
    for (const item of queue) {
      try {
        const response = await fetch('/api/workouts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });
        if (!response.ok) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    cachePendingWorkouts(remaining);
    setPendingWorkoutCount(remaining.length);
    if (remaining.length === 0) {
      await refreshWorkoutData();
      setNotice('Offline workouts are safely synced to Liftline.');
    }
  }, [refreshWorkoutData]);

  useEffect(() => {
    let cancelled = false;
    const cachedEntries = readCachedWorkoutEntries();
    const cachedSessionExercises = readCachedSessionExercises();
    queueMicrotask(() => {
      if (cancelled) return;
      if (cachedEntries) setEntries(cachedEntries);
      if (cachedSessionExercises.length > 0)
        setSessionExercises(cachedSessionExercises);
      setIsOnline(navigator.onLine);
      setPendingWorkoutCount(readPendingWorkouts().length);
      setRestAlertsEnabled(
        'Notification' in window && Notification.permission === 'granted',
      );
      refreshWorkoutData()
        .then(() => {
          if (!cancelled) setError('');
        })
        .catch((loadError: Error) => {
          if (!cancelled && !cachedEntries) setError(loadError.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      if (navigator.onLine) void flushPendingWorkouts();
    });

    const handleOnline = () => {
      setIsOnline(true);
      void flushPendingWorkouts();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flushPendingWorkouts, refreshWorkoutData]);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      !('serviceWorker' in navigator)
    )
      return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(() => navigator.serviceWorker.ready)
        .then((registration) => {
          const worker = registration.active;
          if (!worker) return;
          const assets = performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .filter((url) => {
              try {
                const resource = new URL(url);
                return (
                  resource.origin === window.location.origin &&
                  resource.pathname.startsWith('/_next/static/')
                );
              } catch {
                return false;
              }
            });
          worker.postMessage({ type: 'WARM_ASSETS', assets });
        })
        .catch(() => {
          // Liftline still works normally when service workers are unavailable.
        });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  useEffect(() => {
    let tipTimer: number | undefined;
    let cancelled = false;

    const scheduleNextTip = () => {
      const delay = 24_000 + Math.random() * 18_000;
      tipTimer = window.setTimeout(() => {
        if (cancelled) return;
        setActiveTipIndex((current) => {
          const offset =
            1 + Math.floor(Math.random() * (trainingTips.length - 1));
          return (current + offset) % trainingTips.length;
        });
        scheduleNextTip();
      }, delay);
    };

    scheduleNextTip();
    return () => {
      cancelled = true;
      if (tipTimer != null) window.clearTimeout(tipTimer);
    };
  }, []);

  useEffect(() => {
    const current = entries.find(
      (entry) =>
        entry.week === activeWeek &&
        entry.day === activeDay &&
        entry.exerciseOrder === exercise.order,
    );
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setDraft(draftFromEntry(current));
      setVisibleSetCount(visibleSetsForEntry(current, exercise.targetSets));
      setShowNotes(Boolean(current?.notes));
    });
    return () => {
      cancelled = true;
    };
  }, [activeDay, activeWeek, entries, exercise.order, exercise.targetSets]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      restTimerEndsAt.current = null;
      setRestTimerRunning(false);
      setRestTimerSeconds(suggestedRestSeconds);
    });
    return () => {
      cancelled = true;
    };
  }, [activeDay, exercise.order, suggestedRestSeconds]);

  useEffect(() => {
    if (!restTimerRunning) return;
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil(
          ((restTimerEndsAt.current ?? Date.now()) - Date.now()) / 1000,
        ),
      );
      setRestTimerSeconds(remaining);
      if (remaining === 0) {
        restTimerEndsAt.current = null;
        setRestTimerRunning(false);
        navigator.vibrate?.([160, 80, 160]);
        if (
          'Notification' in window &&
          Notification.permission === 'granted' &&
          document.hidden
        ) {
          new Notification('Liftline rest complete', {
            body: `${exercise.name}: ready for your next set.`,
            icon: '/icon-192.png',
          });
        }
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [exercise.name, restTimerRunning]);

  const weeklySummaries = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const week = index + 1;
        const weekEntries = entries.filter(
          (entry) => entry.week === week && entry.completed,
        );
        const sessions = days.filter((day) => {
          const required = planForSession(sessionExercises, week, day).filter(
            (item) => !item.skipped,
          );
          return (
            required.length > 0 &&
            required.every((item) =>
              weekEntries.some(
                (entry) =>
                  entry.day === day && entry.exerciseOrder === item.order,
              ),
            )
          );
        }).length;
        return {
          week,
          rows: weekEntries.length,
          sessions,
          volume:
            Math.round(
              weekEntries.reduce((sum, entry) => sum + entryVolume(entry), 0) *
                10,
            ) / 10,
          dayA: weekEntries.filter((entry) => entry.day === 'A').length,
          dayB: weekEntries.filter((entry) => entry.day === 'B').length,
          dayC: weekEntries.filter((entry) => entry.day === 'C').length,
        };
      }),
    [entries, sessionExercises],
  );

  const currentSummary = weeklySummaries[activeWeek - 1];
  const sessionsDone = currentSummary.sessions;
  const weeklyPercent = Math.round((sessionsDone / 3) * 100);
  const totalVolume = weeklySummaries.reduce(
    (sum, week) => sum + week.volume,
    0,
  );
  const totalRows = weeklySummaries.reduce((sum, week) => sum + week.rows, 0);
  const totalSessions = weeklySummaries.reduce(
    (sum, week) => sum + week.sessions,
    0,
  );
  const totalRecords = useMemo(() => totalPersonalRecords(entries), [entries]);
  const advice = progressionAdvice(exercise, draft, visibleSetCount);
  const readyToSave = draft.sets
    .slice(0, visibleSetCount)
    .every((set) => numberOrNull(set.reps) != null);
  const currentSessionEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.completed &&
          entry.week === activeWeek &&
          entry.day === activeDay,
      ),
    [activeDay, activeWeek, entries],
  );
  const currentSessionVolume = currentSessionEntries.reduce(
    (sum, entry) => sum + entryVolume(entry),
    0,
  );
  const currentSessionSets = currentSessionEntries.reduce(
    (sum, entry) => sum + loggedSets(entry).length,
    0,
  );
  const currentSessionRecords = currentSessionEntries.reduce(
    (sum, entry) => sum + personalRecordsFor(entry, entries).length,
    0,
  );
  const previousSessionVolume = entries
    .filter(
      (entry) =>
        entry.completed &&
        entry.week === activeWeek - 1 &&
        entry.day === activeDay,
    )
    .reduce((sum, entry) => sum + entryVolume(entry), 0);
  const sessionTimes = currentSessionEntries
    .map((entry) => Date.parse(entry.completedAt ?? ''))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const sessionDurationMinutes =
    sessionTimes.length > 1
      ? Math.max(
          1,
          Math.round((sessionTimes.at(-1)! - sessionTimes[0]) / 60_000),
        )
      : null;
  const progressExerciseOptions = useMemo(() => {
    const customByKey = new Map<string, RoutineExercise>();
    entries
      .filter((entry) => entry.exerciseOrder >= 100)
      .forEach((entry) => {
        const key = `${entry.day}|${entry.exerciseOrder}`;
        if (!customByKey.has(key))
          customByKey.set(key, {
            day: entry.day,
            order: entry.exerciseOrder,
            name: entry.exercise,
            targetSets: entry.setCount ?? 3,
            repRange: entry.target.split('×')[1]?.trim() ?? 'Logged sets',
            rest: 'Custom',
            muscles: 'Custom exercise',
            alternative: 'None',
          });
      });
    return [...routine, ...customByKey.values()];
  }, [entries]);
  const selectedProgressExercise =
    progressExerciseOptions.find(
      (item) => `${item.day}|${item.order}` === progressExerciseKey,
    ) ?? progressExerciseOptions[0]!;
  const selectedProgressData = entries
    .filter(
      (entry) =>
        entry.completed &&
        entry.day === selectedProgressExercise.day &&
        entry.exerciseOrder === selectedProgressExercise.order,
    )
    .sort((left, right) => left.week - right.week)
    .map((entry) => ({ week: entry.week, ...workoutMetrics(entry) }));
  const latestSheetSyncedAt = entries
    .map((entry) => (entry.sheetSyncedAt ? Date.parse(entry.sheetSyncedAt) : 0))
    .reduce((latest, value) => Math.max(latest, value), 0);
  const failedSheetEntries = entries.filter(
    (entry) => entry.syncStatus === 'failed',
  ).length;
  const queuedSheetEntries = entries.filter(
    (entry) => entry.syncStatus === 'pending' && entry.completed,
  ).length;
  const currentSessionComplete = dayExercises
    .filter((item) => !item.skipped)
    .every((item) =>
      currentSessionEntries.some((entry) => entry.exerciseOrder === item.order),
    );

  function chooseDay(day: TrainingDay) {
    setActiveDay(day);
    setActiveIndex(0);
    setView('today');
  }

  function updateSet(index: number, key: 'weight' | 'reps', value: string) {
    setDraft((current) => ({
      ...current,
      sets: current.sets.map((set, setIndex) =>
        setIndex === index ? { ...set, [key]: value } : set,
      ),
    }));
  }

  function stepSet(index: number, key: 'weight' | 'reps', amount: number) {
    const current = Number(draft.sets[index][key] || 0);
    const next = Math.max(0, Math.round((current + amount) * 10) / 10);
    updateSet(index, key, String(next));
  }

  function addSet() {
    setVisibleSetCount((count) => Math.min(5, count + 1));
  }

  function removeSet() {
    if (visibleSetCount <= 1) return;
    const removedIndex = visibleSetCount - 1;
    setDraft((current) => ({
      ...current,
      sets: current.sets.map((set, index) =>
        index === removedIndex ? { weight: '', reps: '', done: false } : set,
      ),
    }));
    setVisibleSetCount((count) => Math.max(1, count - 1));
  }

  function toggleRestTimer() {
    if (restTimerRunning) {
      const remaining = Math.max(
        0,
        Math.ceil(
          ((restTimerEndsAt.current ?? Date.now()) - Date.now()) / 1000,
        ),
      );
      restTimerEndsAt.current = null;
      setRestTimerSeconds(remaining);
      setRestTimerRunning(false);
      return;
    }
    const startingSeconds =
      restTimerSeconds === 0 ? suggestedRestSeconds : restTimerSeconds;
    setRestTimerSeconds(startingSeconds);
    restTimerEndsAt.current = Date.now() + startingSeconds * 1000;
    setRestTimerRunning(true);
  }

  function startRestTimer() {
    setRestTimerSeconds(suggestedRestSeconds);
    restTimerEndsAt.current = Date.now() + suggestedRestSeconds * 1000;
    setRestTimerRunning(true);
  }

  function toggleSetComplete(index: number) {
    const set = draft.sets[index];
    if (!set.done && numberOrNull(set.reps) == null) {
      setError(`Enter reps for set ${index + 1} before marking it complete.`);
      return;
    }
    setError('');
    setDraft((current) => ({
      ...current,
      sets: current.sets.map((currentSet, setIndex) =>
        setIndex === index
          ? { ...currentSet, done: !currentSet.done }
          : currentSet,
      ),
    }));
    if (!set.done) startRestTimer();
  }

  async function enableRestAlerts() {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setRestAlertsEnabled(permission === 'granted');
  }

  function resetRestTimer() {
    restTimerEndsAt.current = null;
    setRestTimerRunning(false);
    setRestTimerSeconds(suggestedRestSeconds);
  }

  function usePreviousSession() {
    if (!previousEntry) return;
    const previousDraft = draftFromEntry(previousEntry);
    setDraft({ ...previousDraft, notes: '' });
    setVisibleSetCount(visibleSetsForEntry(previousEntry, exercise.targetSets));
    setShowNotes(false);
    setNotice('Previous weights and reps copied. Review them before saving.');
  }

  async function saveExercise() {
    if (!readyToSave) {
      setError(`Enter reps for all ${visibleSetCount} displayed sets.`);
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const now = new Date().toISOString();
    const payload: WorkoutPayload = {
      week: activeWeek,
      day: activeDay,
      exerciseOrder: exercise.order,
      set1Weight: numberOrNull(draft.sets[0].weight),
      set1Reps: numberOrNull(draft.sets[0].reps),
      set2Weight: numberOrNull(draft.sets[1].weight),
      set2Reps: numberOrNull(draft.sets[1].reps),
      set3Weight: numberOrNull(draft.sets[2].weight),
      set3Reps: numberOrNull(draft.sets[2].reps),
      set4Weight: numberOrNull(draft.sets[3].weight),
      set4Reps: numberOrNull(draft.sets[3].reps),
      set5Weight: numberOrNull(draft.sets[4].weight),
      set5Reps: numberOrNull(draft.sets[4].reps),
      setCount: visibleSetCount,
      rir: numberOrNull(draft.rir),
      notes: draft.notes,
      completed: true,
      completedAt: existingEntry?.completedAt ?? now,
      clientUpdatedAt: now,
    };
    const localEntry = optimisticEntry(payload, exercise);
    const records = personalRecordsFor(localEntry, entries);
    const nextEntries = replaceWorkoutEntry(entries, localEntry);
    setEntries(nextEntries);
    cacheWorkoutEntries(nextEntries);
    if (records.length > 0) {
      setPersonalRecords(records);
      setPersonalRecordOpen(true);
    }
    const sessionComplete = dayExercises
      .filter((item) => !item.skipped)
      .every((item) =>
        nextEntries.some(
          (entry) =>
            entry.completed &&
            entry.week === activeWeek &&
            entry.day === activeDay &&
            entry.exerciseOrder === item.order,
        ),
      );

    const queueForLater = () => {
      const key = workoutKey(payload);
      const queue = [
        ...readPendingWorkouts().filter((item) => item.key !== key),
        { key, payload },
      ];
      cachePendingWorkouts(queue);
      setPendingWorkoutCount(queue.length);
      setIsOnline(navigator.onLine);
    };

    const advance = () => {
      if (sessionComplete && records.length === 0) setSessionSummaryOpen(true);
      else if (activeIndex < dayExercises.length - 1)
        setActiveIndex((index) => index + 1);
    };

    if (!navigator.onLine) {
      queueForLater();
      setNotice(`${exercise.name} saved offline. It will sync automatically.`);
      setSaving(false);
      advance();
      return;
    }

    try {
      const response = await fetch('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        entry?: WorkoutEntry;
        sheetSyncQueued?: boolean;
        error?: string;
      };
      if (!response.ok || !data.entry)
        throw new Error(data.error ?? 'Unable to save exercise.');
      const saved = {
        ...data.entry,
        completed: Boolean(data.entry.completed),
        offlinePending: false,
      };
      setEntries((current) => {
        const refreshed = replaceWorkoutEntry(current, saved);
        cacheWorkoutEntries(refreshed);
        return refreshed;
      });
      setNotice(
        `${exercise.name} saved to Liftline${data.sheetSyncQueued ? ' · Sheet sync queued' : ''}`,
      );
      window.setTimeout(() => {
        void refreshWorkoutData().catch(() => undefined);
      }, 3500);
      advance();
    } catch (saveError) {
      queueForLater();
      setNotice(
        `${exercise.name} is safe on this device and will retry automatically.`,
      );
      if (navigator.onLine)
        setError(
          saveError instanceof Error
            ? `${saveError.message} Saved locally for retry.`
            : 'Saved locally for retry.',
        );
      advance();
    } finally {
      setSaving(false);
    }
  }

  async function syncGoogleSheet() {
    setSyncingSheet(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/workouts/sync-sheet', {
        method: 'POST',
      });
      const result = (await response.json()) as SheetSyncResult;
      if (!response.ok || !result.ok)
        throw new Error(result.message ?? 'Unable to sync the Google Sheet.');
      await refreshWorkoutData();
      setNotice(
        `${result.synced} workout ${result.synced === 1 ? 'entry' : 'entries'} sent to Google Sheet.`,
      );
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : 'Unable to sync the Google Sheet.',
      );
    } finally {
      setSyncingSheet(false);
    }
  }

  async function previewGoogleSheetImport() {
    setImportOpen(true);
    setLoadingImport(true);
    setImportPreview(null);
    setSelectedImportKeys([]);
    setSheetImportError('');
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/workouts/import-sheet');
      const result = (await response.json()) as SheetImportPreview;
      if (!response.ok || !result.ok)
        throw new Error(
          result.message ?? 'Unable to preview the Google Sheet.',
        );
      setImportPreview(result);
      setSelectedImportKeys(
        result.items
          .filter((item) => item.status === 'new')
          .map((item) => item.key),
      );
    } catch (previewError) {
      setSheetImportError(
        previewError instanceof Error
          ? previewError.message
          : 'Unable to preview the Google Sheet.',
      );
    } finally {
      setLoadingImport(false);
    }
  }

  function toggleImportItem(key: string, checked: boolean) {
    setSelectedImportKeys((current) =>
      checked
        ? [...new Set([...current, key])]
        : current.filter((currentKey) => currentKey !== key),
    );
  }

  async function importSelectedSheetEntries() {
    if (selectedImportKeys.length === 0) return;
    setImportingSheet(true);
    setSheetImportError('');
    try {
      const protectedKeys = new Set(
        importPreview?.items
          .filter((item) => item.status === 'protected')
          .map((item) => item.key) ?? [],
      );
      const response = await fetch('/api/workouts/import-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keys: selectedImportKeys,
          overwriteKeys: selectedImportKeys.filter((key) =>
            protectedKeys.has(key),
          ),
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        imported?: number;
        protected?: number;
        message?: string;
      };
      if (!response.ok || !result.ok)
        throw new Error(result.message ?? 'Unable to import the Google Sheet.');

      const entriesResponse = await fetch('/api/workouts');
      const entriesResult = (await entriesResponse.json()) as {
        entries?: WorkoutEntry[];
        error?: string;
      };
      if (!entriesResponse.ok)
        throw new Error(
          entriesResult.error ??
            'The import finished, but Liftline could not refresh.',
        );
      const freshEntries = normaliseWorkoutEntries(entriesResult.entries ?? []);
      setEntries(freshEntries);
      cacheWorkoutEntries(freshEntries);
      setImportOpen(false);
      const imported = result.imported ?? 0;
      setNotice(
        imported > 0
          ? `${imported} workout ${imported === 1 ? 'entry' : 'entries'} imported from Google Sheet`
          : 'No Liftline records needed updating.',
      );
    } catch (importError) {
      setSheetImportError(
        importError instanceof Error
          ? importError.message
          : 'Unable to import the Google Sheet.',
      );
    } finally {
      setImportingSheet(false);
    }
  }

  function openProgramEditor(day: TrainingDay = activeDay) {
    const selectedPlan = planForSession(sessionExercises, activeWeek, day);
    setProgramDraft(
      selectedPlan.map((item, index) => ({
        week: activeWeek,
        day,
        exerciseOrder: item.order,
        displayOrder: index + 1,
        name: item.name,
        targetSets: item.targetSets,
        repRange: item.repRange,
        rest: item.rest,
        muscles: item.muscles,
        alternative: item.alternative,
        skipped: item.skipped,
        custom: item.custom,
      })),
    );
    setProgramOpen(true);
  }

  function moveProgramExercise(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= programDraft.length) return;
    setProgramDraft((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next.map((item, itemIndex) => ({
        ...item,
        displayOrder: itemIndex + 1,
      }));
    });
  }

  function addProgramExercise() {
    if (programDraft.length >= 10) return;
    const used = new Set(programDraft.map((item) => item.exerciseOrder));
    let exerciseOrder = 100;
    while (used.has(exerciseOrder)) exerciseOrder += 1;
    setProgramDraft((current) => [
      ...current,
      {
        week: activeWeek,
        day: activeDay,
        exerciseOrder,
        displayOrder: current.length + 1,
        name: 'New exercise',
        targetSets: 3,
        repRange: '8–12',
        rest: '90 sec',
        muscles: 'Custom exercise',
        alternative: 'None',
        skipped: false,
        custom: true,
      },
    ]);
  }

  async function saveProgram() {
    setProgramSaving(true);
    setError('');
    try {
      const response = await fetch('/api/workouts/program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week: activeWeek,
          day: activeDay,
          exercises: programDraft,
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        sessionExercises?: SessionExercise[];
        error?: string;
      };
      if (!response.ok || !result.ok)
        throw new Error(result.error ?? 'Unable to update this session.');
      const saved = normaliseSessionExercises(result.sessionExercises ?? []);
      setSessionExercises((current) => {
        const next = [
          ...current.filter(
            (item) => !(item.week === activeWeek && item.day === activeDay),
          ),
          ...saved,
        ];
        cacheSessionExercises(next);
        return next;
      });
      setActiveIndex(0);
      setProgramOpen(false);
      setNotice(`Week ${activeWeek} · Day ${activeDay} updated.`);
    } catch (programError) {
      setError(
        programError instanceof Error
          ? programError.message
          : 'Unable to update this session.',
      );
    } finally {
      setProgramSaving(false);
    }
  }

  async function downloadBackup() {
    setBackupBusy(true);
    setError('');
    try {
      const response = await fetch('/api/workouts/backup');
      if (!response.ok) throw new Error('Unable to create a Liftline backup.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `liftline-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice('Liftline backup downloaded.');
    } catch (backupError) {
      setError(
        backupError instanceof Error
          ? backupError.message
          : 'Unable to create a backup.',
      );
    } finally {
      setBackupBusy(false);
    }
  }

  async function previewBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBackupBusy(true);
    setBackupSummary(null);
    setBackupFileName(file.name);
    setError('');
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const response = await fetch('/api/workouts/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'preview', backup: parsed }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        summary?: BackupSummary;
        error?: string;
      };
      if (!response.ok || !result.ok || !result.summary)
        throw new Error(result.error ?? 'Unable to read this backup.');
      setBackupData(parsed);
      setBackupSummary(result.summary);
    } catch (backupError) {
      setBackupData(null);
      setError(
        backupError instanceof Error
          ? backupError.message
          : 'Unable to read this backup.',
      );
    } finally {
      setBackupBusy(false);
    }
  }

  async function restoreBackup() {
    if (!backupData) return;
    setBackupBusy(true);
    setError('');
    try {
      const response = await fetch('/api/workouts/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'restore', backup: backupData }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !result.ok)
        throw new Error(result.error ?? 'Unable to restore this backup.');
      await refreshWorkoutData();
      setBackupOpen(false);
      setBackupData(null);
      setBackupSummary(null);
      setNotice(
        'Backup restored. Existing records not included in the file were kept.',
      );
    } catch (backupError) {
      setError(
        backupError instanceof Error
          ? backupError.message
          : 'Unable to restore this backup.',
      );
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-24 font-sans text-foreground md:pb-10">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setView('today')}
            className="flex items-center gap-3 text-left"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-[linear-gradient(145deg,#2f75ff_0%,#405fef_55%,#6554db_100%)] text-white shadow-sm shadow-primary/25 ring-1 ring-white/15">
              <Dumbbell className="size-5" />
            </span>
            <span>
              <span className="block font-sans text-lg font-bold tracking-tight">
                Liftline
              </span>
              <span className="block font-sans text-xs text-muted-foreground">
                12-week strength plan
              </span>
            </span>
          </button>
          <div className="hidden items-center gap-1 md:flex">
            <NavButton
              view="today"
              active={view === 'today'}
              icon={Home}
              label="Today"
              onChange={setView}
            />
            <NavButton
              view="plan"
              active={view === 'plan'}
              icon={CalendarDays}
              label="Plan"
              onChange={setView}
            />
            <NavButton
              view="progress"
              active={view === 'progress'}
              icon={BarChart3}
              label="Progress"
              onChange={setView}
            />
          </div>
          <Button
            variant={view === 'guide' ? 'secondary' : 'outline'}
            size="icon-lg"
            aria-label="Open guide"
            onClick={() => setView('guide')}
          >
            <BookOpen />
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 md:py-8">
        {(error || notice) && (
          <Alert
            className={`mb-5 ${error ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-success/25 bg-success-soft text-success'}`}
          >
            {error ? <AlertCircle /> : <CheckCircle2 />}
            <AlertTitle>
              {error ? 'Something needs attention' : 'All set'}
            </AlertTitle>
            <AlertDescription
              className={error ? 'text-destructive/85' : 'text-success/85'}
            >
              {error || notice}
            </AlertDescription>
          </Alert>
        )}

        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border/80 bg-card px-3 py-2.5 shadow-sm shadow-slate-900/5">
          <span
            className={`flex items-center gap-2 font-sans text-xs font-semibold ${isOnline ? 'text-success' : 'text-warning-foreground'}`}
          >
            {isOnline ? (
              <Cloud className="size-4" />
            ) : (
              <CloudOff className="size-4" />
            )}
            {isOnline ? 'Liftline online' : 'Offline mode'}
          </span>
          <span className="h-4 w-px bg-border" />
          <span className="font-sans text-xs text-muted-foreground">
            {pendingWorkoutCount > 0
              ? `${pendingWorkoutCount} workout ${pendingWorkoutCount === 1 ? 'change' : 'changes'} waiting to sync`
              : 'All device changes saved'}
          </span>
          <span className="h-4 w-px bg-border" />
          <span
            className={`font-sans text-xs ${failedSheetEntries > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}
          >
            {failedSheetEntries > 0
              ? `${failedSheetEntries} Sheet ${failedSheetEntries === 1 ? 'update needs' : 'updates need'} retrying`
              : latestSheetSyncedAt > 0
                ? `Google Sheet sent ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(latestSheetSyncedAt)}`
                : queuedSheetEntries > 0
                  ? 'Google Sheet sync queued'
                  : 'Google Sheet ready'}
          </span>
          {pendingWorkoutCount > 0 && (
            <Button
              variant="ghost"
              size="xs"
              className="ml-auto"
              onClick={() => void flushPendingWorkouts()}
              disabled={!isOnline}
            >
              <Cloud /> Sync now
            </Button>
          )}
          {(failedSheetEntries > 0 || queuedSheetEntries > 0) && (
            <Button
              variant="ghost"
              size="xs"
              className={pendingWorkoutCount > 0 ? '' : 'ml-auto'}
              onClick={syncGoogleSheet}
              disabled={syncingSheet || !isOnline}
            >
              <RefreshCw className={syncingSheet ? 'animate-spin' : ''} /> Retry
            </Button>
          )}
        </div>

        {view === 'today' && (
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0 space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <label
                      htmlFor="week"
                      className="text-sm font-semibold text-primary"
                    >
                      WEEK
                    </label>
                    <select
                      id="week"
                      value={activeWeek}
                      onChange={(event) =>
                        setActiveWeek(Number(event.target.value))
                      }
                      className="h-9 rounded-lg border bg-card px-3 text-sm font-semibold outline-none focus:ring-3 focus:ring-ring/30"
                    >
                      {Array.from({ length: 12 }, (_, index) => (
                        <option key={index + 1} value={index + 1}>
                          Week {index + 1}
                        </option>
                      ))}
                    </select>
                    <span className="text-sm text-muted-foreground">
                      · {weekDates[activeWeek - 1]}
                    </span>
                  </div>
                  <h1 className="font-sans text-2xl font-bold tracking-tight sm:text-3xl">
                    Your workout, set by set.
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Log each set, RIR, and notes as you train.
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className="h-7 bg-success-soft px-3 text-success"
                >
                  <CheckCircle2 /> {sessionsDone} of 3 sessions
                </Badge>
              </div>

              <Card className="border-0 text-primary-foreground ring-0 shadow-xl shadow-primary/10 [background:var(--hero)]">
                <CardHeader className="pb-1">
                  <CardTitle className="font-sans text-lg font-semibold text-primary-foreground">
                    Week {activeWeek} progress
                  </CardTitle>
                  <CardDescription className="font-sans text-primary-foreground/90">
                    {sessionsDone === 3
                      ? 'Week complete—excellent consistency.'
                      : `${3 - sessionsDone} session${3 - sessionsDone === 1 ? '' : 's'} left this week.`}
                  </CardDescription>
                  <CardAction className="rounded-xl bg-black/15 px-3 py-2 text-right backdrop-blur-sm">
                    <p className="font-sans text-xl font-bold text-primary-foreground">
                      {weeklyPercent}%
                    </p>
                    <p className="font-sans text-[11px] text-primary-foreground/85">
                      complete
                    </p>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <progress
                    aria-label="Week progress"
                    max={100}
                    value={weeklyPercent}
                    className="h-2 w-full appearance-none overflow-hidden rounded-full bg-black/20 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-white [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-black/20 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-white"
                  />
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-medium">
                    {days.map((day) => {
                      const complete = entries.some(
                        (entry) =>
                          entry.week === activeWeek &&
                          entry.day === day &&
                          entry.completed,
                      );
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => chooseDay(day)}
                          className={`rounded-lg px-3 py-2 text-left font-sans transition-colors ${activeDay === day ? 'bg-white text-primary' : 'bg-black/15 text-white hover:bg-black/20'}`}
                        >
                          Day {day}
                          <span className="float-right">
                            {complete ? '✓' : activeDay === day ? '→' : '·'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-sans text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Day {activeDay} · Exercise {activeIndex + 1} of{' '}
                    {dayExercises.length}
                  </p>
                  <h2 className="mt-1 font-sans text-xl font-bold">
                    {exercise.name}
                  </h2>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openProgramEditor()}
                  >
                    <Settings2 /> Edit session
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous exercise"
                    disabled={activeIndex === 0}
                    onClick={() =>
                      setActiveIndex((index) => Math.max(0, index - 1))
                    }
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Next exercise"
                    disabled={activeIndex === dayExercises.length - 1}
                    onClick={() =>
                      setActiveIndex((index) =>
                        Math.min(dayExercises.length - 1, index + 1),
                      )
                    }
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>

              <Card className="border-0 shadow-sm shadow-slate-900/5 ring-border">
                <CardHeader className="border-b bg-muted/35">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-day-c font-sans text-day-c-foreground">
                      Day {activeDay}
                    </Badge>
                    <Badge variant="outline" className="font-sans">
                      <Target /> {targetLabel(exercise)}
                    </Badge>
                    <Badge variant="outline" className="font-sans">
                      <Clock3 /> Rest {exercise.rest}
                    </Badge>
                    {existingEntry?.completed && (
                      <Badge className="bg-success-soft font-sans text-success">
                        <Check /> Logged
                      </Badge>
                    )}
                    {exercise.skipped && (
                      <Badge className="bg-warning-soft font-sans text-warning-foreground">
                        Skipped this session
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <CardDescription className="font-sans">
                      {exercise.muscles} · Alternative: {exercise.alternative}
                    </CardDescription>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Show an animated movement guide for ${exercise.name}`}
                      onClick={() => {
                        setExerciseDemoVariantIndex(0);
                        setExerciseDemoImageFailed(false);
                        setExerciseDemoOpen(true);
                      }}
                      className="border-primary/20 bg-background font-sans text-xs font-semibold text-primary hover:bg-accent hover:text-primary"
                    >
                      <CirclePlay className="size-4" /> See movement
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/15 bg-background/90 p-3 shadow-sm shadow-slate-900/5">
                    <div className="flex items-center gap-3">
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-lg ${restTimerSeconds === 0 ? 'bg-success-soft text-success' : 'bg-accent text-primary'}`}
                      >
                        <Clock3 className="size-4" />
                      </span>
                      <div>
                        <p className="font-sans text-xs font-medium text-muted-foreground">
                          {restTimerSeconds === 0
                            ? 'Rest complete'
                            : `Rest timer · ${exercise.rest}`}
                        </p>
                        <time
                          className="font-sans text-xl font-bold tabular-nums"
                          aria-live="polite"
                        >
                          {formatTimer(restTimerSeconds)}
                        </time>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!restAlertsEnabled && 'Notification' in globalThis && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={enableRestAlerts}
                        >
                          <Bell /> Alerts
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant={restTimerRunning ? 'secondary' : 'default'}
                        size="sm"
                        onClick={toggleRestTimer}
                      >
                        {restTimerRunning ? <Pause /> : <Play />}
                        {restTimerRunning
                          ? 'Pause'
                          : restTimerSeconds === 0
                            ? 'Again'
                            : 'Start'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label="Reset rest timer"
                        onClick={resetRestTimer}
                      >
                        <TimerReset />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-primary/15 bg-background/90 p-3 shadow-sm shadow-slate-900/5">
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-primary">
                        <History className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className="font-sans text-sm font-semibold">
                            Previous session
                          </p>
                          {previousEntry && (
                            <p className="font-sans text-xs font-medium text-muted-foreground">
                              {formatWorkoutDate(
                                previousEntry.completedAt ??
                                  previousEntry.updatedAt,
                              )}{' '}
                              · Week {previousEntry.week}
                            </p>
                          )}
                        </div>
                        {previousEntry ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {loggedSets(previousEntry).map((set) => (
                              <span
                                key={set.set}
                                className="rounded-lg bg-secondary px-2.5 py-1.5 font-sans text-xs font-medium tabular-nums"
                              >
                                Set {set.set}:{' '}
                                {set.weight == null
                                  ? `${set.reps} ${exercise.name === 'Plank' ? 'sec' : 'reps'}`
                                  : `${set.weight} kg × ${set.reps}`}
                              </span>
                            ))}
                            {previousEntry.rir != null && (
                              <span className="rounded-lg bg-success-soft px-2.5 py-1.5 font-sans text-xs font-medium text-success">
                                RIR {previousEntry.rir}
                              </span>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={usePreviousSession}
                            >
                              <Copy /> Use previous
                            </Button>
                          </div>
                        ) : (
                          <p className="mt-1 font-sans text-xs leading-relaxed text-muted-foreground">
                            No earlier session for this exercise yet. Your last
                            sets and date will appear here from Week 2 onward.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-1">
                  {exercise.skipped ? (
                    <div className="grid min-h-52 place-items-center py-8 text-center">
                      <div className="max-w-sm">
                        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-warning-soft text-warning-foreground">
                          <Minus className="size-5" />
                        </span>
                        <h3 className="mt-3 font-sans text-lg font-semibold">
                          Skipped for Week {activeWeek}
                        </h3>
                        <p className="mt-1 font-sans text-sm leading-relaxed text-muted-foreground">
                          This exercise does not count against Day {activeDay}{' '}
                          completion. You can bring it back from Edit session.
                        </p>
                        <Button
                          className="mt-4"
                          variant="outline"
                          onClick={() =>
                            setActiveIndex((index) =>
                              Math.min(dayExercises.length - 1, index + 1),
                            )
                          }
                        >
                          Continue <ChevronRight />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1fr)_34px] items-center gap-1.5 border-b py-2 font-sans text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid-cols-[42px_1fr_1fr_64px] sm:gap-2 sm:text-xs">
                        <span>Set</span>
                        <span>Weight (kg)</span>
                        <span>
                          {exercise.name === 'Plank' ? 'Seconds' : 'Reps'}
                        </span>
                        <span className="text-center">
                          <span className="sr-only sm:not-sr-only">Status</span>
                        </span>
                      </div>
                      {draft.sets
                        .slice(0, visibleSetCount)
                        .map((set, index) => {
                          const setLabel =
                            index >= exercise.targetSets
                              ? 'EXTRA'
                              : index >= activeSets
                                ? 'OPT'
                                : '';
                          return (
                            <div
                              key={index}
                              className="grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1fr)_34px] items-center gap-1.5 border-b border-border/70 py-3 last:border-0 sm:grid-cols-[42px_1fr_1fr_64px] sm:gap-2"
                            >
                              <span className="relative grid size-8 place-items-center rounded-full bg-secondary font-sans text-sm font-bold">
                                {index + 1}
                                {setLabel && (
                                  <span className="absolute -right-3 -top-2 rounded bg-warning-soft px-1 font-sans text-[8px] text-warning-foreground">
                                    {setLabel}
                                  </span>
                                )}
                              </span>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  aria-label={`Decrease set ${index + 1} weight`}
                                  onClick={() => stepSet(index, 'weight', -2.5)}
                                >
                                  <Minus />
                                </Button>
                                <Input
                                  aria-label={`Set ${index + 1} weight in kilograms`}
                                  inputMode="decimal"
                                  type="number"
                                  value={set.weight}
                                  placeholder={
                                    exercise.name === 'Plank' ? 'Optional' : '0'
                                  }
                                  onFocus={(event) =>
                                    event.currentTarget.select()
                                  }
                                  onChange={(event) =>
                                    updateSet(
                                      index,
                                      'weight',
                                      event.target.value,
                                    )
                                  }
                                  className="h-11 min-w-0 bg-background text-center font-sans text-lg font-semibold tabular-nums"
                                />
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  aria-label={`Increase set ${index + 1} weight`}
                                  onClick={() => stepSet(index, 'weight', 2.5)}
                                >
                                  <Plus />
                                </Button>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  aria-label={`Decrease set ${index + 1} repetitions`}
                                  onClick={() => stepSet(index, 'reps', -1)}
                                >
                                  <Minus />
                                </Button>
                                <Input
                                  aria-label={`Set ${index + 1} ${exercise.name === 'Plank' ? 'seconds' : 'repetitions'}`}
                                  inputMode="numeric"
                                  type="number"
                                  value={set.reps}
                                  placeholder="0"
                                  onFocus={(event) =>
                                    event.currentTarget.select()
                                  }
                                  onChange={(event) =>
                                    updateSet(index, 'reps', event.target.value)
                                  }
                                  className="h-11 min-w-0 bg-background text-center font-sans text-lg font-semibold tabular-nums"
                                />
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  aria-label={`Increase set ${index + 1} repetitions`}
                                  onClick={() => stepSet(index, 'reps', 1)}
                                >
                                  <Plus />
                                </Button>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleSetComplete(index)}
                                aria-label={`${set.done ? 'Reopen' : 'Complete'} set ${index + 1}`}
                                aria-pressed={set.done}
                                className={`mx-auto grid size-8 place-items-center rounded-full border-2 transition-colors ${set.done ? 'border-success bg-success text-white' : 'border-border bg-background text-transparent hover:border-primary'}`}
                              >
                                <Check className="size-4" />
                              </button>
                            </div>
                          );
                        })}

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/55 p-2.5">
                        <p className="px-1 font-sans text-xs text-muted-foreground">
                          <strong className="text-foreground">
                            {visibleSetCount}{' '}
                            {visibleSetCount === 1 ? 'set' : 'sets'}
                          </strong>{' '}
                          · {activeSets} recommended this week
                        </p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={visibleSetCount <= 1}
                            onClick={removeSet}
                          >
                            <Minus /> Remove set
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={visibleSetCount >= 5}
                            onClick={addSet}
                          >
                            <Plus /> Add set
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-[1fr_112px] items-end gap-3">
                        <div>
                          <label
                            htmlFor="rir"
                            className="mb-1.5 block font-sans text-sm font-medium"
                          >
                            Reps in reserve (RIR)
                          </label>
                          <p className="font-sans text-xs text-muted-foreground">
                            {activeWeek <= 2
                              ? 'Aim for about 3 during ramp-in.'
                              : 'Aim for 1–2 with clean form.'}
                          </p>
                        </div>
                        <Input
                          id="rir"
                          type="number"
                          inputMode="numeric"
                          value={draft.rir}
                          placeholder="2"
                          min="0"
                          max="5"
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              rir: event.target.value,
                            }))
                          }
                          className="h-11 bg-background text-center font-sans text-lg font-semibold"
                        />
                      </div>

                      <div className="mt-4 flex items-center justify-between rounded-xl bg-secondary/70 p-3">
                        <div>
                          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Next time
                          </p>
                          <p className="font-sans text-sm font-semibold">
                            {advice}
                          </p>
                        </div>
                        <TrendingUp className="size-5 text-primary" />
                      </div>

                      {showNotes ? (
                        <div className="mt-4">
                          <label
                            htmlFor="notes"
                            className="mb-1.5 block font-sans text-sm font-medium"
                          >
                            Notes
                          </label>
                          <Textarea
                            id="notes"
                            value={draft.notes}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                notes: event.target.value,
                              }))
                            }
                            placeholder="Form cues, machine settings, anything to remember…"
                            className="font-sans"
                          />
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          className="mt-3 font-sans text-muted-foreground"
                          onClick={() => setShowNotes(true)}
                        >
                          <NotebookPen /> Add notes
                        </Button>
                      )}

                      <Button
                        size="lg"
                        className="mt-4 h-12 w-full rounded-xl font-sans text-base shadow-md shadow-primary/20"
                        disabled={saving || loading}
                        onClick={saveExercise}
                      >
                        {saving ? (
                          <Loader2 className="animate-spin" />
                        ) : existingEntry?.completed ? (
                          <RotateCcw />
                        ) : (
                          <CheckCircle2 />
                        )}
                        {saving
                          ? 'Saving…'
                          : existingEntry?.completed
                            ? 'Update & continue'
                            : 'Save & next'}
                        {!saving && <ChevronRight data-icon="inline-end" />}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </section>

            <aside className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle className="font-sans">Week {activeWeek}</CardTitle>
                  <CardDescription className="font-sans">
                    {weekDates[activeWeek - 1]}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {days.map((day) => {
                    const sessionPlan = planForSession(
                      sessionExercises,
                      activeWeek,
                      day,
                    );
                    const required = sessionPlan.filter(
                      (item) => !item.skipped,
                    );
                    const count = required.filter((item) =>
                      entries.some(
                        (entry) =>
                          entry.week === activeWeek &&
                          entry.day === day &&
                          entry.exerciseOrder === item.order &&
                          entry.completed,
                      ),
                    ).length;
                    const total = required.length;
                    const complete = total > 0 && count === total;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => chooseDay(day)}
                        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${activeDay === day ? 'border-primary/35 bg-accent/45' : 'border-border/80 hover:bg-muted/60'}`}
                      >
                        <span
                          className={`grid size-10 place-items-center rounded-xl font-sans font-bold ${complete ? 'bg-success-soft text-success' : day === activeDay ? 'bg-day-c text-day-c-foreground' : 'bg-secondary text-secondary-foreground'}`}
                        >
                          {day}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-sans font-semibold">
                            Day {day}
                          </span>
                          <span className="block font-sans text-xs text-muted-foreground">
                            {count} of {total} exercises
                          </span>
                        </span>
                        {complete ? (
                          <CheckCircle2 className="size-5 text-success" />
                        ) : (
                          <ChevronRight className="size-5 text-muted-foreground" />
                        )}
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
              {currentSessionEntries.length > 0 && (
                <Card className="bg-accent/35 ring-primary/15">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-sans">
                      <Sparkles className="size-4 text-primary" /> Day{' '}
                      {activeDay} summary
                    </CardTitle>
                    <CardDescription className="font-sans">
                      {currentSessionEntries.length} exercises ·{' '}
                      {currentSessionSets} sets ·{' '}
                      {Math.round(currentSessionVolume).toLocaleString()} kg
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => setSessionSummaryOpen(true)}
                    >
                      View session summary <ChevronRight />
                    </Button>
                  </CardContent>
                </Card>
              )}
              <Card
                className="min-h-32 bg-warning-soft ring-warning/20"
                aria-live="polite"
                aria-atomic="true"
              >
                <CardHeader key={trainingTips[activeTipIndex].title}>
                  <CardTitle className="flex items-center gap-2 font-sans text-warning-foreground">
                    <Target className="size-4" />{' '}
                    {trainingTips[activeTipIndex].title}
                  </CardTitle>
                  <CardDescription className="font-sans leading-relaxed text-warning-foreground/80">
                    {trainingTips[activeTipIndex].body}
                  </CardDescription>
                </CardHeader>
              </Card>
            </aside>
          </div>
        )}

        {view === 'plan' && (
          <section>
            <div className="mb-6">
              <p className="font-sans text-sm font-semibold text-primary">
                YOUR ROUTINE
              </p>
              <h1 className="font-sans text-3xl font-bold tracking-tight">
                Three balanced full-body days.
              </h1>
              <p className="mt-1 font-sans text-muted-foreground">
                Tap any day to start logging it for week {activeWeek}.
              </p>
            </div>
            <div className="grid gap-5 lg:grid-cols-3">
              {days.map((day) => {
                const sessionPlan = planForSession(
                  sessionExercises,
                  activeWeek,
                  day,
                );
                return (
                  <Card
                    key={day}
                    className={
                      day === 'A'
                        ? 'ring-blue-200'
                        : day === 'B'
                          ? 'ring-emerald-200'
                          : 'ring-violet-200'
                    }
                  >
                    <CardHeader>
                      <Badge
                        className={`mb-2 font-sans ${day === 'A' ? 'bg-blue-100 text-blue-700' : day === 'B' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'}`}
                      >
                        Day {day}
                      </Badge>
                      <CardTitle className="font-sans">
                        {sessionPlan.filter((item) => !item.skipped).length}{' '}
                        active exercises
                      </CardTitle>
                      <CardDescription className="font-sans">
                        Week {activeWeek} · changes apply only to this session
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {sessionPlan.map((item, index) => (
                        <div
                          key={item.order}
                          className={`flex gap-3 rounded-xl border border-border/75 p-3 ${item.skipped ? 'opacity-55' : ''}`}
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary font-sans text-xs font-bold">
                            {index + 1}
                          </span>
                          <div>
                            <p
                              className={`font-sans text-sm font-semibold leading-snug ${item.skipped ? 'line-through' : ''}`}
                            >
                              {item.name}
                            </p>
                            <p className="mt-1 font-sans text-xs text-muted-foreground">
                              {item.skipped
                                ? 'Skipped this session'
                                : `${targetLabel(item)} · ${item.rest}`}
                            </p>
                            <p className="mt-1 font-sans text-[11px] text-muted-foreground">
                              {item.custom
                                ? 'Custom exercise'
                                : `Alt: ${item.alternative}`}
                            </p>
                          </div>
                        </div>
                      ))}
                      <Button
                        className="mt-2 h-11 w-full font-sans"
                        onClick={() => chooseDay(day)}
                      >
                        Start Day {day}
                        <ChevronRight />
                      </Button>
                      <Button
                        variant="outline"
                        className="h-10 w-full font-sans"
                        onClick={() => {
                          setActiveDay(day);
                          setActiveIndex(0);
                          openProgramEditor(day);
                        }}
                      >
                        <Settings2 /> Edit Week {activeWeek}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {view === 'progress' && (
          <section>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-sans text-sm font-semibold text-primary">
                  TRAINING SUMMARY
                </p>
                <h1 className="font-sans text-3xl font-bold tracking-tight">
                  Progress across 12 weeks.
                </h1>
                <p className="mt-1 font-sans text-muted-foreground">
                  The same core KPIs and weekly totals as your spreadsheet,
                  updated automatically.
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                <Button
                  variant="outline"
                  className="font-sans"
                  disabled={loadingImport || importingSheet || loading}
                  onClick={previewGoogleSheetImport}
                >
                  {loadingImport ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Download />
                  )}{' '}
                  {loadingImport ? 'Checking…' : 'Import from Google Sheet'}
                </Button>
                <Button
                  variant="outline"
                  className="font-sans"
                  disabled={syncingSheet || loading}
                  onClick={syncGoogleSheet}
                >
                  {syncingSheet ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <FileSpreadsheet />
                  )}{' '}
                  {syncingSheet ? 'Sending…' : 'Send to Google Sheet'}
                </Button>
                <Button
                  variant="outline"
                  className="font-sans"
                  disabled={backupBusy || loading}
                  onClick={downloadBackup}
                >
                  {backupBusy ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Download />
                  )}{' '}
                  Download backup
                </Button>
                <Button
                  variant="outline"
                  className="font-sans"
                  disabled={backupBusy || loading}
                  onClick={() => {
                    setBackupOpen(true);
                    setBackupSummary(null);
                    setBackupData(null);
                    setBackupFileName('');
                  }}
                >
                  <Upload /> Restore backup
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ['Exercise rows', totalRows.toLocaleString(), Dumbbell],
                [
                  'Total volume',
                  `${Math.round(totalVolume).toLocaleString()} kg`,
                  TrendingUp,
                ],
                ['Sessions', String(totalSessions), CheckCircle2],
                ['Personal records', String(totalRecords), Medal],
                ['Weekly goal', '3 sessions', Target],
              ].map(([label, value, Icon]) => {
                const KpiIcon = Icon as typeof Dumbbell;
                return (
                  <Card key={String(label)} size="sm">
                    <CardContent className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary">
                        <KpiIcon className="size-5" />
                      </span>
                      <div>
                        <p className="font-sans text-xs text-muted-foreground">
                          {String(label)}
                        </p>
                        <p className="font-sans text-xl font-bold">
                          {String(value)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(330px,.65fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="font-sans">
                    Weekly training volume
                  </CardTitle>
                  <CardDescription className="font-sans">
                    Weight × reps across all logged sets
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Suspense
                    fallback={
                      <div className="grid h-[300px] place-items-center rounded-xl bg-muted/35 font-sans text-sm text-muted-foreground">
                        Loading chart…
                      </div>
                    }
                  >
                    <ProgressChart data={weeklySummaries} />
                  </Suspense>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="font-sans">Weekly summary</CardTitle>
                  <CardDescription className="font-sans">
                    Sessions completed out of 3
                  </CardDescription>
                </CardHeader>
                <CardContent className="max-h-[345px] space-y-3 overflow-y-auto pr-1">
                  {weeklySummaries.map((week) => (
                    <button
                      type="button"
                      key={week.week}
                      onClick={() => {
                        setActiveWeek(week.week);
                        setView('today');
                      }}
                      className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-muted"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary font-sans text-xs font-bold">
                        W{week.week}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex justify-between font-sans text-xs">
                          <span>{week.sessions}/3 sessions</span>
                          <span className="text-muted-foreground">
                            {Math.round(week.volume).toLocaleString()} kg
                          </span>
                        </span>
                        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${(week.sessions / 3) * 100}%` }}
                          />
                        </span>
                      </span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>
            <Card className="mt-5 overflow-hidden">
              <CardHeader className="border-b border-border/70">
                <div>
                  <CardTitle className="flex items-center gap-2 font-sans">
                    <TrendingUp className="size-5 text-primary" /> Exercise
                    progress
                  </CardTitle>
                  <CardDescription className="mt-1 font-sans">
                    Top weight and estimated strength for one exercise across
                    the programme.
                  </CardDescription>
                </div>
                <CardAction>
                  <select
                    value={progressExerciseKey}
                    onChange={(event) =>
                      setProgressExerciseKey(event.target.value)
                    }
                    aria-label="Exercise progress selection"
                    className="h-10 max-w-[260px] rounded-lg border bg-card px-3 font-sans text-sm font-medium outline-none focus:ring-3 focus:ring-ring/30"
                  >
                    {days.map((day) => (
                      <optgroup key={day} label={`Day ${day}`}>
                        {progressExerciseOptions
                          .filter((item) => item.day === day)
                          .map((item) => (
                            <option
                              key={`${day}|${item.order}`}
                              value={`${day}|${item.order}`}
                            >
                              {item.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </CardAction>
              </CardHeader>
              <CardContent className="pt-5">
                {selectedProgressData.length > 0 ? (
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <Suspense
                      fallback={
                        <div className="grid h-[260px] place-items-center rounded-xl bg-muted/35 font-sans text-sm text-muted-foreground">
                          Loading chart…
                        </div>
                      }
                    >
                      <ExerciseProgressChart data={selectedProgressData} />
                    </Suspense>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                      {[
                        [
                          'Latest top weight',
                          `${selectedProgressData.at(-1)?.maxWeight ?? 0} kg`,
                        ],
                        [
                          'Latest estimated 1RM',
                          `${selectedProgressData.at(-1)?.estimatedMax ?? 0} kg`,
                        ],
                        [
                          'Sessions logged',
                          String(selectedProgressData.length),
                        ],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="rounded-xl bg-secondary/65 p-3"
                        >
                          <p className="font-sans text-xs text-muted-foreground">
                            {label}
                          </p>
                          <p className="mt-1 font-sans text-lg font-bold tabular-nums">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-44 place-items-center rounded-xl bg-muted/40 px-5 text-center font-sans text-sm text-muted-foreground">
                    Log this exercise to start its progress chart.
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="mt-5 overflow-hidden">
              <CardHeader className="border-b border-border/70">
                <div>
                  <CardTitle className="flex items-center gap-2 font-sans">
                    <History className="size-5 text-primary" /> Exercise history
                  </CardTitle>
                  <CardDescription className="mt-1 font-sans">
                    Swipe between Day A, B, and C to review every completed
                    exercise, set, and note.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                <Carousel
                  opts={{ align: 'start', loop: false }}
                  aria-label="Workout history by training day"
                >
                  <CarouselContent>
                    {days.map((day) => {
                      const dayEntries = entries.filter(
                        (entry) => entry.completed && entry.day === day,
                      );
                      const sessionCount = new Set(
                        dayEntries.map((entry) => entry.week),
                      ).size;
                      const dayVolume = dayEntries.reduce(
                        (sum, entry) => sum + entryVolume(entry),
                        0,
                      );
                      const customHistory = new Map<number, RoutineExercise>();
                      dayEntries
                        .filter((entry) => entry.exerciseOrder >= 100)
                        .forEach((entry) => {
                          if (!customHistory.has(entry.exerciseOrder))
                            customHistory.set(entry.exerciseOrder, {
                              day,
                              order: entry.exerciseOrder,
                              name: entry.exercise,
                              targetSets: entry.setCount ?? 3,
                              repRange:
                                entry.target.split('×')[1]?.trim() ??
                                'Logged sets',
                              rest: 'Custom',
                              muscles: 'Custom exercise',
                              alternative: 'None',
                            });
                        });
                      const dayExercises = [
                        ...routine.filter((item) => item.day === day),
                        ...customHistory.values(),
                      ];
                      const dayColor =
                        day === 'A'
                          ? 'bg-blue-100 text-blue-700'
                          : day === 'B'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-violet-100 text-violet-700';

                      return (
                        <CarouselItem key={day}>
                          <div className="rounded-2xl border border-border/80 bg-muted/20 p-3 sm:p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4">
                              <div className="flex items-center gap-3">
                                <span
                                  className={`grid size-11 place-items-center rounded-xl font-sans text-sm font-bold ${dayColor}`}
                                >
                                  Day {day}
                                </span>
                                <div>
                                  <p className="font-sans font-semibold">
                                    {dayExercises.length} exercises
                                  </p>
                                  <p className="font-sans text-xs text-muted-foreground">
                                    Full workout history
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Badge
                                  variant="outline"
                                  className="bg-card font-sans"
                                >
                                  {sessionCount}{' '}
                                  {sessionCount === 1 ? 'session' : 'sessions'}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="bg-card font-sans"
                                >
                                  {Math.round(dayVolume).toLocaleString()} kg
                                  volume
                                </Badge>
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                              {dayExercises.map((item) => {
                                const exerciseEntries = dayEntries
                                  .filter(
                                    (entry) =>
                                      entry.exerciseOrder === item.order,
                                  )
                                  .sort(
                                    (a, b) =>
                                      b.week - a.week ||
                                      Date.parse(
                                        b.completedAt ?? b.updatedAt ?? '',
                                      ) -
                                        Date.parse(
                                          a.completedAt ?? a.updatedAt ?? '',
                                        ),
                                  );
                                const displayName =
                                  exerciseEntries[0]?.exercise ?? item.name;

                                return (
                                  <article
                                    key={`${day}-${item.order}`}
                                    className="flex min-h-56 flex-col rounded-xl border border-border/70 bg-card p-3 sm:p-4"
                                  >
                                    <div className="flex items-start gap-3">
                                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary font-sans text-xs font-bold">
                                        {item.order}
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <h3 className="font-sans text-sm font-semibold sm:text-base">
                                          {displayName}
                                        </h3>
                                        <p className="mt-0.5 font-sans text-xs text-muted-foreground">
                                          {targetLabel(item)} · {item.muscles}
                                        </p>
                                      </div>
                                    </div>

                                    {exerciseEntries.length > 0 ? (
                                      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                                        {exerciseEntries.map((entry) => (
                                          <div
                                            key={`${entry.week}-${entry.exerciseOrder}`}
                                            className="rounded-xl bg-muted/55 px-3 py-2.5"
                                          >
                                            <div className="flex flex-wrap items-center justify-between gap-1 font-sans text-xs">
                                              <span className="font-semibold text-foreground">
                                                Week {entry.week}
                                              </span>
                                              <span className="text-muted-foreground">
                                                {formatWorkoutDate(
                                                  entry.completedAt ??
                                                    entry.updatedAt,
                                                )}
                                              </span>
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                              {loggedSets(entry).map((set) => (
                                                <span
                                                  key={set.set}
                                                  className="rounded-lg border border-border/80 bg-card px-2 py-1 font-sans text-xs font-medium"
                                                >
                                                  Set {set.set}:{' '}
                                                  {set.weight == null
                                                    ? `${set.reps} ${displayName === 'Plank' ? 'sec' : 'reps'}`
                                                    : `${set.weight} kg × ${set.reps}`}
                                                </span>
                                              ))}
                                              {entry.rir != null && (
                                                <span className="rounded-lg border border-primary/20 bg-accent px-2 py-1 font-sans text-xs font-medium text-primary">
                                                  RIR {entry.rir}
                                                </span>
                                              )}
                                            </div>
                                            {entry.notes && (
                                              <p className="mt-2 flex gap-1.5 font-sans text-xs leading-relaxed text-muted-foreground">
                                                <NotebookPen className="mt-0.5 size-3.5 shrink-0" />
                                                {entry.notes}
                                              </p>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="mt-3 flex flex-1 items-center justify-center rounded-lg bg-muted/45 px-3 py-5 text-center font-sans text-xs text-muted-foreground">
                                        No logged sessions yet.
                                      </p>
                                    )}
                                  </article>
                                );
                              })}
                            </div>
                          </div>
                        </CarouselItem>
                      );
                    })}
                  </CarouselContent>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="font-sans text-xs text-muted-foreground">
                      Swipe horizontally or use the arrows to change day.
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <CarouselPrevious className="static inset-auto m-0 translate-x-0 translate-y-0" />
                      <CarouselNext className="static inset-auto m-0 translate-x-0 translate-y-0" />
                    </div>
                  </div>
                </Carousel>
              </CardContent>
            </Card>
          </section>
        )}

        {view === 'guide' && (
          <section>
            <div className="mb-6">
              <p className="font-sans text-sm font-semibold text-primary">
                START HERE
              </p>
              <h1 className="font-sans text-3xl font-bold tracking-tight">
                Train simply. Progress steadily.
              </h1>
              <p className="mt-1 font-sans text-muted-foreground">
                The guidance from your spreadsheet, organized for quick
                reference at the gym.
              </p>
            </div>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="font-sans">
                    How to use Liftline
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    [
                      'Train 3× per week',
                      'Do Day A, B and C, ideally with at least one rest or easy day between hard sessions.',
                    ],
                    [
                      'Warm up',
                      'Add 3–5 minutes of easy movement, then 1–3 lighter warm-up sets before the first big lift.',
                    ],
                    [
                      'Choose your load',
                      'Finish most working sets with about 2 reps in reserve. Technique comes before load.',
                    ],
                    [
                      'Progress gradually',
                      'Reach the top of the rep range on every working set with clean form and RIR 1–2, then add the smallest practical load.',
                    ],
                    [
                      'Rest enough',
                      'Use 2–3 minutes for demanding compound lifts and 60–90 seconds for smaller movements.',
                    ],
                    [
                      'Ramp in',
                      'Weeks 1–2 use two working sets at RIR ~3. Weeks 3–4 move toward the listed sets. Week 5 onward uses the full plan.',
                    ],
                    [
                      'Keep cardio',
                      'Running, walking and hiking can stay. Reduce leg volume if another activity leaves your legs heavily fatigued.',
                    ],
                    [
                      'Use machines freely',
                      'For unfamiliar barbell lifts, use a machine or Smith alternative until technique feels comfortable.',
                    ],
                  ].map(([title, description], index) => (
                    <div
                      key={title}
                      className="flex gap-3 rounded-xl border border-border/70 p-3"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent font-sans text-sm font-bold text-primary">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-sans font-semibold">{title}</p>
                        <p className="mt-1 font-sans text-sm leading-relaxed text-muted-foreground">
                          {description}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <div className="space-y-5">
                <Card className="bg-success-soft ring-success/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-sans text-success">
                      <Sparkles className="size-4" /> Balanced week
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 font-sans text-sm text-success/90">
                    {[
                      'Mon · Gym A',
                      'Tue · Walk / easy run',
                      'Wed · Gym B',
                      'Thu · Rest / walk',
                      'Fri · Gym C',
                      'Weekend · Rest, hike or easy run',
                    ].map((item) => (
                      <p
                        key={item}
                        className="rounded-lg bg-white/55 px-3 py-2"
                      >
                        {item}
                      </p>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="font-sans">Recovery notes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 font-sans text-sm text-muted-foreground">
                    <p>
                      <strong className="text-foreground">Sleep:</strong>{' '}
                      Consistent, adequate sleep matters more once you lift
                      three times weekly.
                    </p>
                    <p>
                      <strong className="text-foreground">Fat loss:</strong>{' '}
                      Keep the deficit modest. Strength stable or rising while
                      waist and weight trend down is excellent.
                    </p>
                    <p>
                      <strong className="text-foreground">Pain rule:</strong>{' '}
                      Stop and reassess sharp joint pain, dizziness, chest pain,
                      or unusual symptoms.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>
        )}
      </div>

      <Dialog
        open={exerciseDemoOpen}
        onOpenChange={(open) => {
          setExerciseDemoOpen(open);
          if (!open) setExerciseDemoImageFailed(false);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2 font-sans text-xl">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-primary">
                <CirclePlay className="size-5" />
              </span>
              {exerciseDemoVariant?.label ?? exercise.name}
            </DialogTitle>
            <DialogDescription className="font-sans">
              Animated movement guide for {exercise.name}
            </DialogDescription>
          </DialogHeader>

          {exerciseDemo && exerciseDemoVariant ? (
            <div className="space-y-4">
              {exerciseDemo.variants.length > 1 && (
                <fieldset className="flex gap-2 overflow-x-auto pb-1">
                  <legend className="sr-only">Choose a movement</legend>
                  {exerciseDemo.variants.map((variant, index) => (
                    <Button
                      key={variant.label}
                      type="button"
                      size="sm"
                      variant={
                        exerciseDemoVariantIndex === index
                          ? 'default'
                          : 'outline'
                      }
                      className="shrink-0 font-sans"
                      aria-pressed={exerciseDemoVariantIndex === index}
                      onClick={() => {
                        setExerciseDemoVariantIndex(index);
                        setExerciseDemoImageFailed(false);
                      }}
                    >
                      {variant.label}
                    </Button>
                  ))}
                </fieldset>
              )}

              <div className="grid min-h-64 place-items-center overflow-hidden rounded-2xl border border-primary/15 bg-white shadow-inner">
                {exerciseDemoImageFailed ? (
                  <div className="px-6 py-12 text-center">
                    <ImageOff className="mx-auto size-8 text-muted-foreground" />
                    <p className="mt-3 font-sans font-semibold">
                      Movement guide unavailable
                    </p>
                    <p className="mt-1 font-sans text-sm text-muted-foreground">
                      Check your connection and try opening the guide again.
                    </p>
                  </div>
                ) : (
                  // oxlint-disable-next-line next/no-img-element -- The on-demand modal uses animated GIFs, which should not be transformed by an image optimizer.
                  <img
                    key={exerciseDemoVariant.gif}
                    src={exerciseDemoVariant.gif}
                    alt={`${exerciseDemoVariant.label} animated exercise demonstration`}
                    className="aspect-square max-h-[42dvh] w-full object-contain"
                    loading="eager"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => setExerciseDemoImageFailed(true)}
                  />
                )}
              </div>

              {exerciseDemoVariant.note && (
                <p className="rounded-xl border border-warning/20 bg-warning-soft px-3 py-2 font-sans text-xs leading-relaxed text-warning-foreground">
                  {exerciseDemoVariant.note}
                </p>
              )}

              <div className="rounded-2xl bg-accent/45 p-4">
                <p className="font-sans text-sm font-semibold">Form cues</p>
                <ul className="mt-2 space-y-2 pl-5 font-sans text-sm leading-relaxed text-muted-foreground marker:text-primary">
                  {exerciseDemoVariant.cues.map((cue) => (
                    <li key={cue} className="list-disc pl-1">
                      {cue}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="font-sans text-xs leading-relaxed text-muted-foreground">
                Use this as a movement reference, not a substitute for in-person
                coaching. Animation from the{' '}
                <a
                  href={exerciseDemoSource}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  open exercise library
                </a>
                .
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
              <ImageOff className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-sans font-semibold">
                No animation matched yet
              </p>
              <p className="mt-1 font-sans text-sm text-muted-foreground">
                This can happen for a custom or renamed exercise.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => setExerciseDemoOpen(false)}
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              {activeWeek} · Day {activeDay}
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
                                    ? { ...exercise, rest: event.target.value }
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
                                  ? { ...exercise, skipped: checked === true }
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
                                    exercise.exerciseOrder !==
                                    item.exerciseOrder,
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

      <Dialog open={sessionSummaryOpen} onOpenChange={setSessionSummaryOpen}>
        <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-sans text-xl">
              <Sparkles className="size-5 text-primary" /> Week {activeWeek} ·
              Day {activeDay}
            </DialogTitle>
            <DialogDescription className="font-sans">
              Your completed session at a glance.
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
                <p className="font-sans text-xs text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 font-sans text-lg font-bold tabular-nums">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {currentSessionEntries
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
            <Button onClick={() => setSessionSummaryOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={personalRecordOpen}
        onOpenChange={(open) => {
          setPersonalRecordOpen(open);
          if (!open && currentSessionComplete) setSessionSummaryOpen(true);
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
              A stronger entry for {exercise.name}.
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
            <Button
              className="w-full"
              onClick={() => setPersonalRecordOpen(false)}
            >
              Keep going
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={backupOpen}
        onOpenChange={(open) => {
          if (!backupBusy) setBackupOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-sans">
              <Upload className="size-5 text-primary" /> Restore Liftline backup
            </DialogTitle>
            <DialogDescription className="font-sans">
              Choose a Liftline JSON backup. You will see exactly how many
              records it contains before anything changes.
            </DialogDescription>
          </DialogHeader>
          <label className="grid cursor-pointer place-items-center rounded-xl border border-dashed border-primary/35 bg-accent/25 px-5 py-8 text-center">
            {backupBusy ? (
              <Loader2 className="size-6 animate-spin text-primary" />
            ) : (
              <Upload className="size-6 text-primary" />
            )}
            <span className="mt-2 font-sans text-sm font-semibold">
              {backupFileName || 'Choose backup file'}
            </span>
            <span className="mt-1 font-sans text-xs text-muted-foreground">
              JSON files exported by Liftline
            </span>
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={previewBackupFile}
              disabled={backupBusy}
            />
          </label>
          {backupSummary && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-success-soft p-3">
                <p className="font-sans text-xl font-bold text-success">
                  {backupSummary.newWorkoutRecords}
                </p>
                <p className="font-sans text-xs text-success/80">New records</p>
              </div>
              <div className="rounded-xl bg-warning-soft p-3">
                <p className="font-sans text-xl font-bold text-warning-foreground">
                  {backupSummary.replacedWorkoutRecords}
                </p>
                <p className="font-sans text-xs text-warning-foreground/80">
                  Records replaced
                </p>
              </div>
              <div className="col-span-2 rounded-xl bg-secondary p-3">
                <p className="font-sans text-sm font-semibold">
                  {backupSummary.sessionChanges} session customizations
                </p>
                <p className="font-sans text-xs text-muted-foreground">
                  Records not contained in the backup will be kept.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBackupOpen(false)}
              disabled={backupBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={restoreBackup}
              disabled={!backupSummary || backupBusy}
            >
              {backupBusy ? <Loader2 className="animate-spin" /> : <Upload />}{' '}
              Restore backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          if (!importingSheet) setImportOpen(open);
        }}
      >
        <DialogContent className="h-[calc(100dvh-1.5rem)] max-h-[760px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle className="font-sans text-lg font-semibold">
              Preview Google Sheet import
            </DialogTitle>
            <DialogDescription className="font-sans">
              Nothing changes until you confirm. New entries are selected;
              existing Liftline records remain protected unless you select them.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto px-5 pb-2">
            {loadingImport && (
              <div className="grid min-h-52 place-items-center text-muted-foreground">
                <div className="flex items-center gap-2 font-sans">
                  <Loader2 className="size-5 animate-spin" /> Reading Workout
                  Log…
                </div>
              </div>
            )}
            {sheetImportError && (
              <Alert variant="destructive" className="my-3">
                <AlertCircle />
                <AlertTitle>Import preview unavailable</AlertTitle>
                <AlertDescription>{sheetImportError}</AlertDescription>
              </Alert>
            )}

            {importPreview && !loadingImport && (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-success-soft p-3">
                    <p className="font-sans text-xl font-bold text-success">
                      {importPreview.summary.new}
                    </p>
                    <p className="font-sans text-xs text-success/80">New</p>
                  </div>
                  <div className="rounded-xl bg-secondary p-3">
                    <p className="font-sans text-xl font-bold">
                      {importPreview.summary.unchanged}
                    </p>
                    <p className="font-sans text-xs text-muted-foreground">
                      Already matches
                    </p>
                  </div>
                  <div className="rounded-xl bg-warning-soft p-3">
                    <p className="font-sans text-xl font-bold text-warning-foreground">
                      {importPreview.summary.protected}
                    </p>
                    <p className="font-sans text-xs text-warning-foreground/80">
                      Protected
                    </p>
                  </div>
                </div>

                {importPreview.items.some(
                  (item) => item.status !== 'unchanged',
                ) ? (
                  <div className="space-y-2">
                    {importPreview.items
                      .filter((item) => item.status !== 'unchanged')
                      .map((item) => {
                        const selected = selectedImportKeys.includes(item.key);
                        return (
                          <label
                            key={item.key}
                            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${selected ? 'border-primary/35 bg-accent/35' : 'border-border/80 bg-card'}`}
                          >
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked) =>
                                toggleImportItem(item.key, checked === true)
                              }
                              aria-label={`Import ${item.source.exercise}`}
                              className="mt-0.5"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-sans text-sm font-semibold">
                                  Week {item.source.week} · Day{' '}
                                  {item.source.day} · {item.source.exercise}
                                </span>
                                <Badge
                                  className={`font-sans text-[10px] ${item.status === 'new' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning-foreground'}`}
                                >
                                  {item.status === 'new'
                                    ? 'New'
                                    : 'Existing record'}
                                </Badge>
                              </span>
                              <span className="mt-1 block font-sans text-xs text-muted-foreground">
                                {sheetEntrySummary(item.source) ||
                                  'No set values'}
                                {item.source.rir == null
                                  ? ''
                                  : ` · RIR ${item.source.rir}`}
                              </span>
                              {item.status === 'protected' && (
                                <span className="mt-1.5 flex items-center gap-1 font-sans text-xs font-medium text-warning-foreground">
                                  <ShieldCheck className="size-3.5" /> Selecting
                                  this will replace the Liftline values.
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success-soft p-4 text-success">
                    <CheckCircle2 className="size-5" />
                    <p className="font-sans text-sm font-medium">
                      Liftline already matches every completed Google Sheet row.
                    </p>
                  </div>
                )}

                {selectedImportKeys.some((key) =>
                  importPreview.items.some(
                    (item) => item.key === key && item.status === 'protected',
                  ),
                ) && (
                  <Alert className="border-warning/25 bg-warning-soft text-warning-foreground">
                    <ShieldCheck />
                    <AlertTitle>Replacement selected</AlertTitle>
                    <AlertDescription className="text-warning-foreground/80">
                      One or more existing Liftline records will be replaced
                      with the Google Sheet values when you confirm.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="m-0 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              variant="outline"
              onClick={() => setImportOpen(false)}
              disabled={importingSheet}
            >
              Cancel
            </Button>
            <Button
              onClick={importSelectedSheetEntries}
              disabled={
                !importPreview ||
                selectedImportKeys.length === 0 ||
                importingSheet
              }
            >
              {importingSheet ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Download />
              )}
              {importingSheet
                ? 'Importing…'
                : `Import selected${selectedImportKeys.length > 0 ? ` (${selectedImportKeys.length})` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgb(15_23_42/7%)] backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-sm grid-cols-3">
          <NavButton
            view="today"
            active={view === 'today'}
            icon={Home}
            label="Today"
            onChange={setView}
            compact
          />
          <NavButton
            view="plan"
            active={view === 'plan'}
            icon={CalendarDays}
            label="Plan"
            onChange={setView}
            compact
          />
          <NavButton
            view="progress"
            active={view === 'progress'}
            icon={BarChart3}
            label="Progress"
            onChange={setView}
            compact
          />
        </div>
      </nav>
    </main>
  );
}
