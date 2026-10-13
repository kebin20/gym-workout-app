import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import vm from 'node:vm';
import ts from 'typescript';
import { routeFixture } from './route-test-harness.mjs';
const require = createRequire(import.meta.url);

function seed(
  f,
  {
    week = 5,
    order = 1,
    date = '2026-10-04T12:00:00.000Z',
    status = 'synced',
  } = {},
) {
  f.sqlite
    .prepare(`INSERT INTO workout_entries (week,day,exercise_order,exercise,target,
    set1_weight,set1_reps,set2_weight,set2_reps,set3_weight,set3_reps,set4_weight,set4_reps,set5_weight,set5_reps,
    set1_rir,set2_rir,set3_rir,set4_rir,set5_rir,set_count,rir,notes,completed,completed_at,updated_at,sync_status)
    VALUES (?,'A',?,'Saved machine substitution','Original target',63.25,12,68,12,80,10,82.5,8,85,6,0,2,2,3,4,5,4,'Original note',1,?,'2026-10-04T12:30:00.000Z',?)`)
    .run(week, order, date, status);
  return read(f);
}
function read(f) {
  return f.sqlite
    .prepare(
      `SELECT ${f.load('lib/workout-types.ts').workoutSelectColumns} FROM workout_entries ORDER BY id`,
    )
    .get();
}
function payload(f, entry = read(f)) {
  const { historyFields, historyValues } = f.load(
    'lib/workout-history-edit.ts',
  );
  return {
    ...historyFields(historyValues(entry)),
    id: entry.id,
    programmeId: 'initial',
    expectedUpdatedAt: entry.updatedAt,
    expectedServerRevision: entry.serverRevision,
  };
}
function patch(f, body) {
  return f.load('app/api/workouts/route.ts').PATCH(
    new Request('https://example.test/api/workouts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

test('an older in-flight Sheet write re-sends the latest correction instead of leaving stale values mirrored', async () => {
  const writes = [];
  const f = routeFixture({
    syncWorkoutEntries: async (entries) => {
      writes.push(entries[0].set1Weight);
      if (writes.length === 1)
        f.sqlite.exec(
          "UPDATE workout_entries SET set1_weight=99,updated_at='2099-01-01T00:00:00.000Z',sync_status='synced'",
        );
      return { ok: true, configured: true, synced: 1 };
    },
  });
  try {
    seed(f);
    assert.equal(
      (await patch(f, { ...payload(f), set1Weight: 91 })).status,
      200,
    );
    await f.settled();
    assert.deepEqual(writes, [91, 99]);
    assert.equal(read(f).set1Weight, 99);
    assert.equal(read(f).syncStatus, 'synced');
  } finally {
    f.close();
  }
});

test('continuous corrections bound Sheet reconciliation and expose a retryable error instead of claiming success', async () => {
  let writes = 0;
  const f = routeFixture({
    syncWorkoutEntries: async () => {
      writes++;
      f.sqlite
        .prepare(
          "UPDATE workout_entries SET set1_weight=?,updated_at=?,sync_status='synced'",
        )
        .run(100 + writes, `2099-01-01T00:00:0${writes}.000Z`);
      return { ok: true, configured: true, synced: 1 };
    },
  });
  try {
    seed(f);
    assert.equal(
      (await patch(f, { ...payload(f), set1Weight: 91 })).status,
      200,
    );
    await f.settled();
    assert.equal(writes, 2);
    assert.equal(read(f).set1Weight, 102);
    assert.equal(read(f).syncStatus, 'failed');
    assert.match(read(f).syncError, /Retry Sheet sync/);
  } finally {
    f.close();
  }
});

test('historical correction updates the same five-set record and queues only its matching Sheet row, preserving metadata/date', async () => {
  const writes = [];
  const f = routeFixture({
    syncWorkoutEntries: async (entries) => {
      writes.push(...entries);
      return { ok: true, configured: true, synced: 1 };
    },
  });
  try {
    const original = seed(f);
    f.sqlite
      .prepare(
        `INSERT INTO workout_entries (week,day,exercise_order,exercise,target,completed,updated_at) VALUES (6,'B',1,'Other workout','Keep',0,'2026-10-11T12:00:00Z')`,
      )
      .run();
    const other = f.sqlite
      .prepare('SELECT * FROM workout_entries WHERE week=6')
      .get();
    const response = await patch(f, {
      ...payload(f),
      set1Weight: 91.25,
      set1Reps: 10,
      set1Rir: 0,
      rir: 2,
      notes: 'Corrected load',
      exercise: 'Ignore this',
      completedAt: '2026-10-13T12:00:00Z',
      completed: false,
      setCount: 1,
    });
    assert.equal(response.status, 200);
    const { entry, sheetSyncQueued } = await response.json();
    assert.equal(sheetSyncQueued, true);
    for (const field of [
      'id',
      'week',
      'day',
      'exerciseOrder',
      'exercise',
      'target',
      'completed',
      'completedAt',
      'setCount',
    ])
      assert.equal(entry[field], original[field], field);
    for (const field of [
      'set4Weight',
      'set4Reps',
      'set4Rir',
      'set5Weight',
      'set5Reps',
      'set5Rir',
    ])
      assert.equal(entry[field], original[field], field);
    assert.equal(entry.set1Weight, 91.25);
    assert.equal(entry.set1Rir, 0);
    assert.equal(entry.notes, 'Corrected load');
    assert.ok(entry.serverRevision > original.serverRevision);
    assert.ok(Date.parse(entry.updatedAt) > Date.parse(original.updatedAt));
    assert.equal(entry.programmeId, 'initial');
    await f.settled();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].week, 5);
    assert.equal(writes[0].day, 'A');
    assert.equal(writes[0].exerciseOrder, 1);
    assert.equal(writes[0].completedAt, original.completedAt);
    assert.equal(writes[0].set1Weight, 91.25);
    assert.equal(read(f).syncStatus, 'synced');
    assert.deepEqual(
      f.sqlite.prepare('SELECT * FROM workout_entries WHERE week=6').get(),
      other,
    );
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) AS n FROM workout_entries').get().n,
      2,
    );
    const report = f.load('lib/day-report.ts').buildDayReport('A', [read(f)]);
    assert.equal(report.records[0].set1Weight, 91.25);
  } finally {
    f.close();
  }
});

