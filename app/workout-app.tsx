'use client';

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react';
import {
  AlertCircle,
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  Clock3,
  Copy,
  Download,
  Dumbbell,
  FileSpreadsheet,
  Focus,
  History,
  Home,
  Loader2,
  LockKeyhole,
  Medal,
  Minus,
  NotebookPen,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  TreePalm,
  UnlockKeyhole,
  Upload,
} from 'lucide-react';
import { appVersion, brandMarkHref, notificationIconHref } from './app-release';
import RestTimer, { type RestTimerHandle } from './rest-timer';
import { ProgrammeToolsMenu } from './programme-tools-menu';
import {
  hasPendingOutbox,
  outboxStorageIssue,
  confirmOutboxResponse,
} from '@/lib/workout-outbox';
import { undoWorkoutPayload } from '@/lib/workout-undo';

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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  days,
  displayWeekNumber,
  routineForWeek,
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
} from '@/lib/workout-metrics';
import { findStartupWeek } from '@/lib/startup-week';
import { latestDraftKey } from '@/lib/exercise-drafts';
import { isBundledApp } from '@/lib/client-runtime';
import { sessionProgress } from '@/lib/session-progress';
import { dayPresentation } from '@/lib/day-presentation';
import ExerciseDraftBoundary, {
  type DraftStatus,
} from './exercise-draft-boundary';
import { useOutboxRetry } from './use-outbox-retry';
import { recallSets, validateWorkoutNumbers } from '@/lib/workout-validation';
import {
  acknowledgeOutbox,
  blockOutbox,
  enqueueOutbox,
  migrateWorkoutOutbox,
  overlayOutbox,
  readOutbox,
  retryableStatus,
  singleFlight,
  type OutboxItem,
} from '@/lib/workout-outbox';
import type { SessionExercise, WorkoutEntry } from '@/lib/workout-types';
import type { ProgramSchedule } from './training-tools-dialog';

type View = 'today' | 'plan' | 'progress' | 'nutrition' | 'guide';
type TrainingTool = 'schedule' | 'readiness' | 'calculator' | 'metrics';

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

type PendingWorkout = OutboxItem<WorkoutEntry> & { payload: WorkoutPayload };

