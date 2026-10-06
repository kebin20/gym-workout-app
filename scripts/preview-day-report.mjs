// Synthetic records only; never read personal workout data for visual QA.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { routeFixture } from './route-test-harness.mjs';
const fixture = routeFixture();
try {
  const { buildDayReport } = fixture.load('lib/day-report.ts');
  const { createDayReportPdf } = fixture.load('lib/day-report-pdf.ts');
  const entries = [];
  for (let week = 1; week <= 6; week++) {
    for (const [order, name] of [
      [1, 'Back Squat'],
      [2, 'Bench Press'],
      [3, 'Plank'],
    ]) {
      entries.push({
        week,
        day: 'A',
        exerciseOrder: order,
        exercise: name,
        target: name === 'Plank' ? '2 x 30-60 sec' : '3 x 6-8',
        set1Weight: name === 'Plank' ? null : 40 + week * 2.5,
        set1Reps: name === 'Plank' ? 45 : 8,
        set2Weight: name === 'Plank' ? null : 45 + week * 2.5,
        set2Reps: name === 'Plank' ? 30 : 8,
        set3Weight: null,
        set3Reps: null,
        rir: 2,
        completed: true,
        completedAt: `2026-09-${String(week * 3).padStart(2, '0')}T09:00:00Z`,
        notes:
          week === 4
            ? '今日はフォームを確認。Use the same machine settings and keep the lowering phase controlled. '.repeat(
                12,
              )
            : 'Controlled tempo. No change of equipment.',
      });
    }
  }
  const report = buildDayReport('A', entries);
  const bytes = await createDayReportPdf(
    report,
    readFileSync('public/fonts/NotoSans-Regular.ttf'),
    new Date('2026-10-06T00:00:00Z'),
    readFileSync('public/fonts/NotoSansJP.ttf'),
  );
  mkdirSync('/private/tmp/liftline-report-qa', { recursive: true });
  writeFileSync('/private/tmp/liftline-report-qa/day-a.pdf', bytes);
  console.log('/private/tmp/liftline-report-qa/day-a.pdf');
} finally {
  fixture.close();
}