test('stale, deleted and replaced records cannot be overwritten or recreated by history edits', async () => {
  const f = routeFixture();
  try {
    seed(f);
    const old = payload(f);
    // Even an edit retaining the timestamp is protected by the server revision.
    f.sqlite.exec('UPDATE workout_entries SET set1_weight=100');
    assert.equal((await patch(f, old)).status, 409);
    assert.equal(read(f).set1Weight, 100);
    const deleted = payload(f);
    f.sqlite.exec('DELETE FROM workout_entries');
    assert.equal((await patch(f, deleted)).status, 409);
    assert.equal(read(f), undefined);
    seed(f);
    assert.equal((await patch(f, deleted)).status, 409);
  } finally {
    f.close();
  }
});

test('atomic correction guards reject concurrent edits and programme transitions at the write boundary', async () => {
  for (const race of ['edit', 'programme']) {
    let raced = false;
    const f = routeFixture({
      beforeRun(sql, sqlite) {
        if (!raced && /^UPDATE workout_entries SET set1_weight/.test(sql)) {
          raced = true;
          if (race === 'edit')
            sqlite.exec('UPDATE workout_entries SET set1_weight=99');
          else
            sqlite.exec(
              "INSERT INTO app_settings (key,value,updated_at) VALUES ('programmeId','next-cycle','2026-10-13T00:00:00Z')",
            );
        }
      },
    });
    try {
      seed(f);
      const result = await patch(f, { ...payload(f), set1Weight: 91 });
      assert.equal(result.status, 409);
      assert.equal(read(f).set1Weight, race === 'edit' ? 99 : 63.25);
    } finally {
      f.close();
    }
  }
});