type BackupSummary = {
  workoutRecords: number;
  newWorkoutRecords: number;
  replacedWorkoutRecords: number;
  sessionChanges: number;
  newSessionChanges: number;
  bodyMeasurements?: number;
  readinessChecks?: number;
  holidayRecords?: number;
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
const scheduleCacheKey = 'liftline.programme-schedule.v1';
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

function readCachedWorkoutEntries(): {
  entries: WorkoutEntry[];
  syncedAt: string | null;
} | null {
  try {
    const cached = window.localStorage.getItem(workoutCacheKey);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as {
      entries?: WorkoutEntry[];
      syncedAt?: string;
    };
    return Array.isArray(parsed.entries)
      ? {
          entries: normaliseWorkoutEntries(parsed.entries),
          syncedAt:
            typeof parsed.syncedAt === 'string' ? parsed.syncedAt : null,
        }
      : null;
  } catch {
    return null;
  }
}

function cacheWorkoutEntries(entries: WorkoutEntry[], syncedAt?: string) {
  try {
    const current = window.localStorage.getItem(workoutCacheKey);
    const currentSyncedAt = current
      ? (JSON.parse(current) as { syncedAt?: string }).syncedAt
      : undefined;
    window.localStorage.setItem(
      workoutCacheKey,
      JSON.stringify({
        entries,
        cachedAt: Date.now(),
        syncedAt: syncedAt ?? currentSyncedAt ?? null,
      }),
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

function readCachedSchedule(): ProgramSchedule | null {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(scheduleCacheKey) ?? 'null',
    );
    const validDate = (date: unknown) =>
      typeof date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      Number.isFinite(Date.parse(date));
    return value &&
      validDate(value.phase1StartDate) &&
      validDate(value.phase2StartDate)
      ? value
      : null;
  } catch {
    return null;
  }
}

function cacheSchedule(schedule: ProgramSchedule) {
  try {
    window.localStorage.setItem(scheduleCacheKey, JSON.stringify(schedule));
  } catch {
    /* Server settings remain authoritative. */
  }
}

function resumeDraftIndex(
  plan: PlannedExercise[],
  week: number,
  day: TrainingDay,
) {
  try {
    const key = latestDraftKey(`workout:${week}:${day}:`, window.localStorage);
    return Math.max(
      0,
      plan.findIndex(
        (item) =>
          !item.skipped &&
          key === `workout:${week}:${day}:${item.order}:${item.name}`,
      ),
    );
  } catch {
    return 0;
  }
}

function readPendingWorkouts(): PendingWorkout[] {
  try {
    migrateWorkoutOutbox(window.localStorage, (raw) => {
      const payload = raw as WorkoutPayload;
      const exercise = routineForWeek(payload.week).find(
        (item) =>
          item.day === payload.day && item.order === payload.exerciseOrder,
      );
      return optimisticEntry(payload, {
        ...exercise,
        name: exercise?.name ?? 'Exercise',
        custom: false,
      } as PlannedExercise);
    });
    return readOutbox<WorkoutEntry>(
      'workout',
      window.localStorage,
    ) as PendingWorkout[];
  } catch {
    return [];
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
    syncStatus:
      exercise.custom || payload.week > 12 ? 'not_applicable' : 'pending',
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

function mergeWorkoutEntries(
  current: WorkoutEntry[],
  incoming: WorkoutEntry[],
) {
  const merged = new Map(current.map((entry) => [workoutKey(entry), entry]));
  incoming.forEach((entry) => merged.set(workoutKey(entry), entry));
  return [...merged.values()].sort(
    (left, right) =>
      left.week - right.week ||
      left.day.localeCompare(right.day) ||
      left.exerciseOrder - right.exerciseOrder,
  );
}

const ProgressView = lazy(() => import('./progress-view'));
const ExerciseDemoDialog = lazy(() => import('./exercise-demo-dialog'));
const TrainingToolsDialog = lazy(() => import('./training-tools-dialog'));
const DataManagementDialogs = lazy(() => import('./data-management-dialogs'));
const HolidayWorkout = lazy(() => import('./holiday-workout'));
const NutritionView = lazy(() => import('./nutrition-view'));
const TrainingGuideView = lazy(() => import('./training-guide-view'));
const PlanView = lazy(() => import('./plan-view'));
const Checkbox = lazy(() =>
  import('@/components/ui/checkbox').then((module) => ({
    default: module.Checkbox,
  })),
);
const Dialog = lazy(() =>
  import('@/components/ui/dialog').then((module) => ({
    default: module.Dialog,
  })),
);
const DialogContent = lazy(() =>
  import('@/components/ui/dialog').then((module) => ({
    default: module.DialogContent,
  })),
);
const DialogDescription = lazy(() =>
  import('@/components/ui/dialog').then((module) => ({
    default: module.DialogDescription,
  })),
);
const DialogFooter = lazy(() =>
  import('@/components/ui/dialog').then((module) => ({
    default: module.DialogFooter,
  })),
);
const DialogHeader = lazy(() =>
  import('@/components/ui/dialog').then((module) => ({
    default: module.DialogHeader,
  })),
);
const DialogTitle = lazy(() =>
  import('@/components/ui/dialog').then((module) => ({
    default: module.DialogTitle,
  })),
);

const defaultSchedule: ProgramSchedule = {
  phase1StartDate: '2026-08-26',
  phase2StartDate: '2026-11-18',
};

function weekRange(startDate: string, offset: number) {
  const start = new Date(`${startDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + offset * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const month = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
  return `${month.format(start)} ${start.getUTCDate()}–${month.format(end)} ${end.getUTCDate()}`;
}

function scheduledWeekForToday(
  schedule: ProgramSchedule,
  phaseTwoUnlocked: boolean,
  now = new Date(),
) {
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(dateParts.find((part) => part.type === type)?.value);
  const today = Date.UTC(value('year'), value('month') - 1, value('day'));
  const phaseOneStart = Date.parse(`${schedule.phase1StartDate}T00:00:00Z`);
  const phaseTwoStart = Date.parse(`${schedule.phase2StartDate}T00:00:00Z`);
  const weekFrom = (start: number) =>
    Math.floor((today - start) / (7 * 24 * 60 * 60 * 1000));

  if (
    phaseTwoUnlocked &&
    Number.isFinite(phaseTwoStart) &&
    today >= phaseTwoStart
  ) {
    return Math.min(24, Math.max(13, 13 + weekFrom(phaseTwoStart)));
  }

  if (!Number.isFinite(phaseOneStart)) return 1;
  return Math.min(12, Math.max(1, 1 + weekFrom(phaseOneStart)));
}

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

const phase2TrainingTips = [
  {
    title: 'Use double progression',
    body: 'Keep the load while building reps inside the range. Add the smallest practical increment once every set reaches the top with stable technique and target RIR.',
  },
  {
    title: 'Build free-weight skill gradually',
    body: 'Start with about one major free-weight movement per session, conservative loads, and repeatable technique before adding more exposure.',
  },
  {
    title: 'Warm up for the first compound',
    body: 'Use 2–4 ramp sets before the first major lift. Later exercises usually need only 0–2 quick warm-up sets.',
  },
  {
    title: 'Keep compounds shy of failure',
    body: 'Most primary compounds belong around 1–3 RIR. End the set when technique changes significantly, even if another rough rep is possible.',
  },
  {
    title: 'Watch accumulated fatigue',
    body: 'If performance drops for two sessions alongside poor sleep, soreness, or joint discomfort, reduce accessory work first and consider a deload if it persists.',
  },
  {
    title: 'Fit cardio around recovery',
    body: 'Use 1–2 conversational incline sessions of 20–40 minutes and avoid hard hill work immediately before a lower-body-heavy day.',
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

function weeklySummariesForPhase(
  entries: WorkoutEntry[],
  sessionExercises: SessionExercise[],
  startWeek: number,
) {
  return Array.from({ length: 12 }, (_, index) => {
    const storageWeek = startWeek + index;
    const weekEntries = entries.filter(
      (entry) => entry.week === storageWeek && entry.completed,
    );
    const sessions = days.filter((day) => {
      const required = planForSession(
        sessionExercises,
        storageWeek,
        day,
      ).filter((item) => !item.skipped);
      return (
        required.length > 0 &&
        required.every((item) =>
          weekEntries.some(
            (entry) => entry.day === day && entry.exerciseOrder === item.order,
          ),
        )
      );
    }).length;
    return {
      week: index + 1,
      storageWeek,
      rows: weekEntries.length,
      sessions,
      volume:
        Math.round(
          weekEntries.reduce((sum, entry) => sum + entryVolume(entry), 0) * 10,
        ) / 10,
      dayA: weekEntries.filter((entry) => entry.day === 'A').length,
      dayB: weekEntries.filter((entry) => entry.day === 'B').length,
      dayC: weekEntries.filter((entry) => entry.day === 'C').length,
    };
  });
}

function firstIncompleteDayForWeek(
  entries: WorkoutEntry[],
  sessionExercises: SessionExercise[],
  week: number,
) {
  const completedEntries = entries.filter(
    (entry) => entry.week === week && entry.completed,
  );
  return (
    days.find((day) => {
      const required = planForSession(sessionExercises, week, day).filter(
        (item) => !item.skipped,
      );
      return (
        required.length > 0 &&
        !required.every((item) =>
          completedEntries.some(
            (entry) => entry.day === day && entry.exerciseOrder === item.order,
          ),
        )
      );
    }) ?? 'A'
  );
}

function startupSessionForWeek(
  entries: WorkoutEntry[],
  sessionExercises: SessionExercise[],
  scheduledWeek: number,
) {
  const completedEntries = entries.filter((entry) => entry.completed);
  const startupWeek = findStartupWeek(scheduledWeek, (week) =>
    days.every((day) => {
      const required = planForSession(sessionExercises, week, day).filter(
        (item) => !item.skipped,
      );
      return (
        required.length > 0 &&
        required.every((item) =>
          completedEntries.some(
            (entry) =>
              entry.week === week &&
              entry.day === day &&
              entry.exerciseOrder === item.order,
          ),
        )
      );
    }),
  );

  return {
    week: startupWeek,
    day: firstIncompleteDayForWeek(
      completedEntries,
      sessionExercises,
      startupWeek,
    ),
  };
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
        className={`beta-nav-button flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl font-sans text-xs font-semibold transition-colors ${active ? 'is-active text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <span className="beta-nav-icon">
          <Icon className="size-5" />
        </span>
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

function DashboardMetric({
  icon: Icon,
  label,
  value,
  detail,
  progress,
  accent,
}: {
  icon: typeof Home;
  label: string;
  value: string;
  detail: string;
  progress: number;
  accent: string;
}) {
  return (
    <article
      className="beta-metric-card"
      style={
        {
          '--metric-progress': `${Math.min(100, Math.max(0, progress)) * 3.6}deg`,
          '--metric-accent': accent,
        } as CSSProperties
      }
    >
      <div className="beta-metric-ring" aria-hidden="true">
        <div className="beta-metric-ring-inner">
          <Icon className="size-5" />
        </div>
      </div>
      <div className="min-w-0">
        <p className="beta-metric-label">{label}</p>
        <p className="beta-metric-value">{value}</p>
        <p className="beta-metric-detail">{detail}</p>
      </div>
    </article>
  );
}

export function WorkoutApp() {
  const initialWeek = scheduledWeekForToday(defaultSchedule, false);
  const [view, setView] = useState<View>('today');
  const [holidayMode, setHolidayMode] = useState(false);
  const [activeWeek, setActiveWeek] = useState(initialWeek);
  const [activeDay, setActiveDay] = useState<TrainingDay>('A');
  const [activeIndex, setActiveIndex] = useState(0);
  const [entries, setEntries] = useState<WorkoutEntry[]>([]);
  const [sessionExercises, setSessionExercises] = useState<SessionExercise[]>(
    [],
  );
  const [workoutFocus, setWorkoutFocus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSave, setLastSave] = useState<{
    saved: WorkoutEntry;
    before?: WorkoutEntry;
  } | null>(null);
  const [undoing, setUndoing] = useState(false);
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
  const [exerciseDraft, setDraftStatus] = useState<DraftStatus>({
    dirty: false,
    persisted: false,
  });
  const loggerSnapshot = useRef<(Draft & { setCount: number }) | null>(null);
  const onDraftSnapshot = useCallback((value: Draft & { setCount: number }) => {
    loggerSnapshot.current = value;
  }, []);
  const [activeTipIndex, setActiveTipIndex] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingWorkoutCount, setPendingWorkoutCount] = useState(0);
  const [queueIssue, setQueueIssue] = useState<string | null>(null);
  const blockedWorkouts =
    typeof window !== 'undefined'
      ? readPendingWorkouts().filter((item) => item.blocked)
      : [];
  const [personalRecords, setPersonalRecords] = useState<string[]>([]);
  const [personalRecordOpen, setPersonalRecordOpen] = useState(false);
  const [sessionSummaryOpen, setSessionSummaryOpen] = useState(false);
  const [sessionCelebrationPending, setSessionCelebrationPending] =
    useState(false);
  const [programOpen, setProgramOpen] = useState(false);
  const [programmeMenuOpen, setProgrammeMenuOpen] = useState(false);
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
  const [phaseUnlockOpen, setPhaseUnlockOpen] = useState(false);
  const [activeTrainingTool, setActiveTrainingTool] =
    useState<TrainingTool | null>(null);
  const [schedule, setSchedule] = useState<ProgramSchedule>(defaultSchedule);
  const restTimerRef = useRef<RestTimerHandle>(null);
  const programmeMenuRef = useRef<HTMLDivElement>(null);
  const startupWeekApplied = useRef(false);
  const refreshSequence = useRef(0);
  const mutationSequence = useRef(0);
  const currentSelection = useRef('');
  currentSelection.current = `${activeWeek}|${activeDay}|${activeIndex}`;

  const activePhase = activeWeek > 12 ? 2 : 1;
  const phaseStartWeek = activePhase === 1 ? 1 : 13;
  const activeDisplayWeek = displayWeekNumber(activeWeek);
  const activeRoutine = routineForWeek(activeWeek);
  const activeTrainingTips =
    activePhase === 1 ? trainingTips : phase2TrainingTips;
  const weekDates = useMemo(
    () => [
      ...Array.from({ length: 12 }, (_, index) =>
        weekRange(schedule.phase1StartDate, index),
      ),
      ...Array.from({ length: 12 }, (_, index) =>
        weekRange(schedule.phase2StartDate, index),
      ),
    ],
    [schedule],
  );
  const entryIndex = useMemo(() => {
    const byWorkout = new Map<string, WorkoutEntry>();
    const completedByExercise = new Map<string, WorkoutEntry[]>();
    const completedBySession = new Map<string, WorkoutEntry[]>();
    const byPhase = new Map<1 | 2, WorkoutEntry[]>([
      [1, []],
      [2, []],
    ]);
    const completedByPhaseDay = new Map<string, WorkoutEntry[]>();

    entries.forEach((entry) => {
      const phase = entry.week > 12 ? 2 : 1;
      byWorkout.set(workoutKey(entry), entry);
      byPhase.get(phase)?.push(entry);
      if (!entry.completed) return;

      const exerciseKey = `${phase}|${entry.day}|${entry.exerciseOrder}`;
      const sessionKey = `${entry.week}|${entry.day}`;
      const phaseDayKey = `${phase}|${entry.day}`;
      const exerciseEntries = completedByExercise.get(exerciseKey);
      if (exerciseEntries) exerciseEntries.push(entry);
      else completedByExercise.set(exerciseKey, [entry]);
      const sessionEntries = completedBySession.get(sessionKey);
      if (sessionEntries) sessionEntries.push(entry);
      else completedBySession.set(sessionKey, [entry]);
      const phaseDayEntries = completedByPhaseDay.get(phaseDayKey);
      if (phaseDayEntries) phaseDayEntries.push(entry);
      else completedByPhaseDay.set(phaseDayKey, [entry]);
    });

    completedByExercise.forEach((indexedEntries) =>
      indexedEntries.sort((left, right) => right.week - left.week),
    );
    completedByPhaseDay.forEach((indexedEntries) =>
      indexedEntries.sort(
        (left, right) =>
          right.week - left.week ||
          Date.parse(right.completedAt ?? right.updatedAt ?? '') -
            Date.parse(left.completedAt ?? left.updatedAt ?? ''),
      ),
    );

    return {
      byWorkout,
      completedByExercise,
      completedBySession,
      byPhase,
      completedByPhaseDay,
    };
  }, [entries]);

  const dayExercises = useMemo(
    () => planForSession(sessionExercises, activeWeek, activeDay),
    [activeDay, activeWeek, sessionExercises],
  );
  const exercise = (dayExercises[activeIndex] ?? dayExercises[0])!;
  const existingEntry = exercise
    ? entryIndex.byWorkout.get(
        workoutKey({
          week: activeWeek,
          day: activeDay,
          exerciseOrder: exercise.order,
        }),
      )
    : undefined;
  const draftKey = `workout:${activeWeek}:${activeDay}:${exercise.order}:${exercise.name}`;
  const dayProgress = useMemo(
    () =>
      Object.fromEntries(
        days.map((day) => [
          day,
          sessionProgress(
            planForSession(sessionExercises, activeWeek, day),
            entryIndex.completedBySession.get(`${activeWeek}|${day}`) ?? [],
          ),
        ]),
      ) as Record<TrainingDay, ReturnType<typeof sessionProgress>>,
    [activeWeek, entryIndex, sessionExercises],
  );
  const previousEntry = exercise
    ? entryIndex.completedByExercise
        .get(`${activePhase}|${activeDay}|${exercise.order}`)
        ?.find((entry) => entry.week < activeWeek)
    : undefined;
  const activeSets = exercise ? workingSetsForWeek(exercise, activeWeek) : 1;
  const suggestedRestSeconds = exercise
    ? recommendedRestSeconds(exercise.rest)
    : 60;

  const refreshWorkoutData = useCallback(
    async (cachedEntries?: WorkoutEntry[], syncedAt?: string | null) => {
      const requestSequence = ++refreshSequence.current;
      const mutation = mutationSequence.current;
      const query =
        cachedEntries && syncedAt
          ? `?cursor=${encodeURIComponent(syncedAt)}`
          : '';
      const response = await fetch(`/api/workouts${query}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await response.json()) as {
        entries?: WorkoutEntry[];
        sessionExercises?: SessionExercise[];
        partial?: boolean;
        cursor?: string;
        schedule?: ProgramSchedule;
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? 'Unable to load workouts.');
      if (
        requestSequence !== refreshSequence.current ||
        mutation !== mutationSequence.current
      )
        return readCachedWorkoutEntries()?.entries ?? [];
      const incomingEntries = normaliseWorkoutEntries(data.entries ?? []);
      const serverEntries =
        data.partial && cachedEntries
          ? mergeWorkoutEntries(cachedEntries, incomingEntries)
          : incomingEntries;
      const freshEntries = overlayOutbox(
        serverEntries,
        readPendingWorkouts(),
        workoutKey,
      );
      const freshSessionExercises = normaliseSessionExercises(
        data.sessionExercises ?? [],
      );
      setEntries(freshEntries);
      setSessionExercises(freshSessionExercises);
      if (data.schedule) {
        setSchedule(data.schedule);
        cacheSchedule(data.schedule);
      }
      cacheWorkoutEntries(freshEntries, data.cursor);
      cacheSessionExercises(freshSessionExercises);
      return freshEntries;
    },
    [],
  );

  const flushPendingWorkouts = useCallback(
    () =>
      singleFlight('workout-outbox', async () => {
        const queue = readPendingWorkouts();
        if (queue.length === 0 || !navigator.onLine) {
          setPendingWorkoutCount(queue.length);
          return;
        }

        for (const item of queue) {
          if (item.blocked) continue;
          try {
            const response = await fetch('/api/workouts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item.payload),
              signal: AbortSignal.timeout(15_000),
            });
            if (response.ok) {
              await confirmOutboxResponse(response, 'workout', item);
              acknowledgeOutbox('workout', item, window.localStorage);
            } else if (!retryableStatus(response.status)) {
              const data = (await response.json().catch(() => ({}))) as {
                error?: string;
              };
              const message =
                data.error ??
                'This queued workout needs review before it can sync.';
              blockOutbox('workout', item, message, window.localStorage);
              setError(message);
            }
          } catch {
            // Timeouts and network failures stay durable for bounded automatic retry.
          }
        }
        const remaining = readPendingWorkouts();
        setPendingWorkoutCount(remaining.length);
        if (remaining.length === 0) {
          await refreshWorkoutData();
          setNotice('Offline workouts are safely synced to Liftline.');
        }
      }),
    [refreshWorkoutData],
  );
  useOutboxRetry(flushPendingWorkouts, pendingWorkoutCount);

  useEffect(() => {
    if (!programmeMenuOpen) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!programmeMenuRef.current?.contains(event.target as Node))
        setProgrammeMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProgrammeMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [programmeMenuOpen]);

  useLayoutEffect(() => {
    let cancelled = false;
    const cachedSnapshot = readCachedWorkoutEntries();
    const cachedEntries = cachedSnapshot?.entries ?? null;
    const cachedSessionExercises = readCachedSessionExercises();
    const cachedSchedule = readCachedSchedule();
    if (cachedSchedule) setSchedule(cachedSchedule);
    if (cachedEntries) {
      setEntries(
        overlayOutbox(cachedEntries, readPendingWorkouts(), workoutKey),
      );
      const cachedPhaseTwoUnlocked = weeklySummariesForPhase(
        cachedEntries,
        cachedSessionExercises,
        1,
      ).every((week) => week.sessions === 3);
      const startupSession = startupSessionForWeek(
        cachedEntries,
        cachedSessionExercises,
        scheduledWeekForToday(
          cachedSchedule ?? defaultSchedule,
          cachedPhaseTwoUnlocked,
        ),
      );
      setActiveWeek(startupSession.week);
      setActiveDay(startupSession.day);
      setActiveIndex(
        resumeDraftIndex(
          planForSession(
            cachedSessionExercises,
            startupSession.week,
            startupSession.day,
          ),
          startupSession.week,
          startupSession.day,
        ),
      );
      // Cached workouts are usable immediately; refresh the authoritative data
      // without holding logging behind a slow connection or changing its cursor.
      startupWeekApplied.current = true;
      setLoading(false);
    } else {
      const pending = readPendingWorkouts();
      if (pending.length) {
        setEntries(overlayOutbox([], pending, workoutKey));
        setLoading(false);
      }
    }
    if (cachedSessionExercises.length > 0)
      setSessionExercises(cachedSessionExercises);
    setIsOnline(navigator.onLine);
    setPendingWorkoutCount(readPendingWorkouts().length);
    setQueueIssue(outboxStorageIssue(window.localStorage));
    refreshWorkoutData(cachedEntries ?? undefined, cachedSnapshot?.syncedAt)
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

    const handleOnline = () => {
      setIsOnline(true);
      void flushPendingWorkouts();
    };
    const handleOffline = () => setIsOnline(false);
    const handleStorage = () => {
      const pending = readPendingWorkouts();
      setPendingWorkoutCount(pending.length);
      setQueueIssue(outboxStorageIssue(window.localStorage));
      setEntries((current) => overlayOutbox(current, pending, workoutKey));
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('storage', handleStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('storage', handleStorage);
    };
  }, [flushPendingWorkouts, initialWeek, refreshWorkoutData]);

  useEffect(() => {
    if (
      isBundledApp() ||
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
    if (loading || performance.getEntriesByName('liftline:ready').length)
      return;
    // Wait for the actual enabled logger, including lazy UI primitives, rather
    // than measuring a loading flag while the form is still suspended.
    let frame = 0;
    const check = () => {
      const input = document.querySelector(
        'input[aria-label="Set 1 weight in kilograms"]',
      );
      if (!input || input.matches(':disabled') || frame) return;
      observer.disconnect();
      frame = requestAnimationFrame(() => {
        if (!performance.getEntriesByName('liftline:ready').length)
          performance.mark('liftline:ready');
      });
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled'],
    });
    check();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [loading]);

  useEffect(() => {
    let tipTimer: number | undefined;
    let cancelled = false;

    const scheduleNextTip = () => {
      const delay = 24_000 + Math.random() * 18_000;
      tipTimer = window.setTimeout(() => {
        if (cancelled) return;
        setActiveTipIndex((current) => {
          const offset =
            1 + Math.floor(Math.random() * (activeTrainingTips.length - 1));
          return (current + offset) % activeTrainingTips.length;
        });
        scheduleNextTip();
      }, delay);
    };

    scheduleNextTip();
    return () => {
      cancelled = true;
      if (tipTimer != null) window.clearTimeout(tipTimer);
    };
  }, [activeTrainingTips.length]);

  useLayoutEffect(() => {
    try {
      setWorkoutFocus(
        window.localStorage.getItem('liftline.workout-focus.v1') === 'true',
      );
    } catch {
      /* An optional device preference. */
    }
  }, []);

  function toggleWorkoutFocus() {
    const next = !workoutFocus;
    setWorkoutFocus(next);
    try {
      window.localStorage.setItem('liftline.workout-focus.v1', String(next));
    } catch {
      /* Focus still works without storage. */
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  const phaseOneWeeklySummaries = useMemo(
    () => weeklySummariesForPhase(entries, sessionExercises, 1),
    [entries, sessionExercises],
  );
  const phaseTwoWeeklySummaries = useMemo(
    () => weeklySummariesForPhase(entries, sessionExercises, 13),
    [entries, sessionExercises],
  );
  const weeklySummaries =
    activePhase === 1 ? phaseOneWeeklySummaries : phaseTwoWeeklySummaries;
  const phaseOneSessions = phaseOneWeeklySummaries.reduce(
    (sum, week) => sum + week.sessions,
    0,
  );
  const phaseTwoUnlocked = phaseOneSessions === 36;

  useLayoutEffect(() => {
    if (loading || startupWeekApplied.current) return;
    startupWeekApplied.current = true;
    const scheduledWeek = scheduledWeekForToday(schedule, phaseTwoUnlocked);
    const startupSession = startupSessionForWeek(
      entries,
      sessionExercises,
      scheduledWeek,
    );
    setActiveWeek(startupSession.week);
    setActiveDay(startupSession.day);
    const startupPlan = planForSession(
      sessionExercises,
      startupSession.week,
      startupSession.day,
    );
    setActiveIndex(
      resumeDraftIndex(startupPlan, startupSession.week, startupSession.day),
    );
  }, [entries, loading, phaseTwoUnlocked, schedule, sessionExercises]);

  const currentSummary = weeklySummaries[activeDisplayWeek - 1];
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
  const phaseEntries = useMemo(
    () => entryIndex.byPhase.get(activePhase) ?? [],
    [activePhase, entryIndex],
  );
  const totalRecords = useMemo(
    () => totalPersonalRecords(phaseEntries),
    [phaseEntries],
  );
  const currentSessionEntries = useMemo(
    () => entryIndex.completedBySession.get(`${activeWeek}|${activeDay}`) ?? [],
    [activeDay, activeWeek, entryIndex],
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
    (sum, entry) => sum + personalRecordsFor(entry, phaseEntries).length,
    0,
  );
  const previousSessionVolume =
    activeWeek > phaseStartWeek
      ? (
          entryIndex.completedBySession.get(`${activeWeek - 1}|${activeDay}`) ??
          []
        ).reduce((sum, entry) => sum + entryVolume(entry), 0)
      : 0;
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
  const currentSessionComplete = dayProgress[activeDay].complete;

  function selectPhase(phase: 1 | 2) {
    if (phase === 2 && !phaseTwoUnlocked) {
      setPhaseUnlockOpen(true);
      return;
    }
    if (phase === activePhase) return;
    const nextWeek = phase === 1 ? 12 : 13;
    setActiveWeek(nextWeek);
    setActiveDay(
      firstIncompleteDayForWeek(entries, sessionExercises, nextWeek),
    );
    setActiveIndex(0);
    setActiveTipIndex(0);
    setView('today');
    setNotice(
      phase === 1
        ? 'Phase 1 opened. Your original 12-week history is unchanged.'
        : 'Phase 2 unlocked. Your specialized full-body block is ready.',
    );
  }

  function selectWeek(week: number) {
    setActiveWeek(week);
    setActiveDay(firstIncompleteDayForWeek(entries, sessionExercises, week));
    setActiveIndex(0);
  }

  function chooseDay(day: TrainingDay) {
    setActiveDay(day);
    setActiveIndex(0);
    setView('today');
  }

  function advanceToNextSession() {
    const dayIndex = days.indexOf(activeDay);
    const nextDay = days[dayIndex + 1];

    if (nextDay) {
      setActiveDay(nextDay);
    } else if (activeWeek === 12 && !phaseTwoUnlocked) {
      setNotice(
        'Phase 2 will unlock after every Phase 1 training day is complete.',
      );
      return;
    } else if (activeWeek < 24) {
      setActiveWeek((week) => week + 1);
      setActiveDay('A');
    } else {
      setNotice('You completed every Liftline training session.');
      return;
    }

    setActiveIndex(0);
    setActiveTipIndex(0);
    setView('today');
  }

  function closeSessionSummary() {
    const shouldAdvance = sessionCelebrationPending;
    setSessionSummaryOpen(false);
    setSessionCelebrationPending(false);
    if (shouldAdvance) advanceToNextSession();
  }

  function closePersonalRecord() {
    setPersonalRecordOpen(false);
    if (sessionCelebrationPending) setSessionSummaryOpen(true);
  }

  async function saveExercise(
    draft: Draft,
    visibleSetCount: number,
    clearDraft: () => void,
  ) {
    const inputError = validateWorkoutNumbers({
      weights: draft.sets.map((set) => set.weight),
      values: draft.sets.map((set) => set.reps),
      setCount: visibleSetCount,
      rir: draft.rir,
    });
    const readyToSave = inputError === null;
    if (!readyToSave) {
      setError(inputError ?? 'Review your inputs before saving.');
      return;
    }
    setSaving(true);
    mutationSequence.current++;
    const savedSelection = currentSelection.current;
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
    const previousPending = readPendingWorkouts().filter(
      (item) => item.key === workoutKey(payload),
    );
    const records = personalRecordsFor(localEntry, phaseEntries);
    const nextEntries = replaceWorkoutEntry(entries, localEntry);
    setEntries(nextEntries);
    cacheWorkoutEntries(nextEntries);
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
    const sessionJustCompleted = sessionComplete && !currentSessionComplete;
    if (sessionJustCompleted) setSessionCelebrationPending(true);
    if (records.length > 0) {
      setPersonalRecords(records);
      setPersonalRecordOpen(true);
    }

    const queueForLater = () => {
      const key = workoutKey(payload);
      if (
        !enqueueOutbox(
          'workout',
          { key, revision: crypto.randomUUID(), payload, record: localEntry },
          window.localStorage,
        )
      ) {
        setEntries(entries);
        cacheWorkoutEntries(entries);
        setSessionCelebrationPending(false);
        setPersonalRecordOpen(false);
        return false;
      }
      setPendingWorkoutCount(readPendingWorkouts().length);
      setIsOnline(navigator.onLine);
      clearDraft();
      return true;
    };

    const advance = () => {
      if (currentSelection.current !== savedSelection) return;
      if (sessionJustCompleted && records.length === 0)
        setSessionSummaryOpen(true);
      else if (activeIndex < dayExercises.length - 1)
        setActiveIndex((index) => index + 1);
    };

    if (!navigator.onLine) {
      if (!queueForLater()) {
        setError(
          'Device storage is unavailable. Your inputs have not been logged. Keep this page open and reconnect before saving.',
        );
        setSaving(false);
        return;
      }
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
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await response.json()) as {
        entry?: WorkoutEntry;
        sheetSyncQueued?: boolean;
        error?: string;
      };
      if (!response.ok && !retryableStatus(response.status)) {
        setEntries(entries);
        cacheWorkoutEntries(entries);
        setSessionCelebrationPending(false);
        setPersonalRecordOpen(false);
        setError(data.error ?? 'Review your inputs before saving again.');
        return;
      }
      if (!response.ok || !data.entry)
        throw new Error(data.error ?? 'Unable to save exercise.');
      const saved = {
        ...data.entry,
        completed: Boolean(data.entry.completed),
        offlinePending: false,
      };
      setLastSave({ saved, before: existingEntry });
      previousPending.forEach((item) =>
        acknowledgeOutbox('workout', item, window.localStorage),
      );
      setPendingWorkoutCount(readPendingWorkouts().length);
      setEntries((current) => {
        const refreshed = replaceWorkoutEntry(current, saved);
        cacheWorkoutEntries(refreshed);
        return refreshed;
      });
      setNotice(
        `${exercise.name} saved to Liftline${data.sheetSyncQueued ? ' · Sheet sync queued' : ''}`,
      );
      clearDraft();
      window.setTimeout(() => {
        void refreshWorkoutData().catch(() => undefined);
      }, 3500);
      advance();
    } catch (saveError) {
      if (!queueForLater()) {
        setError(
          'Unable to save online or keep an offline queue on this device. Your inputs remain here; keep this page open and try saving again.',
        );
        return;
      }
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

  async function undoLastSave() {
    if (
      !lastSave ||
      !navigator.onLine ||
      readPendingWorkouts().some(
        (item) => item.key === workoutKey(lastSave.saved),
      )
    ) {
      setError('Reconnect and sync pending changes before undoing this save.');
      return;
    }
    setUndoing(true);
    mutationSequence.current++;
    try {
      const response = await fetch('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          undoWorkoutPayload(lastSave.saved, lastSave.before),
        ),
        signal: AbortSignal.timeout(15_000),
      });
      const result = (await response.json()) as {
        entry?: WorkoutEntry;
        error?: string;
      };
      if (!response.ok || !result.entry)
        throw Error(result.error ?? 'Unable to undo this save.');
      const restored = {
        ...result.entry,
        completed: Boolean(result.entry.completed),
      };
      setEntries((current) => {
        const next = replaceWorkoutEntry(current, restored);
        cacheWorkoutEntries(next);
        return next;
      });
      setPersonalRecordOpen(false);
      setSessionSummaryOpen(false);
      setSessionCelebrationPending(false);
      setActiveWeek(restored.week);
      setActiveDay(restored.day);
      setActiveIndex(
        Math.max(
          0,
          planForSession(
            sessionExercises,
            restored.week,
            restored.day,
          ).findIndex((item) => item.order === restored.exerciseOrder),
        ),
      );
      setView('today');
      setLastSave(null);
      setError('');
      setNotice('Last save undone. Any newer device drafts have been kept.');
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to undo. Your saved workout has been kept.',
      );
    } finally {
      setUndoing(false);
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
      setNotice(
        `Phase ${activePhase} · Week ${activeDisplayWeek} · Day ${activeDay} updated.`,
      );
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
      if (hasPendingOutbox(window.localStorage))
        throw new Error(
          'Sync your pending main and Holiday workouts before downloading a complete backup. Drafts saved only on this device are not included.',
        );
      const response = await fetch('/api/workouts/backup');
      if (!response.ok) throw new Error('Unable to create a Liftline backup.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `liftline-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(
        'Backup downloaded, including Holiday workouts. Unsaved device drafts are not included.',
      );
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

  if (holidayMode) {
    return (
      <Suspense
        fallback={
          <main className="grid min-h-screen place-items-center bg-[linear-gradient(180deg,#ecfdf8,#fff8eb)] text-teal-800">
            <span className="flex items-center gap-2 font-sans text-sm font-semibold">
              <Loader2 className="size-4 animate-spin" /> Opening Holiday mode
            </span>
          </main>
        }
      >
        <HolidayWorkout
          appVersion={appVersion}
          isOnline={isOnline}
          onExit={() => setHolidayMode(false)}
        />
      </Suspense>
    );
  }

  return (
    <main
      className={`liftline-beta ${workoutFocus ? 'beta-workout-focus' : ''} min-h-screen bg-background pb-[calc(6rem+env(safe-area-inset-bottom))] font-sans text-foreground md:pb-10`}
    >
      <header className="beta-app-header sticky top-0 z-30 border-b border-border/70 bg-card/90 backdrop-blur-xl">
        <div className="beta-header-inner mx-auto flex min-h-18 max-w-6xl items-center justify-between gap-3 pb-3 pt-[calc(.75rem+env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={() => setView('today')}
            className="beta-brand flex items-center gap-3 text-left"
          >
            <img
              src={brandMarkHref}
              alt=""
              width={192}
              height={192}
              className="beta-brand-mark"
              aria-hidden="true"
            />
            <span>
              <span className="flex items-center gap-2 font-sans text-lg font-bold tracking-tight">
                Liftline
              </span>
              <span
                className={`flex items-center gap-1.5 font-sans text-xs ${isOnline ? 'text-success' : 'text-destructive'}`}
                aria-label={`${isOnline ? 'Online' : 'Offline'}. ${
                  pendingWorkoutCount > 0
                    ? `${pendingWorkoutCount} changes pending`
                    : exerciseDraft.dirty
                      ? exerciseDraft.persisted
                        ? 'Draft saved on this device'
                        : 'Unsaved draft'
                      : 'Changes saved'
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${isOnline ? 'bg-success' : 'bg-destructive'}`}
                  aria-hidden="true"
                />
                {pendingWorkoutCount > 0
                  ? `${pendingWorkoutCount} pending`
                  : exerciseDraft.dirty
                    ? exerciseDraft.persisted
                      ? 'Draft on device'
                      : 'Unsaved draft'
                    : 'Changes saved'}
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
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Button
              type="button"
              variant="outline"
              className="shrink-0 border-teal-800/20 bg-teal-50 font-sans text-teal-800 hover:bg-teal-100 hover:text-teal-900"
              aria-label="Open Holiday mode"
              onClick={() => setHolidayMode(true)}
            >
              <TreePalm /> <span className="hidden sm:inline">Holiday</span>
            </Button>
            <div ref={programmeMenuRef} className="relative">
              <Button
                type="button"
                variant="outline"
                className="shrink-0 font-sans"
                aria-label="Open programme and tools menu"
                aria-haspopup="menu"
                aria-expanded={programmeMenuOpen}
                aria-controls="programme-tools-menu"
                onClick={() => setProgrammeMenuOpen((open) => !open)}
              >
                Menu{' '}
                <ChevronDown
                  className={`transition-transform ${programmeMenuOpen ? 'rotate-180' : ''}`}
                />
              </Button>
              {programmeMenuOpen && (
                <div
                  id="programme-tools-menu"
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl bg-popover p-2 text-popover-foreground shadow-lg ring-1 ring-foreground/10"
                >
                  <div className="space-y-1 px-2 py-2">
                    <span className="block font-sans text-sm font-semibold text-foreground">
                      Training programme
                    </span>
                    <span className="block font-sans text-sm font-normal text-muted-foreground">
                      {activePhase === 1
                        ? `${phaseOneSessions} of 36 Phase 1 sessions complete`
                        : 'Specialized full-body progression'}
                    </span>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${(phaseOneSessions / 36) * 100}%` }}
                      />
                    </span>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left font-sans text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    onClick={() => {
                      setProgrammeMenuOpen(false);
                      selectPhase(1);
                    }}
                  >
                    {activePhase === 1 ? (
                      <Check className="size-4" />
                    ) : (
                      <Dumbbell className="size-4" />
                    )}{' '}
                    Phase 1
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left font-sans text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    onClick={() => {
                      setProgrammeMenuOpen(false);
                      selectPhase(2);
                    }}
                  >
                    {phaseTwoUnlocked ? (
                      <UnlockKeyhole className="size-4" />
                    ) : (
                      <LockKeyhole className="size-4" />
                    )}
                    Phase 2
                    {!phaseTwoUnlocked && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        Locked
                      </span>
                    )}
                  </button>
                  <ProgrammeToolsMenu
                    view={view}
                    onSelect={(destination) => {
                      setProgrammeMenuOpen(false);
                      if (destination === 'schedule') {
                        setActiveTrainingTool('schedule');
                      } else {
                        setView(destination);
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="beta-app-content mx-auto max-w-6xl py-5 md:py-8">
        {queueIssue && (
          <Alert variant="destructive" className="mb-3">
            <AlertTitle>Offline data needs attention</AlertTitle>
            <AlertDescription>{queueIssue}</AlertDescription>
          </Alert>
        )}
        {blockedWorkouts.map((item) => (
          <div
            key={item.key}
            className="mb-3 rounded-xl border border-destructive/30 bg-card p-3 text-sm"
          >
            <p>{item.blocked} Your local inputs are kept.</p>
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => {
                setActiveWeek(item.record.week);
                setActiveDay(item.record.day);
                setActiveIndex(
                  Math.max(
                    0,
                    planForSession(
                      sessionExercises,
                      item.record.week,
                      item.record.day,
                    ).findIndex(
                      (exercise) =>
                        exercise.order === item.record.exerciseOrder,
                    ),
                  ),
                );
                setView('today');
              }}
            >
              Review pending workout
            </Button>
          </div>
        ))}
        {lastSave && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm">
            <span>Last saved: {lastSave.saved.exercise}</span>
            <Button
              variant="outline"
              disabled={undoing || saving || !isOnline}
              onClick={() => void undoLastSave()}
            >
              <RotateCcw />
              {undoing ? 'Undoing…' : 'Undo last save'}
            </Button>
          </div>
        )}
        {pendingWorkoutCount > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/15 bg-secondary/60 p-3 text-sm">
            <span>
              {pendingWorkoutCount} changes saved only on this device. Keep
              Liftline open to sync.
            </span>
            <Button
              variant="outline"
              onClick={() =>
                void flushPendingWorkouts().catch((error: Error) =>
                  setError(error.message),
                )
              }
            >
              Retry sync
            </Button>
          </div>
        )}
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

        {view === 'today' && (
          <div
            className={`beta-today-layout grid gap-5 ${workoutFocus ? 'mx-auto max-w-3xl' : 'lg:grid-cols-[minmax(0,1fr)_320px]'}`}
          >
            <section className="beta-workout-column min-w-0 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-muted-foreground">
                  Phase {activePhase} · Week {activeDisplayWeek} · Day{' '}
                  {activeDay}
                </p>
                <Button
                  type="button"
                  variant={workoutFocus ? 'default' : 'secondary'}
                  aria-pressed={workoutFocus}
                  onClick={toggleWorkoutFocus}
                >
                  <Focus /> {workoutFocus ? 'Show overview' : 'Workout focus'}
                </Button>
              </div>
              {workoutFocus && (
                <div
                  className="grid grid-cols-3 gap-2"
                  aria-label="Training days"
                >
                  {days.map((day) => (
                    <Button
                      key={day}
                      type="button"
                      variant={day === activeDay ? 'default' : 'outline'}
                      onClick={() => chooseDay(day)}
                      aria-label={`Day ${day}, ${dayProgress[day].count} of ${dayProgress[day].total} exercises complete`}
                    >
                      Day {day}{' '}
                      <span className="text-xs">
                        {dayProgress[day].complete
                          ? '✓'
                          : `${dayProgress[day].count}/${dayProgress[day].total}`}
                      </span>
                    </Button>
                  ))}
                </div>
              )}
              {!workoutFocus && (
                <>
                  <div className="beta-dashboard-intro flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0">
                      <p className="beta-eyebrow">Training dashboard</p>
                      <h1 className="font-sans text-2xl font-bold tracking-tight sm:text-3xl">
                        Ready for your next set?
                      </h1>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Pick up exactly where you left off.
                      </p>
                      <div className="beta-week-picker mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
                        <label
                          htmlFor="week"
                          className="text-xs font-bold uppercase tracking-[0.14em] text-primary"
                        >
                          WEEK
                        </label>
                        <span className="relative inline-flex">
                          <select
                            id="week"
                            value={activeWeek}
                            onChange={(event) =>
                              selectWeek(Number(event.target.value))
                            }
                            className="h-11 appearance-none rounded-2xl border bg-card py-2 pl-4 pr-12 text-base font-semibold shadow-sm outline-none focus:ring-3 focus:ring-ring/30"
                          >
                            {Array.from({ length: 12 }, (_, index) => (
                              <option
                                key={phaseStartWeek + index}
                                value={phaseStartWeek + index}
                              >
                                Week {index + 1}
                              </option>
                            ))}
                          </select>
                          <ChevronDown
                            aria-hidden="true"
                            className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                          />
                        </span>
                        <span className="text-sm font-medium text-muted-foreground">
                          · {weekDates[activeWeek - 1]}
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className="h-7 bg-success-soft px-3 text-success"
                    >
                      <CheckCircle2 /> {sessionsDone} of 3 sessions
                    </Badge>
                  </div>

                  <div className="beta-training-spotlight">
                    <div className="beta-training-spotlight-copy">
                      <p className="beta-eyebrow">Move well today</p>
                      <h2 className="font-sans text-base font-bold tracking-tight sm:text-lg">
                        {exercise.name}
                      </h2>
                      <p className="mt-1 max-w-sm font-sans text-sm text-muted-foreground">
                        {targetLabel(exercise)}
                      </p>
                    </div>
                    <div
                      className="beta-training-spotlight-art"
                      aria-hidden="true"
                    >
                      <img
                        src="/illustrations/goblet-squat.webp"
                        alt=""
                        width={512}
                        height={768}
                        loading="eager"
                        fetchPriority="high"
                        decoding="async"
                      />
                    </div>
                  </div>

                  <div
                    className="beta-metrics-grid"
                    aria-label="Training overview"
                  >
                    <DashboardMetric
                      icon={Activity}
                      label="This week"
                      value={`${sessionsDone}/3`}
                      detail="sessions"
                      progress={weeklyPercent}
                      accent="#2164f3"
                    />
                    <DashboardMetric
                      icon={TrendingUp}
                      label="Volume"
                      value={Math.round(currentSummary.volume).toLocaleString()}
                      detail="kg logged"
                      progress={Math.min(
                        100,
                        (currentSummary.volume / 12000) * 100,
                      )}
                      accent="#7357f6"
                    />
                    <DashboardMetric
                      icon={Medal}
                      label="Phase"
                      value={`${totalSessions}/36`}
                      detail="sessions"
                      progress={(totalSessions / 36) * 100}
                      accent="#9a4ff4"
                    />
                  </div>

                  <Card className="beta-week-card border-0 text-primary-foreground ring-0 shadow-xl shadow-primary/10 [background:var(--hero)]">
                    <CardHeader className="pb-1">
                      <CardTitle className="font-sans text-lg font-semibold text-primary-foreground">
                        Phase {activePhase} · Week {activeDisplayWeek} progress
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
                        <p className="font-sans text-sm text-primary-foreground/90">
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
                      <div className="mt-3 grid grid-cols-3 gap-2 text-sm font-medium">
                        {days.map((day) => {
                          const { complete, count, total } = dayProgress[day];
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => chooseDay(day)}
                              aria-label={`Day ${day}, ${count} of ${total} exercises complete`}
                              aria-current={
                                activeDay === day ? 'step' : undefined
                              }
                              className={`rounded-lg px-3 py-2 text-left font-sans transition-colors ${activeDay === day ? 'bg-white text-primary' : 'bg-black/15 text-white hover:bg-black/20'}`}
                            >
                              Day {day}
                              <span className="float-right">
                                {complete
                                  ? '✓'
                                  : count > 0
                                    ? `${count}/${total}`
                                    : activeDay === day
                                      ? '→'
                                      : '·'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
              <div className="beta-exercise-heading flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-sans text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Day {activeDay} · Exercise {activeIndex + 1} of{' '}
                    {dayExercises.length}
                  </p>
                  <h2 className="mt-1 font-sans text-xl font-bold">
                    {exercise.name}
                  </h2>
                </div>
                <div className="flex shrink-0 flex-nowrap justify-end gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="sm:w-auto sm:px-3"
                    aria-label="Edit session"
                    onClick={() => openProgramEditor()}
                  >
                    <Settings2 />
                    <span className="hidden sm:inline">Edit session</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous exercise"
                    disabled={dayExercises.length <= 1}
                    onClick={() =>
                      setActiveIndex((index) =>
                        dayExercises.length > 0
                          ? (index - 1 + dayExercises.length) %
                            dayExercises.length
                          : 0,
                      )
                    }
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Next exercise"
                    disabled={dayExercises.length <= 1}
                    onClick={() =>
                      setActiveIndex((index) =>
                        dayExercises.length > 0
                          ? (index + 1) % dayExercises.length
                          : 0,
                      )
                    }
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>

              <ExerciseDraftBoundary
                key={draftKey}
                draftKey={draftKey}
                baseline={{
                  ...draftFromEntry(existingEntry),
                  setCount: visibleSetsForEntry(
                    existingEntry,
                    exercise.targetSets,
                  ),
                }}
                ready={!loading}
                onStatus={setDraftStatus}
                onSnapshot={onDraftSnapshot}
              >
                {(exerciseDraft) => {
                  const { showNotes, setShowNotes } = exerciseDraft;
                  const draft = exerciseDraft.value;
                  const visibleSetCount = draft.setCount;
                  function setDraft(
                    update: Draft | ((current: Draft) => Draft),
                  ) {
                    exerciseDraft.setValue((current) => ({
                      ...(typeof update === 'function'
                        ? update(current)
                        : update),
                      setCount: current.setCount,
                    }));
                  }
                  function setVisibleSetCount(
                    update: number | ((current: number) => number),
                  ) {
                    exerciseDraft.setValue((current) => ({
                      ...current,
                      setCount:
                        typeof update === 'function'
                          ? update(current.setCount)
                          : update,
                    }));
                  }

                  const advice = progressionAdvice(
                    exercise,
                    draft,
                    visibleSetCount,
                  );
                  const inputError = validateWorkoutNumbers({
                    weights: draft.sets.map((set) => set.weight),
                    values: draft.sets.map((set) => set.reps),
                    setCount: visibleSetCount,
                    rir: draft.rir,
                  });
                  const readyToSave = inputError === null;

                  function updateSet(
                    index: number,
                    key: 'weight' | 'reps',
                    value: string,
                  ) {
                    setDraft((current) => ({
                      ...current,
                      sets: current.sets.map((set, setIndex) =>
                        setIndex === index ? { ...set, [key]: value } : set,
                      ),
                    }));
                  }

                  function stepSet(
                    index: number,
                    key: 'weight' | 'reps',
                    amount: number,
                  ) {
                    const current = Number(draft.sets[index][key] || 0);
                    const next = Math.max(
                      0,
                      Math.round((current + amount) * 1000) / 1000,
                    );
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
                        index === removedIndex
                          ? { weight: '', reps: '', done: false }
                          : set,
                      ),
                    }));
                    setVisibleSetCount((count) => Math.max(1, count - 1));
                  }

                  function toggleSetComplete(index: number) {
                    const set = draft.sets[index];
                    const invalidSet = validateWorkoutNumbers({
                      weights: [set.weight],
                      values: [set.reps],
                      setCount: 1,
                      rir: null,
                    });
                    if (!set.done && invalidSet) {
                      setError(invalidSet);
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
                    if (!set.done) restTimerRef.current?.start();
                  }

                  function usePreviousSession() {
                    if (!previousEntry) return;
                    const previousDraft = draftFromEntry(previousEntry);
                    setDraft({
                      ...previousDraft,
                      sets: recallSets(previousDraft.sets),
                      notes: '',
                    });
                    setVisibleSetCount(
                      visibleSetsForEntry(previousEntry, exercise.targetSets),
                    );
                    setShowNotes(false);
                    setNotice(
                      'Previous weights and reps copied. Review them before saving.',
                    );
                  }

                  return (
                    <Card className="beta-workout-card gap-0 border-0 py-0 shadow-sm shadow-slate-900/5 ring-border">
                      <CardHeader className="border-b bg-muted/35 pt-(--card-spacing)">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            className={`font-sans ${dayPresentation[activeDay].badge}`}
                          >
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
                            {exercise.muscles} · Alternative:{' '}
                            {exercise.alternative}
                          </CardDescription>
                          <Button
                            type="button"
                            variant="outline"
                            aria-label={`Show an animated movement guide for ${exercise.name}`}
                            onClick={() => setExerciseDemoOpen(true)}
                            className="border-primary/20 bg-background font-sans text-sm font-semibold text-primary hover:bg-accent hover:text-primary"
                          >
                            <CirclePlay className="size-4" /> See movement
                          </Button>
                        </div>
                        <RestTimer
                          key={`${activeWeek}|${activeDay}|${exercise.order}|${suggestedRestSeconds}`}
                          ref={restTimerRef}
                          exerciseName={exercise.name}
                          restLabel={exercise.rest}
                          suggestedSeconds={suggestedRestSeconds}
                          notificationIconHref={notificationIconHref}
                        />
                        {(!workoutFocus || previousEntry) && (
                          <details
                            key={`${activeWeek}|${activeDay}|${exercise.order}|${workoutFocus}`}
                            open={!workoutFocus}
                            className="mt-3 rounded-xl border border-primary/15 bg-background/90 p-3"
                          >
                            <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-primary">
                                <History className="size-4" />
                              </span>
                              <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <p className="font-sans text-sm font-semibold">
                                  Previous session
                                </p>
                                {previousEntry && (
                                  <p className="font-sans text-sm font-medium text-muted-foreground">
                                    {formatWorkoutDate(
                                      previousEntry.completedAt ??
                                        previousEntry.updatedAt,
                                    )}{' '}
                                    · Week{' '}
                                    {displayWeekNumber(previousEntry.week)}
                                  </p>
                                )}
                              </div>
                              <ChevronDown
                                className="size-4 shrink-0 text-muted-foreground"
                                aria-hidden="true"
                              />
                            </summary>
                            {previousEntry ? (
                              <div className="mt-2.5">
                                <div className="flex flex-wrap gap-1.5">
                                  {loggedSets(previousEntry).map((set) => (
                                    <span
                                      key={set.set}
                                      className="rounded-lg bg-secondary px-2 py-1.5 font-sans text-sm font-medium tabular-nums"
                                    >
                                      Set {set.set}:{' '}
                                      {set.weight == null
                                        ? `${set.reps} ${exercise.name === 'Plank' ? 'sec' : 'reps'}`
                                        : `${set.weight} kg × ${set.reps}`}
                                    </span>
                                  ))}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  {previousEntry.rir != null && (
                                    <span className="rounded-lg bg-success-soft px-2.5 py-1.5 font-sans text-xs font-medium text-success">
                                      RIR {previousEntry.rir}
                                    </span>
                                  )}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-sm"
                                    onClick={usePreviousSession}
                                  >
                                    <Copy /> Use previous
                                  </Button>
                                </div>
                                {(previousEntry.notes ?? '').trim() && (
                                  <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-primary/10 bg-background/65 px-3 py-2.5">
                                    <NotebookPen
                                      className="mt-0.5 size-4 shrink-0 text-primary"
                                      aria-hidden="true"
                                    />
                                    <p className="min-w-0 break-words font-sans text-sm leading-relaxed text-muted-foreground">
                                      <span className="font-semibold text-foreground">
                                        Previous note:
                                      </span>{' '}
                                      {previousEntry.notes.trim()}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="mt-2 font-sans text-sm leading-relaxed text-muted-foreground">
                                No earlier session for this exercise yet. Your
                                last sets and date will appear here from Week 2
                                onward.
                              </p>
                            )}
                          </details>
                        )}
                      </CardHeader>
                      <CardContent className="py-(--card-spacing)">
                        <fieldset
                          disabled={loading || saving}
                          className="min-w-0"
                          aria-label={`Log ${exercise.name}`}
                        >
                          {exercise.skipped ? (
                            <div className="grid min-h-52 place-items-center py-8 text-center">
                              <div className="max-w-sm">
                                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-warning-soft text-warning-foreground">
                                  <Minus className="size-5" />
                                </span>
                                <h3 className="mt-3 font-sans text-lg font-semibold">
                                  Skipped for Week {activeDisplayWeek}
                                </h3>
                                <p className="mt-1 font-sans text-sm leading-relaxed text-muted-foreground">
                                  This exercise does not count against Day{' '}
                                  {activeDay} completion. You can bring it back
                                  from Edit session.
                                </p>
                                <Button
                                  className="mt-4"
                                  variant="outline"
                                  onClick={() =>
                                    setActiveIndex((index) =>
                                      Math.min(
                                        dayExercises.length - 1,
                                        index + 1,
                                      ),
                                    )
                                  }
                                >
                                  Continue <ChevronRight />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="hidden grid-cols-[42px_minmax(0,1fr)_64px] items-center gap-2 border-b py-2 font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
                                <span className="text-center">Set</span>
                                <div className="grid grid-cols-2 gap-3">
                                  <span className="text-center">
                                    Weight (kg)
                                  </span>
                                  <span className="text-center">
                                    {exercise.name === 'Plank'
                                      ? 'Seconds'
                                      : 'Reps'}
                                  </span>
                                </div>
                                <span className="text-center">
                                  <span className="sr-only sm:not-sr-only">
                                    Status
                                  </span>
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
                                      data-workout-set-row=""
                                      className="mx-auto grid w-full max-w-[21.5rem] grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-x-2 border-b border-border/70 py-3 last:border-0 min-[32rem]:max-w-none md:grid-cols-[42px_minmax(0,1fr)_64px] md:gap-2"
                                    >
                                      <div className="flex items-center justify-center self-center pt-5 min-[32rem]:h-11 min-[32rem]:self-end min-[32rem]:pt-0 md:self-center">
                                        <span className="relative grid size-11 place-items-center rounded-full bg-secondary font-sans text-sm font-bold md:size-8">
                                          {index + 1}
                                          {setLabel && (
                                            <span className="absolute -right-3 -top-2 rounded bg-warning-soft px-1 font-sans text-[8px] text-warning-foreground">
                                              {setLabel}
                                            </span>
                                          )}
                                        </span>
                                      </div>
                                      <div className="col-start-2 min-w-0">
                                        <div className="grid gap-3 min-[32rem]:grid-cols-2">
                                          <div className="w-full min-w-0">
                                            <span className="mb-1 block font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground md:hidden">
                                              Weight (kg)
                                            </span>
                                            <div className="grid w-full grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center justify-items-center gap-2 min-[32rem]:gap-1">
                                              <Button
                                                variant="outline"
                                                size="icon-sm"
                                                aria-label={`Decrease set ${index + 1} weight`}
                                                onClick={() =>
                                                  stepSet(index, 'weight', -2.5)
                                                }
                                              >
                                                <Minus />
                                              </Button>
                                              <Input
                                                aria-label={`Set ${index + 1} weight in kilograms`}
                                                inputMode="decimal"
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={set.weight}
                                                placeholder={
                                                  exercise.name === 'Plank'
                                                    ? 'Optional'
                                                    : '0'
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
                                                className="h-11 w-full min-w-0 bg-background text-center font-sans text-lg font-semibold text-foreground tabular-nums placeholder:font-normal placeholder:text-placeholder"
                                              />
                                              <Button
                                                variant="outline"
                                                size="icon-sm"
                                                aria-label={`Increase set ${index + 1} weight`}
                                                onClick={() =>
                                                  stepSet(index, 'weight', 2.5)
                                                }
                                              >
                                                <Plus />
                                              </Button>
                                            </div>
                                          </div>
                                          <div className="w-full min-w-0">
                                            <span className="mb-1 block font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground md:hidden">
                                              {exercise.name === 'Plank'
                                                ? 'Seconds'
                                                : 'Reps'}
                                            </span>
                                            <div className="grid w-full grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center justify-items-center gap-2 min-[32rem]:gap-1">
                                              <Button
                                                variant="outline"
                                                size="icon-sm"
                                                aria-label={`Decrease set ${index + 1} repetitions`}
                                                onClick={() =>
                                                  stepSet(index, 'reps', -1)
                                                }
                                              >
                                                <Minus />
                                              </Button>
                                              <Input
                                                aria-label={`Set ${index + 1} ${exercise.name === 'Plank' ? 'seconds' : 'repetitions'}`}
                                                inputMode="numeric"
                                                type="number"
                                                min="1"
                                                step="1"
                                                value={set.reps}
                                                placeholder="0"
                                                onFocus={(event) =>
                                                  event.currentTarget.select()
                                                }
                                                onChange={(event) =>
                                                  updateSet(
                                                    index,
                                                    'reps',
                                                    event.target.value,
                                                  )
                                                }
                                                className="h-11 w-full min-w-0 bg-background text-center font-sans text-lg font-semibold text-foreground tabular-nums placeholder:font-normal placeholder:text-placeholder"
                                              />
                                              <Button
                                                variant="outline"
                                                size="icon-sm"
                                                aria-label={`Increase set ${index + 1} repetitions`}
                                                onClick={() =>
                                                  stepSet(index, 'reps', 1)
                                                }
                                              >
                                                <Plus />
                                              </Button>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="col-start-3 flex h-full items-center justify-center pt-5 min-[32rem]:h-11 min-[32rem]:self-end min-[32rem]:pt-0 md:self-center">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            toggleSetComplete(index)
                                          }
                                          aria-label={`${set.done ? 'Reopen' : 'Complete'} set ${index + 1}`}
                                          aria-pressed={set.done}
                                          className={`grid size-11 place-items-center rounded-full border-2 transition-colors md:size-8 ${set.done ? 'border-success bg-success text-white' : 'border-border bg-background text-transparent hover:border-primary'}`}
                                        >
                                          <Check className="size-4" />
                                        </button>
                                      </div>
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
                                  <p className="font-sans text-sm text-muted-foreground">
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
                                  onFocus={(event) =>
                                    event.currentTarget.select()
                                  }
                                  onChange={(event) =>
                                    setDraft((current) => ({
                                      ...current,
                                      rir: event.target.value,
                                    }))
                                  }
                                  className="h-11 bg-background text-center font-sans text-lg font-semibold text-foreground placeholder:font-normal placeholder:text-placeholder"
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

                              {exerciseDraft.dirty && (
                                <p
                                  className="mt-3 text-xs text-muted-foreground"
                                  role="status"
                                >
                                  {exerciseDraft.persisted
                                    ? `${exerciseDraft.recovered ? 'Draft recovered. ' : ''}Your inputs are saved on this device. Save & next to log this exercise.`
                                    : 'Device storage is unavailable. Keep this page open until you save the exercise.'}
                                </p>
                              )}
                              {showNotes || Boolean(draft.notes) ? (
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
                                onClick={() =>
                                  void saveExercise(
                                    draft,
                                    visibleSetCount,
                                    exerciseDraft.clear,
                                  )
                                }
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
                                {!saving && (
                                  <ChevronRight data-icon="inline-end" />
                                )}
                              </Button>
                            </>
                          )}
                        </fieldset>
                      </CardContent>
                    </Card>
                  );
                }}
              </ExerciseDraftBoundary>
            </section>

            {!workoutFocus && (
              <aside className="beta-side-rail space-y-5">
                <Card>
                  <CardHeader>
                    <CardTitle className="font-sans">
                      Phase {activePhase} · Week {activeDisplayWeek}
                    </CardTitle>
                    <CardDescription className="font-sans">
                      {weekDates[activeWeek - 1]}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {days.map((day) => {
                      const { count, total, complete } = dayProgress[day];
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => chooseDay(day)}
                          className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${activeDay === day ? 'border-primary/35 bg-accent/45' : 'border-border/80 hover:bg-muted/60'}`}
                        >
                          <span
                            className={`grid size-10 place-items-center rounded-xl font-sans font-bold ${complete ? 'bg-success-soft text-success' : dayPresentation[day].badge}`}
                          >
                            {day}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-sans font-semibold">
                              Day {day}
                            </span>
                            <span className="block font-sans text-sm text-muted-foreground">
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
                  <CardHeader key={activeTrainingTips[activeTipIndex].title}>
                    <CardTitle className="flex items-center gap-2 font-sans text-warning-foreground">
                      <Target className="size-4" />{' '}
                      {activeTrainingTips[activeTipIndex].title}
                    </CardTitle>
                    <CardDescription className="font-sans leading-relaxed text-warning-foreground/80">
                      {activeTrainingTips[activeTipIndex].body}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </aside>
            )}
          </div>
        )}

        {view === 'plan' && (
          <Suspense
            fallback={
              <section
                aria-label="Loading training plan"
                className="min-h-[32rem] animate-pulse rounded-3xl bg-card/70"
              />
            }
          >
            <PlanView
              activePhase={activePhase}
              activeDisplayWeek={activeDisplayWeek}
              activeWeek={activeWeek}
              sessionExercises={sessionExercises}
              onChooseDay={chooseDay}
              onEditDay={(day) => {
                setActiveDay(day);
                setActiveIndex(0);
                openProgramEditor(day);
              }}
            />
          </Suspense>
        )}

        {view === 'progress' && (
          <Suspense
            fallback={
              <section
                aria-label="Loading progress"
                className="min-h-[34rem] animate-pulse rounded-3xl bg-card/70"
              />
            }
          >
            <ProgressView
              key={activePhase}
              activePhase={activePhase}
              activeRoutine={activeRoutine}
              phaseEntries={phaseEntries}
              allEntries={entries}
              entryIndex={entryIndex}
              weeklySummaries={weeklySummaries}
              totalRows={totalRows}
              totalVolume={totalVolume}
              totalSessions={totalSessions}
              totalRecords={totalRecords}
              loadingImport={loadingImport}
              importingSheet={importingSheet}
              loading={loading}
              syncingSheet={syncingSheet}
              backupBusy={backupBusy}
              previewGoogleSheetImport={previewGoogleSheetImport}
              syncGoogleSheet={syncGoogleSheet}
              downloadBackup={downloadBackup}
              onRestoreBackup={() => {
                setBackupOpen(true);
                setBackupSummary(null);
                setBackupData(null);
                setBackupFileName('');
              }}
              selectWeek={selectWeek}
              setView={setView}
            />
          </Suspense>
        )}

        {view === 'nutrition' && (
          <Suspense
            fallback={
              <section
                aria-label="Loading nutrition guide"
                className="min-h-[34rem] animate-pulse rounded-3xl bg-card/70"
              />
            }
          >
            <NutritionView />
          </Suspense>
        )}

        {view === 'guide' && (
          <Suspense
            fallback={
              <section
                aria-label="Loading training guide"
                className="min-h-[30rem] animate-pulse rounded-3xl bg-card/70"
              />
            }
          >
            <TrainingGuideView activePhase={activePhase} />
          </Suspense>
        )}
      </div>

      <footer
        aria-label={`Liftline version ${appVersion}`}
        className="mx-auto max-w-6xl px-4 pb-1 text-center font-sans text-xs text-muted-foreground/75 sm:px-6"
      >
        Liftline v{appVersion}
      </footer>

      {phaseUnlockOpen && (
        <Suspense fallback={null}>
          <Dialog open={phaseUnlockOpen} onOpenChange={setPhaseUnlockOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 font-sans text-xl">
                  <span className="grid size-9 place-items-center rounded-xl bg-accent text-primary">
                    <LockKeyhole className="size-5" />
                  </span>
                  Phase 2 unlocks after Phase 1
                </DialogTitle>
                <DialogDescription className="font-sans leading-relaxed">
                  Finish all three sessions in each of the 12 Phase 1 weeks.
                  Your existing workout history will remain available when the
                  next programme opens.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-2xl bg-secondary/65 p-4">
                  <div className="flex items-end justify-between gap-3 font-sans">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        Phase 1 progress
                      </p>
                      <p className="mt-1 text-2xl font-bold">
                        {phaseOneSessions} of 36 sessions
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-primary">
                      {Math.round((phaseOneSessions / 36) * 100)}%
                    </p>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${(phaseOneSessions / 36) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-2 font-sans text-sm">
                  <p className="font-semibold">Waiting in Phase 2</p>
                  {[
                    'Day A · Chest + quad emphasis · 7 exercises',
                    'Day B · Back + posterior-chain emphasis · 7 exercises',
                    'Day C · Shoulders + arms emphasis · 9 exercises',
                  ].map((item) => (
                    <p
                      key={item}
                      className="rounded-xl border border-border/70 px-3 py-2 text-muted-foreground"
                    >
                      {item}
                    </p>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={() => setPhaseUnlockOpen(false)}
                >
                  Keep training Phase 1
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Suspense>
      )}

      {exerciseDemoOpen && (
        <Suspense fallback={null}>
          <ExerciseDemoDialog
            exerciseName={exercise.name}
            open={exerciseDemoOpen}
            onOpenChange={setExerciseDemoOpen}
          />
        </Suspense>
      )}

      {activeTrainingTool && (
        <Suspense fallback={null}>
          <TrainingToolsDialog
            tool={activeTrainingTool}
            schedule={schedule}
            activeWeek={activeWeek}
            activeDay={activeDay}
            currentWeight={numberOrNull(
              loggerSnapshot.current?.sets[0]?.weight ?? '',
            )}
            onScheduleChange={(next) => {
              setSchedule(next);
              cacheSchedule(next);
            }}
            onClose={() => setActiveTrainingTool(null)}
          />
        </Suspense>
      )}

      {programOpen && (
        <Suspense fallback={null}>
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
                  Reorder, substitute, skip, or add exercises for this session
                  only. Your base programme stays unchanged.
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
                                      exercise.exerciseOrder ===
                                      item.exerciseOrder
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
                                      exercise.exerciseOrder ===
                                      item.exerciseOrder
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
                                      exercise.exerciseOrder ===
                                      item.exerciseOrder
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
                                    exercise.exerciseOrder ===
                                    item.exerciseOrder
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
                  {programSaving ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Check />
                  )}{' '}
                  Save session
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Suspense>
      )}

      {sessionSummaryOpen && (
        <Suspense fallback={null}>
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
                      <Sparkles className="size-5 text-primary" /> Phase{' '}
                      {activePhase} · Week {activeDisplayWeek} · Day {activeDay}
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
                  .sort(
                    (left, right) => left.exerciseOrder - right.exerciseOrder,
                  )
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
        </Suspense>
      )}

      {personalRecordOpen && (
        <Suspense fallback={null}>
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
                <Button className="w-full" onClick={closePersonalRecord}>
                  Keep going
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Suspense>
      )}

      {(backupOpen || importOpen) && (
        <Suspense fallback={null}>
          <DataManagementDialogs
            backup={{
              open: backupOpen,
              busy: backupBusy,
              fileName: backupFileName,
              summary: backupSummary,
              onOpenChange: setBackupOpen,
              onPreviewFile: previewBackupFile,
              onRestore: restoreBackup,
            }}
            sheetImport={{
              open: importOpen,
              loading: loadingImport,
              importing: importingSheet,
              preview: importPreview,
              selectedKeys: selectedImportKeys,
              error: sheetImportError,
              onOpenChange: setImportOpen,
              onToggleItem: toggleImportItem,
              onImportSelected: importSelectedSheetEntries,
            }}
          />
        </Suspense>
      )}

      <nav
        aria-label="Primary navigation"
        className="beta-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgb(15_23_42/7%)] backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-3">
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
