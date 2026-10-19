import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { routeFixture } from './route-test-harness.mjs';

const require = createRequire(import.meta.url);
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== 'object' || !tree.props) return [];
  return [tree, ...elements(tree.props.children)];
}
const same = (a, b) =>
  a?.length === b?.length && a.every((v, i) => Object.is(v, b[i]));

// A small hook-state runner invokes the actual component/hook code and effects.
// It checks deferred factory calls and lifecycle subscriptions, not CSS geometry.
function harness(file, { window, useSyncExternalStore } = {}) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const react = {
    lazy: () => () => null,
    useId: () => 'stable-history-id',
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) {
        slots[index] = {
          value: typeof initial === 'function' ? initial() : initial,
        };
        slots[index].set = (update) => {
          slots[index].value =
            typeof update === 'function' ? update(slots[index].value) : update;
        };
      }
      return [slots[index].value, slots[index].set];
    },
    useMemo(factory, dependencies) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].dependencies, dependencies))
        slots[index] = { value: factory(), dependencies };
      return slots[index].value;
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].dependencies, dependencies)) {
        effects.push(() => {
          slots[index]?.cleanup?.();
          slots[index] = { dependencies, cleanup: effect() };
        });
      }
    },
    useSyncExternalStore,
  };
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      window,
      require(name) {
        if (name === 'react') return react;
        if (name === 'react/jsx-runtime' || name === 'lucide-react')
          return require(name);
        if (name === '@/lib/routine') return { days: ['A', 'B', 'C'] };
        return {};
      },
    },
  );
  return {
    render(name = 'default', props) {
      cursor = 0;
      effects = [];
      const result = module.exports[name](props);
      for (const effect of effects) effect();
      return result;
    },
    unmount() {
      for (const slot of slots) slot?.cleanup?.();
    },
  };
}

const cardProps = (children, desktop = false) => ({
  order: 1,
  displayName: 'Squat',
  description: '3 × 6–8 · Quads',
  sessionCount: 6,
  desktop,
  children,
});
const toggle = (tree) => elements(tree).find((n) => n.props['aria-controls']);
const body = (tree) =>
  elements(tree).find((n) => n.props.id === 'stable-history-id');

test('never-opened mobile history does not evaluate its body; opened cards retain identical children across collapse and resize', () => {
  const first = harness('app/history-exercise-card.tsx');
  const second = harness('app/history-exercise-card.tsx');
  let calls = 0;
  let edits = 0;
  const child = createElement(
    'button',
    { onClick: () => edits++ },
    'Edit saved exercise',
  );
  const props = Object.freeze(
    cardProps(() => {
      calls++;
      return child;
    }),
  );
  let tree = first.render('default', props);
  assert.equal(calls, 0);
  assert.equal(body(tree).props.children, null);
  assert.equal(toggle(tree).props['aria-expanded'], false);
  toggle(tree).props.onClick();
  tree = first.render('default', props);
  assert.equal(calls, 1);
  assert.equal(toggle(tree).props['aria-expanded'], true);
  assert.equal(body(tree).props.children, child);
  child.props.onClick();
  assert.equal(edits, 1);
  toggle(tree).props.onClick();
  tree = first.render('default', props);
  assert.equal(body(tree).props.className, 'hidden md:block');
  assert.equal(body(tree).props.children, child);
  assert.equal(
    calls,
    1,
    'collapse does not rebuild or unmount week disclosures',
  );
  first.render('default', { ...props, desktop: true });
  tree = first.render('default', props);
  assert.equal(body(tree).props.children, child);
  assert.equal(calls, 1);
  assert.equal(
    toggle(second.render('default', props)).props['aria-expanded'],
    false,
  );
  assert.equal(calls, 1, 'another unopened card is independent');
  assert.equal(props.sessionCount, 6);
  assert.equal(edits, 1);
});

test('desktop first visit populates history and retains it when resized to collapsed mobile', () => {
  const f = harness('app/history-exercise-card.tsx');
  let calls = 0;
  const child = createElement('p', null, 'Week 6');
  const renderBody = () => {
    calls++;
    return child;
  };
  let tree = f.render('default', cardProps(renderBody, true));
  assert.equal(calls, 1);
  assert.equal(body(tree).props.children, child);
  tree = f.render('default', cardProps(renderBody, false));
  assert.equal(body(tree).props.children, child);
  assert.equal(body(tree).props.className, 'hidden md:block');
  assert.equal(calls, 1);
});

test('already-mounted details update when records change without resetting card expansion', () => {
  const f = harness('app/history-exercise-card.tsx');
  const first = cardProps(() => createElement('p', null, '50 kg'));
  toggle(f.render('default', first)).props.onClick();
  f.render('default', first);
  const tree = f.render(
    'default',
    cardProps(() => createElement('p', null, '70 kg')),
  );
  assert.equal(toggle(tree).props['aria-expanded'], true);
  assert.equal(body(tree).props.children.props.children, '70 kg');
});

