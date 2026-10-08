'use client';
import { lazy, Suspense, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Dumbbell,
  History,
  Medal,
  NotebookPen,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
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
import {
  days,
  displayWeekNumber,
  targetLabel,
  type RoutineExercise,
} from '@/lib/routine';
import { workoutMetrics } from '@/lib/workout-metrics';
import { dayPresentation } from '@/lib/day-presentation';
import type { WorkoutEntry } from '@/lib/workout-types';
import DayReportButton from './day-report-button';
import ProgressDataMenu from './progress-data-menu';
const ProgressChart = lazy(() => import('./progress-chart'));
const ExerciseProgressChart = lazy(() => import('./exercise-progress-chart'));
const AdvancedInsights = lazy(() => import('./advanced-insights'));
const StartupDetails = lazy(() => import('./startup-details'));
const setNumbers = [1, 2, 3, 4, 5] as const;
function entryVolume(entry: WorkoutEntry) {
  return setNumbers.reduce((sum, set) => {
    const weight = entry[`set${set}Weight`];
    const reps = entry[`set${set}Reps`];
    return sum + (weight ?? 0) * (reps ?? 0);
  }, 0);
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

function HistoryWeekDisclosure({
  entry,
  displayName,
  defaultExpanded,
}: {
  entry: WorkoutEntry;
  displayName: string;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const evenWeek = entry.week % 2 === 0;
  const surfaceClass = evenWeek
    ? 'border-blue-200/80 bg-blue-50/75'
    : 'border-violet-200/80 bg-violet-50/75';
  const weekClass = evenWeek
    ? 'bg-blue-100 text-blue-700'
    : 'bg-violet-100 text-violet-700';

  return (
    <div className={`overflow-hidden rounded-xl border ${surfaceClass}`}>
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-sans"
      >
        <span
          className={`rounded-lg px-2 py-1 text-xs font-semibold ${weekClass}`}
        >
          Week {displayWeekNumber(entry.week)}
        </span>
        <span className="ml-auto text-sm text-muted-foreground">
          {formatWorkoutDate(entry.completedAt ?? entry.updatedAt)}
        </span>
        <ChevronRight
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-current/5 px-3 pb-3 pt-2">
          <div className="flex flex-wrap gap-1.5">
            {loggedSets(entry).map((set) => (
              <span
                key={set.set}
                className="rounded-lg border border-border/80 bg-card px-2 py-1 font-sans text-sm font-medium"
              >
                Set {set.set}:{' '}
                {set.weight == null
                  ? `${set.reps} ${displayName === 'Plank' ? 'sec' : 'reps'}`
                  : `${set.weight} kg × ${set.reps}`}
                {entry[`set${set.set}Rir`] != null &&
                  ` · RIR ${entry[`set${set.set}Rir`]}`}
              </span>
            ))}
            {entry.rir != null && (
              <span className="rounded-lg border border-primary/20 bg-accent px-2 py-1 font-sans text-xs font-medium text-primary">
                Exercise RIR {entry.rir}
              </span>
            )}
          </div>
          {entry.notes && (
            <p className="mt-2 flex gap-1.5 font-sans text-sm leading-relaxed text-muted-foreground">
              <NotebookPen className="mt-0.5 size-3.5 shrink-0" />
              {entry.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function EarlierHistoryDisclosure({
  entries,
  displayName,
}: {
  entries: WorkoutEntry[];
  displayName: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <details
      className="group overflow-hidden rounded-xl border border-border/80 bg-muted/35"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-sans text-xs font-semibold [&::-webkit-details-marker]:hidden">
        <History className="size-4 text-muted-foreground" />
        Earlier weeks
        <Badge variant="outline" className="ml-auto bg-card font-sans">
          {entries.length}
        </Badge>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      {expanded && (
        <div className="space-y-2 border-t border-border/70 p-2">
          {entries.map((entry) => (
            <HistoryWeekDisclosure
              key={`${entry.id ?? entry.week}-${entry.exerciseOrder}`}
              entry={entry}
              displayName={displayName}
              defaultExpanded={false}
            />
          ))}
        </div>
      )}
    </details>
  );
}

type Props = {
  activePhase: number;
  activeRoutine: RoutineExercise[];
  phaseEntries: WorkoutEntry[];
  allEntries: WorkoutEntry[];
  entryIndex: {
    completedByPhaseDay: Map<string, WorkoutEntry[]>;
    completedByExercise: Map<string, WorkoutEntry[]>;
  };
  weeklySummaries: {
    week: number;
    storageWeek: number;
    sessions: number;
    volume: number;
  }[];
  totalRows: number;
  totalVolume: number;
  totalSessions: number;
  totalRecords: number;
  loadingImport: boolean;
  importingSheet: boolean;
  loading: boolean;
  syncingSheet: boolean;
  backupBusy: boolean;
  previewGoogleSheetImport: () => void;
  syncGoogleSheet: () => void;
  downloadBackup: () => void;
  onRestoreBackup: () => void;
  selectWeek: (week: number) => void;
  setView: (view: 'today') => void;
};
export default function ProgressView({
  activePhase,
  activeRoutine,
  phaseEntries,
  allEntries,
  entryIndex,
  weeklySummaries,
  totalRows,
  totalVolume,
  totalSessions,
  totalRecords,
  loadingImport,
  importingSheet,
  loading,
  syncingSheet,
  backupBusy,
  previewGoogleSheetImport,
  syncGoogleSheet,
  downloadBackup,
  onRestoreBackup,
  selectWeek,
  setView,
}: Props) {
  const [startupOpen, setStartupOpen] = useState(false);
  const [progressExerciseKey, setProgressExerciseKey] = useState('A|1');
  const progressExerciseOptions = useMemo(() => {
    const customByKey = new Map<string, RoutineExercise>();
    phaseEntries
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
    return [...activeRoutine, ...customByKey.values()];
  }, [activeRoutine, phaseEntries]);
  const selectedProgressExercise =
    progressExerciseOptions.find(
      (item) => `${item.day}|${item.order}` === progressExerciseKey,
    ) ?? progressExerciseOptions[0]!;
  const selectedProgressData = [
    ...(entryIndex.completedByExercise.get(
      `${activePhase}|${selectedProgressExercise.day}|${selectedProgressExercise.order}`,
    ) ?? []),
  ]
    .reverse()
    .map((entry) => ({
      week: displayWeekNumber(entry.week),
      ...workoutMetrics(entry),
    }));

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-sans text-sm font-semibold text-primary">
            TRAINING SUMMARY
          </p>
          <h1 className="font-sans text-3xl font-bold tracking-tight">
            Phase {activePhase} progress across 12 weeks.
          </h1>
          <p className="mt-1 font-sans text-muted-foreground">
            The same core KPIs and weekly totals as your spreadsheet, updated
            automatically.
          </p>
        </div>
        <ProgressDataMenu
          activePhase={activePhase}
          loadingImport={loadingImport}
          importingSheet={importingSheet}
          loading={loading}
          syncingSheet={syncingSheet}
          backupBusy={backupBusy}
          previewGoogleSheetImport={previewGoogleSheetImport}
          syncGoogleSheet={syncGoogleSheet}
          downloadBackup={downloadBackup}
          onRestoreBackup={onRestoreBackup}
          onStartupDetails={() => setStartupOpen(true)}
        />
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
                  <p className="font-sans text-xl font-bold">{String(value)}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <details className="group mt-5 overflow-hidden rounded-2xl border bg-card">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 font-sans [&::-webkit-details-marker]:hidden">
          <span className="grid size-9 place-items-center rounded-xl bg-accent text-primary">
            <Sparkles className="size-4" />
          </span>
          <span>
            <span className="block text-sm font-semibold">
              Programme insights
            </span>
            <span className="block text-xs font-normal text-muted-foreground">
              Progress, effort, muscle balance, and recovery signals
            </span>
          </span>
          <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t px-4 py-4 sm:px-5">
          <Suspense
            fallback={
              <div className="h-28 animate-pulse rounded-xl bg-muted/45" />
            }
          >
            <AdvancedInsights entries={phaseEntries} routine={activeRoutine} />
          </Suspense>
        </div>
      </details>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(330px,.65fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="font-sans">Weekly training volume</CardTitle>
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
                  selectWeek(week.storageWeek);
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
              <TrendingUp className="size-5 text-primary" /> Exercise progress
            </CardTitle>
            <CardDescription className="mt-1 font-sans">
              Top weight and estimated strength for one exercise across the
              programme.
            </CardDescription>
          </div>
          <CardAction>
            <select
              value={progressExerciseKey}
              onChange={(event) => setProgressExerciseKey(event.target.value)}
              aria-label="Exercise progress selection"
              className="h-11 max-w-[260px] rounded-lg border bg-card px-3 font-sans text-base font-medium outline-none focus:ring-3 focus:ring-ring/30"
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
                  ['Sessions logged', String(selectedProgressData.length)],
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
              Swipe between Day A, B, and C to review every completed exercise,
              set, and note. The latest three weeks open by default; earlier
              weeks stay tucked away.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <Carousel
            opts={{ align: 'start', loop: false, duration: 18 }}
            adaptiveHeight
            wheelNavigation
            aria-label="Workout history by training day"
          >
            <CarouselContent>
              {days.map((day) => {
                const dayEntries =
                  entryIndex.completedByPhaseDay.get(`${activePhase}|${day}`) ??
                  [];
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
                          entry.target.split('×')[1]?.trim() ?? 'Logged sets',
                        rest: 'Custom',
                        muscles: 'Custom exercise',
                        alternative: 'None',
                      });
                  });
                const dayExercises = [
                  ...activeRoutine.filter((item) => item.day === day),
                  ...customHistory.values(),
                ];
                const dayColor = dayPresentation[day].badge;

                return (
                  <CarouselItem key={day}>
                    <div className="rounded-2xl border border-border/80 bg-muted/20 p-3 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4">
                        <div className="flex items-center gap-3">
                          <span
                            className={`grid size-16 shrink-0 place-items-center rounded-full p-2 font-sans text-sm font-bold ${dayColor}`}
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
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <DayReportButton
                            day={day}
                            entries={allEntries}
                            loading={loading}
                          />
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
                            {Math.round(dayVolume).toLocaleString()} kg volume
                          </Badge>
                          <span className="mx-1 hidden h-6 w-px bg-border md:block" />
                          <div className="hidden shrink-0 gap-2 md:flex">
                            <CarouselPrevious
                              aria-label="Previous training day"
                              title="Previous training day"
                              className="static inset-auto m-0 size-8 translate-x-0 translate-y-0"
                            />
                            <CarouselNext
                              aria-label="Next training day"
                              title="Next training day"
                              className="static inset-auto m-0 size-8 translate-x-0 translate-y-0"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {dayExercises.map((item) => {
                          const exerciseEntries =
                            entryIndex.completedByExercise.get(
                              `${activePhase}|${day}|${item.order}`,
                            ) ?? [];
                          const displayName =
                            exerciseEntries[0]?.exercise ?? item.name;

                          return (
                            <article
                              key={`${day}-${item.order}`}
                              className="workout-history-card flex min-h-56 flex-col rounded-xl border border-border/70 bg-card p-3 sm:p-4"
                            >
                              <div className="flex items-start gap-3">
                                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary font-sans text-xs font-bold">
                                  {item.order}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <h3 className="font-sans text-sm font-semibold sm:text-base">
                                    {displayName}
                                  </h3>
                                  <p className="mt-0.5 font-sans text-sm text-muted-foreground">
                                    {targetLabel(item)} · {item.muscles}
                                  </p>
                                </div>
                              </div>

                              {exerciseEntries.length > 0 ? (
                                <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
                                  {exerciseEntries.slice(0, 3).map((entry) => (
                                    <HistoryWeekDisclosure
                                      key={`${entry.id ?? entry.week}-${entry.exerciseOrder}`}
                                      entry={entry}
                                      displayName={displayName}
                                      defaultExpanded
                                    />
                                  ))}
                                  {exerciseEntries.length > 3 && (
                                    <EarlierHistoryDisclosure
                                      entries={exerciseEntries.slice(3)}
                                      displayName={displayName}
                                    />
                                  )}
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
                Swipe or scroll horizontally, or use the arrows to change day.
              </p>
              <div className="flex shrink-0 gap-2">
                <CarouselPrevious className="static inset-auto m-0 translate-x-0 translate-y-0" />
                <CarouselNext className="static inset-auto m-0 translate-x-0 translate-y-0" />
              </div>
            </div>
          </Carousel>
        </CardContent>
      </Card>
      {startupOpen && (
        <Suspense fallback={null}>
          <StartupDetails onClose={() => setStartupOpen(false)} />
        </Suspense>
      )}
    </section>
  );
}
