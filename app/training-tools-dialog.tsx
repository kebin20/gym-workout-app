'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  Activity,
  CalendarDays,
  Calculator,
  CheckCircle2,
  Dumbbell,
  Loader2,
  Scale,
  Upload,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import type { TrainingDay } from '@/lib/routine';

type TrainingTool = 'schedule' | 'readiness' | 'calculator' | 'metrics';

export type ProgramSchedule = {
  phase1StartDate: string;
  phase2StartDate: string;
};

type BodyMetric = {
  id?: number;
  date: string;
  weight: number | null;
  waist: number | null;
  bodyFat: number | null;
  leanMass: number | null;
  source: string;
  notes?: string | null;
};

type Props = {
  tool: TrainingTool;
  schedule: ProgramSchedule;
  activeWeek: number;
  activeDay: TrainingDay;
  currentWeight?: number | null;
  onScheduleChange: (schedule: ProgramSchedule) => void;
  onClose: () => void;
};

const toolCopy = {
  schedule: {
    title: 'Training schedule',
    description:
      'Adjust start dates without changing your saved workout history.',
    icon: CalendarDays,
  },
  readiness: {
    title: 'Readiness check',
    description: 'A quick recovery check before you decide how hard to train.',
    icon: Activity,
  },
  calculator: {
    title: 'Warm-up & plates',
    description:
      'Generate warm-up sets and calculate plates for today’s working weight.',
    icon: Calculator,
  },
  metrics: {
    title: 'Body metrics',
    description:
      'Keep weight and body-composition trends beside your training data.',
    icon: Scale,
  },
} as const;

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundTo(value: number, increment: number) {
  return Math.max(increment, Math.round(value / increment) * increment);
}

function plateBreakdown(totalWeight: number, barWeight: number) {
  const perSide = Math.max(0, (totalWeight - barWeight) / 2);
  const plates = [25, 20, 15, 10, 5, 2.5, 1.25];
  let remaining = perSide;
  const result: string[] = [];
  for (const plate of plates) {
    const count = Math.floor((remaining + 0.001) / plate);
    if (count > 0) {
      result.push(`${count} × ${plate}`);
      remaining -= count * plate;
    }
  }
  return {
    result: result.length ? result.join(' + ') : 'bar only',
    remainder: Math.max(0, remaining),
  };
}

