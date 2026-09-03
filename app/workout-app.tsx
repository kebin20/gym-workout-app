'use client';

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, BarChart3, BookOpen, CalendarDays, Check,
  CheckCircle2, ChevronLeft, ChevronRight, Clock3, Dumbbell,
  CirclePlay, Download, FileSpreadsheet, History, Home, Loader2, Minus, NotebookPen, Plus, RotateCcw,
  ShieldCheck, Sparkles, Target, TrendingUp,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { days, routine, targetLabel, workingSetsForWeek, type RoutineExercise, type TrainingDay } from '@/lib/routine';

type View = 'today' | 'plan' | 'progress' | 'guide';

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

type SheetSyncResult = {
  ok: boolean;
  configured: boolean;
  synced: number;
  message?: string;
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

const emptyDraft: Draft = {
  sets: Array.from({ length: 3 }, () => ({ weight: '', reps: '', done: false })),
  rir: '',
  notes: '',
};

function normaliseWorkoutEntries(entries: WorkoutEntry[]) {
  return entries.map((entry) => ({ ...entry, completed: Boolean(entry.completed) }));
}

function readCachedWorkoutEntries(): WorkoutEntry[] | null {
  try {
    const cached = window.localStorage.getItem(workoutCacheKey);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as { entries?: WorkoutEntry[] };
    return Array.isArray(parsed.entries) ? normaliseWorkoutEntries(parsed.entries) : null;
  } catch {
    return null;
  }
}

function cacheWorkoutEntries(entries: WorkoutEntry[]) {
  try {
    window.localStorage.setItem(workoutCacheKey, JSON.stringify({ entries, cachedAt: Date.now() }));
  } catch {
    // Device storage can be unavailable in private browsing. The server remains authoritative.
  }
}

const ProgressChart = lazy(() => import('./progress-chart'));

const weekDates = [
  'Aug 26–Sep 1', 'Sep 2–8', 'Sep 9–15', 'Sep 16–22', 'Sep 23–29', 'Sep 30–Oct 6',
  'Oct 7–13', 'Oct 14–20', 'Oct 21–27', 'Oct 28–Nov 3', 'Nov 4–10', 'Nov 11–17',
];

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

function exerciseVideoUrl(exercise: RoutineExercise) {
  const primaryExercise = exercise.name.split(' or ')[0].replace(/\s*\([^)]*\)\s*$/, '');
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${primaryExercise} short exercise demonstration`)}`;
}

function sheetEntrySummary(entry: WorkoutEntry) {
  const unit = entry.exercise === 'Plank' ? 'sec' : 'reps';
  return ([1, 2, 3] as const).flatMap((set) => {
    const weight = entry[`set${set}Weight`];
    const reps = entry[`set${set}Reps`];
    if (reps == null) return [];
    return [weight == null ? `${reps} ${unit}` : `${weight} kg × ${reps}`];
  }).join(' · ');
}

