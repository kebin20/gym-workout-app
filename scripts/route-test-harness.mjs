import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
export function routeFixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(path.join(root, 'drizzle'))
    .filter((file) => file.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(path.join(root, 'drizzle', file), 'utf8'));
  const waits = [];
  const db = {
    prepare(sql) {
      let values = [];
      const statement = {
        sql,
        bind(...input) {
          values = input;
          return statement;
        },
        async first() {
          return sqlite.prepare(sql).get(...values) ?? null;
        },
        async all() {
          return {
            results: sqlite.prepare(sql).all(...values),
            meta: { changes: 0 },
          };
        },
        async run() {
          return {
            meta: {
              changes: Number(sqlite.prepare(sql).run(...values).changes),
            },
          };
        },
      };
      return statement;
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements)
          results.push(
            /^\s*SELECT/i.test(statement.sql)
              ? await statement.all()
              : await statement.run(),
          );
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    const source = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    const localRequire = (name) => {
      if (name === 'cloudflare:workers')
        return { env: { DB: db }, waitUntil: (promise) => waits.push(promise) };
      if (name.includes('google-sheet-sync'))
        return {
          syncWorkoutEntries: async () => ({
            ok: true,
            configured: true,
            synced: 1,
          }),
          syncHolidayWorkoutEntries: async () => ({
            ok: true,
            configured: true,
            synced: 1,
          }),
        };
      if (name.startsWith('@/') || name.startsWith('.')) {
        const resolved = name.startsWith('@/')
          ? path.join(root, name.slice(2))
          : path.resolve(path.dirname(file), name);
        if (resolved.endsWith('.json'))
          return JSON.parse(readFileSync(resolved, 'utf8'));
        const candidate = ['.ts', '.tsx']
          .map((suffix) =>
            resolved.endsWith(suffix) ? resolved : resolved + suffix,
          )
          .find((file) => existsSync(file));
        if (!candidate) throw Error('Missing local test module: ' + resolved);
        return load(candidate);
      }
      return require(name);
    };
    vm.runInNewContext(
      source,
      {
        exports: module.exports,
        module,
        require: localRequire,
        Request,
        Response,
        URL,
        Date,
        Number,
        TextEncoder,
        structuredClone,
        console,
      },
      { filename: file },
    );
    return module.exports;
  }
  return {
    sqlite,
    load: (relative) => load(path.join(root, relative)),
    settled: () => Promise.all(waits),
    close: () => sqlite.close(),
  };
}