function ScorePicker({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-xl border bg-muted/35 p-3">
      <div className="flex items-start justify-between gap-3">
        <span>
          <span className="block font-sans text-sm font-semibold">{label}</span>
          <span className="block font-sans text-xs text-muted-foreground">
            {hint}
          </span>
        </span>
        <span className="font-sans text-sm font-bold text-primary">
          {value}/5
        </span>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => onChange(score)}
            className={`h-9 rounded-lg border font-sans text-sm font-semibold transition ${value === score ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'}`}
          >
            {score}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TrainingToolsDialog({
  tool,
  schedule,
  activeWeek,
  activeDay,
  currentWeight,
  onScheduleChange,
  onClose,
}: Props) {
  const copy = toolCopy[tool];
  const ToolIcon = copy.icon;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [scheduleDraft, setScheduleDraft] = useState(schedule);
  const [scores, setScores] = useState({
    sleep: 3,
    energy: 3,
    soreness: 3,
    jointComfort: 4,
  });
  const [readinessAdvice, setReadinessAdvice] = useState('');
  const [workingWeight, setWorkingWeight] = useState(
    String(currentWeight || 60),
  );
  const [barWeight, setBarWeight] = useState('20');
  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [metricDraft, setMetricDraft] = useState({
    date: new Date().toISOString().slice(0, 10),
    weight: '',
    waist: '',
    bodyFat: '',
    leanMass: '',
    source: 'manual',
    notes: '',
  });

  useEffect(() => {
    if (tool !== 'metrics') return;
    let active = true;
    fetch('/api/body-metrics', { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as {
          metrics?: BodyMetric[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(data.error ?? 'Unable to load body metrics.');
        if (active) setMetrics(data.metrics ?? []);
      })
      .catch(
        (loadError) =>
          active &&
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load body metrics.',
          ),
      );
    return () => {
      active = false;
    };
  }, [tool]);

  const warmups = useMemo(() => {
    const weight = Number(workingWeight);
    if (!Number.isFinite(weight) || weight <= 0) return [];
    return [
      { label: 'Easy', weight: roundTo(weight * 0.4, 2.5), reps: 8 },
      { label: 'Build', weight: roundTo(weight * 0.6, 2.5), reps: 5 },
      { label: 'Prime', weight: roundTo(weight * 0.8, 2.5), reps: 3 },
    ];
  }, [workingWeight]);
  const plates = plateBreakdown(
    Number(workingWeight) || 0,
    Number(barWeight) || 0,
  );

  async function saveSchedule() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleDraft),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? 'Unable to save schedule.');
      onScheduleChange(scheduleDraft);
      setSuccess(
        'Programme dates updated. Workout records were left unchanged.',
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to save schedule.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveReadiness() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...scores, week: activeWeek, day: activeDay }),
      });
      const data = (await response.json()) as {
        check?: { recommendation: string };
        error?: string;
      };
      if (!response.ok || !data.check)
        throw new Error(data.error ?? 'Unable to save readiness check.');
      setReadinessAdvice(data.check.recommendation);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to save readiness check.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveMetrics(payload: BodyMetric | BodyMetric[]) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/body-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          Array.isArray(payload) ? { metrics: payload } : payload,
        ),
      });
      const data = (await response.json()) as {
        saved?: number;
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? 'Unable to save body metrics.');
      const refreshed = await fetch('/api/body-metrics', { cache: 'no-store' });
      const refreshedData = (await refreshed.json()) as {
        metrics?: BodyMetric[];
      };
      setMetrics(refreshedData.metrics ?? []);
      setSuccess(
        `${data.saved ?? 1} measurement${data.saved === 1 ? '' : 's'} saved.`,
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to save body metrics.',
      );
    } finally {
      setBusy(false);
    }
  }

  function saveMetricDraft() {
    void saveMetrics({
      date: metricDraft.date,
      weight: numberOrNull(metricDraft.weight),
      waist: numberOrNull(metricDraft.waist),
      bodyFat: numberOrNull(metricDraft.bodyFat),
      leanMass: numberOrNull(metricDraft.leanMass),
      source: metricDraft.source,
      notes: metricDraft.notes,
    });
  }

  function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then((text) => {
        const lines = text.trim().split(/\r?\n/).filter(Boolean);
        if (lines.length < 2)
          throw new Error('The CSV does not contain any measurement rows.');
        const headers = lines[0].split(',').map((value) =>
          value
            .trim()
            .toLowerCase()
            .replace(/[^a-z]/g, ''),
        );
        const indexOf = (...names: string[]) =>
          headers.findIndex((header) => names.includes(header));
        const dateIndex = indexOf('date', 'measurementdate');
        const weightIndex = indexOf('weight', 'weightkg');
        const bodyFatIndex = indexOf(
          'bodyfat',
          'bodyfatpercentage',
          'fatmasspercentage',
        );
        const leanMassIndex = indexOf('leanmass', 'leanmasskg', 'musclemass');
        const waistIndex = indexOf('waist', 'waistcm');
        if (
          dateIndex < 0 ||
          [weightIndex, bodyFatIndex, leanMassIndex, waistIndex].every(
            (index) => index < 0,
          )
        ) {
          throw new Error(
            'Use a CSV with a date plus weight, waist, body fat, or lean mass column.',
          );
        }
        const imported = lines.slice(1).map((line) => {
          const columns = line
            .split(',')
            .map((value) => value.trim().replace(/^"|"$/g, ''));
          const rawDate = columns[dateIndex];
          const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
            ? rawDate
            : new Date(rawDate).toISOString().slice(0, 10);
          return {
            date,
            weight:
              weightIndex >= 0 ? numberOrNull(columns[weightIndex]) : null,
            waist: waistIndex >= 0 ? numberOrNull(columns[waistIndex]) : null,
            bodyFat:
              bodyFatIndex >= 0 ? numberOrNull(columns[bodyFatIndex]) : null,
            leanMass:
              leanMassIndex >= 0 ? numberOrNull(columns[leanMassIndex]) : null,
            source: 'csv',
          } satisfies BodyMetric;
        });
        void saveMetrics(imported);
      })
      .catch((importError) =>
        setError(
          importError instanceof Error
            ? importError.message
            : 'Unable to read this CSV.',
        ),
      );
    event.target.value = '';
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[min(88dvh,760px)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-sans">
            <span className="grid size-9 place-items-center rounded-xl bg-accent text-primary">
              <ToolIcon className="size-5" />
            </span>
            {copy.title}
          </DialogTitle>
          <DialogDescription className="font-sans">
            {copy.description}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert className="border-destructive/30 bg-destructive/5 text-destructive">
            <AlertTitle>Unable to continue</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="border-success/25 bg-success-soft text-success">
            <CheckCircle2 />
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {tool === 'schedule' && (
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <label
              htmlFor="phase-1-start"
              className="space-y-1.5 font-sans text-sm font-medium"
            >
              Phase 1 starts
              <Input
                id="phase-1-start"
                type="date"
                value={scheduleDraft.phase1StartDate}
                onChange={(event) =>
                  setScheduleDraft((current) => ({
                    ...current,
                    phase1StartDate: event.target.value,
                  }))
                }
              />
            </label>
            <label
              htmlFor="phase-2-start"
              className="space-y-1.5 font-sans text-sm font-medium"
            >
              Phase 2 starts
              <Input
                id="phase-2-start"
                type="date"
                value={scheduleDraft.phase2StartDate}
                onChange={(event) =>
                  setScheduleDraft((current) => ({
                    ...current,
                    phase2StartDate: event.target.value,
                  }))
                }
              />
            </label>
            <p className="font-sans text-xs leading-relaxed text-muted-foreground sm:col-span-2">
              Week labels and planned dates update immediately. Existing
              sessions keep their recorded dates and history.
            </p>
          </div>
        )}

        {tool === 'readiness' && (
          <div className="space-y-3 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <ScorePicker
                label="Sleep"
                hint="1 poor · 5 excellent"
                value={scores.sleep}
                onChange={(sleep) =>
                  setScores((current) => ({ ...current, sleep }))
                }
              />
              <ScorePicker
                label="Energy"
                hint="1 depleted · 5 energised"
                value={scores.energy}
                onChange={(energy) =>
                  setScores((current) => ({ ...current, energy }))
                }
              />
              <ScorePicker
                label="Soreness"
                hint="1 fresh · 5 very sore"
                value={scores.soreness}
                onChange={(soreness) =>
                  setScores((current) => ({ ...current, soreness }))
                }
              />
              <ScorePicker
                label="Joint comfort"
                hint="1 painful · 5 comfortable"
                value={scores.jointComfort}
                onChange={(jointComfort) =>
                  setScores((current) => ({ ...current, jointComfort }))
                }
              />
            </div>
            {readinessAdvice && (
              <div className="rounded-xl border border-primary/20 bg-accent p-4">
                <p className="font-sans text-xs font-bold uppercase tracking-wide text-primary">
                  Today’s guidance
                </p>
                <p className="mt-1 font-sans text-sm leading-relaxed">
                  {readinessAdvice}
                </p>
              </div>
            )}
          </div>
        )}

        {tool === 'calculator' && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <label
                htmlFor="working-weight"
                className="space-y-1.5 font-sans text-sm font-medium"
              >
                Working weight (kg)
                <Input
                  id="working-weight"
                  inputMode="decimal"
                  value={workingWeight}
                  onChange={(event) => setWorkingWeight(event.target.value)}
                />
              </label>
              <label
                htmlFor="bar-weight"
                className="space-y-1.5 font-sans text-sm font-medium"
              >
                Bar weight (kg)
                <Input
                  id="bar-weight"
                  inputMode="decimal"
                  value={barWeight}
                  onChange={(event) => setBarWeight(event.target.value)}
                />
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {warmups.map((set) => (
                <div
                  key={set.label}
                  className="rounded-xl border bg-muted/35 p-3"
                >
                  <span className="font-sans text-xs font-bold uppercase text-muted-foreground">
                    {set.label}
                  </span>
                  <span className="mt-1 block font-sans text-lg font-bold">
                    {set.weight} kg × {set.reps}
                  </span>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-primary/20 bg-accent p-4">
              <p className="flex items-center gap-2 font-sans text-sm font-semibold">
                <Dumbbell className="size-4 text-primary" /> Plates per side
              </p>
              <p className="mt-1 font-sans text-lg font-bold">
                {plates.result} kg
              </p>
              {plates.remainder > 0.01 && (
                <p className="mt-1 font-sans text-xs text-muted-foreground">
                  Nearest available loading is{' '}
                  {Math.round(plates.remainder * 200) / 100} kg per side short.
                </p>
              )}
            </div>
            <p className="font-sans text-xs leading-relaxed text-muted-foreground">
              Warm-ups are practical estimates. Add an easier set when you feel
              stiff, and avoid tiring yourself before the working sets.
            </p>
          </div>
        )}

        {tool === 'metrics' && (
          <div className="space-y-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <label
                htmlFor="metric-date"
                className="space-y-1 font-sans text-xs font-semibold"
              >
                Date
                <Input
                  id="metric-date"
                  type="date"
                  value={metricDraft.date}
                  onChange={(event) =>
                    setMetricDraft((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                />
              </label>
              <label
                htmlFor="metric-source"
                className="space-y-1 font-sans text-xs font-semibold"
              >
                Source
                <select
                  id="metric-source"
                  className="h-9 w-full rounded-lg border bg-transparent px-3 font-sans text-sm"
                  value={metricDraft.source}
                  onChange={(event) =>
                    setMetricDraft((current) => ({
                      ...current,
                      source: event.target.value,
                    }))
                  }
                >
                  <option value="manual">Manual</option>
                  <option value="withings">Withings</option>
                  <option value="inbody">InBody</option>
                </select>
              </label>
              <label
                htmlFor="metric-weight"
                className="space-y-1 font-sans text-xs font-semibold"
              >
                Weight (kg)
                <Input
                  id="metric-weight"
                  inputMode="decimal"
                  value={metricDraft.weight}
                  onChange={(event) =>
                    setMetricDraft((current) => ({
                      ...current,
                      weight: event.target.value,
                    }))
                  }
                />
              </label>
              <label
                htmlFor="metric-waist"
                className="space-y-1 font-sans text-xs font-semibold"
              >
                Waist (cm)
                <Input
                  id="metric-waist"
                  inputMode="decimal"
                  value={metricDraft.waist}
                  onChange={(event) =>
                    setMetricDraft((current) => ({
                      ...current,
                      waist: event.target.value,
                    }))
                  }
                />
              </label>
              <label
                htmlFor="metric-body-fat"
                className="space-y-1 font-sans text-xs font-semibold"
              >
                Body fat (%)
                <Input
                  id="metric-body-fat"
                  inputMode="decimal"
                  value={metricDraft.bodyFat}
                  onChange={(event) =>
                    setMetricDraft((current) => ({
                      ...current,
                      bodyFat: event.target.value,
                    }))
                  }
                />
              </label>
              <label
                htmlFor="metric-lean-mass"
                className="space-y-1 font-sans text-xs font-semibold"
              >
                Lean mass (kg)
                <Input
                  id="metric-lean-mass"
                  inputMode="decimal"
                  value={metricDraft.leanMass}
                  onChange={(event) =>
                    setMetricDraft((current) => ({
                      ...current,
                      leanMass: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <Textarea
              aria-label="Measurement notes"
              placeholder="Optional notes"
              value={metricDraft.notes}
              onChange={(event) =>
                setMetricDraft((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveMetricDraft} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Scale />} Save
                measurement
              </Button>
              <label
                htmlFor="metric-csv"
                className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border bg-background px-4 font-sans text-sm font-medium shadow-xs transition-colors hover:bg-muted"
              >
                <Upload className="size-4" /> Import CSV
                <input
                  id="metric-csv"
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={importCsv}
                />
              </label>
            </div>
            <p className="font-sans text-xs leading-relaxed text-muted-foreground">
              Withings and InBody CSV exports can be imported here. Direct
              account connections can be added later when their API access is
              authorised.
            </p>
            {metrics.length > 0 && (
              <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border p-2">
                {metrics.slice(0, 12).map((metric, index) => (
                  <div
                    key={`${metric.date}-${metric.source}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-muted/45 px-3 py-2"
                  >
                    <span>
                      <span className="block font-sans text-sm font-semibold">
                        {formatDate(metric.date)}
                      </span>
                      <span className="block font-sans text-xs capitalize text-muted-foreground">
                        {metric.source}
                      </span>
                    </span>
                    <span className="text-right font-sans text-sm">
                      {metric.weight != null && `${metric.weight} kg`}
                      {metric.bodyFat != null && (
                        <span className="block text-xs text-muted-foreground">
                          {metric.bodyFat}% body fat
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {tool === 'schedule' && (
            <Button onClick={saveSchedule} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Save dates
            </Button>
          )}
          {tool === 'readiness' && (
            <Button onClick={saveReadiness} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Get guidance
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
