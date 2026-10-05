import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { openCatalog } from '../scripts/catalog-store.mjs';
import { prepareCloud } from '../scripts/cloud-prepare.mjs';
import worker from '../src/cloud/worker.ts';
import { recordHeartbeat, HEARTBEAT_CRON } from '../src/cloud/runtime.ts';
import { deploymentSettings } from '../scripts/cloud-deploy.mjs';

const token = 'test-only-' + 'x'.repeat(40);
function fixture() {
  const db = openCatalog(); db.exec(readFileSync('cloud/runtime.sql', 'utf8'));
  const env = { APP_ENV: 'staging', INTEGRATION_MODE: 'unconfigured', STAGING_HEALTH_TOKEN: token,
    DB: { prepare(sql) { let args = []; return {
      bind(...values) { args = values; return this; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async run() { return db.prepare(sql).run(...args); },
    }; } } };
  return { db, env };
}
const request = (path, authorized = false) => new Request('https://staging.invalid' + path,
  { headers: authorized ? { Authorization: 'Bearer ' + token } : {} });

test('staging liveness exposes no database or account data, and makes no D1 call', async () => {
  const response = await worker.fetch(request('/health'), { APP_ENV: 'staging', INTEGRATION_MODE: 'unconfigured' });
  const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.databaseChecked, false);
  assert.equal(body.schedulerImplemented, false); assert.equal(body.publishingImplemented, false);
  assert.equal(body.environment, 'staging');
});
test('cloud foundation rejects missing, local, fake and production configurations', async () => {
  for (const env of [{}, { APP_ENV: 'local', INTEGRATION_MODE: 'fake' },
    { APP_ENV: 'production', INTEGRATION_MODE: 'unconfigured' }, { APP_ENV: 'staging', INTEGRATION_MODE: 'fake' }]) {
    assert.equal((await worker.fetch(request('/health'), env)).status, 503);
    await assert.rejects(recordHeartbeat({ cron: HEARTBEAT_CRON, scheduledTime: 1 }, env));
  }
});
test('D1 status is private and fails closed when the token is absent or incorrect', async () => {
  const { db, env } = fixture(); try {
    assert.equal((await worker.fetch(request('/api/staging/status'), env)).status, 401);
    assert.equal((await worker.fetch(request('/api/staging/status', true), { ...env, STAGING_HEALTH_TOKEN: 'short' })).status, 401);
    const response = await worker.fetch(request('/api/staging/status', true), env);
    assert.equal(response.status, 200); assert.equal((await response.json()).paused, true);
  } finally { db.close(); }
});
test('missing or mismatched D1 schema/identity/pause returns sanitized unavailable status', async () => {
  const { db, env } = fixture(); try {
    for (const changed of [{ ...env, DB: undefined }, env]) {
      if (changed === env) db.exec("UPDATE application_state SET paused_by_user=0 WHERE environment='staging'");
      const response = await worker.fetch(request('/api/staging/status', true), changed);
      assert.equal(response.status, 503); assert.deepEqual(await response.json(), { code: 'DATABASE_NOT_READY' });
    }
    db.exec("UPDATE application_state SET paused_by_user=1 WHERE environment='staging'; DELETE FROM schema_migrations WHERE name='0006_editor.sql'");
    assert.equal((await worker.fetch(request('/api/staging/status', true), env)).status, 503);
  } finally { db.close(); }
});
test('heartbeat is monotonic and duplicate-safe, without altering publication state', async () => {
  const { db, env } = fixture(); try {
    for (const scheduledTime of [1000, 1000, 999, 2000]) await worker.scheduled({ cron: HEARTBEAT_CRON, scheduledTime }, env);
    const row = db.prepare('SELECT * FROM cloud_runtime').get();
    assert.equal(row.heartbeat_count, 2); assert.equal(row.last_scheduled_at, 2000);
    assert.equal(db.prepare('SELECT count(*) AS n FROM publish_jobs').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM application_state WHERE paused_by_user=1').get().n, 3);
    assert.equal(db.prepare('SELECT last_run_at FROM application_state WHERE environment=?').get('staging').last_run_at, null);
  } finally { db.close(); }
});
test('unexpected cron and malformed scheduled times cannot write heartbeat', async () => {
  const { db, env } = fixture(); try {
    for (const event of [{ cron: '0 3 * * *', scheduledTime: 1 }, { cron: HEARTBEAT_CRON, scheduledTime: NaN }]) {
      await assert.rejects(worker.scheduled(event, env));
    }
    assert.equal(db.prepare('SELECT heartbeat_count FROM cloud_runtime').get().heartbeat_count, 0);
  } finally { db.close(); }
});
test('cloud exposes no local GUI, content, source, backup or mutation endpoints', async () => {
  const { db, env } = fixture(); try {
    for (const path of ['/', '/assets/sources/BM03.pdf', '/editor-assets/anything.png']) assert.equal((await worker.fetch(request(path, true), env)).status, 404);
    for (const path of ['/api/editor/posts', '/api/publishing/resume', '/api/trial-publish']) assert.equal((await worker.fetch(request(path, true), env)).status, 501);
    assert.equal((await worker.fetch(new Request('https://staging.invalid/api/staging/status', { method: 'POST' }), env)).status, 501);
  } finally { db.close(); }
});
test('cloud migration preparation preserves original schema hashes and never imports private data', () => {
  const { directory, config } = prepareCloud({ output: 'tmp/tests/cloud-preparation' });
  assert.equal(config.vars.APP_ENV, 'staging'); assert.deepEqual(config.triggers.crons, [HEARTBEAT_CRON]);
  assert.equal('assets' in config, false); assert.equal('r2_buckets' in config, false);
  const db = new DatabaseSync(':memory:'); try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const name of readdirSync(directory + '/migrations').sort()) db.exec(readFileSync(directory + '/migrations/' + name, 'utf8'));
    assert.equal(db.prepare('SELECT count(*) AS n FROM posts').get().n, 0);
    const reference = openCatalog(); try {
      assert.deepEqual(db.prepare('SELECT * FROM schema_migrations ORDER BY name').all(), reference.prepare('SELECT * FROM schema_migrations ORDER BY name').all());
    } finally { reference.close(); }
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally { db.close(); }
  assert.throws(() => prepareCloud({ output: '../escape' }));
  assert.throws(() => prepareCloud({ databaseId: 'bad' }));
});
test('deployment refuses placeholders, production targets and incomplete release identity', () => {
  const valid = { STAGING_D1_DATABASE_ID: '12345678-1234-1234-1234-123456789abc',
    GITHUB_SHA: 'a'.repeat(40), STAGING_HEALTH_TOKEN: 'b'.repeat(64),
    STAGING_WORKER_URL: 'https://nttu-publisher-staging.example.workers.dev',
    CLOUDFLARE_ACCOUNT_ID: 'c'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-only-token' };
  assert.equal(deploymentSettings(valid).releaseSha, valid.GITHUB_SHA);
  for (const patch of [{ STAGING_D1_DATABASE_ID: '00000000-0000-0000-0000-000000000000' },
    { GITHUB_SHA: 'main' }, { STAGING_HEALTH_TOKEN: 'weak' },
    { STAGING_WORKER_URL: 'https://nttu-publisher-production.example.workers.dev' },
    { STAGING_WORKER_URL: 'https://nttu-publisher-staging.example.workers.dev/extra' },
    { CLOUDFLARE_API_TOKEN: '' }]) assert.throws(() => deploymentSettings({ ...valid, ...patch }));
});
test('pause changed between read and heartbeat write prevents the write', async () => {
  const { db, env } = fixture(); try {
    const prepare = env.DB.prepare;
    env.DB.prepare = sql => {
      if (sql.startsWith('UPDATE cloud_runtime')) db.exec("UPDATE application_state SET paused_by_user=0 WHERE environment='staging'");
      return prepare(sql);
    };
    await recordHeartbeat({ cron: HEARTBEAT_CRON, scheduledTime: 1000 }, env);
    assert.equal(db.prepare('SELECT heartbeat_count FROM cloud_runtime').get().heartbeat_count, 0);
  } finally { db.close(); }
});
