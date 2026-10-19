import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import { PDFPage, PDFDocument } from 'pdf-lib';
import { routeFixture } from './route-test-harness.mjs';

function loadWorkoutDates(intl = Intl) {
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(readFileSync('lib/workout-date.ts', 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { module, exports: module.exports, Date, Intl: intl },
  );
  return module.exports;
}

test('date formatting is lazy on import and reuses formatters across history rows', () => {
  let constructed = 0;
  const dates = loadWorkoutDates({
    DateTimeFormat: class extends Intl.DateTimeFormat {
      constructor(...args) {
        super(...args);
        constructed++;
      }
    },
  });
  assert.equal(constructed, 0);
  dates.formatWorkoutDate(null);
  dates.workoutCalendarDate('invalid');
  assert.equal(constructed, 0);
  for (let row = 0; row < 20; row++) {
    dates.formatWorkoutDate('2026-10-16T15:30:00Z');
    dates.workoutCalendarDate('2026-10-16T15:30:00Z');
  }
  assert.equal(constructed, 2);
});

test('workout timestamps use the Tokyo calendar day at midnight, month and year boundaries', () => {
  const { workoutCalendarDate, formatWorkoutDate, WORKOUT_TIME_ZONE } =
    loadWorkoutDates();
  assert.equal(WORKOUT_TIME_ZONE, 'Asia/Tokyo');
  for (const [instant, key, label] of [
    ['2026-10-16T14:59:59.999Z', '2026-10-16', '16 Oct 2026'],
    ['2026-10-16T15:00:00.000Z', '2026-10-17', '17 Oct 2026'],
    ['2026-10-17T00:30:00+09:00', '2026-10-17', '17 Oct 2026'],
    ['2026-10-16T08:30:00-07:00', '2026-10-17', '17 Oct 2026'],
    ['2026-01-31T15:30:00Z', '2026-02-01', '1 Feb 2026'],
    ['2026-12-31T15:30:00Z', '2027-01-01', '1 Jan 2027'],
  ]) {
    assert.equal(workoutCalendarDate(instant), key);
    assert.equal(formatWorkoutDate(instant), label);
    const date = new Date(instant);
    const before = date.toISOString();
    assert.equal(workoutCalendarDate(date), key);
    assert.equal(formatWorkoutDate(date), label);
    assert.equal(date.toISOString(), before, 'formatting must not mutate instants');
  }
});

test('date-only records retain their actual calendar day and invalid/missing dates never become today', () => {
  const { workoutCalendarDate, formatWorkoutDate } = loadWorkoutDates();
  assert.equal(workoutCalendarDate('2026-10-17'), '2026-10-17');
  assert.equal(formatWorkoutDate('2026-10-17'), '17 Oct 2026');
  assert.equal(workoutCalendarDate('2028-02-29'), '2028-02-29');
  for (const value of [
    undefined,
    null,
    '',
    ' ',
    'not-a-date',
    '2026-02-30',
    '2026-02-30T15:30:00Z',
    '2026-02-29',
    '2026-13-01',
    new Date(NaN),
  ]) {
    assert.equal(workoutCalendarDate(value), null);
    assert.equal(formatWorkoutDate(value), 'Date unavailable');
  }
});

test('Tokyo labels and calendar keys remain identical across viewer timezones, including legacy unzoned timestamps', () => {
  const script = `
    import { readFileSync } from 'node:fs';
    import vm from 'node:vm';
    import ts from 'typescript';
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(readFileSync('lib/workout-date.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText, { module, exports: module.exports, Date, Intl });
    const { workoutCalendarDate, formatWorkoutDate } = module.exports;
    console.log(JSON.stringify([
      '2026-10-16T15:30:00Z', '2026-10-17', '2026-10-16T15:30:00',
      '2026-10-16 15:30:00'
    ].map(value => [workoutCalendarDate(value), formatWorkoutDate(value)])));
  `;
  for (const TZ of [
    'UTC',
    'Pacific/Honolulu',
    'Pacific/Kiritimati',
    'America/New_York',
  ]) {
    const result = JSON.parse(
      execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf8',
        env: { ...process.env, TZ },
      }),
    );
    assert.deepEqual(
      result,
      Array.from({ length: 4 }, () => ['2026-10-17', '17 Oct 2026']),
      TZ,
    );
  }
});

