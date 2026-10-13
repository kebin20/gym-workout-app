'use client';
import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  buildDayReport,
  reportWeekLabel,
  type DayReportScope,
} from '@/lib/day-report';
import type { TrainingDay } from '@/lib/routine';
import type { WorkoutEntry } from '@/lib/workout-types';

export default function DayReportButton({
  day,
  entries,
  loading,
  currentWeek,
}: {
  day: TrainingDay;
  entries: WorkoutEntry[];
  loading: boolean;
  currentWeek?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [scope, setScope] = useState<'all' | 'recent'>('all');
  const selectedScope: DayReportScope =
    scope === 'recent' && currentWeek !== undefined
      ? { kind: 'recent', currentWeek }
      : { kind: 'all' };
  async function download() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const report = buildDayReport(day, entries, selectedScope);
      const { createDayReportPdf, reportFontPath } =
        await import('@/lib/day-report-pdf');
      async function loadFont(path: string) {
        const response = await fetch(path, {
          signal: AbortSignal.timeout(30_000),
        });
        if (
          !response.ok ||
          response.headers.get('content-type')?.includes('text/html')
        )
          throw new Error(
            'The report font could not be loaded. Please reconnect and try again.',
          );
        return new Uint8Array(await response.arrayBuffer());
      }
      const [font, unicode] = await Promise.all([
        loadFont('/fonts/NotoSans-Regular.ttf'),
        reportFontPath(report).includes('JP')
          ? loadFont('/fonts/NotoSansJP.ttf')
          : undefined,
      ]);
      const bytes = await createDayReportPdf(report, font, new Date(), unicode);
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download =
        selectedScope.kind === 'recent'
          ? `liftline-day-${day.toLowerCase()}-weeks-${Math.max(1, selectedScope.currentWeek - 1)}-${selectedScope.currentWeek}.pdf`
          : `liftline-day-${day.toLowerCase()}-history.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // iOS may open a preview instead; retain the URL while it reads the PDF.
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      setMessage(
        'Report ready. On iPhone, use Share to save the PDF if a preview opens.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not create the PDF. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      data-day-report-controls=""
      className={`grid min-w-0 gap-2 sm:max-w-xl ${currentWeek !== undefined ? 'sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end' : ''}`}
    >
      {currentWeek !== undefined && (
        <label className="grid min-w-0 gap-1 font-sans text-sm font-medium text-muted-foreground">
          <span>PDF range</span>
          <select
            aria-label={`Day ${day} PDF week range`}
            value={scope}
            disabled={busy || loading}
            onChange={(event) => {
              setScope(event.target.value as 'all' | 'recent');
              setMessage('');
            }}
            className="h-11 w-full min-w-0 rounded-lg border bg-card px-3 text-base text-foreground outline-none focus:ring-3 focus:ring-ring/30"
          >
            <option value="all">All saved weeks</option>
            <option value="recent">Current + previous week</option>
          </select>
        </label>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-11 w-full sm:w-auto sm:justify-self-start"
        disabled={busy || loading}
        onClick={download}
        aria-label={`Download Day ${day} PDF report ${selectedScope.kind === 'all' ? 'with all saved sessions' : 'for the current and previous week'}`}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Download />}{' '}
        {busy ? 'Creating PDF…' : 'Download PDF'}
      </Button>
      {scope === 'recent' && currentWeek !== undefined && (
        <p className="font-sans text-sm text-muted-foreground sm:col-span-2">
          {currentWeek > 1 ? `${reportWeekLabel(currentWeek - 1)} + ` : ''}
          {reportWeekLabel(currentWeek)} · selected in Liftline
        </p>
      )}
      {message && (
        <p
          className={`text-sm text-muted-foreground [overflow-wrap:anywhere] ${currentWeek !== undefined ? 'sm:col-span-2' : ''}`}
          role="status"
        >
          {message}
        </p>
      )}
    </div>
  );
}