function formatWorkoutDate(value?: string | null) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function loggedSets(entry: WorkoutEntry) {
  return ([1, 2, 3] as const).flatMap((set) => {
    const weight = entry[`set${set}Weight`];
    const reps = entry[`set${set}Reps`];
    if (reps == null) return [];
    return [{ set, weight, reps }];
  });
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

export function WorkoutApp() {
  const [view, setView] = useState<View>('today');
  const [activeWeek, setActiveWeek] = useState(1);
  const [activeDay, setActiveDay] = useState<TrainingDay>('C');
  const [activeIndex, setActiveIndex] = useState(0);
  const [entries, setEntries] = useState<WorkoutEntry[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingSheet, setSyncingSheet] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [importingSheet, setImportingSheet] = useState(false);
  const [importPreview, setImportPreview] = useState<SheetImportPreview | null>(null);
  const [selectedImportKeys, setSelectedImportKeys] = useState<string[]>([]);
  const [sheetImportError, setSheetImportError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  const dayExercises = useMemo(() => routine.filter((exercise) => exercise.day === activeDay), [activeDay]);
  const exercise = dayExercises[activeIndex] ?? dayExercises[0];
  const existingEntry = entries.find((entry) => entry.week === activeWeek && entry.day === activeDay && entry.exerciseOrder === exercise.order);
  const previousEntry = [...entries]
    .filter((entry) => entry.completed && entry.week < activeWeek && entry.day === activeDay && entry.exerciseOrder === exercise.order)
    .sort((a, b) => b.week - a.week)[0];
  const activeSets = workingSetsForWeek(exercise, activeWeek);

  useEffect(() => {
    let cancelled = false;
    const cachedEntries = readCachedWorkoutEntries();
    if (cachedEntries) {
      queueMicrotask(() => {
        if (!cancelled) setEntries(cachedEntries);
      });
    }

    fetch('/api/workouts', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as { entries?: WorkoutEntry[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? 'Unable to load workouts.');
        if (!cancelled) {
          const freshEntries = normaliseWorkoutEntries(data.entries ?? []);
          setEntries(freshEntries);
          cacheWorkoutEntries(freshEntries);
          setError('');
        }
      })
      .catch((loadError: Error) => {
        if (!cancelled && !cachedEntries) setError(loadError.message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(() => navigator.serviceWorker.ready)
        .then((registration) => {
          const worker = registration.active;
          if (!worker) return;
          const assets = performance.getEntriesByType('resource')
            .map((entry) => entry.name)
            .filter((url) => {
              try {
                const resource = new URL(url);
                return resource.origin === window.location.origin && resource.pathname.startsWith('/_next/static/');
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
      const data = await response.json() as { entry?: WorkoutEntry; sheetSync?: SheetSyncResult; error?: string };
      if (!response.ok || !data.entry) throw new Error(data.error ?? 'Unable to save exercise.');
      const saved = { ...data.entry, completed: Boolean(data.entry.completed) };
      setEntries((current) => {
        const nextEntries = [...current.filter((entry) => !(entry.week === saved.week && entry.day === saved.day && entry.exerciseOrder === saved.exerciseOrder)), saved];
        cacheWorkoutEntries(nextEntries);
        return nextEntries;
      });
      setNotice(data.sheetSync?.ok ? `${exercise.name} saved and synced to Google Sheet` : `${exercise.name} saved`);
      if (activeIndex < dayExercises.length - 1) setActiveIndex((index) => index + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save exercise.');
    } finally { setSaving(false); }
  }

  async function syncGoogleSheet() {
    setSyncingSheet(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/workouts/sync-sheet', { method: 'POST' });
      const result = await response.json() as SheetSyncResult;
      if (!response.ok || !result.ok) throw new Error(result.message ?? 'Unable to sync the Google Sheet.');
      setNotice(`${result.synced} workout ${result.synced === 1 ? 'entry' : 'entries'} synced to Google Sheet`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Unable to sync the Google Sheet.');
    } finally {
      setSyncingSheet(false);
    }
  }

  async function previewGoogleSheetImport() {
    setImportOpen(true); setLoadingImport(true); setImportPreview(null); setSelectedImportKeys([]); setSheetImportError(''); setError(''); setNotice('');
    try {
      const response = await fetch('/api/workouts/import-sheet');
      const result = await response.json() as SheetImportPreview;
      if (!response.ok || !result.ok) throw new Error(result.message ?? 'Unable to preview the Google Sheet.');
      setImportPreview(result);
      setSelectedImportKeys(result.items.filter((item) => item.status === 'new').map((item) => item.key));
    } catch (previewError) {
      setSheetImportError(previewError instanceof Error ? previewError.message : 'Unable to preview the Google Sheet.');
    } finally { setLoadingImport(false); }
  }

  function toggleImportItem(key: string, checked: boolean) {
    setSelectedImportKeys((current) => checked ? [...new Set([...current, key])] : current.filter((currentKey) => currentKey !== key));
  }

  async function importSelectedSheetEntries() {
    if (selectedImportKeys.length === 0) return;
    setImportingSheet(true); setSheetImportError('');
    try {
      const protectedKeys = new Set(importPreview?.items.filter((item) => item.status === 'protected').map((item) => item.key) ?? []);
      const response = await fetch('/api/workouts/import-sheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: selectedImportKeys, overwriteKeys: selectedImportKeys.filter((key) => protectedKeys.has(key)) }),
      });
      const result = await response.json() as { ok?: boolean; imported?: number; protected?: number; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message ?? 'Unable to import the Google Sheet.');

      const entriesResponse = await fetch('/api/workouts');
      const entriesResult = await entriesResponse.json() as { entries?: WorkoutEntry[]; error?: string };
      if (!entriesResponse.ok) throw new Error(entriesResult.error ?? 'The import finished, but Liftline could not refresh.');
      const freshEntries = normaliseWorkoutEntries(entriesResult.entries ?? []);
      setEntries(freshEntries);
      cacheWorkoutEntries(freshEntries);
      setImportOpen(false);
      const imported = result.imported ?? 0;
      setNotice(imported > 0 ? `${imported} workout ${imported === 1 ? 'entry' : 'entries'} imported from Google Sheet` : 'No Liftline records needed updating.');
    } catch (importError) {
      setSheetImportError(importError instanceof Error ? importError.message : 'Unable to import the Google Sheet.');
    } finally { setImportingSheet(false); }
  }

  return (
    <main className="min-h-screen bg-background pb-24 font-sans text-foreground md:pb-10">
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
          <Button variant={view === 'guide' ? 'secondary' : 'outline'} size="icon-lg" aria-label="Open guide" onClick={() => setView('guide')}><BookOpen /></Button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 md:py-8">
        {(error || notice) && (
          <Alert className={`mb-5 ${error ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-success/25 bg-success-soft text-success'}`}>
            {error ? <AlertCircle /> : <CheckCircle2 />}
            <AlertTitle>{error ? 'Something needs attention' : 'All set'}</AlertTitle>
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
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <CardDescription className="font-sans">{exercise.muscles} · Alternative: {exercise.alternative}</CardDescription>
                    <a href={exerciseVideoUrl(exercise)} target="_blank" rel="noreferrer" aria-label={`Find a short video demonstration for ${exercise.name}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/20 bg-background px-2.5 font-sans text-xs font-semibold text-primary transition-colors hover:bg-accent">
                      <CirclePlay className="size-4" /> Watch demo
                    </a>
                  </div>
                  <div className="mt-3 rounded-xl border border-primary/15 bg-background/90 p-3 shadow-sm shadow-slate-900/5">
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-primary"><History className="size-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className="font-sans text-sm font-semibold">Previous session</p>
                          {previousEntry && <p className="font-sans text-xs font-medium text-muted-foreground">{formatWorkoutDate(previousEntry.completedAt ?? previousEntry.updatedAt)} · Week {previousEntry.week}</p>}
                        </div>
                        {previousEntry ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {loggedSets(previousEntry).map((set) => (
                              <span key={set.set} className="rounded-lg bg-secondary px-2.5 py-1.5 font-sans text-xs font-medium tabular-nums">
                                Set {set.set}: {set.weight == null ? `${set.reps} ${exercise.name === 'Plank' ? 'sec' : 'reps'}` : `${set.weight} kg × ${set.reps}`}
                              </span>
                            ))}
                            {previousEntry.rir != null && <span className="rounded-lg bg-success-soft px-2.5 py-1.5 font-sans text-xs font-medium text-success">RIR {previousEntry.rir}</span>}
                          </div>
                        ) : (
                          <p className="mt-1 font-sans text-xs leading-relaxed text-muted-foreground">No earlier session for this exercise yet. Your last sets and date will appear here from Week 2 onward.</p>
                        )}
                      </div>
                    </div>
                  </div>
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
                    {saving ? <Loader2 className="animate-spin" /> : existingEntry?.completed ? <RotateCcw /> : <CheckCircle2 />}
                    {saving ? 'Saving…' : existingEntry?.completed ? 'Update & continue' : 'Save & next'}
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
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div><p className="font-sans text-sm font-semibold text-primary">TRAINING SUMMARY</p><h1 className="font-sans text-3xl font-bold tracking-tight">Progress across 12 weeks.</h1><p className="mt-1 font-sans text-muted-foreground">The same core KPIs and weekly totals as your spreadsheet, updated automatically.</p></div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button variant="outline" className="font-sans" disabled={loadingImport || importingSheet || loading} onClick={previewGoogleSheetImport}>
                  {loadingImport ? <Loader2 className="animate-spin" /> : <Download />} {loadingImport ? 'Checking…' : 'Import from Google Sheet'}
                </Button>
                <Button variant="outline" className="font-sans" disabled={syncingSheet || loading} onClick={syncGoogleSheet}>
                  {syncingSheet ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} {syncingSheet ? 'Sending…' : 'Send to Google Sheet'}
                </Button>
              </div>
            </div>
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
                  <Suspense fallback={<div className="grid h-[300px] place-items-center rounded-xl bg-muted/35 font-sans text-sm text-muted-foreground">Loading chart…</div>}>
                    <ProgressChart data={weeklySummaries} />
                  </Suspense>
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
            <Card className="mt-5 overflow-hidden">
              <CardHeader className="border-b border-border/70">
                <div>
                  <CardTitle className="flex items-center gap-2 font-sans"><History className="size-5 text-primary" /> Exercise history</CardTitle>
                  <CardDescription className="mt-1 font-sans">Swipe between Day A, B, and C to review every completed exercise, set, and note.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                <Carousel opts={{ align: 'start', loop: false }} aria-label="Workout history by training day">
                  <CarouselContent>
                    {days.map((day) => {
                      const dayEntries = entries.filter((entry) => entry.completed && entry.day === day);
                      const sessionCount = new Set(dayEntries.map((entry) => entry.week)).size;
                      const dayVolume = dayEntries.reduce((sum, entry) => sum + entryVolume(entry), 0);
                      const dayExercises = routine.filter((item) => item.day === day);
                      const dayColor = day === 'A' ? 'bg-blue-100 text-blue-700' : day === 'B' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700';

                      return (
                        <CarouselItem key={day}>
                          <div className="rounded-2xl border border-border/80 bg-muted/20 p-3 sm:p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4">
                              <div className="flex items-center gap-3">
                                <span className={`grid size-11 place-items-center rounded-xl font-sans text-sm font-bold ${dayColor}`}>Day {day}</span>
                                <div>
                                  <p className="font-sans font-semibold">{dayExercises.length} exercises</p>
                                  <p className="font-sans text-xs text-muted-foreground">Full workout history</p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline" className="bg-card font-sans">{sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}</Badge>
                                <Badge variant="outline" className="bg-card font-sans">{Math.round(dayVolume).toLocaleString()} kg volume</Badge>
                              </div>
                            </div>

                            <div className="mt-4 max-h-[560px] space-y-3 overflow-y-auto pr-1">
                              {dayExercises.map((item) => {
                                const exerciseEntries = dayEntries
                                  .filter((entry) => entry.exerciseOrder === item.order)
                                  .sort((a, b) => b.week - a.week || Date.parse(b.completedAt ?? b.updatedAt ?? '') - Date.parse(a.completedAt ?? a.updatedAt ?? ''));

                                return (
                                  <article key={`${day}-${item.order}`} className="rounded-xl border border-border/70 bg-card p-3 sm:p-4">
                                    <div className="flex items-start gap-3">
                                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary font-sans text-xs font-bold">{item.order}</span>
                                      <div className="min-w-0 flex-1">
                                        <h3 className="font-sans text-sm font-semibold sm:text-base">{item.name}</h3>
                                        <p className="mt-0.5 font-sans text-xs text-muted-foreground">{targetLabel(item)} · {item.muscles}</p>
                                      </div>
                                    </div>

                                    {exerciseEntries.length > 0 ? (
                                      <div className="mt-3 space-y-2 pl-0 sm:pl-11">
                                        {exerciseEntries.map((entry) => (
                                          <div key={`${entry.week}-${entry.exerciseOrder}`} className="rounded-xl bg-muted/55 px-3 py-2.5">
                                            <div className="flex flex-wrap items-center justify-between gap-1 font-sans text-xs">
                                              <span className="font-semibold text-foreground">Week {entry.week}</span>
                                              <span className="text-muted-foreground">{formatWorkoutDate(entry.completedAt ?? entry.updatedAt)}</span>
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                              {loggedSets(entry).map((set) => (
                                                <span key={set.set} className="rounded-lg border border-border/80 bg-card px-2 py-1 font-sans text-xs font-medium">
                                                  Set {set.set}: {set.weight == null ? `${set.reps} ${item.name === 'Plank' ? 'sec' : 'reps'}` : `${set.weight} kg × ${set.reps}`}
                                                </span>
                                              ))}
                                              {entry.rir != null && <span className="rounded-lg border border-primary/20 bg-accent px-2 py-1 font-sans text-xs font-medium text-primary">RIR {entry.rir}</span>}
                                            </div>
                                            {entry.notes && <p className="mt-2 flex gap-1.5 font-sans text-xs leading-relaxed text-muted-foreground"><NotebookPen className="mt-0.5 size-3.5 shrink-0" />{entry.notes}</p>}
                                          </div>
                                        ))}
                                      </div>
                                    ) : <p className="mt-3 rounded-lg bg-muted/45 px-3 py-2 font-sans text-xs text-muted-foreground sm:ml-11">No logged sessions yet.</p>}
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
                    <p className="font-sans text-xs text-muted-foreground">Swipe horizontally or use the arrows to change day.</p>
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

      <Dialog open={importOpen} onOpenChange={(open) => { if (!importingSheet) setImportOpen(open); }}>
        <DialogContent className="h-[calc(100dvh-1.5rem)] max-h-[760px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle className="font-sans text-lg font-semibold">Preview Google Sheet import</DialogTitle>
            <DialogDescription className="font-sans">Nothing changes until you confirm. New entries are selected; existing Liftline records remain protected unless you select them.</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto px-5 pb-2">
            {loadingImport && <div className="grid min-h-52 place-items-center text-muted-foreground"><div className="flex items-center gap-2 font-sans"><Loader2 className="size-5 animate-spin" /> Reading Workout Log…</div></div>}
            {sheetImportError && <Alert variant="destructive" className="my-3"><AlertCircle /><AlertTitle>Import preview unavailable</AlertTitle><AlertDescription>{sheetImportError}</AlertDescription></Alert>}

            {importPreview && !loadingImport && (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-success-soft p-3"><p className="font-sans text-xl font-bold text-success">{importPreview.summary.new}</p><p className="font-sans text-xs text-success/80">New</p></div>
                  <div className="rounded-xl bg-secondary p-3"><p className="font-sans text-xl font-bold">{importPreview.summary.unchanged}</p><p className="font-sans text-xs text-muted-foreground">Already matches</p></div>
                  <div className="rounded-xl bg-warning-soft p-3"><p className="font-sans text-xl font-bold text-warning-foreground">{importPreview.summary.protected}</p><p className="font-sans text-xs text-warning-foreground/80">Protected</p></div>
                </div>

                {importPreview.items.some((item) => item.status !== 'unchanged') ? (
                  <div className="space-y-2">
                    {importPreview.items.filter((item) => item.status !== 'unchanged').map((item) => {
                      const selected = selectedImportKeys.includes(item.key);
                      return (
                        <label key={item.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${selected ? 'border-primary/35 bg-accent/35' : 'border-border/80 bg-card'}`}>
                          <Checkbox checked={selected} onCheckedChange={(checked) => toggleImportItem(item.key, checked === true)} aria-label={`Import ${item.source.exercise}`} className="mt-0.5" />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2"><span className="font-sans text-sm font-semibold">Week {item.source.week} · Day {item.source.day} · {item.source.exercise}</span><Badge className={`font-sans text-[10px] ${item.status === 'new' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning-foreground'}`}>{item.status === 'new' ? 'New' : 'Existing record'}</Badge></span>
                            <span className="mt-1 block font-sans text-xs text-muted-foreground">{sheetEntrySummary(item.source) || 'No set values'}{item.source.rir == null ? '' : ` · RIR ${item.source.rir}`}</span>
                            {item.status === 'protected' && <span className="mt-1.5 flex items-center gap-1 font-sans text-xs font-medium text-warning-foreground"><ShieldCheck className="size-3.5" /> Selecting this will replace the Liftline values.</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success-soft p-4 text-success"><CheckCircle2 className="size-5" /><p className="font-sans text-sm font-medium">Liftline already matches every completed Google Sheet row.</p></div>}

                {selectedImportKeys.some((key) => importPreview.items.some((item) => item.key === key && item.status === 'protected')) && <Alert className="border-warning/25 bg-warning-soft text-warning-foreground"><ShieldCheck /><AlertTitle>Replacement selected</AlertTitle><AlertDescription className="text-warning-foreground/80">One or more existing Liftline records will be replaced with the Google Sheet values when you confirm.</AlertDescription></Alert>}
              </div>
            )}
          </div>

          <DialogFooter className="m-0 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importingSheet}>Cancel</Button>
            <Button onClick={importSelectedSheetEntries} disabled={!importPreview || selectedImportKeys.length === 0 || importingSheet}>
              {importingSheet ? <Loader2 className="animate-spin" /> : <Download />}{importingSheet ? 'Importing…' : `Import selected${selectedImportKeys.length > 0 ? ` (${selectedImportKeys.length})` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