test('history validation preserves legacy blank/zero sets and rejects invalid values, including hidden sets', async () => {
  const f = routeFixture();
  try {
    seed(f);
    f.sqlite.exec(
      'UPDATE workout_entries SET set2_reps=0,set3_reps=NULL,set_count=3',
    );
    const before = read(f);
    assert.equal(
      (await patch(f, { ...payload(f), set1Weight: 91, set1Rir: 0 })).status,
      200,
    );
    await f.settled();
    assert.equal(read(f).set2Reps, 0);
    assert.equal(read(f).set3Reps, null);
    assert.equal(read(f).completedAt, before.completedAt);
    for (const invalid of [
      { set1Weight: -1 },
      { set4Weight: -1 },
      { set1Reps: 1.5 },
      { set1Reps: 0 },
      { set5Rir: 11 },
      { set1Weight: '91' },
      { notes: 'x'.repeat(1001) },
      { set2Reps: undefined },
    ])
      assert.equal(
        (await patch(f, { ...payload(f), ...invalid })).status,
        400,
        JSON.stringify(invalid),
      );
    assert.equal(
      (await patch(f, { ...payload(f), programmeId: 'archived' })).status,
      409,
    );
    assert.equal(
      (await patch(f, { ...payload(f), expectedServerRevision: undefined }))
        .status,
      400,
    );
    assert.equal(
      (await patch(f, { ...payload(f), set1Rir: null, rir: null })).status,
      200,
    );
    assert.equal(read(f).set1Rir, null);
    assert.equal(read(f).rir, null);
    await f.settled();
  } finally {
    f.close();
  }
});

test('extra programmes/custom routines remain app-only; unknown dates and Sheet failures never erase a correction', async () => {
  for (const config of [
    { week: 13 },
    { order: 100, status: 'not_applicable' },
    { programme: 'next-cycle' },
    { date: null },
    { fail: true },
  ]) {
    let writes = 0;
    const f = routeFixture({
      syncWorkoutEntries: async () => {
        writes++;
        return {
          ok: false,
          configured: true,
          synced: 0,
          message: 'Synthetic Sheet outage',
        };
      },
    });
    try {
      seed(f, config);
      if (config.programme)
        f.sqlite.exec(
          "INSERT INTO app_settings (key,value,updated_at) VALUES ('programmeId','next-cycle','2026-10-13T00:00:00Z')",
        );
      const response = await patch(f, {
        ...payload(f),
        programmeId: config.programme ?? 'initial',
        set1Weight: 91,
      });
      assert.equal(response.status, 200);
      const result = await response.json();
      await f.settled();
      assert.equal(read(f).set1Weight, 91);
      assert.equal(
        read(f).completedAt,
        config.date === null ? null : '2026-10-04T12:00:00.000Z',
      );
      assert.equal(result.sheetSyncQueued, Boolean(config.fail));
      assert.equal(writes, config.fail ? 1 : 0);
      assert.equal(
        read(f).syncStatus,
        config.date === null || config.fail ? 'failed' : 'not_applicable',
      );
    } finally {
      f.close();
    }
  }
});

test('the existing Apps Script writes corrected values to the original key and preserves unrelated rows and columns', () => {
  const rows = [Array(18).fill('untouched'), Array(18).fill('untouched')];
  rows[0][0] = 5;
  rows[0][1] = 'A';
  rows[0][16] = 1;
  rows[1][0] = 6;
  rows[1][1] = 'A';
  rows[1][16] = 1;
  const other = [...rows[1]];
  const sheet = {
    getLastRow: () => 6,
    getRange(row, col, height, width) {
      return {
        getValues: () => rows.map((entry) => [...entry]),
        setValue: (value) => {
          rows[row - 5][col - 1] = value;
        },
        setValues: (values) => {
          for (let i = 0; i < width; i++)
            rows[row - 5][col - 1 + i] = values[0][i];
        },
      };
    },
  };
  const context = vm.createContext({
    LockService: {
      getScriptLock: () => ({
        waitLock() {},
        hasLock: () => true,
        releaseLock() {},
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }),
      flush() {},
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (json) => ({
        json: JSON.parse(json),
        setMimeType() {
          return this;
        },
      }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha' },
      computeDigest: (_, value) => [
        ...createHash('sha256').update(value).digest(),
      ],
    },
  });
  vm.runInContext(
    readFileSync('integrations/google-apps-script/Code.gs', 'utf8'),
    context,
  );
  const result = context.doPost({
    postData: {
      contents: JSON.stringify({
        token: 'replace-with-a-long-random-token',
        action: 'write',
        entries: [
          {
            week: 5,
            day: 'A',
            exerciseOrder: 1,
            completedOn: '2026-10-04',
            set1Weight: 91.25,
            set1Reps: 10,
            set2Weight: 91,
            set2Reps: 12,
            set3Weight: 91,
            set3Reps: 10,
            rir: 0,
            notes: 'Correction',
            completed: true,
          },
        ],
      }),
    },
  });
  assert.equal(result.json.ok, true);
  assert.deepEqual(rows[0].slice(5, 12), [91.25, 10, 91, 12, 91, 10, 0]);
  assert.equal(rows[0][2], Date.UTC(2026, 9, 4) / 86400000 + 25569);
  assert.equal(rows[0][14], 'Correction');
  assert.equal(rows[0][17], 'Yes');
  assert.equal(rows[0][3], 'untouched');
  assert.deepEqual(rows[1], other);
});

function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== 'object' || !tree.props) return [];
  return [tree, ...elements(tree.props.children)];
}
function dialogHarness(f) {
  const state = [];
  let cursor = 0;
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(readFileSync('app/history-edit-dialog.tsx', 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      Intl,
      Date,
      Error,
      require: (name) =>
        name === 'react'
          ? {
              useState(initial) {
                const i = cursor++;
                if (!(i in state))
                  state[i] =
                    typeof initial === 'function' ? initial() : initial;
                return [
                  state[i],
                  (value) => {
                    state[i] =
                      typeof value === 'function' ? value(state[i]) : value;
                  },
                ];
              },
              useRef(initial) {
                const i = cursor++;
                return (state[i] ??= { current: initial });
              },
            }
          : name.startsWith('@/')
            ? f.load(name.slice(2) + (name.includes('/lib/') ? '.ts' : '.tsx'))
            : require(name),
    },
  );
  return (props) => {
    cursor = 0;
    return elements(module.exports.default(props));
  };
}