test('reopening Holiday restores the cached session identity and date, including an unsaved session absent from server history', async () => {
  const source = readFileSync('app/holiday-workout.tsx', 'utf8');
  const parsed = ts.createSourceFile(
    'holiday-workout.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let restoreEffect;
  function findEffect(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(parsed) === 'useEffect' &&
      node.arguments[0]?.getText(parsed).includes('let cachedSession:')
    )
      restoreEffect = node.arguments[0].getText(parsed);
    ts.forEachChild(node, findEffect);
  }
  findEffect(parsed);
  assert.ok(restoreEffect, 'exercise the real Holiday restore effect');
  const code = ts.transpileModule(`export const restore = ${restoreEffect}`, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  for (const saved of [
    {
      sessionId: 'holiday-local-unsaved',
      sessionDate: '2026-10-16',
      sessionType: 'A',
    },
    {
      sessionId: 'holiday-local-session-b',
      sessionDate: '2026-10-17',
      sessionType: 'B',
    },
    {
      sessionId: 'holiday-invalid-date',
      sessionDate: '2026-02-30',
      sessionType: 'A',
    },
  ]) {
    const values = {},
      persisted = [],
      module = { exports: {} };
    const sessionRef = { current: '' };
    const valid = saved.sessionDate !== '2026-02-30';
    vm.runInNewContext(code, {
      module,
      exports: module.exports,
      localStorage: {
        getItem: () => JSON.stringify(saved),
        setItem: (_, value) => persisted.push(JSON.parse(value)),
      },
      activeSessionKey: 'liftline.holiday-active-session.v1',
      ...loadWorkoutDates(),
      readHolidayCache: () => ({ entries: [], nextPage: null }),
      pendingHoliday: () => [],
      overlayOutbox: (entries) => entries,
      holidayKey: () => '',
      latestDraftKey: () => null,
      holidayPlans: {
        A: [{ order: 1, name: 'Split squat' }],
        B: [{ order: 1, name: 'Push-up' }],
      },
      tokyoDate: () => '2026-10-17',
      newSessionId: () => 'holiday-new-fallback',
      sessionRef,
      setSessionId: (value) => (values.sessionId = value),
      setSessionDate: (value) => (values.sessionDate = value),
      setSessionType: (value) => (values.sessionType = value),
      setExerciseIndex() {},
      setEntries() {},
      setNextPage() {},
      setPendingCount() {},
      setLoading() {},
      setError(error) {
        assert.fail(error);
      },
      changeSequence: { current: 0 },
      refreshHoliday: async () => {},
      flushHoliday: async () => {},
      navigator: { onLine: false },
      window: { addEventListener() {}, removeEventListener() {} },
    });
    const cleanup = module.exports.restore();
    await Promise.resolve();
    await Promise.resolve();
    const expected = valid
      ? saved
      : {
          sessionId: 'holiday-new-fallback',
          sessionDate: '2026-10-17',
          sessionType: 'A',
        };
    assert.deepEqual(values, expected);
    assert.equal(sessionRef.current, expected.sessionId);
    assert.deepEqual(persisted.at(-1), expected);
    cleanup();
  }
});

test('actual PDF labels use the same Tokyo date as the app without modifying records or PDF creation timestamps', async () => {
  const f = routeFixture();
  const originalDrawText = PDFPage.prototype.drawText;
  const labels = [];
  PDFPage.prototype.drawText = function (text, options) {
    labels.push(text);
    return originalDrawText.call(this, text, options);
  };
  try {
    const { buildDayReport } = f.load('lib/day-report.ts');
    const { createDayReportPdf } = f.load('lib/day-report-pdf.ts');
    const records = [
      {
        week: 6,
        day: 'A',
        exerciseOrder: 1,
        exercise: 'Back Squat',
        target: '3 x 6-8',
        set1Weight: 70,
        set1Reps: 8,
        set1Rir: 2,
        completed: true,
        completedAt: '2026-10-16T15:30:00.000Z',
        updatedAt: '2026-10-16T15:30:00.000Z',
      },
    ];
    const before = JSON.stringify(records);
    const generatedAt = new Date('2026-10-16T15:45:00.000Z');
    const bytes = await createDayReportPdf(
      buildDayReport('A', records),
      readFileSync('public/fonts/NotoSans-Regular.ttf'),
      generatedAt,
    );
    const text = labels.join('\n');
    assert.match(text, /Generated 17 Oct 2026/);
    assert.match(text, /Recorded: 17 Oct 2026/);
    assert.doesNotMatch(text, /16 Oct 2026/);
    assert.equal(JSON.stringify(records), before);
    assert.equal(
      (await PDFDocument.load(bytes)).getCreationDate().toISOString(),
      generatedAt.toISOString(),
    );
  } finally {
    PDFPage.prototype.drawText = originalDrawText;
    f.close();
  }
});

test('Sheet requests keep Tokyo dates and the existing noon-UTC compatibility format, without changing source timestamps', async () => {
  const requests = [];
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(readFileSync('lib/google-sheet-sync.ts', 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      URL,
      Date,
      AbortSignal,
      require: (name) => {
        if (name === '@/lib/workout-date') return loadWorkoutDates();
        assert.equal(name, 'cloudflare:workers');
        return {
          env: {
            GOOGLE_SHEETS_WEBHOOK_URL:
              'https://script.google.com/macros/s/synthetic-test/exec',
            GOOGLE_SHEETS_SYNC_TOKEN: 'synthetic-test-token',
          },
        };
      },
      fetch: async (_, request) => {
        requests.push(JSON.parse(request.body));
        return {
          ok: true,
          text: async () => JSON.stringify({ ok: true, synced: 1 }),
        };
      },
    },
  );
  for (const completedAt of [
    '2026-10-16T15:30:00Z',
    '2026-10-17',
    '2026-10-16 15:30:00',
  ]) {
    const entry = { completed: true, completedAt, week: 6, day: 'A' };
    const result = await module.exports.syncWorkoutEntries([entry]);
    assert.equal(result.ok, true);
    assert.equal(requests.at(-1).entries[0].completedOn, '2026-10-17');
    assert.equal(
      requests.at(-1).entries[0].completedAt,
      '2026-10-17T12:00:00.000Z',
    );
    assert.equal(entry.completedAt, completedAt);
  }
  for (const completedAt of [
    null,
    '',
    'invalid',
    '2026-02-30',
    '2026-02-30T15:30:00Z',
  ]) {
    const result = await module.exports.syncWorkoutEntries([
      { completed: true, completedAt },
    ]);
    assert.equal(result.ok, false);
    assert.match(result.message, /no original date/);
  }
  assert.equal(requests.length, 3, 'invalid rows must not send any request');
});
