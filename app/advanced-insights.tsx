'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { RoutineExercise } from '@/lib/routine';
import { workoutMetrics } from '@/lib/workout-metrics';
import type { WorkoutEntry } from '@/lib/workout-types';

type Props = {
  entries: WorkoutEntry[];
  routine: RoutineExercise[];
};

export default function AdvancedInsights({ entries, routine }: Props) {
  const completed = entries.filter((entry) => entry.completed);
  const groups = new Map<string, WorkoutEntry[]>();
  completed.forEach((entry) => {
    const key = `${entry.day}|${entry.exerciseOrder}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  });

  const trends = [...groups.values()]
    .map((exerciseEntries) => {
      const sorted = exerciseEntries.sort(
        (left, right) => left.week - right.week,
      );
      const first = workoutMetrics(sorted[0]);
      const latest = workoutMetrics(sorted.at(-1)!);
      const change =
        first.estimatedMax > 0
          ? ((latest.estimatedMax - first.estimatedMax) / first.estimatedMax) *
            100
          : 0;
      return {
        name: sorted.at(-1)!.exercise,
        change,
        latest,
        latestEntry: sorted.at(-1)!,
        sessions: sorted.length,
      };
    })
    .sort((left, right) => right.change - left.change);

  const improving = trends.filter(
    (trend) => trend.sessions > 1 && trend.change > 1,
  );
  const needsAttention = trends.filter(
    (trend) => trend.sessions > 1 && trend.change < -5,
  );
  const muscleSets = new Map<string, number>();
  completed.forEach((entry) => {
    const exercise = routine.find(
      (item) => item.day === entry.day && item.order === entry.exerciseOrder,
    );
    const sets = entry.setCount ?? 3;
    (exercise?.muscles ?? 'Custom')
      .split('/')
      .map((muscle) => muscle.trim())
      .filter(Boolean)
      .forEach((muscle) =>
        muscleSets.set(muscle, (muscleSets.get(muscle) ?? 0) + sets),
      );
  });
  const topMuscles = [...muscleSets.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4);
  const lowRirCount = trends.filter(
    (trend) => trend.latestEntry.rir != null && trend.latestEntry.rir <= 1,
  ).length;

  if (completed.length === 0) {
    return (
      <p className="rounded-xl bg-muted/45 p-5 text-center font-sans text-sm text-muted-foreground">
        Complete a workout to unlock programme insights.
      </p>
    );
  }

  return (
    <div className="grid gap-3 py-1 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border bg-card p-4">
        <p className="flex items-center gap-2 font-sans text-sm font-semibold">
          <TrendingUp className="size-4 text-primary" /> Moving forward
        </p>
        <p className="mt-2 font-sans text-2xl font-bold">{improving.length}</p>
        <p className="font-sans text-xs text-muted-foreground">
          exercises with a stronger estimated max
        </p>
        {improving[0] && (
          <Badge className="mt-3 bg-success-soft font-sans text-success">
            Best: {improving[0].name} {Math.round(improving[0].change)}%
          </Badge>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="flex items-center gap-2 font-sans text-sm font-semibold">
          <Target className="size-4 text-primary" /> Training focus
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {topMuscles.map(([muscle, sets]) => (
            <Badge key={muscle} variant="outline" className="font-sans">
              {muscle} · {sets} sets
            </Badge>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="flex items-center gap-2 font-sans text-sm font-semibold">
          <Sparkles className="size-4 text-primary" /> Effort signal
        </p>
        <p className="mt-2 font-sans text-2xl font-bold">{lowRirCount}</p>
        <p className="font-sans text-xs text-muted-foreground">
          latest exercises at RIR 0–1
        </p>
        <p className="mt-2 font-sans text-xs text-muted-foreground">
          Use hard sets selectively so technique and recovery stay reliable.
        </p>
      </div>

      <div
        className={`rounded-xl border p-4 ${needsAttention.length ? 'border-warning/30 bg-warning-soft' : 'bg-card'}`}
      >
        <p className="flex items-center gap-2 font-sans text-sm font-semibold">
          {needsAttention.length ? (
            <AlertTriangle className="size-4 text-warning-foreground" />
          ) : (
            <CheckCircle2 className="size-4 text-success" />
          )}{' '}
          Recovery watch
        </p>
        <p className="mt-2 font-sans text-2xl font-bold">
          {needsAttention.length}
        </p>
        <p className="font-sans text-xs text-muted-foreground">
          exercises down more than 5% from their first estimate
        </p>
        {needsAttention[0] && (
          <p className="mt-2 font-sans text-xs font-medium">
            Review {needsAttention[0].name}: sleep, setup, range of motion, and
            load.
          </p>
        )}
      </div>
    </div>
  );
}
