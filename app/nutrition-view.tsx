'use client';

import type { ReactNode } from 'react';
import {
  Apple,
  Check,
  CheckCircle2,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

function NutritionList({
  items,
  ordered = false,
}: {
  items: string[];
  ordered?: boolean;
}) {
  const List = ordered ? 'ol' : 'ul';
  return (
    <List
      className={`space-y-2 pl-5 font-sans text-sm leading-relaxed text-muted-foreground ${ordered ? 'list-decimal' : 'list-disc'} marker:font-semibold marker:text-primary`}
    >
      {items.map((item) => (
        <li key={item} className="pl-1">
          {item}
        </li>
      ))}
    </List>
  );
}

function NutritionGuideCard({
  number,
  title,
  children,
  defaultOpen = false,
}: {
  number: string;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Card id={`nutrition-${number}`} className="scroll-mt-24 overflow-hidden">
      <details open={defaultOpen} className="group">
        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 font-sans sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-success-soft text-sm font-bold text-success">
            {number}
          </span>
          <span className="flex-1 font-semibold">{title}</span>
          <ChevronRight className="size-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <CardContent className="space-y-4 border-t border-border/70 pt-4 font-sans">
          {children}
        </CardContent>
      </details>
    </Card>
  );
}

export default function NutritionView() {
  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-3xl bg-[linear-gradient(145deg,#0f8f63_0%,#17a673_50%,#3171f5_140%)] p-5 text-white shadow-lg shadow-success/10 sm:p-7">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <Apple className="size-6" />
          </span>
          <div>
            <p className="font-sans text-sm font-semibold text-white/80">
              NUTRITION
            </p>
            <h1 className="mt-1 font-sans text-3xl font-bold tracking-tight">
              Eat to get leaner and stronger.
            </h1>
            <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-white/85 sm:text-base">
              A practical two-meal guide for gradual fat loss, muscle retention
              or gain, and steady strength progress.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-sans">Daily targets</CardTitle>
          <CardDescription className="font-sans">
            Treat these as working ranges. Weekly consistency matters more than
            one meal or one day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['1,900–2,200', 'kcal / day'],
              ['110–125 g', 'protein / day'],
              ['25–30 g', 'fibre / day'],
              ['2–2.5 L', 'water / day'],
            ].map(([value, label]) => (
              <div
                key={label}
                className="rounded-2xl border border-success/15 bg-success-soft p-4"
              >
                <p className="font-sans text-xl font-bold text-success sm:text-2xl">
                  {value}
                </p>
                <p className="mt-1 font-sans text-xs font-medium text-success/80">
                  {label}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 font-sans text-sm leading-relaxed text-muted-foreground">
            Estimated maintenance is roughly 2,300–2,500 kcal. Aim for about
            50–70 g fat, then use the remaining calories for carbohydrates—often
            around 180–250 g, with more flexibility on training and hiking days.
            Drink more on hot, sweaty or especially active days.
          </p>
        </CardContent>
      </Card>

      <Card className="border-primary/15 bg-accent/35">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-sans">
            <CheckCircle2 className="size-5 text-primary" /> Quick rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              'Alternate toast and granola; do not normally stack both.',
              'Average 1,900–2,200 kcal instead of chasing the lowest number.',
              'Aim for 110–125 g protein every day, including rest days.',
              'Make the second main meal protein-centred.',
              'Use shakes to fill gaps, not replace most whole foods.',
              'Keep vegetables, fruit and fibre in the diet.',
              'Restaurant meals, kebabs, burgers and small desserts can fit.',
              'Do not punish higher-calorie days with fasting or excessive cardio.',
              'Judge progress over 4–8 weeks, not day to day.',
            ].map((rule) => (
              <div
                key={rule}
                className="flex gap-2 rounded-xl bg-card/80 p-3 font-sans text-sm leading-relaxed"
              >
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
                <span>{rule}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <NutritionGuideCard number="2" title="Breakfast template" defaultOpen>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Keep this normal base: 130 ml soy milk, one banana, 200 ml Kagome
            vegetable/fruit juice, 80 g full-milk yoghurt with 5–8 g honey, and
            a 250 ml homemade whole-milk latte.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [
                'Toast',
                '2 slices rye or wheatmeal',
                '790–800 kcal · 29–30 g protein',
              ],
              [
                'Granola',
                "50 g Kellogg's granola",
                '690–700 kcal · 21–22 g protein',
              ],
              ['Both', 'Toast + granola', '~1,000 kcal · 33–34 g protein'],
            ].map(([name, choice, total]) => (
              <div
                key={name}
                className="rounded-xl border border-border/70 p-3"
              >
                <p className="font-semibold">{name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{choice}</p>
                <p className="mt-2 text-xs font-medium text-primary">{total}</p>
              </div>
            ))}
          </div>
          <p className="rounded-xl bg-warning-soft p-3 text-sm leading-relaxed text-warning-foreground">
            The two toast slices contribute about 11.6 g protein and 8.2 g
            fibre. Both toast and granola are fine occasionally, but leave less
            room later. Count margarine, marmalade and other spreads separately.
          </p>
        </NutritionGuideCard>

        <NutritionGuideCard number="3" title="Two-meal structure" defaultOpen>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Two main meals work well if they suit your hunger pattern. You do
            not need a mandatory dinner when the two meals and a protein top-up
            meet your needs.
          </p>
          <NutritionList
            items={[
              'Breakfast: about 700–800 kcal and 20–30 g protein.',
              'Main meal: about 700–900 kcal and 40–60 g protein.',
              'Protein top-up: shake, yoghurt, eggs, salad chicken or similar as needed.',
              'Optional snack: fruit, yoghurt, oats or a small dessert if calories and hunger allow.',
            ]}
          />
        </NutritionGuideCard>

        <NutritionGuideCard number="4" title="Protein guide">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Keep protein at 110–125 g on training and rest days because repair
            and adaptation continue between workouts.
          </p>
          <NutritionList
            items={[
              'Chicken breast or salad chicken; eggs; fish and sashimi; lean beef or pork.',
              'Tofu, natto, soy milk and yoghurt.',
              'Protein powder or SAVAS drinks when food alone leaves a gap.',
              'A shake with 20–30 g protein is usually enough; one daily suits most days.',
              'A second shake is fine on protein-light days, but keep whole foods as the base.',
              'Timing is flexible. Total daily protein matters more than a narrow post-training window.',
            ]}
          />
        </NutritionGuideCard>

        <NutritionGuideCard number="5" title="Main meals & restaurants">
          <NutritionList
            ordered
            items={[
              'Start with a clear protein source.',
              'Add vegetables or salad.',
              'Choose a sensible carbohydrate portion.',
              'Fit sauces and fried extras to hunger and the day’s calorie budget.',
            ]}
          />
          <p className="text-sm font-semibold">Easy choices</p>
          <NutritionList
            items={[
              'Chicken or kebab rice bowl with a generous meat portion and moderate sauce.',
              'Chicken breast with rice and spinach or vegetables.',
              'Grilled fish with rice and vegetables, or sashimi with rice and tofu.',
              'Saizeriya chicken steak with spinach, plus bread or rice according to hunger.',
              'Salad chicken, bagged salad and eggs for a very light option.',
            ]}
          />
          <p className="rounded-xl bg-accent/50 p-3 text-sm leading-relaxed text-muted-foreground">
            A kebab rice bowl is roughly 650–850 kcal and 35–45 g protein,
            depending on meat, rice and sauce. A 900–1,100 kcal restaurant meal
            is not “bad”; keep the rest of the day lighter instead of forcing
            another full meal.
          </p>
        </NutritionGuideCard>

        <NutritionGuideCard number="6" title="Snacks, desserts & sauces">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Snacks and dessert do not need to be banned. Flexible options
            include fruit, yoghurt, oats with yoghurt and a little honey, a
            protein bar or drink, a small ice cream, or boiled eggs.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Treats fit when portions are controlled. Prefer a flexible or
            maintenance-calorie day to an unrestricted “cheat day.” Sauces do
            not directly cause fat gain, but can be calorie-dense—use enough for
            flavour without needing to remove them completely.
          </p>
        </NutritionGuideCard>

        <NutritionGuideCard number="7" title="Training vs rest days">
          <NutritionList
            items={[
              'Keep protein roughly the same every day.',
              'Calories can be slightly higher on hard training, hiking or very active days when hunger rises.',
              'Carbohydrates are useful around training and do not need to be avoided.',
              'Do not slash rest-day calories; recovery still needs energy and protein.',
            ]}
          />
        </NutritionGuideCard>

        <NutritionGuideCard number="8" title="Progress targets">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Aim for slow fat loss while strength stays stable or improves. Use a
            seven-day weight average and compare four-week trends, rather than
            judging one weigh-in.
          </p>
          <NutritionList
            items={[
              'Average body weight falls slowly—about 0.2–0.4 kg per week at most.',
              'Waist measurement trends down while gym reps and loads trend up.',
              'InBody or body-fat estimates trend down over months, not days.',
              'Energy, sleep and recovery remain good.',
            ]}
          />
          <div className="rounded-xl bg-warning-soft p-3 text-sm leading-relaxed text-warning-foreground">
            If weight and waist have not moved after 4–6 consistent weeks,
            reduce intake by roughly 100–200 kcal or add a little easy
            activity—avoid a large cut. If strength, recovery or sleep worsens,
            or hunger becomes extreme, increase calories slightly and reassess.
          </div>
        </NutritionGuideCard>

        <NutritionGuideCard number="9" title="Example: toast day">
          <NutritionList
            items={[
              'Fixed breakfast base + 2 slices bread: 790–800 kcal and 29–30 g protein.',
              'Chicken or kebab rice bowl: 700–850 kcal and 35–45 g protein.',
              'Protein shake with soy milk: 25–30 g protein.',
              'Small yoghurt, eggs or fruit if needed.',
              'Typical total: 1,900–2,200 kcal and about 105–125+ g protein, depending on portions.',
            ]}
          />
        </NutritionGuideCard>

        <NutritionGuideCard number="10" title="Example: granola day">
          <NutritionList
            items={[
              'Fixed breakfast base + 50 g granola: 690–700 kcal and 21–22 g protein.',
              'Protein-focused restaurant or home meal: 750–950 kcal and 40–60 g protein.',
              'Protein shake: 20–30 g protein.',
              'Yoghurt, eggs or salad chicken if protein is still short.',
              'Typical total: 1,850–2,150 kcal, depending on the main meal and snacks.',
            ]}
          />
        </NutritionGuideCard>
      </div>

      <Card className="border-success/20 bg-success-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-sans text-success">
            <Sparkles className="size-5" /> The core strategy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 font-sans text-sm leading-relaxed text-success/90">
          <p>
            Three resistance-training days each week, normal walking or cardio,
            a moderate calorie deficit and consistent protein. The goal is to
            become leaner and stronger—not simply make the scale fall as quickly
            as possible.
          </p>
          <p className="border-t border-success/15 pt-3 text-xs">
            Calorie and protein figures are practical estimates based on the
            product labels and portions supplied. Restaurant and homemade
            portions vary, so use ranges rather than treating them as laboratory
            measurements.
          </p>
        </CardContent>
      </Card>

      <p className="px-1 text-center font-sans text-xs text-muted-foreground">
        Adapted from Kevin’s Fat Loss + Muscle Gain Dietary Guide.
      </p>
    </section>
  );
}
