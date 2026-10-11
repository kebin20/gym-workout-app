import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { routeFixture } from './route-test-harness.mjs';

test('Liftline controls remove the small responsive font without replacing larger numeric text', () => {
  const fixture = routeFixture();
  try {
    const { Input, Textarea } = fixture.load(
      'components/liftline-form-controls.tsx',
    );
    for (const Control of [Input, Textarea]) {
      const html = renderToStaticMarkup(createElement(Control));
      assert.match(html, /\btext-base\b/);
      assert.match(html, /\bmd:text-base\b/);
      assert.doesNotMatch(html, /\bmd:text-sm\b/);
    }
    const large = renderToStaticMarkup(
      createElement(Input, {
        className: 'h-11 text-lg md:text-lg placeholder:text-placeholder',
      }),
    );
    assert.match(large, /\btext-lg\b/);
    assert.match(large, /\bmd:text-lg\b/);
    assert.doesNotMatch(large, /\bmd:text-sm\b/);
    assert.match(large, /placeholder:text-placeholder/);
  } finally {
    fixture.close();
  }
});

test('focus-safe controls preserve numeric zero, constraints and accessibility labels', () => {
  const fixture = routeFixture();
  try {
    const { Input, Textarea } = fixture.load(
      'components/liftline-form-controls.tsx',
    );
    const number = renderToStaticMarkup(
      createElement(Input, {
        type: 'number',
        inputMode: 'numeric',
        min: 0,
        max: 10,
        step: 1,
        value: 0,
        readOnly: true,
        'aria-label': 'Set effort',
        id: 'effort',
      }),
    );
    for (const attribute of [
      'type="number"',
      'inputMode="numeric"',
      'min="0"',
      'max="10"',
      'step="1"',
      'value="0"',
      'aria-label="Set effort"',
      'id="effort"',
    ])
      assert.ok(number.includes(attribute), attribute);
    const notes = renderToStaticMarkup(
      createElement(Textarea, {
        defaultValue: 'Keep this note',
        'aria-label': 'Notes',
        disabled: true,
      }),
    );
    assert.match(notes, /Keep this note/);
    assert.match(notes, /aria-label="Notes"/);
    assert.match(notes, /disabled/);
  } finally {
    fixture.close();
  }
});

test('all Liftline form surfaces use the shared typography and keep pinch zoom available', () => {
  for (const file of [
    'app/workout-app.tsx',
    'app/workout-session-dialogs.tsx',
    'app/holiday-workout.tsx',
    'app/training-tools-dialog.tsx',
  ]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /from '@\/components\/liftline-form-controls'/);
    assert.doesNotMatch(source, /from '@\/components\/ui\/(input|textarea)'/);
  }
  const css = readFileSync(
    new URL('../app/globals.css', import.meta.url),
    'utf8',
  );
  assert.ok(css.includes("@source '../components/liftline-form-controls.tsx'"));
  const layout = readFileSync(
    new URL('../app/layout.tsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    layout,
    /userScalable:\s*false|maximumScale:\s*1\b|user-scalable\s*=\s*no/,
  );
});
