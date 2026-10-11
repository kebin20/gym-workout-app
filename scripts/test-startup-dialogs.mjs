import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { routeFixture } from './route-test-harness.mjs';

test('the built dialogs exist on demand and are excluded from the startup manifest', async () => {
  const { default: graph } =
    await import('../dist/server/vinext-client-assets.js');
  const optional = graph.dynamicPreloads['app/workout-session-dialogs.tsx'];
  assert.ok(optional?.length);
  for (const asset of optional)
    assert.ok(existsSync(new URL('../dist/client/' + asset, import.meta.url)));
  const chunk = optional.find((asset) =>
    asset.includes('workout-session-dialogs-'),
  );
  assert.ok(chunk);
  const manifest = JSON.parse(
    readFileSync(
      new URL('../dist/client/startup-assets.json', import.meta.url),
      'utf8',
    ),
  );
  assert.ok(!manifest.assets.includes('/' + chunk));
});

function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== 'object' || !tree.props) return [];
  return [tree, ...elements(tree.props.children)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  return text(tree.props?.children);
}

test('lazy editor preserves edits, reordering, removal protection, reset and save guards', () => {
  const fixture = routeFixture();
  try {
    const { ProgramEditorDialog } = fixture.load(
      'app/workout-session-dialogs.tsx',
    );
    let draft = [
      {
        week: 5,
        day: 'A',
        exerciseOrder: 1,
        name: 'Squat',
        targetSets: 3,
        repRange: '6–8',
        rest: '2 min',
        custom: true,
        skipped: false,
        displayOrder: 1,
      },
      {
        week: 5,
        day: 'A',
        exerciseOrder: 2,
        name: 'Row',
        targetSets: 3,
        repRange: '8–10',
        rest: '2 min',
        custom: true,
        skipped: false,
        displayOrder: 2,
      },
    ];
    let opened = true;
    let saved = 0;
    const moves = [];
    const props = {
      programOpen: true,
      programSaving: false,
      activeWeek: 5,
      activeDay: 'A',
      activeDisplayWeek: 5,
      entries: [{ week: 5, day: 'A', exerciseOrder: 1, completed: true }],
      setProgramOpen: (value) => {
        opened = value;
      },
      setProgramDraft: (value) => {
        draft = typeof value === 'function' ? value(draft) : value;
      },
      moveProgramExercise: (...args) => moves.push(args),
      addProgramExercise() {},
      saveProgram: () => saved++,
    };
    const render = (extra = {}) =>
      ProgramEditorDialog({ ...props, programDraft: draft, ...extra });
    const tree = render();
    const all = elements(tree);
    all
      .find((el) => el.props['aria-label'] === 'Exercise 1 name')
      .props.onChange({ target: { value: 'Hack squat' } });
    assert.equal(draft[0].name, 'Hack squat');
    all
      .find((el) => el.props.id === 'program-sets-1')
      .props.onChange({ target: { value: '9' } });
    assert.equal(draft[0].targetSets, 5);
    all.find((el) => el.props.onCheckedChange).props.onCheckedChange(true);
    assert.equal(draft[0].skipped, true);
    assert.equal(
      all.find((el) => el.props['aria-label'] === 'Remove Squat').props
        .disabled,
      true,
    );
    all.find((el) => el.props['aria-label'] === 'Move Row up').props.onClick();
    assert.deepEqual(moves, [[1, -1]]);
    all.find((el) => el.props['aria-label'] === 'Remove Row').props.onClick();
    assert.equal(draft.length, 1);
    elements(render())
      .find((el) => text(el).trim() === 'Reset Day A' && el.props.onClick)
      .props.onClick();
    assert.ok(draft.length > 1);
    elements(render())
      .find((el) => text(el).trim() === 'Save session' && el.props.onClick)
      .props.onClick();
    assert.equal(saved, 1);
    render({ programSaving: true }).props.onOpenChange(false);
    assert.equal(opened, true);
    const busySave = elements(render({ programSaving: true })).find(
      (el) => text(el).trim() === 'Save session' && el.props.onClick,
    );
    assert.equal(busySave.props.disabled, true);
    render().props.onOpenChange(false);
    assert.equal(opened, false);
  } finally {
    fixture.close();
  }
});

