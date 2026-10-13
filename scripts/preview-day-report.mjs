// Synthetic PDF QA only. Never fetches or changes actual workout data.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { routeFixture } from './route-test-harness.mjs';
const output = process.argv[2];
if (!output || !output.startsWith('/private/tmp/'))
  throw Error(
    'Use an explicit /private/tmp/ directory for synthetic PDF previews.',
  );
mkdirSync(output, { recursive: true });
const f = routeFixture();
try {
  const { buildDayReport } = f.load('lib/day-report.ts');
  const { createDayReportPdf, reportFontPath } = f.load(
    'lib/day-report-pdf.ts',
  );
  const entries = [1, 2, 4, 5, 6, 12, 13].flatMap((week) => [
    {
      week,
      day: 'A',
      exerciseOrder: 1,
      exercise: 'Back Squat or Hack Squat',
      target: '3 x 6-8',
      completed: true,
      set1Weight: 97.25,
      set1Reps: 8,
      set1Rir: 0,
      set2Weight: 97.25,
      set2Reps: 8,
      set2Rir: 2,
      set3Weight: 97.25,
      set3Reps: 8,
      set3Rir: 3,
      rir: 4,
      notes:
        week === 5
          ? 'Machine settings and form cue. '.repeat(50) +
            '今日はフォームを確認。'
          : 'Keep the same depth.',
      completedAt: `2026-10-${String(week).padStart(2, '0')}T10:00:00Z`,
    },
    {
      week,
      day: 'A',
      exerciseOrder: 2,
      exercise: 'Dumbbell Bench Press',
      target: '3 x 8-12',
      completed: true,
      set1Weight: 22.5,
      set1Reps: 12,
      set1Rir: 2,
      set2Weight: 22.5,
      set2Reps: 10,
      set3Weight: 22.5,
      set3Reps: 10,
      rir: 2,
      notes: 'Use controlled reps.',
    },
    {
      week,
      day: 'A',
      exerciseOrder: 6,
      exercise: 'Plank',
      target: '3 x 45 seconds',
      completed: week !== 6,
      set1Weight: null,
      set1Reps: 45,
      set2Weight: null,
      set2Reps: 40,
      set3Weight: null,
      set3Reps: 35,
      rir: null,
      notes: 'Timed holds are not kg volume.',
    },
  ]);
  for (const [name, scope] of [
    ['day-a-all-weeks', { kind: 'all' }],
    ['day-a-weeks-5-6', { kind: 'recent', currentWeek: 6 }],
  ]) {
    const report = buildDayReport('A', entries, scope);
    const bytes = await createDayReportPdf(
      report,
      readFileSync('public/fonts/NotoSans-Regular.ttf'),
      new Date('2026-10-13T10:00:00Z'),
      reportFontPath(report).includes('JP')
        ? readFileSync('public/fonts/NotoSansJP.ttf')
        : undefined,
    );
    const path = resolve(output, name + '.pdf');
    writeFileSync(path, bytes);
    console.log(path);
  }
} finally {
  f.close();
}
