'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/liftline-form-controls';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import DayReportButton from './day-report-button';
import type { WorkoutEntry } from '@/lib/workout-types';
import { reportSets } from '@/lib/day-report';

type Archive = { id: string; label: string; createdAt: string };
type Detail = Archive & {
  rawSnapshot: string;
  snapshot: {
    entries: WorkoutEntry[];
    sessionExercises: unknown[];
    settings: Record<string, string>;
  };
};
export default function ProgrammeManager({
  onClose,
  onBeforeStart,
  onStarted,
  programmeId,
}: {
  onClose: () => void;
  onBeforeStart: () => void;
  onStarted: () => Promise<void>;
  programmeId: string;
}) {
  const [archives, setArchives] = useState<Archive[]>([]),
    [detail, setDetail] = useState<Detail | null>(null);
  const [next, setNext] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false),
    [startDate, setStartDate] = useState(() =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
    );
  async function load(before?: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/programmes${before ? '?before=' + encodeURIComponent(before) : ''}`,
        { cache: 'no-store', signal: AbortSignal.timeout(15000) },
      );
      const data = (await response.json()) as {
        error?: string;
        archives: Archive[];
        next: string | null;
      };
      if (!response.ok)
        throw new Error(data.error ?? 'Cannot load programme history.');
      setArchives((current) =>
        before ? [...current, ...data.archives] : data.archives,
      );
      setNext(data.next);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Cannot load programme history.',
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function open(id: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/programmes?id=${encodeURIComponent(id)}`,
        { cache: 'no-store', signal: AbortSignal.timeout(15000) },
      );
      const data = (await response.json()) as Detail & { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Cannot load archive.');
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cannot load archive.');
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (busy || !confirmed) return;
    setBusy(true);
    setError('');
    try {
      onBeforeStart();
      const response = await fetch('/api/programmes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programmeId, startDate, confirm: 'ARCHIVE' }),
        signal: AbortSignal.timeout(30000),
      });
      const data = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok)
        throw new Error(data.error ?? 'Cannot start another programme.');
      await onStarted();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Cannot start another programme. Reload before retrying if the connection was interrupted.',
      );
    } finally {
      setBusy(false);
    }
  }
  function exportArchive() {
    if (!detail) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              source: 'Liftline',
              version: 4,
              entries: [],
              sessionExercises: [],
              archives: [
                {
                  id: detail.id,
                  label: detail.label,
                  createdAt: detail.createdAt,
                  snapshot: detail.rawSnapshot,
                },
              ],
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `liftline-programme-${detail.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Programme history</DialogTitle>
          <DialogDescription>
            Archived programmes are read-only. Starting another programme
            preserves all old logs and keeps Holiday records and measurements.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {detail ? (
          <section className="space-y-4">
            <Button variant="outline" onClick={() => setDetail(null)}>
              Back to programmes
            </Button>
            <h3 className="font-semibold">{detail.label}</h3>
            <p className="text-sm text-muted-foreground">
              {detail.snapshot.entries.length} saved exercise records · archived{' '}
              {new Date(detail.createdAt).toLocaleDateString()}
            </p>
            <Button variant="outline" onClick={exportArchive}>
              Download this archive
            </Button>
            {(['A', 'B', 'C'] as const).map((day) => (
              <details key={day} className="rounded-xl border p-4">
                <summary className="cursor-pointer font-semibold">
                  Day {day} history
                </summary>
                <div className="my-3">
                  <DayReportButton
                    day={day}
                    entries={detail.snapshot.entries}
                    loading={false}
                  />
                </div>
                {detail.snapshot.entries
                  .filter((entry) => entry.day === day)
                  .map((entry) => (
                    <details
                      key={`${entry.week}-${entry.exerciseOrder}`}
                      className="mb-2 rounded-lg border p-3"
                    >
                      <summary className="cursor-pointer">
                        Phase {entry.week > 12 ? 2 : 1} · Week{' '}
                        {entry.week > 12 ? entry.week - 12 : entry.week} ·{' '}
                        {entry.exercise}
                      </summary>
                      <p className="mt-2 text-sm">
                        {entry.target} ·{' '}
                        {entry.completedAt
                          ? new Date(entry.completedAt).toLocaleDateString()
                          : 'Date unavailable'}
                      </p>
                      {reportSets(entry).map((set) => (
                        <p key={set.set} className="text-sm">
                          Set {set.set}: {set.weight ?? '—'} kg ×{' '}
                          {set.reps ?? '—'}
                          {set.rir != null ? ` · RIR ${set.rir}` : ''}
                        </p>
                      ))}
                      {entry.rir != null && (
                        <p className="text-sm">
                          Legacy exercise RIR: {entry.rir}
                        </p>
                      )}
                      {entry.notes && (
                        <p className="mt-2 whitespace-pre-wrap text-sm">
                          {entry.notes}
                        </p>
                      )}
                    </details>
                  ))}
              </details>
            ))}
          </section>
        ) : (
          <>
            <div className="space-y-2">
              {archives.map((archive) => (
                <Button
                  key={archive.id}
                  variant="outline"
                  className="h-auto w-full justify-start whitespace-normal p-3 text-left"
                  disabled={busy}
                  onClick={() => void open(archive.id)}
                >
                  {archive.label}
                </Button>
              ))}
              {!archives.length && !busy && (
                <p className="text-sm text-muted-foreground">
                  No archived programmes yet.
                </p>
              )}
              {next && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void load(next)}
                >
                  Load earlier programmes
                </Button>
              )}
            </div>
            <section className="mt-4 space-y-3 rounded-xl border p-4">
              <h3 className="font-semibold">Start another 24-week programme</h3>
              <p className="text-sm text-muted-foreground">
                This archives your active main programme and starts Phase 1,
                Week 1 with the default routine. It never runs automatically.
                Download a full backup first and sync any queued saves on your
                devices. The existing Google Sheet remains the original
                programme; later programmes use JSON backups and PDF reports.
              </p>
              <label className="block text-sm">
                New programme start date
                <Input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-5 shrink-0"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  disabled={busy}
                />
                I have backed up and synced my devices, and want to archive the
                current programme and start again.
              </label>
              <Button
                disabled={!confirmed || busy || !startDate}
                onClick={() => void start()}
              >
                {busy ? 'Working…' : 'Archive & start new programme'}
              </Button>
            </section>
          </>
        )}
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