test('desktop detection uses hydration-safe server state and cleans its media-query listener', () => {
  let desktop = true;
  let subscription;
  const listeners = new Set();
  const query = {
    get matches() {
      return desktop;
    },
    addEventListener(event, listener) {
      assert.equal(event, 'change');
      listeners.add(listener);
    },
    removeEventListener(event, listener) {
      assert.equal(event, 'change');
      listeners.delete(listener);
    },
  };
  const f = harness('app/history-exercise-card.tsx', {
    window: {
      matchMedia(value) {
        assert.equal(value, '(min-width: 768px)');
        return query;
      },
    },
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
      subscription = { subscribe, getSnapshot, getServerSnapshot };
      return getServerSnapshot();
    },
  });
  assert.equal(
    f.render('useHistoryDesktopLayout'),
    false,
    'SSR and first hydration state are mobile regardless of client width',
  );
  assert.equal(subscription.getSnapshot(), true);
  let changes = 0;
  const unsubscribe = subscription.subscribe(() => changes++);
  assert.equal(listeners.size, 1);
  desktop = false;
  for (const listener of listeners) listener();
  assert.equal(changes, 1);
  assert.equal(subscription.getSnapshot(), false);
  assert.equal(subscription.getServerSnapshot(), false);
  unsubscribe();
  assert.equal(listeners.size, 0);
});

test('day grids mount before incoming swipes settle, persist on revisits/reInit, and clean every listener', () => {
  const f = harness('app/progress-view.tsx');
  let selected = 0;
  let visible = [0];
  const listeners = new Map();
  const api = {
    selectedScrollSnap: () => selected,
    slidesInView: () => visible,
    on(event, listener) {
      listeners.set(event, listener);
    },
    off(event, listener) {
      if (listeners.get(event) === listener) listeners.delete(event);
    },
  };
  const snapshot = () => f.render('useHistoryDayMounts');
  let [visited, setApi] = snapshot();
  assert.deepEqual([...visited], ['A']);
  setApi(api);
  snapshot();
  assert.equal(listeners.size, 3);
  visible = [0, 1];
  listeners.get('slidesInView')();
  [visited] = snapshot();
  assert.deepEqual(
    [...visited],
    ['A', 'B'],
    'B mounts during the drag, before selection changes',
  );
  selected = 1;
  visible = [1];
  listeners.get('select')();
  const [unchanged] = snapshot();
  assert.equal(unchanged, visited, 'revisits avoid redundant state updates');
  selected = 0;
  visible = [0];
  listeners.get('reInit')();
  [visited] = snapshot();
  assert.deepEqual([...visited], ['A', 'B']);
  selected = 2;
  visible = [2, 99];
  listeners.get('select')();
  [visited] = snapshot();
  assert.deepEqual([...visited], ['A', 'B', 'C']);
  f.unmount();
  assert.equal(listeners.size, 0);
});

test('Progress SSR keeps every day header, export and carousel navigation but only mounts first-day compact cards', () => {
  const f = routeFixture();
  try {
    const Progress = f.load('app/progress-view.tsx').default;
    const routine = f.load('lib/routine.ts').routineForWeek(6);
    const props = {
      activeWeek: 6,
      activePhase: 1,
      activeRoutine: routine,
      phaseEntries: [],
      allEntries: [],
      entryIndex: {
        completedByExercise: new Map(),
        completedByPhaseDay: new Map(),
      },
      weeklySummaries: [],
      totalRows: 0,
      totalVolume: 0,
      totalSessions: 0,
      totalRecords: 0,
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
    };
    const html = renderToStaticMarkup(createElement(Progress, props));
    assert.equal(
      (html.match(/<article\b/g) ?? []).length,
      routine.filter((item) => item.day === 'A').length,
    );
    assert.equal(
      (html.match(/history" aria-expanded="false"/g) ?? []).length,
      routine.filter((item) => item.day === 'A').length,
    );
    for (const day of ['A', 'B', 'C'])
      assert.ok(
        html.includes(`Download Day ${day} PDF report`),
        `Day ${day} export remains available`,
      );
    assert.ok(html.includes('Previous training day'));
    assert.ok(html.includes('Next training day'));
    assert.equal(
      (html.match(/No logged sessions yet\./g) ?? []).length,
      0,
      'empty-state bodies are deferred too',
    );
    assert.ok(!html.includes('Edit saved exercise'));
    const carousel = readFileSync('components/ui/carousel.tsx', 'utf8');
    assert.match(carousel, /resizeObserver.observe\(selectedSlide\)/);
  } finally {
    f.close();
  }
});