test('editor retains values/errors, protects unsaved dismissal and double submits, and uses compact labeled controls', async () => {
  const f = routeFixture();
  try {
    const entry = seed(f);
    const render = dialogHarness(f);
    let closes = 0,
      saves = 0,
      reject;
    const props = {
      entry,
      sheetAvailable: true,
      onClose: () => closes++,
      onSave: async () => {
        saves++;
        await new Promise((_, no) => {
          reject = no;
        });
      },
    };
    let nodes = render(props);
    assert.equal(
      nodes.find((n) => n.props['aria-label'] === 'Set 1 rir').props.value,
      '0',
    );
    assert.equal(
      nodes.filter((n) => n.props.inputMode === 'decimal').length,
      5,
    );
    for (const node of nodes.filter((n) => n.props.inputMode))
      assert.ok(node.props['aria-label']);
    nodes
      .find((n) => n.props['aria-label'] === 'Set 1 weight')
      .props.onChange({ target: { value: '91.25' } });
    nodes = render(props);
    nodes[0].props.onOpenChange(false);
    assert.equal(closes, 0);
    assert.ok(render(props).some((n) => n.props.role === 'alert'));
    const submit = () =>
      render(props)
        .find((n) => n.type === 'form')
        .props.onSubmit({ preventDefault() {} });
    submit();
    submit();
    assert.equal(saves, 1);
    render(props)[0].props.onOpenChange(false);
    assert.equal(closes, 0);
    assert.equal(
      render(props).find((n) => n.type === 'fieldset').props.disabled,
      true,
    );
    reject(Error('Synthetic network outage'));
    await new Promise((resolve) => setImmediate(resolve));
    nodes = render(props);
    assert.equal(
      nodes.find((n) => n.props['aria-label'] === 'Set 1 weight').props.value,
      '91.25',
    );
    assert.ok(
      nodes.some(
        (n) =>
          n.props.role === 'alert' &&
          n.props.children === 'Synthetic network outage',
      ),
    );
    props.onSave = async (_, fields) => {
      assert.equal(fields.set1Weight, 91.25);
      saves++;
    };
    submit();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(closes, 1);
    assert.equal(saves, 2);
  } finally {
    f.close();
  }
});

