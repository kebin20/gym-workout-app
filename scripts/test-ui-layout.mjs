import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { routeFixture } from './route-test-harness.mjs';

// Structural/CSS regressions, not a substitute for real viewport/iPhone QA.
const source = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== 'object' || !tree.props) return [];
  return [tree, ...elements(tree.props.children)];
}

test('exercise history starts compact on mobile, remains expanded on desktop and exposes unique accessible controls', () => {
  const f = routeFixture();
  try {
    const Card = f.load('app/history-exercise-card.tsx').default;
    const html = renderToStaticMarkup(
      createElement(
        'div',
        null,
        ...[0, 1, 6].map((sessionCount) =>
          createElement(
            Card,
            {
              key: sessionCount,
              order: sessionCount + 1,
              displayName: 'LongCustomExerciseName'.repeat(5),
              description: '3 × 6–8 · Quads / glutes / core',
              sessionCount,
              desktop: false,
            },
            () => createElement('button', null, 'Edit saved exercise'),
          ),
        ),
      ),
    );
    assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 3);
    assert.equal((html.match(/class="hidden md:block"/g) ?? []).length, 3);
    assert.equal((html.match(/Edit saved exercise/g) ?? []).length, 0);
    const desktopHtml = renderToStaticMarkup(
      createElement(Card, {
        order: 1,
        displayName: 'Squat',
        description: 'Quads',
        sessionCount: 6,
        desktop: true,
        children: () => createElement('button', null, 'Edit saved exercise'),
      }),
    );
    assert.match(desktopHtml, /Edit saved exercise/);
    const ids = [...html.matchAll(/aria-controls="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, 3);
    for (const id of ids) assert.ok(html.includes(`id="${id}"`));
    assert.match(html, /No logged sessions yet/);
    assert.match(html, /1 saved session</);
    assert.match(html, /6 saved sessions/);
    assert.match(html, /min-h-11 w-full/);
    assert.match(html, /md:min-h-56/);
    assert.doesNotMatch(html, /flex min-h-56/);
    assert.match(html, /hidden items-start gap-3 md:flex/);
    assert.match(html, /overflow-wrap:anywhere/);
  } finally {
    f.close();
  }
  const css = source('app/globals.css');
  assert.match(
    css,
    /\.workout-history-card\s*\{[^}]*content-visibility: visible;/,
  );
  assert.match(
    css,
    /@media \(min-width: 768px\)\s*\{\s*\.workout-history-card\s*\{\s*content-visibility: auto;\s*contain-intrinsic-size: auto 22rem;/,
  );
});

test('deferred history retains week editing, earlier disclosures and adaptive-height wiring', () => {
  const progress = source('app/progress-view.tsx');
  assert.match(
    progress,
    /<HistoryExerciseCard[\s\S]*?sessionCount=\{exerciseEntries.length\}/,
  );
  assert.match(
    progress,
    /<HistoryWeekDisclosure[\s\S]*?defaultExpanded[\s\S]*?onEdit=\{editHistory\}/,
  );
  assert.match(
    progress,
    /<EarlierHistoryDisclosure[\s\S]*?onEdit=\{editHistory\}/,
  );
  // Existing adaptive height observes slide resizes when a card opens/closes.
  assert.match(
    source('components/ui/carousel.tsx'),
    /resizeObserver.observe\(selectedSlide\)/,
  );
});

test('shared dialogs constrain tall content, retain internal-scroll overrides and reserve a 44px close target', () => {
  const f = routeFixture();
  try {
    const { DialogContent, DialogTitle } = f.load('components/ui/dialog.tsx');
    const popup = (props) =>
      elements(DialogContent(props)).find(
        (node) => node.props['data-slot'] === 'dialog-content',
      );
    const defaults = popup({ children: 'Content' });
    assert.match(defaults.props.className, /max-h-\[calc\(100dvh-2rem\)\]/);
    assert.match(defaults.props.className, /overflow-y-auto/);
    assert.match(
      defaults.props.className,
      /\[&>\[data-slot=dialog-header\]\]:pr-14/,
    );
    const override = popup({
      children: 'Content',
      className: 'max-h-[820px] overflow-hidden p-0',
    });
    assert.match(override.props.className, /max-h-\[820px\]/);
    assert.match(override.props.className, /overflow-hidden/);
    assert.doesNotMatch(
      override.props.className,
      /overflow-y-auto|max-h-\[calc\(100dvh-2rem\)\]/,
    );
    const close = elements(DialogContent({ children: 'Content' })).find(
      (node) => node.props.render,
    );
    assert.match(close.props.render.props.className, /size-11/);
    assert.ok(
      !popup({ showCloseButton: false }).props.className.includes(
        'dialog-header',
      ),
    );
    const title = DialogTitle({ children: 'Long title' });
    assert.match(title.props.className, /leading-snug/);
    assert.match(title.props.className, /overflow-wrap:anywhere/);
  } finally {
    f.close();
  }
  const css = source('app/globals.css');
  assert.match(
    css,
    /:where\(main, \[data-slot='dialog-content'\]\) :where\(button, \[role='button'\]\)/,
  );
  assert.match(css, /min-height: 2\.75rem/);
  const dialogs = source('app/workout-session-dialogs.tsx');
  assert.match(dialogs, /sessionCelebrationPending \? 'pl-14'/);
  assert.match(dialogs, /<DialogHeader className="pl-14">/);
});

test('narrow Plan text has room, custom exercise names wrap and desktop actions stay below a growing list', () => {
  const css = source('app/globals.css');
  assert.match(
    css,
    /@media \(max-width: 480px\)\s*\{\s*\.beta-plan-intro\s*\{\s*min-height: auto;\s*padding: 1\.25rem;/,
  );
  assert.match(css, /\.beta-plan-art\s*\{\s*display: none;/);
  const f = routeFixture();
  try {
    const Plan = f.load('app/plan-view.tsx').default;
    const name = 'UserDefinedExerciseWithoutAnySpaces'.repeat(4);
    const html = renderToStaticMarkup(
      createElement(Plan, {
        activePhase: 1,
        activeDisplayWeek: 5,
        activeWeek: 5,
        sessionExercises: [
          {
            week: 5,
            day: 'A',
            exerciseOrder: 100,
            displayOrder: 7,
            name,
            targetSets: 3,
            repRange: '8–12',
            rest: '2 min',
            muscles: '',
            alternative: '',
            custom: true,
            skipped: false,
          },
        ],
        onChooseDay() {},
        onEditDay() {},
      }),
    );
    assert.ok(html.includes(name));
    assert.ok(html.includes('min-w-0 flex-1 [overflow-wrap:anywhere]'));
    assert.ok(html.includes('flex min-w-0 flex-1 flex-col gap-4'));
    assert.equal((html.match(/Start Day/g) ?? []).length, 3);
    assert.equal((html.match(/Edit Week 5/g) ?? []).length, 3);
  } finally {
    f.close();
  }
});

test('logger and history inputs align beneath wrapping labels without restoring oversized stacked controls', () => {
  for (const file of [
    'app/workout-set-card.tsx',
    'app/history-edit-dialog.tsx',
  ]) {
    const code = source(file);
    assert.match(
      code,
      /grid-cols-\[minmax\(0,1\.4fr\)_minmax\(0,1fr\)_minmax\(0,0\.8fr\)\] items-end/,
    );
    assert.match(code, /liftline-form-controls/);
  }
  const root = source('app/workout-app.tsx');
  assert.match(
    root,
    /beta-exercise-heading flex flex-col items-stretch[^"\n]*sm:flex-row sm:items-start/,
  );
  assert.match(
    root,
    /id="programme-tools-menu"[\s\S]*?max-h-\[calc\(100dvh-7rem-env\(safe-area-inset-top\)-env\(safe-area-inset-bottom\)\)\][^"\n]*overflow-y-auto/,
  );
  const timer = source('app/rest-timer.tsx');
  assert.match(
    timer,
    /grid grid-cols-1 items-center gap-3 sm:flex sm:flex-wrap sm:justify-between/,
  );
});

test('PDF controls have aligned mobile/desktop layouts and do not grow across the whole desktop panel', () => {
  const f = routeFixture();
  try {
    const Report = f.load('app/day-report-button.tsx').default;
    const html = renderToStaticMarkup(
      createElement(Report, {
        day: 'A',
        entries: [],
        loading: false,
        currentWeek: 6,
      }),
    );
    assert.ok(html.includes('data-day-report-controls=""'));
    assert.ok(html.includes('sm:max-w-xl'));
    assert.ok(html.includes('sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end'));
    assert.match(html, /<select[^>]*class="[^"]*w-full min-w-0/);
    assert.match(
      html,
      /<select[^>]*class="[^"]*appearance-none[^\"]*pl-3 pr-10/,
    );
    const chevron = html.match(
      /<svg\b[^>]*class="[^"]*lucide-chevron-down[^>]*>/,
    )?.[0];
    assert.ok(chevron);
    assert.match(chevron, /aria-hidden="true"/);
    assert.match(
      chevron,
      /pointer-events-none absolute right-3 top-1\/2 size-4 -translate-y-1\/2/,
    );
    assert.ok(html.includes('forced-colors:appearance-auto'));
    assert.ok(html.includes('forced-colors:hidden'));
    assert.ok(html.includes('aria-label="Day A PDF week range"'));
    assert.ok(html.includes('Download PDF'));
    const archive = renderToStaticMarkup(
      createElement(Report, { day: 'A', entries: [], loading: false }),
    );
    assert.ok(!archive.includes('<select'));
    assert.ok(!archive.includes('sm:grid-cols-'));
  } finally {
    f.close();
  }
  const progress = source('app/progress-view.tsx');
  assert.match(progress, /grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
  assert.match(
    progress,
    /min-w-0 flex-1 whitespace-pre-wrap \[overflow-wrap:anywhere\]/,
  );
});

test('Holiday, session editors and data dialogs handle safe areas and long dynamic text without changing values', () => {
  const holiday = source('app/holiday-workout.tsx');
  for (const inset of ['top', 'left', 'right', 'bottom'])
    assert.ok(holiday.includes(`env(safe-area-inset-${inset})`), inset);
  assert.ok(holiday.includes('min-h-dvh'));
  const editor = source('app/workout-session-dialogs.tsx');
  assert.match(
    editor,
    /grid-cols-1 gap-2 min-\[380px\]:grid-cols-2 sm:grid-cols-3/,
  );
  assert.match(editor, /min-\[380px\]:col-span-2 sm:col-span-1/);
  const backup = source('app/data-management-dialogs.tsx');
  assert.match(backup, /max-w-full[^"\n]*overflow-wrap:anywhere/);
  const archive = source('app/programme-manager.tsx');
  assert.match(
    archive,
    /whitespace-pre-wrap text-sm \[overflow-wrap:anywhere\]/,
  );
  assert.match(archive, /h-auto min-h-11 w-full whitespace-normal/);
});
