'use client';

import { Dumbbell, ShieldCheck, Sparkles } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function TrainingGuideView({
  activePhase,
}: {
  activePhase: 1 | 2;
}) {
  return (
    <>
      {activePhase === 2 && (
        <section>
          <div className="mb-6">
            <p className="font-sans text-sm font-semibold text-primary">
              PHASE 2 GUIDE
            </p>
            <h1 className="font-sans text-3xl font-bold tracking-tight">
              Specialize without losing balance.
            </h1>
            <p className="mt-1 max-w-3xl font-sans text-muted-foreground">
              Keep the proven three-day habit, add targeted volume, and build
              free-weight skill gradually while every major muscle still gets
              trained at least twice each week.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="font-sans">How to progress</CardTitle>
                <CardDescription className="font-sans">
                  Double progression · most compounds at 1–3 RIR
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  [
                    'Build reps first',
                    'Keep the same load while repetitions improve inside the prescribed range.',
                  ],
                  [
                    'Earn the load increase',
                    'Add the smallest practical increment when all sets reach the top with stable technique and target RIR.',
                  ],
                  [
                    'Never require failure',
                    'A set ends when technique changes significantly, even if another rough repetition is possible.',
                  ],
                  [
                    'Use appropriate jumps',
                    'Upper-body compounds often rise by 1–2.5 kg total; lower-body compounds by 2.5–5 kg when equipment allows.',
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
              <Card className="bg-accent/35 ring-primary/15">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-sans">
                    <Dumbbell className="size-5 text-primary" /> Free-weight
                    transition
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 font-sans text-sm leading-relaxed text-muted-foreground">
                  <p>
                    Weeks 1–2: use about one major free-weight movement per
                    session with conservative loads and 2–4 ramp sets.
                  </p>
                  <p>
                    Weeks 3–4: move toward two major free-weight movements when
                    technique and recovery are good. Keep machines and cables
                    for controlled accessory work.
                  </p>
                  <p className="font-medium text-foreground">
                    Machine, barbell and dumbbell loads are not directly
                    interchangeable.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-warning-soft ring-warning/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-sans text-warning-foreground">
                    <ShieldCheck className="size-5" /> Recovery guardrails
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 font-sans text-sm leading-relaxed text-warning-foreground/85">
                  <p>
                    Separate lifting days when practical. If performance falls
                    across two sessions alongside poor sleep, soreness or joint
                    discomfort, reduce accessory work first.
                  </p>
                  <p>
                    If fatigue persists, deload by cutting working sets about
                    30–50%, using moderate loads, and finishing around 3–4 RIR.
                  </p>
                  <p>
                    Keep incline cardio conversational for 20–40 minutes and
                    avoid hard hill work before a lower-body-heavy day.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      )}

      {activePhase === 1 && (
        <section>
          <div className="mb-6">
            <p className="font-sans text-sm font-semibold text-primary">
              START HERE
            </p>
            <h1 className="font-sans text-3xl font-bold tracking-tight">
              Train simply. Progress steadily.
            </h1>
            <p className="mt-1 font-sans text-muted-foreground">
              The guidance from your spreadsheet, organized for quick reference
              at the gym.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="font-sans">How to use Liftline</CardTitle>
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
                    <p key={item} className="rounded-lg bg-white/55 px-3 py-2">
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
                    Consistent, adequate sleep matters more once you lift three
                    times weekly.
                  </p>
                  <p>
                    <strong className="text-foreground">Fat loss:</strong> Keep
                    the deficit modest. Strength stable or rising while waist
                    and weight trend down is excellent.
                  </p>
                  <p>
                    <strong className="text-foreground">Pain rule:</strong> Stop
                    and reassess sharp joint pain, dizziness, chest pain, or
                    unusual symptoms.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
