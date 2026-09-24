'use client';

import { ChevronRight, Settings2 } from 'lucide-react';

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
  days,
  phase2Emphasis,
  targetLabel,
  type TrainingDay,
} from '@/lib/routine';
import { planForSession } from '@/lib/session-plan';
import type { SessionExercise } from '@/lib/workout-types';

type PlanViewProps = {
  activePhase: 1 | 2;
  activeDisplayWeek: number;
  activeWeek: number;
  sessionExercises: SessionExercise[];
  onChooseDay: (day: TrainingDay) => void;
  onEditDay: (day: TrainingDay) => void;
};

export default function PlanView({
  activePhase,
  activeDisplayWeek,
  activeWeek,
  sessionExercises,
  onChooseDay,
  onEditDay,
}: PlanViewProps) {
  return (
    <section>
      <div className="beta-plan-intro mb-6">
        <div className="beta-plan-intro-copy">
          <p className="font-sans text-sm font-semibold text-primary">
            PHASE {activePhase} ROUTINE
          </p>
          <h1 className="font-sans text-2xl font-bold tracking-tight sm:text-3xl">
            {activePhase === 1
              ? 'Three balanced full-body days.'
              : 'Specialized full-body progression.'}
          </h1>
          <p className="mt-1 max-w-xl font-sans text-sm text-muted-foreground sm:text-base">
            Tap any day to start logging it for week {activeDisplayWeek}.
          </p>
        </div>
        <div className="beta-plan-art" aria-hidden="true">
          <img
            src="/illustrations/reverse-lunge.webp"
            alt=""
            width={512}
            height={768}
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {days.map((day) => {
          const sessionPlan = planForSession(sessionExercises, activeWeek, day);
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
                  {sessionPlan.filter((item) => !item.skipped).length} active
                  exercises
                </CardTitle>
                <CardDescription className="font-sans">
                  {activePhase === 2 && (
                    <span className="mb-1 block font-semibold text-foreground">
                      {phase2Emphasis[day]}
                    </span>
                  )}
                  Week {activeDisplayWeek} · changes apply only to this session
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
                  onClick={() => onChooseDay(day)}
                >
                  Start Day {day}
                  <ChevronRight />
                </Button>
                <Button
                  variant="outline"
                  className="h-10 w-full font-sans"
                  onClick={() => onEditDay(day)}
                >
                  <Settings2 /> Edit Week {activeDisplayWeek}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
