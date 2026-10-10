import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { routeFixture } from './route-test-harness.mjs';

const props = {
  number: 1,
  set: { weight: '62.5', reps: '10', rir: '0', done: false },
  timed: false,
  onChange() {},
  onStep() {},
  onToggleDone() {},
};

test('compact cards put three labeled inputs together and hide adjustment buttons by default', () => {
  const fixture = routeFixture();
  try {
    const { WorkoutSetCard } = fixture.load('app/workout-set-card.tsx');
    const html = renderToStaticMarkup(createElement(WorkoutSetCard, props));
    assert.match(html, /Set 1/);
    assert.equal((html.match(/<input\b/g) ?? []).length, 3);
    assert.match(
      html,
      /grid-cols-\[minmax\(0,1\.4fr\)_minmax\(0,1fr\)_minmax\(0,0\.8fr\)\]/,
    );
    assert.match(html, /aria-label="Adjust set 1"[^>]*aria-expanded="false"/);
    assert.match(
      html,
      /aria-label="Mark done, set 1"[^>]*aria-pressed="false"/,
    );
    assert.match(html, /Mark done/);
    assert.doesNotMatch(html, /Decrease set|Increase set/);
    assert.match(html, /value="62\.5"/);
    assert.match(html, /value="10"/);
    assert.match(html, /id="set-1-rir"[^>]*min="0"[^>]*max="10"[^>]*value="0"/);
    assert.equal((html.match(/md:text-lg/g) ?? []).length, 3);
    assert.equal((html.match(/placeholder:text-placeholder/g) ?? []).length, 3);
    assert.match(html, /h-12/);
  } finally {
    fixture.close();
  }
});

test('completion, optional/extra identity and timed inputs remain explicit', () => {
  const fixture = routeFixture();
  try {
    const { WorkoutSetCard } = fixture.load('app/workout-set-card.tsx');
    const completed = renderToStaticMarkup(
      createElement(WorkoutSetCard, {
        ...props,
        number: 5,
        setLabel: 'Extra set',
        timed: true,
        set: { weight: '', reps: '45', rir: '', done: true },
      }),
    );
    assert.match(completed, /Extra set/);
    assert.match(
      completed,
      /aria-label="Done, set 5\. Activate to reopen"[^>]*aria-pressed="true"/,
    );
    assert.match(completed, /Done/);
    assert.match(completed, /aria-label="Set 5 Seconds"/);
    assert.match(completed, /value="45"/);
    assert.match(completed, /id="set-5-rir"/);
    const optional = renderToStaticMarkup(
      createElement(WorkoutSetCard, {
        ...props,
        setLabel: 'Optional set',
      }),
    );
    assert.match(optional, /Optional set/);
  } finally {
    fixture.close();
  }
});

test('invalid fields are identified beside the set without crowding every column', () => {
  const fixture = routeFixture();
  try {
    const { WorkoutSetCard } = fixture.load('app/workout-set-card.tsx');
    const html = renderToStaticMarkup(
      createElement(WorkoutSetCard, {
        ...props,
        showValidation: true,
        set: { weight: '-1', reps: '0', rir: '11', done: false },
      }),
    );
    assert.equal((html.match(/aria-invalid="true"/g) ?? []).length, 3);
    assert.match(html, /role="alert"/);
    assert.match(html, /Weight: Enter zero or a positive weight\./);
    assert.match(html, /Mark done, set 1/);
  } finally {
    fixture.close();
  }
});
