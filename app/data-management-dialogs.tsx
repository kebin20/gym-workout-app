'use client';

import type { ChangeEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  ShieldCheck,
  Upload,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { WorkoutEntry } from '@/lib/workout-types';

type BackupSummary = {
  workoutRecords: number;
  newWorkoutRecords: number;
  replacedWorkoutRecords: number;
  sessionChanges: number;
  newSessionChanges: number;
  bodyMeasurements?: number;
  readinessChecks?: number;
  holidayRecords?: number;
};

type SheetImportPreview = {
  ok: boolean;
  items: {
    key: string;
    status: 'new' | 'unchanged' | 'protected';
    source: WorkoutEntry;
    liftlineUpdatedAt: string | null;
    sheetCompletedAt: string | null;
  }[];
  summary: { new: number; unchanged: number; protected: number };
  message?: string;
};

function sheetEntrySummary(entry: WorkoutEntry) {
  return [1, 2, 3, 4, 5]
    .map((setNumber) => ({
      setNumber,
      weight: entry[`set${setNumber}Weight` as keyof WorkoutEntry] as
        | number
        | null,
      reps: entry[`set${setNumber}Reps` as keyof WorkoutEntry] as number | null,
    }))
    .filter((set) => set.reps != null)
    .map((set) =>
      set.weight == null
        ? `Set ${set.setNumber}: ${set.reps} reps`
        : `Set ${set.setNumber}: ${set.weight} kg × ${set.reps}`,
    )
    .join(' · ');
}

export default function DataManagementDialogs({
  backup,
  sheetImport,
}: {
  backup: {
    open: boolean;
    busy: boolean;
    fileName: string;
    summary: BackupSummary | null;
    onOpenChange: (open: boolean) => void;
    onPreviewFile: (event: ChangeEvent<HTMLInputElement>) => void;
    onRestore: () => void;
  };
  sheetImport: {
    open: boolean;
    loading: boolean;
    importing: boolean;
    preview: SheetImportPreview | null;
    selectedKeys: string[];
    error: string;
    onOpenChange: (open: boolean) => void;
    onToggleItem: (key: string, selected: boolean) => void;
    onImportSelected: () => void;
  };
}) {
  return (
    <>
      {backup.open && (
        <Dialog
          open={backup.open}
          onOpenChange={(open) => {
            if (!backup.busy) backup.onOpenChange(open);
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-sans">
                <Upload className="size-5 text-primary" /> Restore Liftline
                backup
              </DialogTitle>
              <DialogDescription className="font-sans">
                Choose a Liftline JSON backup. You will see exactly how many
                records it contains before anything changes.
              </DialogDescription>
            </DialogHeader>
            <label className="grid cursor-pointer place-items-center rounded-xl border border-dashed border-primary/35 bg-accent/25 px-5 py-8 text-center">
              {backup.busy ? (
                <Loader2 className="size-6 animate-spin text-primary" />
              ) : (
                <Upload className="size-6 text-primary" />
              )}
              <span className="mt-2 font-sans text-sm font-semibold">
                {backup.fileName || 'Choose backup file'}
              </span>
              <span className="mt-1 font-sans text-xs text-muted-foreground">
                JSON files exported by Liftline
              </span>
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={backup.onPreviewFile}
                disabled={backup.busy}
              />
            </label>
            {backup.summary && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-success-soft p-3">
                  <p className="font-sans text-xl font-bold text-success">
                    {backup.summary.newWorkoutRecords}
                  </p>
                  <p className="font-sans text-xs text-success/80">
                    New records
                  </p>
                </div>
                <div className="rounded-xl bg-warning-soft p-3">
                  <p className="font-sans text-xl font-bold text-warning-foreground">
                    {backup.summary.replacedWorkoutRecords}
                  </p>
                  <p className="font-sans text-xs text-warning-foreground/80">
                    Records replaced
                  </p>
                </div>
                <div className="col-span-2 rounded-xl bg-secondary p-3">
                  <p className="font-sans text-sm font-semibold">
                    {backup.summary.sessionChanges} session customizations
                    {(backup.summary.bodyMeasurements ?? 0) > 0 &&
                      ` · ${backup.summary.bodyMeasurements} body measurements`}
                    {(backup.summary.holidayRecords ?? 0) > 0 &&
                      ` · ${backup.summary.holidayRecords} Holiday records`}
                    {(backup.summary.readinessChecks ?? 0) > 0 &&
                      ` · ${backup.summary.readinessChecks} readiness checks`}
                  </p>
                  <p className="font-sans text-xs text-muted-foreground">
                    Records not contained in the backup will be kept.
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => backup.onOpenChange(false)}
                disabled={backup.busy}
              >
                Cancel
              </Button>
              <Button
                onClick={backup.onRestore}
                disabled={!backup.summary || backup.busy}
              >
                {backup.busy ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Upload />
                )}{' '}
                Restore backup
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {sheetImport.open && (
        <Dialog
          open={sheetImport.open}
          onOpenChange={(open) => {
            if (!sheetImport.importing) sheetImport.onOpenChange(open);
          }}
        >
          <DialogContent className="h-[calc(100dvh-1.5rem)] max-h-[760px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0 sm:max-w-2xl">
            <DialogHeader className="px-5 pt-5">
              <DialogTitle className="font-sans text-lg font-semibold">
                Preview Google Sheet import
              </DialogTitle>
              <DialogDescription className="font-sans">
                Nothing changes until you confirm. New entries are selected;
                existing Liftline records remain protected unless you select
                them.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 overflow-y-auto px-5 pb-2">
              {sheetImport.loading && (
                <div className="grid min-h-52 place-items-center text-muted-foreground">
                  <div className="flex items-center gap-2 font-sans">
                    <Loader2 className="size-5 animate-spin" /> Reading Workout
                    Log…
                  </div>
                </div>
              )}
              {sheetImport.error && (
                <Alert variant="destructive" className="my-3">
                  <AlertCircle />
                  <AlertTitle>Import preview unavailable</AlertTitle>
                  <AlertDescription>{sheetImport.error}</AlertDescription>
                </Alert>
              )}

              {sheetImport.preview && !sheetImport.loading && (
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-success-soft p-3">
                      <p className="font-sans text-xl font-bold text-success">
                        {sheetImport.preview.summary.new}
                      </p>
                      <p className="font-sans text-xs text-success/80">New</p>
                    </div>
                    <div className="rounded-xl bg-secondary p-3">
                      <p className="font-sans text-xl font-bold">
                        {sheetImport.preview.summary.unchanged}
                      </p>
                      <p className="font-sans text-xs text-muted-foreground">
                        Already matches
                      </p>
                    </div>
                    <div className="rounded-xl bg-warning-soft p-3">
                      <p className="font-sans text-xl font-bold text-warning-foreground">
                        {sheetImport.preview.summary.protected}
                      </p>
                      <p className="font-sans text-xs text-warning-foreground/80">
                        Protected
                      </p>
                    </div>
                  </div>

                  {sheetImport.preview.items.some(
                    (item) => item.status !== 'unchanged',
                  ) ? (
                    <div className="space-y-2">
                      {sheetImport.preview.items
                        .filter((item) => item.status !== 'unchanged')
                        .map((item) => {
                          const selected = sheetImport.selectedKeys.includes(
                            item.key,
                          );
                          return (
                            <label
                              key={item.key}
                              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${selected ? 'border-primary/35 bg-accent/35' : 'border-border/80 bg-card'}`}
                            >
                              <Checkbox
                                checked={selected}
                                onCheckedChange={(checked) =>
                                  sheetImport.onToggleItem(
                                    item.key,
                                    checked === true,
                                  )
                                }
                                aria-label={`Import ${item.source.exercise}`}
                                className="mt-0.5"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="font-sans text-sm font-semibold">
                                    Week {item.source.week} · Day{' '}
                                    {item.source.day} · {item.source.exercise}
                                  </span>
                                  <Badge
                                    className={`font-sans text-[10px] ${item.status === 'new' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning-foreground'}`}
                                  >
                                    {item.status === 'new'
                                      ? 'New'
                                      : 'Existing record'}
                                  </Badge>
                                </span>
                                <span className="mt-1 block font-sans text-xs text-muted-foreground">
                                  {sheetEntrySummary(item.source) ||
                                    'No set values'}
                                  {item.source.rir == null
                                    ? ''
                                    : ` · RIR ${item.source.rir}`}
                                </span>
                                {item.status === 'protected' && (
                                  <span className="mt-1.5 flex items-center gap-1 font-sans text-xs font-medium text-warning-foreground">
                                    <ShieldCheck className="size-3.5" />{' '}
                                    Selecting this will replace the Liftline
                                    values.
                                  </span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success-soft p-4 text-success">
                      <CheckCircle2 className="size-5" />
                      <p className="font-sans text-sm font-medium">
                        Liftline already matches every completed Google Sheet
                        row.
                      </p>
                    </div>
                  )}

                  {sheetImport.selectedKeys.some((key) =>
                    sheetImport.preview?.items.some(
                      (item) => item.key === key && item.status === 'protected',
                    ),
                  ) && (
                    <Alert className="border-warning/25 bg-warning-soft text-warning-foreground">
                      <ShieldCheck />
                      <AlertTitle>Replacement selected</AlertTitle>
                      <AlertDescription className="text-warning-foreground/80">
                        One or more existing Liftline records will be replaced
                        with the Google Sheet values when you confirm.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="m-0 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button
                variant="outline"
                onClick={() => sheetImport.onOpenChange(false)}
                disabled={sheetImport.importing}
              >
                Cancel
              </Button>
              <Button
                onClick={sheetImport.onImportSelected}
                disabled={
                  !sheetImport.preview ||
                  sheetImport.selectedKeys.length === 0 ||
                  sheetImport.importing
                }
              >
                {sheetImport.importing ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Download />
                )}
                {sheetImport.importing
                  ? 'Importing…'
                  : `Import selected${sheetImport.selectedKeys.length > 0 ? ` (${sheetImport.selectedKeys.length})` : ''}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
