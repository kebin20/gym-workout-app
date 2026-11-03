import { readFile } from 'node:fs/promises';

const configPath = new URL('../dist/server/wrangler.json', import.meta.url);
const expectedWorkerName = 'liftline-cloudflare-preview';
const expectedDatabaseName = 'liftline-cloudflare-preview';
const placeholderDatabaseId = '00000000-0000-4000-8000-000000000000';

let config;
try {
  config = JSON.parse(await readFile(configPath, 'utf8'));
} catch {
  console.error(
    'Cloudflare Worker config is missing or invalid. Run npm run build:cloudflare first.',
  );
  process.exitCode = 1;
}

if (config) {
  const errors = [];

  if (config.name !== expectedWorkerName) {
    errors.push(`Expected Worker "${expectedWorkerName}".`);
  }
  if (config.workers_dev !== true) {
    errors.push('The public preview Worker must expose its workers.dev route.');
  }
  if (config.preview_urls !== false) {
    errors.push('The preview Worker must not expose version preview URLs.');
  }

  const database = config.d1_databases?.find(({ binding }) => binding === 'DB');
  if (!database) {
    errors.push('The generated config has no D1 database bound as DB.');
  } else {
    if (
      !database.database_id ||
      database.database_id === placeholderDatabaseId
    ) {
      errors.push(
        'Set LIFTLINE_CLOUDFLARE_D1_DATABASE_ID to the new preview D1 database ID, then rebuild.',
      );
    }
    if (database.database_name !== expectedDatabaseName) {
      errors.push(`Expected D1 database "${expectedDatabaseName}".`);
    }
    if (database.migrations_dir !== '../../drizzle') {
      errors.push('The D1 binding must use the repository Drizzle migrations.');
    }
  }

  if (errors.length) {
    console.error('Refusing to deploy the generated Cloudflare config:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log('Cloudflare preview config passed the deployment safety checks.');
  }
}
