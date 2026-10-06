import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HEARTBEAT_CRON } from '../src/cloud/runtime.ts';
import {DESIGN_REGISTRY} from '../src/cloud/design-registry.ts';
import { cloudSeedSQL } from './cloud-seed.mjs';

export function prepareCloud({ databaseId = '00000000-0000-0000-0000-000000000000', output = 'tmp/cloud', releaseSha = 'local', origin = process.env.STAGING_WORKER_URL ?? '', storageEnabled = process.env.STAGING_R2_ENABLED === 'true' } = {}) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(databaseId)) throw new Error('Invalid D1 database ID');
  if (releaseSha !== 'local' && !/^[a-f0-9]{40}$/i.test(releaseSha)) throw new Error('Release must be a full commit SHA');
  const root = resolve('.'), directory = resolve(output);
  const localPath = relative(resolve('tmp'), directory);
  if (localPath.startsWith('..') || resolve('tmp') === directory || directory === root) throw new Error('Output must be a subdirectory of tmp');
  mkdirSync(resolve(directory, 'migrations'), { recursive: true });
  const files = readdirSync('migrations').filter(name => /^\d+.*\.sql$/.test(name)).sort();
  if (files.length !== 6) throw new Error('Cloud schema version must be reviewed before adding migrations');
  const hashes = [];
  for (const [index, name] of files.entries()) {
    const sql = readFileSync(resolve('migrations', name), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const bootstrap = index === 0 ? 'CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL);\n' : '';
    // Originals remain byte-pinned. Store their original checksums for parity with the local catalog.
    writeFileSync(resolve(directory, 'migrations', name), bootstrap + sql + `\nINSERT INTO schema_migrations VALUES ('${name.replaceAll("'", "''")}','${checksum}');\n`);
    hashes.push({ name, checksum });
  }
  writeFileSync(resolve(directory, 'migrations', '0007_cloud_runtime.sql'), readFileSync('cloud/runtime.sql'));
  writeFileSync(resolve(directory, 'migrations', '0008_owner_management.sql'), readFileSync('cloud/owner-management.sql'));
  writeFileSync(resolve(directory, 'migrations', '0009_staging_briefs.sql'), cloudSeedSQL());
  writeFileSync(resolve(directory, 'migrations', '0010_private_storage.sql'), readFileSync('cloud/private-storage.sql'));
  writeFileSync(resolve(directory, 'migrations', '0011_source_review.sql'), readFileSync('cloud/source-review.sql'));
  writeFileSync(resolve(directory,'migrations','0012_cloud_backups.sql'),readFileSync('cloud/backups.sql'));
  writeFileSync(resolve(directory,'migrations','0013_telegram.sql'),readFileSync('cloud/telegram.sql'));
  writeFileSync(resolve(directory,'migrations','0014_meta.sql'),readFileSync('cloud/meta.sql'));
  writeFileSync(resolve(directory,'migrations','0015_meta_trial.sql'),readFileSync('cloud/meta-trial.sql'));
  const assets = resolve(directory, 'assets'); mkdirSync(assets, { recursive: true });
  for (const name of ['manager.html', 'manager.js', 'cloud.css','artwork.js','artwork-ui.js','backups.js','zip.js','telegram-ui.js','meta-ui.js','meta-trial-ui.js']) writeFileSync(resolve(assets, name), readFileSync(resolve('ui/cloud', name)));
  mkdirSync(resolve(assets,'fonts'),{recursive:true});
  for(const font of DESIGN_REGISTRY.fonts){const bytes=readFileSync(resolve('assets/fonts',font.name));if(createHash('sha256').update(bytes).digest('hex')!==font.sha256)throw new Error('Approved font changed');writeFileSync(resolve(assets,'fonts',font.name),bytes);}
  for(const license of ['BricolageGrotesque-OFL.txt','WorkSans-OFL.txt'])writeFileSync(resolve(assets,'fonts',license),readFileSync(resolve('assets/fonts',license)));
  const config = {
    name: 'nttu-publisher-staging', main: relative(directory, resolve('src/cloud/worker.ts')).split(sep).join('/'),
    compatibility_date: '2026-10-05', workers_dev: true, preview_urls: false,
    // Preserve dashboard-managed OAuth client ID across deployments.
    keep_vars: true,
    vars: { APP_ENV: 'staging', INTEGRATION_MODE: 'unconfigured', RELEASE_SHA: releaseSha, AUTH_ORIGIN: origin },
    assets: { directory: './assets', binding: 'ASSETS', run_worker_first: true },
    triggers: { crons: [HEARTBEAT_CRON] },
    d1_databases: [{ binding: 'DB', database_name: 'nttu-publisher-staging', database_id: databaseId, migrations_dir: './migrations' }],
    observability: { enabled: false },
    ...(storageEnabled ? { r2_buckets: [{ binding: 'MEDIA', bucket_name: 'nttu-publisher-staging-assets' }] } : {}),
  };
  writeFileSync(resolve(directory, 'wrangler.json'), JSON.stringify(config, null, 2) + '\n');
  writeFileSync(resolve(directory, 'schema-manifest.json'), JSON.stringify(hashes, null, 2) + '\n');
  return { directory, config };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = prepareCloud({ databaseId: process.env.STAGING_D1_DATABASE_ID });
  console.log('Prepared staging-only configuration: ' + result.directory);
}
