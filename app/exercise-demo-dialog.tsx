'use client';

import { useMemo, useState } from 'react';
import { CirclePlay, ImageOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { exerciseDemoFor, exerciseDemoSource } from '@/lib/exercise-demos';

export default function ExerciseDemoDialog({
  exerciseName,
  open,
  onOpenChange,
}: {
  exerciseName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [variantIndex, setVariantIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const exerciseDemo = useMemo(
    () => exerciseDemoFor(exerciseName),
    [exerciseName],
  );
  const exerciseDemoVariant = exerciseDemo
    ? exerciseDemo.variants[
        Math.min(variantIndex, exerciseDemo.variants.length - 1)
      ]
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setVariantIndex(0);
          setImageFailed(false);
        }
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="pr-8">
          <DialogTitle className="flex items-center gap-2 font-sans text-xl">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-primary">
              <CirclePlay className="size-5" />
            </span>
            {exerciseDemoVariant?.label ?? exerciseName}
          </DialogTitle>
          <DialogDescription className="font-sans">
            Animated movement guide for {exerciseName}
          </DialogDescription>
        </DialogHeader>

        {exerciseDemo && exerciseDemoVariant ? (
          <div className="space-y-4">
            {exerciseDemo.variants.length > 1 && (
              <fieldset className="flex gap-2 overflow-x-auto pb-1">
                <legend className="sr-only">Choose a movement</legend>
                {exerciseDemo.variants.map((variant, index) => (
                  <Button
                    key={variant.label}
                    type="button"
                    size="sm"
                    variant={variantIndex === index ? 'default' : 'outline'}
                    className="shrink-0 font-sans"
                    aria-pressed={variantIndex === index}
                    onClick={() => {
                      setVariantIndex(index);
                      setImageFailed(false);
                    }}
                  >
                    {variant.label}
                  </Button>
                ))}
              </fieldset>
            )}

            <div className="grid min-h-64 place-items-center overflow-hidden rounded-2xl border border-primary/15 bg-white shadow-inner">
              {imageFailed ? (
                <div className="px-6 py-12 text-center">
                  <ImageOff className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-3 font-sans font-semibold">
                    Movement guide unavailable
                  </p>
                  <p className="mt-1 font-sans text-sm text-muted-foreground">
                    Check your connection and try opening the guide again.
                  </p>
                </div>
              ) : (
                // oxlint-disable-next-line next/no-img-element -- The on-demand modal uses animated GIFs, which should not be transformed by an image optimizer.
                <img
                  key={exerciseDemoVariant.gif}
                  src={exerciseDemoVariant.gif}
                  alt={`${exerciseDemoVariant.label} animated exercise demonstration`}
                  className="aspect-square max-h-[42dvh] w-full object-contain"
                  loading="eager"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => setImageFailed(true)}
                />
              )}
            </div>

            {exerciseDemoVariant.note && (
              <p className="rounded-xl border border-warning/20 bg-warning-soft px-3 py-2 font-sans text-xs leading-relaxed text-warning-foreground">
                {exerciseDemoVariant.note}
              </p>
            )}

            <div className="rounded-2xl bg-accent/45 p-4">
              <p className="font-sans text-sm font-semibold">Form cues</p>
              <ul className="mt-2 space-y-2 pl-5 font-sans text-sm leading-relaxed text-muted-foreground marker:text-primary">
                {exerciseDemoVariant.cues.map((cue) => (
                  <li key={cue} className="list-disc pl-1">
                    {cue}
                  </li>
                ))}
              </ul>
            </div>

            <p className="font-sans text-xs leading-relaxed text-muted-foreground">
              Use this as a movement reference, not a substitute for in-person
              coaching. Animation from the{' '}
              <a
                href={exerciseDemoSource}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                open exercise library
              </a>
              .
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
            <ImageOff className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-sans font-semibold">
              No animation matched yet
            </p>
            <p className="mt-1 font-sans text-sm text-muted-foreground">
              This can happen for a custom or renamed exercise.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
