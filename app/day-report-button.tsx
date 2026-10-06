'use client';
import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildDayReport } from '@/lib/day-report';
import type { TrainingDay } from '@/lib/routine';
import type { WorkoutEntry } from '@/lib/workout-types';

export default function DayReportButton({
  day,
  entries,
  loading,
}: {
  day: TrainingDay;
  entries: WorkoutEntry[];
  loading: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function download() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const report = buildDayReport(day, entries);
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
      link.download = `liftline-day-${day.toLowerCase()}-history.pdf`;
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
    <div className="max-w-xs">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy || loading}
        onClick={download}
        aria-label={`Download Day ${day} PDF report with all saved sessions`}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Download />}{' '}
        {busy ? 'Creating PDF…' : 'Download PDF'}
      </Button>
      {message && (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
