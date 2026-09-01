'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis,
} from 'recharts';
import {
  AlertCircle, BarChart3, BookOpen, CalendarDays, Check,
  CheckCircle2, ChevronLeft, ChevronRight, Clock3, Dumbbell,
  Eye, Home, Loader2, LockKeyhole, LogOut, Minus, NotebookPen,
  Plus, RotateCcw, Sparkles, Target, TrendingUp,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { days, routine, targetLabel, workingSetsForWeek, type RoutineExercise, type TrainingDay } from '@/lib/routine';

type View = 'today' | 'plan' | 'progress' | 'guide';

type WorkoutAppProps = {
  mode?: 'demo' | 'owner';
  userLabel?: string;
  signOutHref?: string;
};

type WorkoutEntry = {
  id?: number;
  week: number;
  day: TrainingDay;
  exerciseOrder: number;
  exercise: string;
  target: string;
  set1Weight: number | null;
  set1Reps: number | null;
  set2Weight: number | null;
  set2Reps: number | null;
  set3Weight: number | null;
  set3Reps: number | null;
  rir: number | null;
  notes: string;
  completed: boolean;
  completedAt?: string | null;
  updatedAt?: string;
};

type Draft = {
  sets: { weight: string; reps: string; done: boolean }[];
  rir: string;
  notes: string;
};

const emptyDraft: Draft = {
  sets: Array.from({ length: 3 }, () => ({ weight: '', reps: '', done: false })),
  rir: '',
  notes: '',
};

const chartConfig = {
  volume: { label: 'Volume (kg)', color: 'var(--color-chart-1)' },
} satisfies ChartConfig;

const weekDates = [
  'Aug 26–Sep 1', 'Sep 2–8', 'Sep 9–15', 'Sep 16–22', 'Sep 23–29', 'Sep 30–Oct 6',
  'Oct 7–13', 'Oct 14–20', 'Oct 21–27', 'Oct 28–Nov 3', 'Nov 4–10', 'Nov 11–17',
];

const demoLoads: Record<string, number> = {
  A1: 70, A2: 30, A3: 32.5, A4: 25, A5: 10, A6: 40,
  B1: 20, B2: 27.5, B3: 24, B4: 80, B5: 30, B6: 8,
};

const demoEntries: WorkoutEntry[] = routine
  .filter((exercise) => exercise.day !== 'C')
  .map((exercise, index) => ({
    id: index + 1,
    week: 1,
    day: exercise.day,
    exerciseOrder: exercise.order,
    exercise: exercise.name,
    target: targetLabel(exercise),
    set1Weight: demoLoads[`${exercise.day}${exercise.order}`],
    set1Reps: 10,
    set2Weight: demoLoads[`${exercise.day}${exercise.order}`],
    set2Reps: 10,
    set3Weight: null,
    set3Reps: null,
    rir: 2,
    notes: '',
    completed: true,
    completedAt: exercise.day === 'A' ? '2026-08-26' : '2026-08-31',
    updatedAt: exercise.day === 'A' ? '2026-08-26' : '2026-08-31',
  }));

function numberOrNull(value: string) {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function entryVolume(entry: WorkoutEntry) {
  return ([1, 2, 3] as const).reduce((sum, set) => {
    const weight = entry[`set${set}Weight`];
    const reps = entry[`set${set}Reps`];
    return sum + (weight ?? 0) * (reps ?? 0);
  }, 0);
}

function draftFromEntry(entry?: WorkoutEntry): Draft {
  if (!entry) return structuredClone(emptyDraft);
  return {
    sets: ([1, 2, 3] as const).map((set) => {
      const weight = entry[`set${set}Weight`];
      const reps = entry[`set${set}Reps`];
      return { weight: weight == null ? '' : String(weight), reps: reps == null ? '' : String(reps), done: reps != null };
    }),
    rir: entry.rir == null ? '' : String(entry.rir),
    notes: entry.notes ?? '',
  };
}

function progressionAdvice(exercise: RoutineExercise, draft: Draft, activeSets: number) {
  const reps = draft.sets.slice(0, activeSets).map((set) => numberOrNull(set.reps));
  if (reps.some((value) => value == null)) return 'Complete the working sets for guidance';
  const rir = numberOrNull(draft.rir);
  if (rir == null) return 'Log RIR for progression guidance';
  const numbers = exercise.repRange.match(/\d+/g)?.map(Number) ?? [];
  const top = numbers[1] ?? numbers[0] ?? 0;
  if (reps.every((value) => (value ?? 0) >= top) && rir <= 2) {
    return exercise.name === 'Plank' ? 'Increase difficulty next time' : 'Increase load next time';
  }
  return exercise.name === 'Plank' ? 'Keep building' : 'Keep this load';
}

function NavButton({ view, active, icon: Icon, label, onChange, compact = false }: {
  view: View; active: boolean; icon: typeof Home; label: string; onChange: (view: View) => void; compact?: boolean;
}) {
  if (compact) {
    return (
      <button type="button" onClick={() => onChange(view)} aria-current={active ? 'page' : undefined}
        className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl font-sans text-xs font-semibold transition-colors ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
        <Icon className="size-5" />{label}
      </button>
    );
  }
  return (
    <Button type="button" variant="ghost" onClick={() => onChange(view)} aria-current={active ? 'page' : undefined}
      className={`h-10 px-4 font-sans ${active ? 'bg-accent text-primary' : 'text-muted-foreground'}`}>
      <Icon data-icon="inline-start" />{label}
    </Button>
  );
}

export function WorkoutApp({ mode = 'owner', userLabel, signOutHref = '/' }: WorkoutAppProps) {
  const isDemo = mode === 'demo';
  const [view, setView] = useState<View>('today');
  const [activeWeek, setActiveWeek] = useState(1);
  const [activeDay, setActiveDay] = useState<TrainingDay>('C');
  const [activeIndex, setActiveIndex] = useState(0);
  const [entries, setEntries] = useState<WorkoutEntry[]>(isDemo ? demoEntries : []);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(!isDemo);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  const dayExercises = useMemo(() => routine.filter((exercise) => exercise.day === activeDay), [activeDay]);
  const exercise = dayExercises[activeIndex] ?? dayExercises[0];
  const existingEntry = entries.find((entry) => entry.week === activeWeek && entry.day === activeDay && entry.exerciseOrder === exercise.order);
  const activeSets = workingSetsForWeek(exercise, activeWeek);

  useEffect(() => {
    if (isDemo) return;
    let cancelled = false;
    fetch('/api/workouts')
      .then(async (response) => {
        const data = await response.json() as { entries?: WorkoutEntry[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? 'Unable to load workouts.');
        if (!cancelled) {
          setEntries((data.entries ?? []).map((entry) => ({ ...entry, completed: Boolean(entry.completed) })));
          setError('');
        }
      })
      .catch((loadError: Error) => { if (!cancelled) setError(loadError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isDemo]);

  useEffect(() => {
    const current = entries.find((entry) => entry.week === activeWeek && entry.day === activeDay && entry.exerciseOrder === exercise.order);
    const previous = [...entries]
      .filter((entry) => entry.week < activeWeek && entry.day === activeDay && entry.exerciseOrder === exercise.order)
      .sort((a, b) => b.week - a.week)[0];
    setDraft(draftFromEntry(current ?? previous));
    if (!current && previous) {
      setDraft((value) => ({ ...value, sets: value.sets.map((set) => ({ ...set, done: false })), rir: '', notes: '' }));
    }
    setShowNotes(Boolean(current?.notes));
    setNotice('');
  }, [activeDay, activeWeek, entries, exercise.order]);

  const weeklySummaries = useMemo(() => Array.from({ length: 12 }, (_, index) => {
    const week = index + 1;
    const weekEntries = entries.filter((entry) => entry.week === week && entry.completed);
    const sessions = days.filter((day) => weekEntries.some((entry) => entry.day === day)).length;
    return {
      week,
      rows: weekEntries.length,
      sessions,
      volume: Math.round(weekEntries.reduce((sum, entry) => sum + entryVolume(entry), 0) * 10) / 10,
      dayA: weekEntries.filter((entry) => entry.day === 'A').length,
      dayB: weekEntries.filter((entry) => entry.day === 'B').length,
      dayC: weekEntries.filter((entry) => entry.day === 'C').length,
    };
  }), [entries]);

  const currentSummary = weeklySummaries[activeWeek - 1];
  const sessionsDone = currentSummary.sessions;
  const weeklyPercent = Math.round((sessionsDone / 3) * 100);
  const totalVolume = weeklySummaries.reduce((sum, week) => sum + week.volume, 0);
  const totalRows = weeklySummaries.reduce((sum, week) => sum + week.rows, 0);
  const totalSessions = weeklySummaries.reduce((sum, week) => sum + week.sessions, 0);
  const advice = progressionAdvice(exercise, draft, activeSets);
  const readyToSave = draft.sets.slice(0, activeSets).every((set) => numberOrNull(set.reps) != null);

  function chooseDay(day: TrainingDay) {
    setActiveDay(day); setActiveIndex(0); setView('today');
  }

  function updateSet(index: number, key: 'weight' | 'reps', value: string) {
    setDraft((current) => ({ ...current, sets: current.sets.map((set, setIndex) => setIndex === index ? { ...set, [key]: value, done: key === 'reps' ? value !== '' : set.done } : set) }));
  }

  function stepSet(index: number, key: 'weight' | 'reps', amount: number) {
    const current = Number(draft.sets[index][key] || 0);
    const next = Math.max(0, Math.round((current + amount) * 10) / 10);
    updateSet(index, key, String(next));
  }

  async function saveExercise() {
    if (isDemo) {
      setError('');
      setNotice('This public preview uses sample data. Only the owner can save workout entries.');
      return;
    }
    if (!readyToSave) { setError(`Enter reps for the first ${activeSets} working sets.`); return; }
    setSaving(true); setError(''); setNotice('');
    const payload = {
      week: activeWeek, day: activeDay, exerciseOrder: exercise.order,
      set1Weight: numberOrNull(draft.sets[0].weight), set1Reps: numberOrNull(draft.sets[0].reps),
      set2Weight: numberOrNull(draft.sets[1].weight), set2Reps: numberOrNull(draft.sets[1].reps),
      set3Weight: numberOrNull(draft.sets[2].weight), set3Reps: numberOrNull(draft.sets[2].reps),
      rir: numberOrNull(draft.rir), notes: draft.notes, completed: true,
    };
    try {
      const response = await fetch('/api/workouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json() as { entry?: WorkoutEntry; error?: string };
      if (!response.ok || !data.entry) throw new Error(data.error ?? 'Unable to save exercise.');
      const saved = { ...data.entry, completed: Boolean(data.entry.completed) };
      setEntries((current) => [...current.filter((entry) => !(entry.week === saved.week && entry.day === saved.day && entry.exerciseOrder === saved.exerciseOrder)), saved]);
      setNotice(`${exercise.name} saved`);
      if (activeIndex < dayExercises.length - 1) setActiveIndex((index) => index + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save exercise.');
    } finally { setSaving(false); }
  }

  return (
    <main className="min-h-screen bg-background pb-24 font-sans text-foreground md:pb-10">
      {isDemo && (
        <div className="border-b border-primary/15 bg-accent/70 px-4 py-2.5 text-primary">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 text-xs font-semibold sm:text-sm">
            <span className="flex items-center gap-2"><Eye className="size-4 shrink-0" /> Public preview · Sample workout data only</span>
            <Link href="/workout" className="shrink-0 underline underline-offset-4">Owner sign in</Link>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between px-4 sm:px-6">
          <button type="button" onClick={() => setView('today')} className="flex items-center gap-3 text-left">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20"><Dumbbell className="size-5" /></span>
            <span><span className="block font-sans text-lg font-bold tracking-tight">Liftline</span><span className="block font-sans text-xs text-muted-foreground">12-week strength plan</span></span>
          </button>
          <div className="hidden items-center gap-1 md:flex">
            <NavButton view="today" active={view === 'today'} icon={Home} label="Today" onChange={setView} />
            <NavButton view="plan" active={view === 'plan'} icon={CalendarDays} label="Plan" onChange={setView} />
            <NavButton view="progress" active={view === 'progress'} icon={BarChart3} label="Progress" onChange={setView} />
          </div>
          <div className="flex items-center gap-2">
            {isDemo ? (
              <Link href="/workout" className="hidden h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted sm:inline-flex"><LockKeyhole className="size-4" /> Owner sign in</Link>
            ) : (
              <>
                <span className="hidden max-w-44 truncate text-xs font-medium text-muted-foreground lg:block">Private · {userLabel}</span>
                <a href={signOutHref} target="_top" className="hidden h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted sm:inline-flex"><LogOut className="size-4" /> Sign out</a>
                <a href={signOutHref} target="_top" aria-label="Sign out" className="grid size-10 place-items-center rounded-xl border border-border bg-card text-foreground sm:hidden"><LogOut className="size-4" /></a>
              </>
            )}
            <Button variant={view === 'guide' ? 'secondary' : 'outline'} size="icon-lg" aria-label="Open guide" onClick={() => setView('guide')}><BookOpen /></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 md:py-8">
        {(error || notice) && (
          <Alert className={`mb-5 ${error ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-success/25 bg-success-soft text-success'}`}>
            {error ? <AlertCircle /> : <CheckCircle2 />}
            <AlertTitle>{error ? 'Something needs attention' : isDemo ? 'Read-only preview' : 'Saved'}</AlertTitle>
            <AlertDescription className={error ? 'text-destructive/85' : 'text-success/85'}>{error || notice}</AlertDescription>
          </Alert>
        )}

        {view === 'today' && (
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0 space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <label htmlFor="week" className="text-sm font-semibold text-primary">WEEK</label>
                    <select id="week" value={activeWeek} onChange={(event) => setActiveWeek(Number(event.target.value))}
                      className="h-9 rounded-lg border bg-card px-3 text-sm font-semibold outline-none focus:ring-3 focus:ring-ring/30">
                      {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>Week {index + 1}</option>)}
                    </select>
                    <span className="text-sm text-muted-foreground">· {weekDates[activeWeek - 1]}</span>
                  </div>
                  <h1 className="font-sans text-2xl font-bold tracking-tight sm:text-3xl">Your workout, set by set.</h1>
                  <p className="mt-1 text-sm text-muted-foreground">Log each set, RIR, and notes as you train.</p>
                </div>
                <Badge variant="secondary" className="h-7 bg-success-soft px-3 text-success"><CheckCircle2 /> {sessionsDone} of 3 sessions</Badge>
              </div>

              <Card className="border-0 text-primary-foreground ring-0 shadow-xl shadow-primary/10 [background:var(--hero)]">
                <CardHeader className="pb-1">
                  <CardTitle className="font-sans text-lg font-semibold text-primary-foreground">Week {activeWeek} progress</CardTitle>
                  <CardDescription className="font-sans text-primary-foreground/90">
                    {sessionsDone === 3 ? 'Week complete—excellent consistency.' : `${3 - sessionsDone} session${3 - sessionsDone === 1 ? '' : 's'} left this week.`}
                  </CardDescription>
                  <CardAction className="rounded-xl bg-black/15 px-3 py-2 text-right backdrop-blur-sm">
                    <p className="font-sans text-xl font-bold text-primary-foreground">{weeklyPercent}%</p><p className="font-sans text-[11px] text-primary-foreground/85">complete</p>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div role="progressbar" aria-label="Week progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={weeklyPercent} className="h-2 overflow-hidden rounded-full bg-black/20">
                    <span className="block h-full rounded-full bg-white transition-[width]" style={{ width: `${weeklyPercent}%` }} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-medium">
                    {days.map((day) => {
                      const complete = entries.some((entry) => entry.week === activeWeek && entry.day === day && entry.completed);
                      return <button key={day} type="button" onClick={() => chooseDay(day)} className={`rounded-lg px-3 py-2 text-left font-sans transition-colors ${activeDay === day ? 'bg-white text-primary' : 'bg-black/15 text-white hover:bg-black/20'}`}>Day {day}<span className="float-right">{complete ? '✓' : activeDay === day ? '→' : '·'}</span></button>;
                    })}
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center justify-between gap-3">
                <div><p className="font-sans text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Day {activeDay} · Exercise {activeIndex + 1} of {dayExercises.length}</p><h2 className="mt-1 font-sans text-xl font-bold">{exercise.name}</h2></div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" aria-label="Previous exercise" disabled={activeIndex === 0} onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}><ChevronLeft /></Button>
                  <Button variant="outline" size="icon" aria-label="Next exercise" disabled={activeIndex === dayExercises.length - 1} onClick={() => setActiveIndex((index) => Math.min(dayExercises.length - 1, index + 1))}><ChevronRight /></Button>
                </div>
              </div>

              <Card className="border-0 shadow-sm shadow-slate-900/5 ring-border">
                <CardHeader className="border-b bg-muted/35">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-day-c font-sans text-day-c-foreground">Day {activeDay}</Badge>
                    <Badge variant="outline" className="font-sans"><Target /> {targetLabel(exercise)}</Badge>
                    <Badge variant="outline" className="font-sans"><Clock3 /> Rest {exercise.rest}</Badge>
                    {existingEntry?.completed && <Badge className="bg-success-soft font-sans text-success"><Check /> Logged</Badge>}
                  </div>
                  <CardDescription className="mt-2 font-sans">{exercise.muscles} · Alternative: {exercise.alternative}</CardDescription>
                </CardHeader>
                <CardContent className="pt-1">
                  <div className="grid grid-cols-[42px_1fr_1fr] items-center gap-2 border-b py-2 font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid-cols-[42px_1fr_1fr_64px]">
                    <span>Set</span><span>Weight (kg)</span><span>{exercise.name === 'Plank' ? 'Seconds' : 'Reps'}</span><span className="hidden text-center sm:block">Status</span>
                  </div>
                  {draft.sets.slice(0, exercise.targetSets).map((set, index) => (
                    <div key={index} className="grid grid-cols-[42px_1fr_1fr] items-center gap-2 border-b border-border/70 py-3 last:border-0 sm:grid-cols-[42px_1fr_1fr_64px]">
                      <span className="relative grid size-8 place-items-center rounded-full bg-secondary font-sans text-sm font-bold">{index + 1}{index >= activeSets && <span className="absolute -right-2.5 -top-2 rounded bg-warning-soft px-1 font-sans text-[8px] text-warning-foreground">OPT</span>}</span>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon-sm" aria-label={`Decrease set ${index + 1} weight`} onClick={() => stepSet(index, 'weight', -2.5)}><Minus /></Button>
                        <Input aria-label={`Set ${index + 1} weight in kilograms`} inputMode="decimal" type="number" value={set.weight} placeholder={exercise.name === 'Plank' ? 'Optional' : '0'} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateSet(index, 'weight', event.target.value)} className="h-11 min-w-0 bg-background text-center font-sans text-lg font-semibold tabular-nums" />
                        <Button variant="outline" size="icon-sm" aria-label={`Increase set ${index + 1} weight`} onClick={() => stepSet(index, 'weight', 2.5)}><Plus /></Button>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon-sm" aria-label={`Decrease set ${index + 1} repetitions`} onClick={() => stepSet(index, 'reps', -1)}><Minus /></Button>
                        <Input aria-label={`Set ${index + 1} ${exercise.name === 'Plank' ? 'seconds' : 'repetitions'}`} inputMode="numeric" type="number" value={set.reps} placeholder="0" onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateSet(index, 'reps', event.target.value)} className="h-11 min-w-0 bg-background text-center font-sans text-lg font-semibold tabular-nums" />
                        <Button variant="outline" size="icon-sm" aria-label={`Increase set ${index + 1} repetitions`} onClick={() => stepSet(index, 'reps', 1)}><Plus /></Button>
                      </div>
                      <span className={`mx-auto hidden size-8 place-items-center rounded-full border-2 sm:grid ${set.done ? 'border-success bg-success text-white' : 'border-border text-transparent'}`}><Check className="size-4" /></span>
                    </div>
                  ))}

                  <div className="mt-4 grid grid-cols-[1fr_112px] items-end gap-3">
                    <div><label htmlFor="rir" className="mb-1.5 block font-sans text-sm font-medium">Reps in reserve (RIR)</label><p className="font-sans text-xs text-muted-foreground">{activeWeek <= 2 ? 'Aim for about 3 during ramp-in.' : 'Aim for 1–2 with clean form.'}</p></div>
                    <Input id="rir" type="number" inputMode="numeric" value={draft.rir} placeholder="2" min="0" max="5" onFocus={(event) => event.currentTarget.select()} onChange={(event) => setDraft((current) => ({ ...current, rir: event.target.value }))} className="h-11 bg-background text-center font-sans text-lg font-semibold" />
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-xl bg-secondary/70 p-3">
                    <div><p className="font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next time</p><p className="font-sans text-sm font-semibold">{advice}</p></div><TrendingUp className="size-5 text-primary" />
                  </div>

                  {showNotes ? (
                    <div className="mt-4"><label htmlFor="notes" className="mb-1.5 block font-sans text-sm font-medium">Notes</label><Textarea id="notes" value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Form cues, machine settings, anything to remember…" className="font-sans" /></div>
                  ) : (
                    <Button type="button" variant="ghost" className="mt-3 font-sans text-muted-foreground" onClick={() => setShowNotes(true)}><NotebookPen /> Add notes</Button>
                  )}

                  <Button size="lg" className="mt-4 h-12 w-full rounded-xl font-sans text-base shadow-md shadow-primary/20" disabled={saving || loading} onClick={saveExercise}>
                    {saving ? <Loader2 className="animate-spin" /> : isDemo ? <LockKeyhole /> : existingEntry?.completed ? <RotateCcw /> : <CheckCircle2 />}
                    {saving ? 'Saving…' : isDemo ? 'Preview only' : existingEntry?.completed ? 'Update & continue' : 'Save & next'}
                    {!saving && <ChevronRight data-icon="inline-end" />}
                  </Button>
                </CardContent>
              </Card>
            </section>

            <aside className="space-y-5">
              <Card>
                <CardHeader><CardTitle className="font-sans">Week {activeWeek}</CardTitle><CardDescription className="font-sans">{weekDates[activeWeek - 1]}</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {days.map((day) => {
                    const count = entries.filter((entry) => entry.week === activeWeek && entry.day === day && entry.completed).length;
                    const total = routine.filter((item) => item.day === day).length;
                    const complete = count === total;
                    return (
                      <button key={day} type="button" onClick={() => chooseDay(day)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${activeDay === day ? 'border-primary/35 bg-accent/45' : 'border-border/80 hover:bg-muted/60'}`}>
                        <span className={`grid size-10 place-items-center rounded-xl font-sans font-bold ${complete ? 'bg-success-soft text-success' : day === activeDay ? 'bg-day-c text-day-c-foreground' : 'bg-secondary text-secondary-foreground'}`}>{day}</span>
                        <span className="min-w-0 flex-1"><span className="block font-sans font-semibold">Day {day}</span><span className="block font-sans text-xs text-muted-foreground">{count} of {total} exercises</span></span>
                        {complete ? <CheckCircle2 className="size-5 text-success" /> : <ChevronRight className="size-5 text-muted-foreground" />}
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
              <Card className="bg-warning-soft ring-warning/20"><CardHeader><CardTitle className="flex items-center gap-2 font-sans text-warning-foreground"><Target className="size-4" /> Ramp-in tip</CardTitle><CardDescription className="font-sans text-warning-foreground/80">Weeks 1–2 use two working sets for most exercises at RIR ~3. Weeks 3–4 build toward the full routine.</CardDescription></CardHeader></Card>
            </aside>
          </div>
        )}

        {view === 'plan' && (
          <section>
            <div className="mb-6"><p className="font-sans text-sm font-semibold text-primary">YOUR ROUTINE</p><h1 className="font-sans text-3xl font-bold tracking-tight">Three balanced full-body days.</h1><p className="mt-1 font-sans text-muted-foreground">Tap any day to start logging it for week {activeWeek}.</p></div>
            <div className="grid gap-5 lg:grid-cols-3">
              {days.map((day) => (
                <Card key={day} className={day === 'A' ? 'ring-blue-200' : day === 'B' ? 'ring-emerald-200' : 'ring-violet-200'}>
                  <CardHeader><Badge className={`mb-2 font-sans ${day === 'A' ? 'bg-blue-100 text-blue-700' : day === 'B' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'}`}>Day {day}</Badge><CardTitle className="font-sans">{routine.filter((item) => item.day === day).length} exercises</CardTitle><CardDescription className="font-sans">Full body · 50–60 minutes</CardDescription></CardHeader>
                  <CardContent className="space-y-2">
                    {routine.filter((item) => item.day === day).map((item) => (
                      <div key={item.order} className="flex gap-3 rounded-xl border border-border/75 p-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary font-sans text-xs font-bold">{item.order}</span><div><p className="font-sans text-sm font-semibold leading-snug">{item.name}</p><p className="mt-1 font-sans text-xs text-muted-foreground">{targetLabel(item)} · {item.rest}</p><p className="mt-1 font-sans text-[11px] text-muted-foreground">Alt: {item.alternative}</p></div></div>
                    ))}
                    <Button className="mt-2 h-11 w-full font-sans" onClick={() => chooseDay(day)}>Start Day {day}<ChevronRight /></Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {view === 'progress' && (
          <section>
            <div className="mb-6"><p className="font-sans text-sm font-semibold text-primary">TRAINING SUMMARY</p><h1 className="font-sans text-3xl font-bold tracking-tight">Progress across 12 weeks.</h1><p className="mt-1 font-sans text-muted-foreground">The same core KPIs and weekly totals as your spreadsheet, updated automatically.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Exercise rows', totalRows.toLocaleString(), Dumbbell], ['Total volume', `${Math.round(totalVolume).toLocaleString()} kg`, TrendingUp],
                ['Sessions', String(totalSessions), CheckCircle2], ['Weekly goal', '3 sessions', Target],
              ].map(([label, value, Icon]) => {
                const KpiIcon = Icon as typeof Dumbbell;
                return <Card key={String(label)} size="sm"><CardContent className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-accent text-primary"><KpiIcon className="size-5" /></span><div><p className="font-sans text-xs text-muted-foreground">{String(label)}</p><p className="font-sans text-xl font-bold">{String(value)}</p></div></CardContent></Card>;
              })}
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(330px,.65fr)]">
              <Card>
                <CardHeader><CardTitle className="font-sans">Weekly training volume</CardTitle><CardDescription className="font-sans">Weight × reps across all logged sets</CardDescription></CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[300px] w-full aspect-auto">
                    <BarChart data={weeklySummaries} margin={{ left: 0, right: 8 }}>
                      <CartesianGrid vertical={false} /><XAxis dataKey="week" tickLine={false} axisLine={false} tickFormatter={(value) => `W${value}`} />
                      <YAxis width={42} tickLine={false} axisLine={false} tickFormatter={(value) => value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)} />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                      <Bar dataKey="volume" fill="var(--color-volume)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="font-sans">Weekly summary</CardTitle><CardDescription className="font-sans">Sessions completed out of 3</CardDescription></CardHeader>
                <CardContent className="max-h-[345px] space-y-3 overflow-y-auto pr-1">
                  {weeklySummaries.map((week) => (
                    <button type="button" key={week.week} onClick={() => { setActiveWeek(week.week); setView('today'); }} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-muted">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary font-sans text-xs font-bold">W{week.week}</span>
                      <span className="min-w-0 flex-1"><span className="flex justify-between font-sans text-xs"><span>{week.sessions}/3 sessions</span><span className="text-muted-foreground">{Math.round(week.volume).toLocaleString()} kg</span></span><span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(week.sessions / 3) * 100}%` }} /></span></span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {view === 'guide' && (
          <section>
            <div className="mb-6"><p className="font-sans text-sm font-semibold text-primary">START HERE</p><h1 className="font-sans text-3xl font-bold tracking-tight">Train simply. Progress steadily.</h1><p className="mt-1 font-sans text-muted-foreground">The guidance from your spreadsheet, organized for quick reference at the gym.</p></div>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]">
              <Card><CardHeader><CardTitle className="font-sans">How to use Liftline</CardTitle></CardHeader><CardContent className="space-y-3">
                {[
                  ['Train 3× per week', 'Do Day A, B and C, ideally with at least one rest or easy day between hard sessions.'],
                  ['Warm up', 'Add 3–5 minutes of easy movement, then 1–3 lighter warm-up sets before the first big lift.'],
                  ['Choose your load', 'Finish most working sets with about 2 reps in reserve. Technique comes before load.'],
                  ['Progress gradually', 'Reach the top of the rep range on every working set with clean form and RIR 1–2, then add the smallest practical load.'],
                  ['Rest enough', 'Use 2–3 minutes for demanding compound lifts and 60–90 seconds for smaller movements.'],
                  ['Ramp in', 'Weeks 1–2 use two working sets at RIR ~3. Weeks 3–4 move toward the listed sets. Week 5 onward uses the full plan.'],
                  ['Keep cardio', 'Running, walking and hiking can stay. Reduce leg volume if another activity leaves your legs heavily fatigued.'],
                  ['Use machines freely', 'For unfamiliar barbell lifts, use a machine or Smith alternative until technique feels comfortable.'],
                ].map(([title, description], index) => <div key={title} className="flex gap-3 rounded-xl border border-border/70 p-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent font-sans text-sm font-bold text-primary">{index + 1}</span><div><p className="font-sans font-semibold">{title}</p><p className="mt-1 font-sans text-sm leading-relaxed text-muted-foreground">{description}</p></div></div>)}
              </CardContent></Card>
              <div className="space-y-5">
                <Card className="bg-success-soft ring-success/20"><CardHeader><CardTitle className="flex items-center gap-2 font-sans text-success"><Sparkles className="size-4" /> Balanced week</CardTitle></CardHeader><CardContent className="space-y-2 font-sans text-sm text-success/90">
                  {['Mon · Gym A', 'Tue · Walk / easy run', 'Wed · Gym B', 'Thu · Rest / walk', 'Fri · Gym C', 'Weekend · Rest, hike or easy run'].map((item) => <p key={item} className="rounded-lg bg-white/55 px-3 py-2">{item}</p>)}
                </CardContent></Card>
                <Card><CardHeader><CardTitle className="font-sans">Recovery notes</CardTitle></CardHeader><CardContent className="space-y-3 font-sans text-sm text-muted-foreground">
                  <p><strong className="text-foreground">Sleep:</strong> Consistent, adequate sleep matters more once you lift three times weekly.</p>
                  <p><strong className="text-foreground">Fat loss:</strong> Keep the deficit modest. Strength stable or rising while waist and weight trend down is excellent.</p>
                  <p><strong className="text-foreground">Pain rule:</strong> Stop and reassess sharp joint pain, dizziness, chest pain, or unusual symptoms.</p>
                </CardContent></Card>
              </div>
            </div>
          </section>
        )}
      </div>

      <nav aria-label="Primary navigation" className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgb(15_23_42/7%)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-sm grid-cols-3">
          <NavButton view="today" active={view === 'today'} icon={Home} label="Today" onChange={setView} compact />
          <NavButton view="plan" active={view === 'plan'} icon={CalendarDays} label="Plan" onChange={setView} compact />
          <NavButton view="progress" active={view === 'progress'} icon={BarChart3} label="Progress" onChange={setView} compact />
        </div>
      </nav>
    </main>
  );
}
