import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';
import ts from 'typescript';
import { writeExerciseDraft } from '../lib/exercise-drafts.ts';

// Synthetic device-local benchmark; never reads the user's browser storage.
const source = execFileSync(
  'git',
  ['show', '92702338dc74e03ce8c6a73cd2c4ab26e6344e87:lib/exercise-drafts.ts'],
  { encoding: 'utf8' },
);
const module = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { exports: module.exports, module, Date },
);
const draft = {
  sets: Array.from({ length: 5 }, () => ({
    weight: '51.25',
    reps: '12',
    done: false,
  })),
  setCount: 3,
  rir: '2',
  notes: 'Synthetic performance fixture.',
};
function measure(write) {
  const data = new Map();
  let bytes = 0;
  let writes = 0;
  const storage = {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      bytes += Buffer.byteLength(value);
      writes++;
      data.set(key, value);
    },
    removeItem: (key) => data.delete(key),
  };
  for (let index = 0; index < 32; index++)
    write('fixture:' + index, draft, storage);
  bytes = 0;
  writes = 0;
  const start = performance.now();
  for (let index = 0; index < 1000; index++)
    if (
      !write(
        'fixture:31',
        { ...draft, notes: 'Synthetic edit ' + index },
        storage,
      )
    )
      throw Error('Benchmark write failed');
  return {
    edits: 1000,
    writes,
    bytes,
    elapsedMs: Math.round((performance.now() - start) * 100) / 100,
  };
}
console.log(
  JSON.stringify(
    {
      baseline: measure(module.exports.writeExerciseDraft),
      current: measure(writeExerciseDraft),
    },
    null,
    2,
  ),
);
