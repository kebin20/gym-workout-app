import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { routeFixture } from './route-test-harness.mjs';
const require = createRequire(import.meta.url);
const row = (week, changes = {}) => ({
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
  set4Weight: 100,
  set4Reps: 6,
  set5Weight: 101.5,
  set5Reps: 5,
  set5Rir: 3,
  rir: 4,
  notes: 'Saved note',
  updatedAt: `2026-10-${String(week).padStart(2, '0')}T10:00:00Z`,
  ...changes,
});

test('current/previous means exact selected programme weeks, with no history, day or future leakage', () => {
  const f = routeFixture();
  try {
    const { buildDayReport } = f.load('lib/day-report.ts');
    const entries = [
      row(2),
      row(4),
      row(5),
      row(6),
      row(7),
      row(6, { day: 'B' }),
    ];
    const before = JSON.stringify(entries);
    const report = buildDayReport('A', entries, {
      kind: 'recent',
      currentWeek: 6,
    });
    assert.deepEqual(
      Array.from(report.sessions, (session) => session.week),
      [5, 6],
    );
    assert.equal(report.records.length, 2);
    assert.equal(report.recordedSessions, 2);
    assert.equal(report.records[0].set1Weight, 97.25);
    assert.equal(report.records[0].set1Rir, 0);
    assert.equal(report.records[1].set5Rir, 3);
    assert.match(report.scopeLabel, /Phase 1 - Week 5 and Phase 1 - Week 6/);
    assert.equal(JSON.stringify(entries), before);
    assert.equal(buildDayReport('A', entries).records.length, 5);
  } finally {
    f.close();
  }
});

test('week one, cross-phase week 13, and missing-week reports retain explicit scope without inventing completion', () => {
  const f = routeFixture();
  try {
    const { buildDayReport } = f.load('lib/day-report.ts');
    const first = buildDayReport('A', [row(1), row(2)], {
      kind: 'recent',
      currentWeek: 1,
    });
    assert.deepEqual(
      Array.from(first.sessions, (session) => session.week),
      [1],
    );
    const boundary = buildDayReport('A', [row(11), row(12), row(13), row(14)], {
      kind: 'recent',
      currentWeek: 13,
    });
    assert.deepEqual(
      Array.from(boundary.sessions, (session) => session.week),
      [12, 13],
    );
    assert.match(boundary.scopeLabel, /Phase 1 - Week 12 and Phase 2 - Week 1/);
    const missing = buildDayReport('A', [row(4), row(6)], {
      kind: 'recent',
      currentWeek: 6,
    });
    assert.equal(missing.sessions[0].week, 5);
    assert.equal(missing.sessions[0].records.length, 0);
    assert.equal(missing.sessions[0].date, null);
    assert.equal(missing.recordedSessions, 1);
    const empty = buildDayReport('A', [], { kind: 'recent', currentWeek: 6 });
    assert.equal(empty.recordedSessions, 0);
    assert.equal(empty.sessions.length, 2);
    for (const currentWeek of [0, 25, 6.5, NaN])
      assert.throws(
        () => buildDayReport('A', [], { kind: 'recent', currentWeek }),
        /valid programme week/,
      );
  } finally {
    f.close();
  }
});

test('report-range selector stays accessible, captures the selected app week and leaves archived reports full-history', () => {
  const f = routeFixture(),
    state = [];
  let cursor = 0;
  const module = { exports: {} };
  try {
    vm.runInNewContext(
      ts.transpileModule(readFileSync('app/day-report-button.tsx', 'utf8'), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
      {
        module,
        exports: module.exports,
        require: (name) =>
          name === 'react'
            ? {
                useState: (initial) => {
                  const i = cursor++;
                  if (!(i in state)) state[i] = initial;
                  return [
                    state[i],
                    (v) => {
                      state[i] = v;
                    },
                  ];
                },
              }
            : name === '@/components/ui/button'
              ? { Button: () => null }
              : name === '@/lib/day-report'
                ? f.load('lib/day-report.ts')
                : require(name),
      },
    );
    const render = (currentWeek) => {
      cursor = 0;
      return module.exports.default({
        day: 'A',
        entries: [row(6)],
        loading: false,
        currentWeek,
      });
    };
    const elements = (node) =>
      !node || typeof node !== 'object'
        ? []
        : Array.isArray(node)
          ? node.flatMap(elements)
          : [node, ...elements(node.props?.children)];
    let tree = elements(render(6));
    const selector = tree.find((node) => node.type === 'select');
    assert.equal(selector.props['aria-label'], 'Day A PDF week range');
    assert.match(selector.props.className, /text-base/);
    selector.props.onChange({ target: { value: 'recent' } });
    tree = elements(render(6));
    assert.match(
      tree.find((node) => node.props?.onClick).props['aria-label'],
      /current and previous week/,
    );
    assert.equal(
      elements(render(undefined)).some((node) => node.type === 'select'),
      false,
    );
    assert.match(
      elements(render(undefined)).find((node) => node.props?.onClick).props[
        'aria-label'
      ],
      /all saved sessions/,
    );
  } finally {
    f.close();
  }
});

test('weekly PDF routines appear before exercise trends and render separate set columns without rounding recorded loads', () => {
  const source = readFileSync('lib/day-report-pdf.ts', 'utf8');
  assert.ok(
    source.indexOf("heading('Weekly routines and set details')") <
      source.indexOf("heading('Exercise trends')"),
  );
  for (const label of [
    'LOAD (KG)',
    'SECONDS',
    'REPS',
    'RIR',
    'No saved Day',
    'Legacy exercise RIR',
    'notes continued',
  ])
    assert.ok(source.includes(label), label);
  assert.match(source, /setValue\(set.weight\)/);
  assert.match(source, /maximumFractionDigits: 20/);
});