test('correction code stays lazy, covers earlier weeks, preserves selection/timers and leaves immutable archives alone', () => {
  const progress = readFileSync('app/progress-view.tsx', 'utf8');
  assert.match(progress, /lazy\(\(\) => import\('\.\/history-edit-dialog'\)\)/);
  assert.equal((progress.match(/onEdit=\{editHistory\}/g) ?? []).length, 2);
  assert.match(progress, /onEdit=\{onEdit\}/);
  const root = readFileSync('app/workout-app.tsx', 'utf8');
  const handler = root.slice(
    root.indexOf('const saveHistoryEdit:'),
    root.indexOf('async function undoLastSave'),
  );
  for (const unwanted of [
    'setActiveWeek(',
    'setActiveDay(',
    'advance(',
    'restTimerRef',
    'queueForLater(',
  ])
    assert.ok(!handler.includes(unwanted), unwanted);
  assert.match(handler, /hasPendingOutbox/);
  assert.match(handler, /exerciseDraft.dirty/);
  assert.match(handler, /mutationSequence.current\+\+/);
  assert.match(handler, /replaceWorkoutEntry/);
  assert.match(root, /key=\{`\$\{programmeId\}\|\$\{activePhase\}`\}/);
  assert.ok(
    !readFileSync('app/programme-manager.tsx', 'utf8').includes(
      'HistoryEditDialog',
    ),
  );
});

test('Progress renders a labeled edit action inside the correct week without nesting buttons or making unsynced records editable', () => {
  const f = routeFixture();
  try {
    const entry = seed(f);
    const Progress = f.load('app/progress-view.tsx').default;
    const routine = f.load('lib/routine.ts').routineForWeek(5);
    const props = {
      activeWeek: 6,
      activePhase: 1,
      activeRoutine: routine,
      phaseEntries: [entry],
      allEntries: [entry],
      entryIndex: {
        completedByExercise: new Map([['1|A|1', [entry]]]),
        completedByPhaseDay: new Map([['1|A', [entry]]]),
      },
      weeklySummaries: [],
      totalRows: 1,
      totalVolume: 1000,
      totalSessions: 1,
      totalRecords: 1,
      loadingImport: false,
      importingSheet: false,
      loading: false,
      syncingSheet: false,
      backupBusy: false,
      previewGoogleSheetImport() {},
      syncGoogleSheet() {},
      downloadBackup() {},
      onRestoreBackup() {},
      selectWeek() {},
      setView() {},
      onSaveHistory: async () => {},
      sheetAvailable: true,
    };
    const html = renderToString(createElement(Progress, props));
    assert.match(
      html,
      /aria-label="Edit Phase 1 Week 5 Day A Saved machine substitution"/,
    );
    assert.ok(html.includes('Edit saved exercise'));
    assert.doesNotMatch(
      html,
      /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/,
    );
    const offline = { ...entry, offlinePending: true };
    const blocked = renderToString(
      createElement(Progress, {
        ...props,
        entryIndex: {
          ...props.entryIndex,
          completedByExercise: new Map([['1|A|1', [offline]]]),
        },
      }),
    );
    assert.match(
      blocked,
      /aria-label="Edit Phase 1 Week 5 Day A Saved machine substitution"[^>]*disabled/,
    );
    assert.ok(
      blocked.includes('Reconnect and sync this record before editing.'),
    );
  } finally {
    f.close();
  }
});

test('Sheet transport preserves the completion calendar day and refuses undated historical records without any external request', async () => {
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
      Intl,
      Date,
      Number,
      AbortSignal,
      require: () => ({
        env: {
          GOOGLE_SHEETS_WEBHOOK_URL:
            'https://script.google.com/macros/s/synthetic-test/exec',
          GOOGLE_SHEETS_SYNC_TOKEN: 'synthetic-test-token',
        },
      }),
      fetch: async (_, request) => {
        requests.push(JSON.parse(request.body));
        return {
          ok: true,
          text: async () => JSON.stringify({ ok: true, synced: 1 }),
        };
      },
    },
  );
  const sync = module.exports.syncWorkoutEntries;
  const valid = await sync([
    {
      completed: true,
      completedAt: '2026-10-03T15:30:00Z',
      week: 5,
      day: 'A',
      exerciseOrder: 1,
    },
  ]);
  assert.equal(valid.ok, true);
  assert.equal(requests[0].entries[0].completedOn, '2026-10-04');
  assert.equal(requests[0].entries[0].completedAt, '2026-10-04T12:00:00.000Z');
  for (const date of [null, '', 'not-a-date']) {
    const blocked = await sync([{ completed: true, completedAt: date }]);
    assert.equal(blocked.ok, false);
    assert.match(blocked.message, /no original date/);
  }
  assert.equal(requests.length, 1);
});
