import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { routeFixture } from './route-test-harness.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const source = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('production graph keeps menu internals outside both initial Progress and Today', async () => {
  const { default: graph } = await import(
    pathToFileURL(resolve('dist/server/vinext-client-assets.js')).href
  );
  const normalize = (path) => '/' + path.replace(/^\//, '');
  const progress = new Set(
    graph.dynamicPreloads['app/progress-view.tsx'].map(normalize),
  );
  const popup =
    graph.dynamicPreloads['app/progress-data-menu-popup.tsx']?.map(normalize);
  assert.ok(
    popup?.length,
    'intent-loaded Data menu has a separate built graph',
  );
  const entry = popup.find((path) =>
    /\/progress-data-menu-popup-[^/]+\.js$/.test(path),
  );
  assert.ok(entry);
  assert.equal(progress.has(entry), false);
  const startup = JSON.parse(source('dist/client/startup-assets.json')).assets;
  assert.equal(startup.includes(entry), false);
  assert.ok(
    popup.some((path) => !progress.has(path) && !startup.includes(path)),
    'menu-only infrastructure is deferred',
  );
});
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== 'object' || !tree.props) return [];
  return [tree, ...elements(tree.props.children)];
}
function props(overrides = {}) {
  return {
    activePhase: 1,
    loadingImport: false,
    importingSheet: false,
    loading: false,
    syncingSheet: false,
    backupBusy: false,
    previewGoogleSheetImport() {},
    syncGoogleSheet() {},
    downloadBackup() {},
    onRestoreBackup() {},
    ...overrides,
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

// Exercise the real component callbacks and hook state without a browser or
// network. Base UI still owns popup behavior; these tests cover our lazy seam.
function wrapperHarness() {
  const state = [],
    refs = [],
    effects = [],
    windowEvents = new Map(),
    documentEvents = new Map();
  let stateIndex, refIndex, effectIndex;
  let requests = 0,
    resolveImport,
    rejectImport,
    popupActions = 0;
  const document = {
    activeElement: null,
    visibilityState: 'visible',
    addEventListener: (name, fn) => documentEvents.set(name, fn),
    removeEventListener: (name) => documentEvents.delete(name),
  };
  const button = {
    focusCount: 0,
    focus() {
      this.focusCount++;
      document.activeElement = this;
    },
  };
  function Popup() {
    popupActions++;
    return null;
  }
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(source('app/progress-data-menu.tsx'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      document,
      window: {
        addEventListener: (name, fn) => windowEvents.set(name, fn),
        removeEventListener: (name) => windowEvents.delete(name),
      },
      require(name) {
        if (name === 'react')
          return {
            useId: () => 'data-tools',
            useRef(initial) {
              const slot = refIndex++;
              refs[slot] ??= { current: initial };
              return refs[slot];
            },
            useState(initial) {
              const slot = stateIndex++;
              if (!(slot in state))
                state[slot] =
                  typeof initial === 'function' ? initial() : initial;
              return [
                state[slot],
                (update) => {
                  state[slot] =
                    typeof update === 'function' ? update(state[slot]) : update;
                },
              ];
            },
            useEffect(effect) {
              const slot = effectIndex++;
              if (!(slot in effects)) effects[slot] = { effect };
            },
          };
        if (name === './progress-data-menu-popup') {
          requests++;
          return new Promise((resolve, reject) => {
            resolveImport = () => resolve({ default: Popup });
            rejectImport = reject;
          });
        }
        if (name === '@/components/ui/button') return { Button: 'button' };
        return require(name);
      },
    },
  );
  function render(values = props()) {
    stateIndex = refIndex = effectIndex = 0;
    const tree = elements(module.exports.default(values));
    const trigger = tree.find((node) => node.props['aria-haspopup'] === 'menu');
    trigger.props.ref.current = button;
    for (const effect of effects) {
      if (!effect.ran) {
        effect.ran = true;
        effect.cleanup = effect.effect();
      }
    }
    return { tree, trigger, popup: tree.find((node) => node.type === Popup) };
  }
  return {
    render,
    button,
    document,
    windowEvents,
    documentEvents,
    resolve: () => resolveImport(),
    reject: () => rejectImport(new Error('Synthetic chunk failure')),
    requests: () => requests,
    popupActions: () => popupActions,
    unmount() {
      for (const effect of effects) effect.cleanup?.();
    },
  };
}

test('Data trigger is available immediately and does not import menu infrastructure on mount or SSR', () => {
  const h = wrapperHarness();
  const { trigger, popup } = h.render();
  assert.equal(h.requests(), 0);
  assert.equal(popup, undefined);
  assert.equal(trigger.props['aria-haspopup'], 'menu');
  assert.equal(trigger.props['aria-expanded'], false);
  assert.equal(trigger.props['aria-controls'], undefined);
  assert.match(trigger.props.className, /h-11/);
  const f = routeFixture();
  try {
    const Component = f.load('app/progress-data-menu.tsx').default;
    const html = renderToStaticMarkup(
      createElement(Component, props({ backupBusy: true })),
    );
    assert.match(html, /aria-haspopup="menu"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /Preparing backup…/);
    assert.doesNotMatch(html, /role="menu"|Import from Google Sheet/);
  } finally {
    f.close();
  }
  const eager = source('app/progress-data-menu.tsx');
  assert.match(eager, /import\('\.\/progress-data-menu-popup'\)/);
  assert.doesNotMatch(
    eager,
    /from ['"](?:@base-ui|@\/components\/ui\/dropdown-menu)/,
  );
  h.unmount();
});

test('pointer/focus intent preloads once without opening or invoking any action', async () => {
  const h = wrapperHarness();
  let view = h.render();
  const originalRef = view.trigger.props.ref;
  view.trigger.props.onPointerEnter();
  view.trigger.props.onFocus();
  await settle();
  assert.equal(h.requests(), 1);
  h.resolve();
  await settle();
  view = h.render();
  assert.equal(view.popup.props.open, false);
  assert.equal(view.trigger.props['aria-expanded'], false);
  assert.equal(view.trigger.props.ref, originalRef);
  assert.equal(h.popupActions(), 0);
  h.unmount();
});

test('first activation loads then opens with stable trigger/ARIA; native Enter/Space clicks toggle and arrows choose an end', async () => {
  const h = wrapperHarness();
  let view = h.render();
  const originalType = view.trigger.type,
    originalRef = view.trigger.props.ref;
  view.trigger.props.onFocus(); // The loading feedback must also work after a prefetch began.
  view.trigger.props.onClick();
  view = h.render();
  assert.equal(view.trigger.props['aria-busy'], true);
  assert.ok(
    view.tree.some(
      (node) =>
        node.props.role === 'status' &&
        node.props.children === 'Loading data tools…',
    ),
  );
  await settle();
  h.resolve();
  await settle();
  view = h.render();
  assert.equal(view.popup.props.open, true);
  assert.equal(view.trigger.props['aria-expanded'], true);
  assert.equal(view.trigger.props['aria-controls'], view.popup.props.menuId);
  assert.equal(view.trigger.props.id, view.popup.props.triggerId);
  assert.equal(view.trigger.type, originalType);
  assert.equal(view.trigger.props.ref, originalRef);
  assert.equal(view.popup.props.triggerRef.current, h.button);
  assert.equal(h.document.activeElement, h.button);
  view.trigger.props.onClick();
  view = h.render();
  assert.equal(view.popup.props.open, false);
  // Native button Enter/Space dispatch click; don't double-toggle on keydown.
  for (const key of ['Enter', ' ']) {
    view.trigger.props.onKeyDown({
      key,
      preventDefault() {
        assert.fail('Native activation was intercepted');
      },
    });
    view.trigger.props.onClick();
    view = h.render();
    assert.equal(view.popup.props.open, true);
    view.popup.props.onOpenChange(false);
    view = h.render();
  }
  for (const [key, initialItem] of [
    ['ArrowDown', 'first'],
    ['ArrowUp', 'last'],
  ]) {
    let prevented = false;
    view.trigger.props.onKeyDown({
      key,
      preventDefault() {
        prevented = true;
      },
    });
    view = h.render();
    assert.equal(prevented, true);
    assert.equal(view.popup.props.initialItem, initialItem);
    assert.equal(view.popup.props.open, true);
    view.popup.props.onOpenChange(false);
    view = h.render();
  }
  assert.equal(h.requests(), 1);
  h.unmount();
});

test('late chunk completion cannot reopen after trigger blur, Escape, tab hide, window blur or unmount', async () => {
  for (const cancellation of [
    'blur',
    'escape',
    'hidden',
    'window-blur',
    'unmount',
  ]) {
    const h = wrapperHarness();
    let view = h.render();
    view.trigger.props.onClick();
    await settle();
    if (cancellation === 'blur') {
      h.document.activeElement = {};
      view.trigger.props.onBlur();
    } else if (cancellation === 'escape') {
      view.trigger.props.onKeyDown({ key: 'Escape', preventDefault() {} });
    } else if (cancellation === 'hidden') {
      h.document.visibilityState = 'hidden';
      h.documentEvents.get('visibilitychange')();
      h.document.visibilityState = 'visible';
    } else if (cancellation === 'window-blur') h.windowEvents.get('blur')();
    else h.unmount();
    h.resolve();
    await settle();
    view = h.render();
    assert.equal(view.trigger.props['aria-expanded'], false, cancellation);
    assert.equal(view.popup?.props.open ?? false, false, cancellation);
    assert.equal(h.popupActions(), 0);
    if (cancellation !== 'unmount') h.unmount();
  }
});

test('failed intent is silent; failed activation explains retry and retry opens without running actions', async () => {
  const h = wrapperHarness();
  let view = h.render();
  view.trigger.props.onFocus();
  await settle();
  h.reject();
  await settle();
  view = h.render();
  assert.equal(view.trigger.props['aria-describedby'], undefined);
  view.trigger.props.onClick();
  await settle();
  h.reject();
  await settle();
  view = h.render();
  assert.equal(view.trigger.props['aria-expanded'], false);
  assert.equal(view.trigger.props['aria-describedby'], 'data-tools-status');
  assert.ok(
    view.tree.some((node) => /couldn’t load/.test(node.props.children ?? '')),
  );
  view.trigger.props.onClick();
  await settle();
  h.resolve();
  await settle();
  view = h.render();
  assert.equal(h.requests(), 3);
  assert.equal(view.popup.props.open, true);
  assert.equal(view.trigger.props['aria-describedby'], undefined);
  assert.equal(h.popupActions(), 0);
  h.unmount();
});

function popupHarness(values = {}) {
  const f = routeFixture();
  let index = 0;
  const refs = [];
  const document = { activeElement: null, body: {} };
  const focusLog = [],
    changes = [];
  const trigger = {
    contains: (target) => target === trigger,
    focus: () => {
      focusLog.push('trigger');
      document.activeElement = trigger;
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(source('app/progress-data-menu-popup.tsx'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      document,
      require(name) {
        if (name === 'react')
          return {
            useRef(initial) {
              refs[index] ??= { current: initial };
              return refs[index++];
            },
          };
        if (name.startsWith('@/')) return f.load(name.slice(2) + '.tsx');
        return require(name);
      },
    },
  );
  const base = props({
    open: true,
    menuId: 'data-menu',
    triggerId: 'data-trigger',
    triggerRef: { current: trigger },
    initialItem: 'first',
    onOpenChange: (value) => changes.push(value),
    ...values,
  });
  function render(overrides = {}) {
    index = 0;
    return elements(module.exports.default({ ...base, ...overrides }));
  }
  return {
    render,
    trigger,
    document,
    focusLog,
    changes,
    close: () => f.close(),
  };
}

test('lazy popup uses supported Base UI anchor, keyboard/focus management and trigger-click dismissal guard', () => {
  const h = popupHarness();
  try {
    let tree = h.render();
    const root = tree[0];
    const positioner = tree.find((node) => node.props.anchor);
    const popup = tree.find((node) => node.props.id === 'data-menu');
    assert.equal(root.props.modal, false);
    assert.equal(positioner.props.anchor.current, h.trigger);
    assert.equal(popup.props['aria-labelledby'], 'data-trigger');
    const first = { focus: () => h.focusLog.push('first') },
      last = { focus: () => h.focusLog.push('last') };
    const inner = {};
    popup.props.ref.current = {
      querySelectorAll: () => [first, last],
      contains: (element) => element === inner,
    };
    root.props.onOpenChangeComplete(true);
    tree = h.render({ initialItem: 'last' });
    tree[0].props.onOpenChangeComplete(true);
    assert.deepEqual(h.focusLog, ['first', 'last']);
    // Fast keyboard navigation or an outside click during the open animation
    // must not get reset by our first/last-item initialization afterward.
    for (const active of [inner, { name: 'outside input' }]) {
      h.document.activeElement = active;
      root.props.onOpenChangeComplete(true);
      assert.deepEqual(h.focusLog, ['first', 'last']);
    }
    let cancelled = false;
    root.props.onOpenChange(false, {
      reason: 'outside-press',
      event: { target: h.trigger },
      cancel() {
        cancelled = true;
      },
    });
    assert.equal(cancelled, true);
    assert.deepEqual(h.changes, []);
    root.props.onOpenChange(false, {
      reason: 'escape-key',
      event: {},
      cancel() {},
    });
    root.props.onOpenChange(false, {
      reason: 'outside-press',
      event: { target: {} },
      cancel() {},
    });
    assert.deepEqual(h.changes, [false, false]);
    for (const active of [inner, h.trigger, h.document.body]) {
      h.document.activeElement = active;
      assert.equal(popup.props.finalFocus(), h.trigger);
    }
    h.document.activeElement = { name: 'New dialog or outside input' };
    assert.equal(popup.props.finalFocus(), false);
    // A pending old open-animation callback must not focus a closed popup.
    h.render({ open: false })[0].props.onOpenChangeComplete(true);
    assert.deepEqual(h.focusLog, ['first', 'last']);
  } finally {
    h.close();
  }
});

test('all Data actions, optional visibility and original disabled states survive lazy loading; action focus cannot steal a new dialog', () => {
  const actions = [
    ['Import from Google Sheet', 'previewGoogleSheetImport'],
    ['Send to Google Sheet', 'syncGoogleSheet'],
    ['Download backup', 'downloadBackup'],
    ['Restore backup', 'onRestoreBackup'],
    ['Export device recovery', 'onDeviceRecovery'],
    ['Programme history & restart', 'onProgrammes'],
    ['Startup details', 'onStartupDetails'],
  ];
  const called = [],
    dialog = { name: 'opened-dialog' };
  const h = popupHarness(
    Object.fromEntries(
      actions.map(([label, name]) => [
        name,
        () => {
          called.push(label);
          h.document.activeElement = dialog;
        },
      ]),
    ),
  );
  const text = (node) =>
    elements(node)
      .flatMap((child) =>
        Array.isArray(child.props.children)
          ? child.props.children
          : [child.props.children],
      )
      .filter((value) => typeof value === 'string')
      .join('');
  const items = (tree) =>
    tree.filter(
      (node) => node.props.onClick && node.props.className === 'min-h-11 px-3',
    );
  try {
    for (const [label] of actions) {
      const tree = h.render();
      tree[0].props.onOpenChangeComplete(true);
      const item = items(tree).find((node) => text(node).includes(label));
      assert.ok(item, label);
      item.props.onClick();
      assert.equal(h.changes.at(-1), false);
      assert.equal(h.focusLog.at(-1), 'trigger');
      assert.equal(h.document.activeElement, dialog);
      const popup = tree.find((node) => node.props.id === 'data-menu');
      assert.equal(popup.props.finalFocus(), false);
    }
    assert.deepEqual(
      called,
      actions.map(([label]) => label),
    );
    for (const overrides of [{ activePhase: 2 }, { sheetAvailable: false }]) {
      const labels = items(h.render(overrides)).map(text).join(' ');
      assert.doesNotMatch(labels, /Google Sheet/);
      assert.match(labels, /Download backup/);
    }
    const byLabel = (overrides, label) =>
      items(h.render(overrides)).find((node) => text(node).includes(label));
    for (const flag of ['loadingImport', 'importingSheet', 'loading'])
      assert.equal(
        byLabel({ [flag]: true }, 'Import from Google Sheet').props.disabled,
        true,
      );
    for (const flag of ['syncingSheet', 'loading'])
      assert.equal(
        byLabel({ [flag]: true }, 'Send to Google Sheet').props.disabled,
        true,
      );
    for (const label of ['Download backup', 'Restore backup'])
      for (const flag of ['backupBusy', 'loading'])
        assert.equal(byLabel({ [flag]: true }, label).props.disabled, true);
  } finally {
    h.close();
  }
});

test('business operation status remains announced while menu tools load', () => {
  for (const [flag, expected] of [
    ['loadingImport', 'Checking Google Sheet…'],
    ['importingSheet', 'Importing Google Sheet…'],
    ['syncingSheet', 'Sending to Google Sheet…'],
    ['backupBusy', 'Preparing backup…'],
  ]) {
    const h = wrapperHarness();
    h.render().trigger.props.onClick();
    const tree = h.render(props({ [flag]: true })).tree;
    assert.ok(
      tree.some(
        (node) =>
          node.props.role === 'status' && node.props.children === expected,
      ),
      flag,
    );
    h.unmount();
  }
});
