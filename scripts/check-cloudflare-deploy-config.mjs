import { readFile } from 'node:fs/promises';

const configPath = new URL('../dist/server/wrangler.json', import.meta.url);
const deploymentTarget = process.env.LIFTLINE_CLOUDFLARE_TARGET || 'preview';
const placeholderDatabaseId = '00000000-0000-4000-8000-000000000000';

if (!['preview', 'production'].includes(deploymentTarget)) {
  console.error('LIFTLINE_CLOUDFLARE_TARGET must be "preview" or "production".');
  process.exit(1);
}

const expectedWorkerName = `liftline-cloudflare-${deploymentTarget}`;
const expectedDatabaseName = expectedWorkerName;
const databaseIdVariable =
  deploymentTarget === 'production'
    ? 'LIFTLINE_CLOUDFLARE_PRODUCTION_D1_DATABASE_ID'
    : 'LIFTLINE_CLOUDFLARE_D1_DATABASE_ID';
const expectedDatabaseId = process.env[databaseIdVariable];

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
    errors.push('The Worker must expose its workers.dev route.');
  }
  if (config.preview_urls !== false) {
    errors.push('The Worker must not expose version preview URLs.');
  }

  const database = config.d1_databases?.find(({ binding }) => binding === 'DB');
  if (!database) {
    errors.push('The generated config has no D1 database bound as DB.');
  } else {
    if (!expectedDatabaseId || expectedDatabaseId === placeholderDatabaseId) {
      errors.push(
        `Set ${databaseIdVariable} to the ${deploymentTarget} D1 database ID, then rebuild.`,
      );
    } else if (database.database_id !== expectedDatabaseId) {
      errors.push(
        `The generated config does not use ${databaseIdVariable}; rebuild with the correct ${deploymentTarget} database ID.`,
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
    console.log(
      `Cloudflare ${deploymentTarget} config passed the deployment safety checks.`,
    );
  }
}