test('lazy recap keeps every set and continuation label without sorting the caller history in place', () => {
  const fixture = routeFixture();
  try {
    const { SessionSummaryDialog } = fixture.load(
      'app/workout-session-dialogs.tsx',
    );
    const entries = [
      { exerciseOrder: 2, exercise: 'Row', set1Reps: 10, set1Weight: 40 },
      {
        exerciseOrder: 1,
        exercise: 'Squat',
        set1Reps: 8,
        set1Weight: 80,
        set5Reps: 6,
        set5Weight: 90,
      },
    ];
    let closed = 0;
    const props = {
      sessionSummaryOpen: true,
      setSessionSummaryOpen() {},
      closeSessionSummary: () => closed++,
      sessionCelebrationPending: true,
      activeDay: 'A',
      activePhase: 1,
      activeDisplayWeek: 5,
      activeWeek: 5,
      phaseTwoUnlocked: false,
      currentSessionEntries: entries,
      currentSessionSets: 3,
      currentSessionVolume: 1580,
      currentSessionRecords: 1,
      sessionDurationMinutes: 20,
      previousSessionVolume: 1000,
    };
    for (const [extra, label] of [
      [{}, 'Continue to Day B'],
      [{ activeDay: 'B' }, 'Continue to Day C'],
      [
        { activeDay: 'C', activeWeek: 12, phaseTwoUnlocked: true },
        'Start Phase 2',
      ],
      [{ activeDay: 'C', activeWeek: 24 }, 'Finish programme'],
      [{ sessionCelebrationPending: false }, 'Done'],
    ]) {
      const tree = SessionSummaryDialog({ ...props, ...extra });
      const copy = text(tree);
      assert.ok(copy.includes('90 kg × 6'));
      assert.ok(copy.includes('+58% volume'));
      assert.deepEqual(
        entries.map((entry) => entry.exerciseOrder),
        [2, 1],
      );
      elements(tree)
        .find((el) => text(el) === label && el.props.onClick)
        .props.onClick();
      tree.props.onOpenChange(false);
    }
    assert.equal(closed, 10);
  } finally {
    fixture.close();
  }
});

test('lazy personal-record dialog preserves the record details and its dismissal callback', () => {
  const fixture = routeFixture();
  try {
    const { PersonalRecordDialog } = fixture.load(
      'app/workout-session-dialogs.tsx',
    );
    let closed = 0;
    const tree = PersonalRecordDialog({
      personalRecordOpen: true,
      setPersonalRecordOpen() {},
      closePersonalRecord: () => closed++,
      exerciseName: 'Squat',
      personalRecords: ['Top weight: 90 kg'],
    });
    assert.ok(text(tree).includes('A stronger entry for Squat.'));
    assert.ok(text(tree).includes('Top weight: 90 kg'));
    elements(tree)
      .find((el) => text(el) === 'Keep going' && el.props.onClick)
      .props.onClick();
    tree.props.onOpenChange(false);
    assert.equal(closed, 2);
  } finally {
    fixture.close();
  }
});

test('outbox rendering reads no storage and explicit refreshes expose the latest durable snapshot', () => {
  const states = [];
  let cursor = 0;
  const exports = {};
  const source = ts.transpileModule(
    readFileSync(
      new URL('../app/use-outbox-snapshot.ts', import.meta.url),
      'utf8',
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    require: () => ({
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [
          states[index],
          (next) => {
            states[index] = next;
          },
        ];
      },
      useCallback(callback, dependencies) {
        const index = cursor++;
        const previous = states[index];
        if (
          !previous ||
          dependencies.some((dep, i) => dep !== previous.dependencies[i])
        )
          states[index] = { callback, dependencies };
        return states[index].callback;
      },
    }),
  });
  let reads = 0;
  let durable = [{ key: 'first', blocked: 'Review this workout' }];
  const read = () => {
    reads++;
    return durable.slice();
  };
  const render = () => {
    cursor = 0;
    return exports.useOutboxSnapshot(read);
  };
  const initial = render();
  render();
  assert.equal(reads, 0);
  const snapshot = initial.refresh();
  const loaded = render();
  assert.equal(reads, 1);
  assert.equal(loaded.pending, snapshot);
  assert.equal(loaded.refresh, initial.refresh);
  render();
  render();
  assert.equal(reads, 1);
  durable = [{ key: 'newer', revision: '2' }];
  loaded.refresh();
  assert.deepEqual(render().pending, durable);
  durable = [];
  loaded.refresh();
  assert.equal(render().pending.length, 0);
  assert.equal(reads, 3);
});
