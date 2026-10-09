'use client';

import { useId, useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/liftline-form-controls';
import { workoutSetFieldErrors } from '@/lib/workout-set-safeguards';

type WorkoutSetCardProps = {
  number: number;
  set: { weight: string; reps: string; rir: string; done: boolean };
  setLabel?: string;
  timed: boolean;
  showValidation?: boolean;
  onChange: (field: 'weight' | 'reps' | 'rir', value: string) => void;
  onStep: (field: 'weight' | 'reps', amount: number) => void;
  onToggleDone: () => void;
};

export function WorkoutSetCard({
  number,
  set,
  setLabel,
  timed,
  showValidation = false,
  onChange,
  onStep,
  onToggleDone,
}: WorkoutSetCardProps) {
  const [adjusting, setAdjusting] = useState(false);
  const [attemptedDone, setAttemptedDone] = useState(false);
  const [touched, setTouched] = useState<
    Partial<Record<'weight' | 'reps' | 'rir', boolean>>
  >({});
  const id = useId();
  const errors = workoutSetFieldErrors(set, {
    requireReps: showValidation || attemptedDone || Boolean(touched.reps),
    timed,
  });
  const firstError = Object.entries(errors)[0] as
    | ['weight' | 'reps' | 'rir', string]
    | undefined;
  const errorLabel = firstError
    ? `${firstError[0] === 'weight' ? 'Weight' : firstError[0] === 'reps' ? (timed ? 'Seconds' : 'Reps') : 'RIR'}: ${firstError[1]}`
    : '';
  const adjustmentId = `${id}-adjustments`;
  const inputClass =
    'h-12 w-full min-w-0 bg-background text-center font-sans text-lg font-semibold text-foreground tabular-nums placeholder:font-normal placeholder:text-placeholder md:text-lg';

  return (
    <div
      data-workout-set-row=""
      className="flex flex-col gap-2 border-b border-border/70 py-3 last:border-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="min-w-0 font-sans">
          <h3 className="text-base font-semibold">Set {number}</h3>
          {setLabel && (
            <span className="block text-sm text-muted-foreground">
              {setLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className="h-11 gap-1.5 px-2 font-sans text-sm text-muted-foreground"
            aria-label={`Adjust set ${number}`}
            aria-expanded={adjusting}
            aria-controls={adjustmentId}
            onClick={() => setAdjusting((open) => !open)}
          >
            Adjust
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label={`${set.done ? 'Done' : 'Mark done'}, set ${number}${set.done ? '. Activate to reopen' : ''}`}
            aria-pressed={set.done}
            onClick={() => {
              setAttemptedDone(true);
              onToggleDone();
            }}
            className={`h-11 gap-1.5 px-2.5 font-sans text-sm ${set.done ? 'border-success bg-success text-white hover:bg-success/90 hover:text-white' : 'bg-card'}`}
          >
            {set.done && <Check aria-hidden="true" />}
            {set.done ? 'Done' : 'Mark done'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)] items-start gap-2 sm:gap-3">
        <label
          htmlFor={`${id}-weight`}
          className="grid min-w-0 gap-1 font-sans text-sm font-medium text-muted-foreground"
        >
          <span className="block">Weight (kg)</span>
          <Input
            id={`${id}-weight`}
            aria-label={`Set ${number} Weight (kg)`}
            aria-invalid={Boolean(errors.weight)}
            aria-describedby={errors.weight ? `${id}-weight-error` : undefined}
            inputMode="decimal"
            type="number"
            min="0"
            step="any"
            value={set.weight}
            placeholder={timed ? 'Optional' : '0'}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => onChange('weight', event.target.value)}
            className={inputClass}
          />
          {errors.weight && (
            <span id={`${id}-weight-error`} className="sr-only">
              {errors.weight}
            </span>
          )}
        </label>
        <label
          htmlFor={`${id}-reps`}
          className="grid min-w-0 gap-1 font-sans text-sm font-medium text-muted-foreground"
        >
          <span className="block">{timed ? 'Seconds' : 'Reps'}</span>
          <Input
            id={`${id}-reps`}
            aria-label={`Set ${number} ${timed ? 'Seconds' : 'Reps'}`}
            aria-invalid={Boolean(errors.reps)}
            aria-describedby={errors.reps ? `${id}-reps-error` : undefined}
            inputMode="numeric"
            type="number"
            min="1"
            step="1"
            value={set.reps}
            placeholder="0"
            onFocus={(event) => event.currentTarget.select()}
            onBlur={() => setTouched((current) => ({ ...current, reps: true }))}
            onChange={(event) => onChange('reps', event.target.value)}
            className={inputClass}
          />
          {errors.reps && (
            <span id={`${id}-reps-error`} className="sr-only">
              {errors.reps}
            </span>
          )}
        </label>
        <label
          htmlFor={`set-${number}-rir`}
          className="grid min-w-0 gap-1 font-sans text-sm font-medium text-muted-foreground"
        >
          <span className="block">RIR</span>
          <Input
            id={`set-${number}-rir`}
            aria-label={`Set ${number} RIR (reps in reserve, optional)`}
            aria-invalid={Boolean(errors.rir)}
            aria-describedby={errors.rir ? `${id}-rir-error` : undefined}
            type="number"
            inputMode="numeric"
            min="0"
            max="10"
            step="1"
            value={set.rir}
            placeholder="–"
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => onChange('rir', event.target.value)}
            className={inputClass}
          />
          {errors.rir && (
            <span id={`${id}-rir-error`} className="sr-only">
              {errors.rir}
            </span>
          )}
        </label>
      </div>

      {firstError && (
        <p className="font-sans text-sm text-destructive" role="alert">
          {errorLabel}
        </p>
      )}

      <div id={adjustmentId} hidden={!adjusting}>
        {adjusting && (
          <div
            role="group"
            aria-label={`Set ${number} adjustments`}
            className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-2"
          >
            {(['weight', 'reps'] as const).map((field) => (
              <div key={field} className="min-w-0 space-y-1">
                <span className="block text-center font-sans text-sm text-muted-foreground">
                  {field === 'weight'
                    ? 'Weight · 2.5 kg'
                    : timed
                      ? 'Time · 1 sec'
                      : 'Reps · 1'}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {([-1, 1] as const).map((direction) => (
                    <Button
                      key={direction}
                      type="button"
                      variant="outline"
                      className="h-11 min-w-11"
                      disabled={
                        direction < 0 &&
                        Number(set[field] || 0) <= (field === 'weight' ? 0 : 1)
                      }
                      aria-label={`${direction < 0 ? 'Decrease' : 'Increase'} set ${number} ${field === 'weight' ? 'weight' : timed ? 'seconds' : 'repetitions'}`}
                      onClick={() =>
                        onStep(
                          field,
                          direction * (field === 'weight' ? 2.5 : 1),
                        )
                      }
                    >
                      {direction < 0 ? (
                        <Minus aria-hidden="true" />
                      ) : (
                        <Plus aria-hidden="true" />
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
